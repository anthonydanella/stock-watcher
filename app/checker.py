from __future__ import annotations

import asyncio
import random
import time
from base64 import b64encode
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING

from app.challenges import is_challenge_response
from app.config import Settings
from app.failures import classify_exception
from app.models import (
    ERROR_HTTP,
    ERROR_QUANTITY_PARSE,
    ERROR_SELECTOR,
    EVENT_CHALLENGE,
    EVENT_ERROR,
    EVENT_NOTIFICATION_ERROR,
    EVENT_RECOVERY,
    EVENT_SCREENSHOT_ERROR,
    EVENT_STATUS_CHANGE,
    STATUS_CHALLENGE,
    STATUS_ERROR,
    STATUS_IN_STOCK,
    STATUS_LOW_STOCK,
    STATUS_OUT_OF_STOCK,
    STATUS_UNKNOWN,
    STOCK_MODE_QUANTITY,
    STOCK_STATUSES,
    AppSettings,
    Monitor,
    utcnow,
)
from app.notification_rules import evaluate_rules as evaluate_notification_rules
from app.ntfy import NtfyClient
from app.repository import Repository
from app.rules import RuleResult, evaluate_rule, evaluate_rule_diagnostics
from app.scheduler import calculate_cooldown, calculate_next_check
from app.screenshots import save_screenshot
from app.webhook import WebhookClient
from app.webpush import WebPushManager

if TYPE_CHECKING:
    from playwright.async_api import Browser, Playwright

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
]

COOKIE_CONSENT_CLEANUP_SCRIPT = """
(() => {
  const textPattern = /(cookie|cookies|consent|gdpr|ccpa|tracking|personal data|manage preferences|privacy settings)/i;
  const identityPattern = /(cookie|cookies|consent|gdpr|ccpa|onetrust|didomi|trustarc|quantcast|usercentrics|cookiebot|cookieyes|iubenda|axeptio|uc-)/i;
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const candidates = new Set();

  const identity = (element) => [
    element.id,
    element.className,
    element.getAttribute("aria-label") || "",
    element.getAttribute("data-testid") || "",
    element.getAttribute("data-test") || ""
  ].join(" ");

  const isPageShell = (element) => {
    if (!element || element === document.body || element === document.documentElement) return true;
    const tag = element.tagName.toLowerCase();
    if (["html", "body", "main"].includes(tag)) return true;
    if (["root", "app", "__next", "__nuxt"].includes(element.id)) return true;
    return Boolean(element.closest("main, [role='main']")) && element.children.length > 8;
  };

  const isOverlay = (element, style, rect) => {
    const position = style.position;
    const areaRatio = rect.width * rect.height / viewportArea;
    const anchored = position === "fixed" || position === "sticky";
    const modal = element.getAttribute("role") === "dialog" || element.getAttribute("aria-modal") === "true";
    const edgeDocked = rect.top < 8 || rect.left < 8 || window.innerHeight - rect.bottom < 8 || window.innerWidth - rect.right < 8;
    return modal || (anchored && (areaRatio > 0.015 || edgeDocked));
  };

  document.querySelectorAll("body *").forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (isPageShell(element)) return;

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

    const rect = element.getBoundingClientRect();
    if (rect.width < 240 || rect.height < 80) return;
    if (!isOverlay(element, style, rect)) return;

    const name = identity(element);
    const text = `${name} ${element.innerText || ""}`.slice(0, 2000);
    if (identityPattern.test(name) || textPattern.test(text)) candidates.add(element);
  });

  candidates.forEach((element) => {
    if (isPageShell(element)) return;
    element.setAttribute("data-stock-watcher-hidden", "cookie-consent");
    element.style.setProperty("display", "none", "important");
  });

  for (const element of [document.documentElement, document.body]) {
    element.style.setProperty("overflow", "auto", "important");
  }
})();
"""


@dataclass(frozen=True)
class FetchResult:
    status_code: int | None
    content: str
    content_type: str
    headers: dict[str, str]
    screenshot: bytes | None = None
    screenshot_error: str = ""


class StockChecker:
    def __init__(self, repo: Repository, settings: Settings, ntfy: NtfyClient | None = None):
        self.repo = repo
        self.settings = settings
        self.ntfy = ntfy or NtfyClient(
            max_attempts=settings.ntfy_max_attempts,
            backoff_seconds=settings.ntfy_retry_backoff_seconds,
        )
        self.webpush = WebPushManager(repo, settings)
        self.webhook = WebhookClient()
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._browser_lock = asyncio.Lock()

    async def check_monitor(self, monitor: Monitor) -> None:
        started = time.perf_counter()
        old_status = monitor.status
        old_quantity = monitor.last_quantity
        http_status: int | None = None
        status = STATUS_ERROR
        error = ""
        error_type = ""
        evidence = ""
        reason = ""
        quantity: int | None = None
        fetched: FetchResult | None = None
        now = utcnow()
        try:
            fetched = await self.fetch(monitor)
            http_status = fetched.status_code
            if is_challenge_response(fetched.status_code, fetched.content, fetched.headers):
                status = STATUS_CHALLENGE
                error = "CAPTCHA or bot challenge detected"
                evidence = "Challenge page detected"
                reason = "The fetched response looks like a CAPTCHA or bot challenge, so the rule was not evaluated."
            elif fetched.status_code is None or fetched.status_code >= 400:
                status = STATUS_ERROR
                error_type = ERROR_HTTP
                error = f"HTTP status {fetched.status_code}"
                evidence = fetched.content[:500]
                reason = "The page fetch did not return a successful HTTP response, so the rule was not evaluated."
            else:
                in_quantity_mode = monitor.stock_mode == STOCK_MODE_QUANTITY
                diagnostics = evaluate_rule_diagnostics(
                    monitor.rule_type,
                    monitor.selector_or_path,
                    monitor.match_mode,
                    monitor.match_value,
                    fetched.content,
                    fetched.content_type,
                    quantity_pattern=monitor.quantity_pattern if in_quantity_mode else None,
                )
                reason = diagnostics.reason
                if diagnostics.reason.startswith("Invalid CSS selector"):
                    status = STATUS_ERROR
                    error_type = ERROR_SELECTOR
                    error = diagnostics.reason
                    evidence = diagnostics.reason
                elif in_quantity_mode:
                    if diagnostics.quantity is None:
                        status = STATUS_ERROR
                        error_type = ERROR_QUANTITY_PARSE
                        error = (
                            diagnostics.quantity_error
                            or "Could not parse a quantity from the extracted text"
                        )
                        evidence = diagnostics.evidence or diagnostics.extracted_text[:500]
                        reason = error
                    else:
                        quantity = diagnostics.quantity
                        status = _quantity_to_status(quantity, monitor.low_stock_threshold)
                        evidence = _quantity_evidence(quantity, diagnostics.evidence)
                else:
                    status = STATUS_IN_STOCK if diagnostics.matched else STATUS_OUT_OF_STOCK
                    evidence = diagnostics.evidence
        except Exception as exc:  # noqa: BLE001 - persisted for UI troubleshooting
            status = STATUS_ERROR
            error_type = classify_exception(exc)
            error = str(exc)
            evidence = error
            reason = f"Fetch failed before the rule could be evaluated: {error}"

        duration_ms = int((time.perf_counter() - started) * 1000)
        ok = status in STOCK_STATUSES
        failure_count = 0 if ok else monitor.failure_count + 1
        challenge_count = (
            monitor.challenge_count + 1 if status == STATUS_CHALLENGE else monitor.challenge_count
        )
        cooldown_until = None
        if status == STATUS_CHALLENGE:
            cooldown_until = now + timedelta(hours=1)
        elif status == STATUS_ERROR and failure_count >= 3:
            cooldown_until = calculate_cooldown(failure_count, now)

        next_check_at = calculate_next_check(monitor, now)
        if cooldown_until and cooldown_until > next_check_at:
            next_check_at = cooldown_until

        fields = {
            "status": status,
            "last_checked_at": now.isoformat(),
            "next_check_at": next_check_at.isoformat(),
            "failure_count": failure_count,
            "challenge_count": challenge_count,
            "cooldown_until": cooldown_until.isoformat() if cooldown_until else None,
            "last_error": error,
            "last_error_type": error_type,
            "last_evidence": evidence,
        }
        if quantity is not None:
            fields["last_quantity"] = quantity
            fields["last_quantity_at"] = now.isoformat()
        screenshot_error = ""
        if fetched and monitor.id is not None:
            screenshot_fields = self._screenshot_fields(monitor.id, fetched, now)
            fields.update(screenshot_fields)
            screenshot_error = screenshot_fields.get("last_screenshot_error") or ""
        self.repo.update_monitor(monitor.id or 0, fields)
        self.repo.add_attempt(
            monitor.id or 0,
            status,
            ok,
            duration_ms,
            http_status,
            error,
            evidence,
            error_type,
            reason=reason,
            quantity=quantity,
        )
        if (
            screenshot_error
            and screenshot_error != monitor.last_screenshot_error
            and monitor.id is not None
        ):
            self.repo.add_event(
                monitor.id,
                EVENT_SCREENSHOT_ERROR,
                f"{monitor.name}: screenshot failed: {screenshot_error}",
                evidence=screenshot_error,
            )
        await self._record_events_and_notify(
            monitor,
            old_status,
            status,
            error,
            evidence,
            failure_count,
            old_quantity=old_quantity,
            new_quantity=quantity,
        )
        if old_status != status:
            await evaluate_notification_rules(
                self.repo,
                self.repo.get_settings(),
                self.notify,
            )

    async def fetch(self, monitor: Monitor) -> FetchResult:
        return await self._fetch_browser(monitor)

    async def _get_browser(self) -> Browser:
        # One persistent Chromium per checker; each check still runs in a fresh context
        # (its own cookies, storage, and user agent) so monitors stay isolated. Launching a
        # full browser per check was the dominant cost when many monitors run together.
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise RuntimeError("Playwright is not installed. Install the browser extra.") from exc

        async with self._browser_lock:
            if self._browser is not None and self._browser.is_connected():
                return self._browser
            # A previous browser may have crashed or been closed out from under us; drop the
            # stale handle and relaunch so one bad session does not wedge every later check.
            self._browser = None
            if self._playwright is None:
                self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(headless=True)
            return self._browser

    async def _fetch_browser(self, monitor: Monitor) -> FetchResult:
        browser = await self._get_browser()
        context = await browser.new_context(
            user_agent=self._user_agent(monitor),
            viewport={"width": 1280, "height": 720},
        )
        try:
            page = await context.new_page()
            response = await page.goto(
                monitor.url,
                wait_until="domcontentloaded",
                timeout=monitor.timeout_seconds * 1000,
            )
            # Many product pages hydrate stock info via deferred XHR after DOMContentLoaded.
            # Wait until the network goes quiet so the LLM and rules see the real DOM, not the
            # shell. Bounded by the monitor's own timeout — networkidle never blocks forever.
            try:
                await page.wait_for_load_state(
                    "networkidle", timeout=monitor.timeout_seconds * 1000
                )
            except Exception:  # noqa: BLE001 - some sites long-poll; fall through with what we have
                pass
            await page.wait_for_timeout(random.randint(500, 1800))
            content = await page.content()
            headers = await response.all_headers() if response else {}
            status_code = response.status if response else None
            screenshot: bytes | None = None
            screenshot_error = ""
            try:
                await self._prepare_page_for_screenshot(page)
                screenshot = await page.screenshot(type="jpeg", quality=80, full_page=False)
            except Exception as exc:  # noqa: BLE001 - screenshot failures should not fail stock checks
                screenshot_error = str(exc)
            return FetchResult(
                status_code=status_code,
                content=content,
                content_type=headers.get("content-type", ""),
                headers=headers,
                screenshot=screenshot,
                screenshot_error=screenshot_error,
            )
        finally:
            await context.close()

    async def aclose(self) -> None:
        # Tear down the persistent browser and Playwright driver. Call from the app's
        # shutdown path so the Chromium process and its pipe do not leak across restarts.
        async with self._browser_lock:
            if self._browser is not None:
                try:
                    await self._browser.close()
                except Exception:  # noqa: BLE001 - shutdown is best effort
                    pass
                self._browser = None
            if self._playwright is not None:
                try:
                    await self._playwright.stop()
                except Exception:  # noqa: BLE001 - shutdown is best effort
                    pass
                self._playwright = None

    async def _prepare_page_for_screenshot(self, page) -> None:  # noqa: ANN001
        try:
            await page.evaluate(COOKIE_CONSENT_CLEANUP_SCRIPT)
        except Exception:
            return

    def _screenshot_fields(
        self, monitor_id: int, fetched: FetchResult, checked_at
    ) -> dict[str, str | None]:
        if fetched.screenshot:
            try:
                save_screenshot(self.settings, monitor_id, fetched.screenshot)
            except Exception as exc:  # noqa: BLE001 - keep monitor result even if disk writes fail
                return {"last_screenshot_error": str(exc)}
            return {
                "last_screenshot_at": checked_at.isoformat(),
                "last_screenshot_error": "",
            }
        if fetched.screenshot_error:
            return {"last_screenshot_error": fetched.screenshot_error}
        return {}

    def _user_agent(self, monitor: Monitor) -> str:
        if monitor.user_agent_mode and monitor.user_agent_mode != "random":
            return monitor.user_agent_mode
        return random.choice(USER_AGENTS)

    async def test_rule(self, monitor: Monitor) -> RuleResult:
        fetched = await self.fetch(monitor)
        if is_challenge_response(fetched.status_code, fetched.content, fetched.headers):
            return RuleResult(matched=False, evidence="Challenge page detected")
        if fetched.status_code is None or fetched.status_code >= 400:
            detail = _compact_evidence(fetched.content)
            evidence = f"HTTP status {fetched.status_code}"
            if detail:
                evidence = f"{evidence}: {detail}"
            return RuleResult(matched=False, evidence=evidence)
        return evaluate_rule(
            monitor.rule_type,
            monitor.selector_or_path,
            monitor.match_mode,
            monitor.match_value,
            fetched.content,
            fetched.content_type,
        )

    async def rule_lab(self, monitor: Monitor) -> dict:
        started = time.perf_counter()
        try:
            fetched = await self.fetch(monitor)
        except Exception as exc:  # noqa: BLE001 - the lab should explain fetch failures in-band
            duration_ms = int((time.perf_counter() - started) * 1000)
            error = str(exc)
            error_type = classify_exception(exc)
            return {
                "matched": False,
                "evidence": error,
                "reason": f"Fetch failed before the rule could be evaluated: {error}",
                "fetch": {
                    "status_code": None,
                    "content_type": "",
                    "duration_ms": duration_ms,
                    "content_length": 0,
                    "screenshot": None,
                    "screenshot_error": "",
                    "error_type": error_type,
                },
                "diagnostics": None,
            }
        duration_ms = int((time.perf_counter() - started) * 1000)
        screenshot = (
            f"data:image/jpeg;base64,{b64encode(fetched.screenshot).decode('ascii')}"
            if fetched.screenshot
            else None
        )
        fetch = {
            "status_code": fetched.status_code,
            "content_type": fetched.content_type,
            "duration_ms": duration_ms,
            "content_length": len(fetched.content),
            "screenshot": screenshot,
            "screenshot_error": fetched.screenshot_error,
            "error_type": "",
        }
        if is_challenge_response(fetched.status_code, fetched.content, fetched.headers):
            return {
                "matched": False,
                "evidence": "Challenge page detected",
                "reason": "The fetched response looks like a CAPTCHA or bot challenge, so the rule was not evaluated.",
                "fetch": fetch,
                "diagnostics": None,
            }
        if fetched.status_code is None or fetched.status_code >= 400:
            detail = _compact_evidence(fetched.content)
            evidence = f"HTTP status {fetched.status_code}"
            if detail:
                evidence = f"{evidence}: {detail}"
            fetch["error_type"] = ERROR_HTTP
            return {
                "matched": False,
                "evidence": evidence,
                "reason": "The page fetch did not return a successful HTTP response, so the rule was not evaluated.",
                "fetch": fetch,
                "diagnostics": None,
            }
        in_quantity_mode = monitor.stock_mode == STOCK_MODE_QUANTITY
        diagnostics = evaluate_rule_diagnostics(
            monitor.rule_type,
            monitor.selector_or_path,
            monitor.match_mode,
            monitor.match_value,
            fetched.content,
            fetched.content_type,
            quantity_pattern=monitor.quantity_pattern if in_quantity_mode else None,
        )
        if diagnostics.reason.startswith("Invalid CSS selector"):
            fetch["error_type"] = ERROR_SELECTOR
        elif in_quantity_mode and diagnostics.quantity is None:
            fetch["error_type"] = ERROR_QUANTITY_PARSE
        return {
            "matched": diagnostics.matched,
            "evidence": diagnostics.evidence,
            "reason": diagnostics.reason,
            "fetch": fetch,
            "diagnostics": diagnostics.to_dict(),
        }

    async def _record_events_and_notify(
        self,
        monitor: Monitor,
        old_status: str,
        new_status: str,
        error: str,
        evidence: str,
        failure_count: int,
        old_quantity: int | None = None,
        new_quantity: int | None = None,
    ) -> None:
        if monitor.id is None:
            return
        app_settings = self.repo.get_settings()
        notify_enabled = monitor.notifications_enabled
        if new_status == STATUS_CHALLENGE:
            message = f"{monitor.name}: CAPTCHA or bot challenge detected. Checks are cooling down."
            self.repo.add_event(
                monitor.id, EVENT_CHALLENGE, message, old_status, new_status, evidence
            )
            if notify_enabled and monitor.notify_on_challenge:
                await self.notify(
                    app_settings,
                    monitor,
                    "Stock watcher challenge",
                    message,
                    tags="warning",
                    collapse_key=f"monitor-{monitor.id}",
                )
            return
        if new_status == STATUS_ERROR and failure_count in {3, 6}:
            message = (
                f"{monitor.name}: repeated check failures ({failure_count}). Last error: {error}"
            )
            self.repo.add_event(monitor.id, EVENT_ERROR, message, old_status, new_status, evidence)
            if notify_enabled and monitor.notify_on_error:
                await self.notify(
                    app_settings,
                    monitor,
                    "Stock watcher errors",
                    message,
                    tags="warning",
                    collapse_key=f"monitor-{monitor.id}",
                )
            return
        if old_status != new_status:
            new_descriptor = _status_descriptor(new_status, new_quantity)
            old_descriptor = _status_descriptor(old_status, old_quantity)
            if old_status == STATUS_UNKNOWN and new_status in STOCK_STATUSES:
                event_type = EVENT_STATUS_CHANGE
                title = "Stock watcher active"
                message = (
                    f"{monitor.name}: initial check completed, current status is {new_descriptor}."
                )
            elif old_status == STATUS_ERROR and new_status in STOCK_STATUSES:
                event_type = EVENT_RECOVERY
                title = "Stock watcher recovered"
                message = f"{monitor.name}: checks recovered, current status is {new_descriptor}."
            else:
                event_type = EVENT_STATUS_CHANGE
                title = "Stock status changed"
                message = f"{monitor.name}: {old_descriptor} -> {new_descriptor}."
            self.repo.add_event(monitor.id, event_type, message, old_status, new_status, evidence)
            if notify_enabled and monitor.notify_on_stock_change:
                await self.notify(
                    app_settings,
                    monitor,
                    title,
                    message,
                    tags="shopping_cart",
                    collapse_key=f"monitor-{monitor.id}",
                )

    async def notify(
        self,
        app_settings: AppSettings,
        monitor: Monitor | None,
        title: str,
        message: str,
        tags: str = "package",
        collapse_key: str | None = None,
    ) -> bool:
        """Fan a notification out to every enabled channel.

        Returns True if at least one channel delivered. Each channel is isolated:
        a failure (raised or rejected) is recorded as an event and never blocks
        the others or the surrounding check.

        `tags` is the ntfy emoji label; `collapse_key` is the Web Push
        notification tag (its client-side replace key). They are kept separate so
        ntfy keeps its emoji while Web Push can collapse per source.
        """
        monitor_id = monitor.id if monitor else None
        delivered = False

        try:
            sent = await self.ntfy.send(app_settings, monitor, title, message, tags=tags)
        except Exception as exc:  # noqa: BLE001 - notification failure should not stop checks
            self.repo.add_event(
                monitor_id, EVENT_NOTIFICATION_ERROR, f"ntfy notification failed: {exc}"
            )
        else:
            if sent:
                delivered = True
            elif app_settings.ntfy_enabled and app_settings.ntfy_topic:
                self.repo.add_event(
                    monitor_id,
                    EVENT_NOTIFICATION_ERROR,
                    "ntfy notification failed: delivery was rejected or unavailable",
                )

        try:
            if await self.webpush.send(
                app_settings, monitor, title, message, tags=tags, collapse_key=collapse_key
            ):
                delivered = True
        except Exception as exc:  # noqa: BLE001 - isolate channel failures
            self.repo.add_event(
                monitor_id, EVENT_NOTIFICATION_ERROR, f"Web Push notification failed: {exc}"
            )

        try:
            sent = await self.webhook.send(app_settings, monitor, title, message, tags=tags)
        except Exception as exc:  # noqa: BLE001 - isolate channel failures
            self.repo.add_event(
                monitor_id, EVENT_NOTIFICATION_ERROR, f"Webhook notification failed: {exc}"
            )
        else:
            if sent:
                delivered = True
            elif app_settings.webhook_enabled and app_settings.webhook_url.strip():
                self.repo.add_event(
                    monitor_id,
                    EVENT_NOTIFICATION_ERROR,
                    "Webhook notification failed: delivery was rejected or unavailable",
                )

        return delivered


def _compact_evidence(value: str, limit: int = 300) -> str:
    compacted = " ".join(value.split())
    if len(compacted) > limit:
        return compacted[: limit - 3] + "..."
    return compacted


def _quantity_to_status(quantity: int, low_threshold: int | None) -> str:
    if quantity <= 0:
        return STATUS_OUT_OF_STOCK
    if low_threshold is not None and quantity <= low_threshold:
        return STATUS_LOW_STOCK
    return STATUS_IN_STOCK


def _quantity_evidence(quantity: int, rule_evidence: str) -> str:
    label = f"Quantity: {quantity}"
    if rule_evidence and rule_evidence.strip() and rule_evidence.strip() != str(quantity):
        return f"{label} (from {_compact_evidence(rule_evidence, 200)})"
    return label


def _status_descriptor(status: str, quantity: int | None) -> str:
    label = status.replace("_", " ") if status else "unknown"
    if quantity is None or status not in STOCK_STATUSES:
        return label
    if status == STATUS_OUT_OF_STOCK:
        return "out of stock (0)"
    return f"{label} ({quantity})"
