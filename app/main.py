from __future__ import annotations

import importlib.util
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, HttpUrl, field_validator

from app.checker import StockChecker
from app.config import settings
from app.db import connect, init_db
from app.llm import LLMError, suggest_rule
from app.models import (
    ALERT_STATUSES,
    CHECK_MODE_BROWSER,
    EVENT_MANUAL,
    EVENT_NOTIFICATION_ERROR,
    MATCH_CONTAINS,
    RULE_TEXT,
    STATUS_UNKNOWN,
    STOCK_MODE_BINARY,
    AppSettings,
    CheckAttempt,
    Monitor,
    NotificationRule,
    parse_dt,
    utcnow,
)
from app.notification_rules import evaluate_rule as evaluate_notification_rule
from app.repository import Repository
from app.scheduler import Scheduler
from app.screenshots import (
    SCREENSHOT_CONTENT_TYPE,
    delete_screenshot,
    screenshot_path,
    screenshot_url,
)

conn = connect(settings.database_path)
init_db(conn)
conn.close()
repo = Repository(None, settings)
checker = StockChecker(repo, settings)
scheduler = Scheduler(repo, settings, checker.check_monitor)
FRONTEND_DIST = Path("frontend/dist")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    await scheduler.stop()
    await checker.aclose()


app = FastAPI(title="Stock Watcher", lifespan=lifespan)
if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


class MonitorPayload(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    url: HttpUrl
    enabled: bool = True
    check_mode: Literal["browser"] = CHECK_MODE_BROWSER
    interval_seconds: int = Field(default=900, ge=30)
    jitter_percent: int = Field(default=20, ge=0, le=100)
    rule_type: Literal["css", "text"] = RULE_TEXT
    selector_or_path: str = ""
    match_mode: Literal["contains", "not_contains", "equals", "regex", "exists"] = MATCH_CONTAINS
    match_value: str = ""
    user_agent_mode: str = "random"
    timeout_seconds: int = Field(default=20, ge=3, le=120)
    stock_mode: Literal["binary", "quantity"] = STOCK_MODE_BINARY
    quantity_pattern: str = ""
    low_stock_threshold: int | None = Field(default=None, ge=0)
    notifications_enabled: bool = True
    notify_on_stock_change: bool = True
    notify_on_error: bool = True
    notify_on_challenge: bool = True

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Monitor name must not be blank")
        return value

    @field_validator("quantity_pattern")
    @classmethod
    def quantity_pattern_must_compile(cls, value: str) -> str:
        text = value.strip()
        if not text:
            return ""
        import re as _re

        try:
            _re.compile(text)
        except _re.error as exc:
            raise ValueError(f"Quantity regex is invalid: {exc}") from exc
        return text


class NotificationRulePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    monitor_ids: list[int] = Field(default_factory=list)
    trigger_statuses: list[str] = Field(default_factory=lambda: ["in_stock"])
    threshold: int = Field(default=1, ge=1, le=1000)
    cooldown_minutes: int = Field(default=60, ge=0, le=10080)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Rule name must not be blank")
        return value

    @field_validator("trigger_statuses")
    @classmethod
    def statuses_must_be_known(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("Pick at least one status to trigger on")
        unknown = [item for item in value if item not in ALERT_STATUSES]
        if unknown:
            raise ValueError(f"Unsupported status: {', '.join(unknown)}")
        # Preserve order, drop duplicates.
        seen: list[str] = []
        for item in value:
            if item not in seen:
                seen.append(item)
        return seen

    @field_validator("monitor_ids")
    @classmethod
    def monitor_ids_must_be_unique(cls, value: list[int]) -> list[int]:
        seen: list[int] = []
        for item in value:
            if item not in seen:
                seen.append(item)
        return seen


class SettingsPayload(BaseModel):
    ntfy_enabled: bool = False
    ntfy_server: str = "https://ntfy.sh"
    ntfy_topic: str = ""
    ntfy_token: str = ""
    ntfy_priority: str = "default"
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = ""
    llm_extra_params: str = ""

    @field_validator("llm_extra_params")
    @classmethod
    def extra_params_must_be_json(cls, value: str) -> str:
        text = (value or "").strip()
        if not text:
            return ""
        import json as _json

        try:
            parsed = _json.loads(text)
        except _json.JSONDecodeError as exc:
            raise ValueError(f"Extra params must be valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ValueError("Extra params must be a JSON object")
        return text


class RuleSuggestPayload(BaseModel):
    url: HttpUrl
    hint: str = Field(default="", max_length=2000)
    other_state_sample: str = Field(default="", max_length=4000)
    stock_mode: Literal["binary", "quantity"] = "binary"
    rule_type: Literal["css", "text"] = RULE_TEXT
    selector_or_path: str = ""
    user_agent_mode: str = "random"
    timeout_seconds: int = Field(default=20, ge=3, le=120)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/monitors")
def api_list_monitors() -> list[dict[str, Any]]:
    monitors = repo.list_monitors()
    quantities = repo.recent_quantities_by_monitor()
    return [
        _monitor_to_dict(monitor, recent_quantities=quantities.get(monitor.id or 0, []))
        for monitor in monitors
    ]


@app.post("/api/monitors", status_code=201)
def api_create_monitor(payload: MonitorPayload) -> dict[str, Any]:
    monitor = _monitor_from_payload(payload)
    monitor_id = repo.create_monitor(monitor)
    repo.add_event(monitor_id, EVENT_MANUAL, f"Monitor created: {monitor.name}")
    created = repo.get_monitor(monitor_id)
    return _monitor_to_dict(created) if created else {"id": monitor_id}


@app.get("/api/monitors/{monitor_id}")
def api_get_monitor(monitor_id: int) -> dict[str, Any]:
    return _get_monitor_dict(monitor_id)


@app.put("/api/monitors/{monitor_id}")
def api_update_monitor(monitor_id: int, payload: MonitorPayload) -> dict[str, Any]:
    _ensure_monitor(monitor_id)
    repo.update_monitor(monitor_id, _monitor_fields_from_payload(payload))
    repo.add_event(monitor_id, EVENT_MANUAL, "Monitor settings updated")
    return _get_monitor_dict(monitor_id)


@app.delete("/api/monitors/{monitor_id}", status_code=204)
def api_delete_monitor(monitor_id: int) -> Response:
    _ensure_monitor(monitor_id)
    repo.add_event(monitor_id, EVENT_MANUAL, "Monitor deleted")
    repo.delete_monitor(monitor_id)
    delete_screenshot(settings, monitor_id)
    return Response(status_code=204)


@app.post("/api/monitors/{monitor_id}/toggle")
def api_toggle_monitor(monitor_id: int) -> dict[str, Any]:
    monitor = _ensure_monitor(monitor_id)
    enabled = not monitor.enabled
    repo.update_monitor(
        monitor_id,
        {
            "enabled": int(enabled),
            "next_check_at": utcnow().isoformat() if enabled else _dt(monitor.next_check_at),
        },
    )
    repo.add_event(monitor_id, EVENT_MANUAL, f"Monitor {'enabled' if enabled else 'disabled'}")
    return _get_monitor_dict(monitor_id)


@app.post("/api/monitors/{monitor_id}/run")
async def api_run_monitor(monitor_id: int) -> dict[str, Any]:
    monitor = _ensure_monitor(monitor_id)
    await checker.check_monitor(monitor)
    repo.add_event(monitor_id, EVENT_MANUAL, "Manual check completed")
    return _get_monitor_dict(monitor_id)


@app.post("/api/monitors/{monitor_id}/test")
async def api_test_monitor(monitor_id: int) -> dict[str, Any]:
    monitor = _ensure_monitor(monitor_id)
    result = await checker.test_rule(monitor)
    return {"matched": result.matched, "evidence": result.evidence}


@app.post("/api/rule-lab")
async def api_rule_lab(payload: MonitorPayload) -> dict[str, Any]:
    monitor = _monitor_from_payload(payload)
    return await checker.rule_lab(monitor)


@app.get("/api/monitors/{monitor_id}/history")
def api_monitor_history(monitor_id: int, limit: int = 50) -> list[dict[str, Any]]:
    _ensure_monitor(monitor_id)
    limit = max(1, min(limit, 200))
    return [_attempt_to_dict(attempt) for attempt in repo.list_attempts(monitor_id, limit=limit)]


@app.get("/api/monitors/{monitor_id}/screenshot")
def api_monitor_screenshot(monitor_id: int) -> FileResponse:
    _ensure_monitor(monitor_id)
    path = screenshot_path(settings, monitor_id)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot not found")
    return FileResponse(path, media_type=SCREENSHOT_CONTENT_TYPE)


@app.get("/api/settings")
def api_get_settings() -> dict[str, Any]:
    return _settings_to_dict(repo.get_settings())


@app.put("/api/settings")
def api_save_settings(payload: SettingsPayload) -> dict[str, Any]:
    data = payload.model_dump()
    app_settings = AppSettings(**data)
    repo.save_settings(app_settings)
    return _settings_to_dict(repo.get_settings())


@app.post("/api/settings/test-notification")
async def api_test_notification() -> dict[str, bool]:
    app_settings = repo.get_settings()
    if not app_settings.ntfy_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="ntfy notifications are disabled"
        )
    if not app_settings.ntfy_topic:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="ntfy topic is required"
        )

    title = "Stock Watcher test"
    message = "Stock Watcher test notification sent successfully."
    try:
        sent = await checker.ntfy.send(app_settings, None, title, message, tags="bell")
    except Exception as exc:  # noqa: BLE001 - surface notification failures without crashing the app
        repo.add_event(None, EVENT_NOTIFICATION_ERROR, f"ntfy test notification failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ntfy test notification failed",
        ) from exc
    if not sent:
        repo.add_event(
            None,
            EVENT_NOTIFICATION_ERROR,
            "ntfy test notification failed: delivery was rejected or unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ntfy test notification failed",
        )
    repo.add_event(None, EVENT_MANUAL, "ntfy test notification sent")
    return {"sent": True}


@app.get("/api/events")
def api_events(limit: int = 200) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 500))
    return [_event_to_dict(row) for row in repo.list_events(limit=limit)]


@app.get("/api/scheduler/status")
def api_scheduler_status() -> dict[str, Any]:
    return _scheduler_status_to_dict()


@app.post("/api/llm/suggest-rule")
async def api_llm_suggest_rule(payload: RuleSuggestPayload) -> dict[str, Any]:
    app_settings = repo.get_settings()
    fetched = await _fetch_for_llm(
        str(payload.url),
        user_agent_mode=payload.user_agent_mode,
        timeout_seconds=payload.timeout_seconds,
    )
    try:
        suggestion = await suggest_rule(
            settings,
            app_settings,
            html_content=fetched.content,
            stock_mode=payload.stock_mode,
            hint=payload.hint,
            current_rule_type=payload.rule_type,
            current_selector_or_path=payload.selector_or_path,
            other_state_sample=payload.other_state_sample,
        )
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return {
        "stock_mode": suggestion.stock_mode,
        "rule_type": suggestion.rule_type,
        "selector_or_path": suggestion.selector_or_path,
        "match_mode": suggestion.match_mode,
        "match_value": suggestion.match_value,
        "quantity_pattern": suggestion.quantity_pattern,
        "low_stock_threshold": suggestion.low_stock_threshold,
        "explanation": suggestion.explanation,
    }


@app.get("/api/notification-rules")
def api_list_notification_rules() -> list[dict[str, Any]]:
    return [_notification_rule_to_dict(rule) for rule in repo.list_notification_rules()]


@app.post("/api/notification-rules", status_code=201)
def api_create_notification_rule(payload: NotificationRulePayload) -> dict[str, Any]:
    rule = _notification_rule_from_payload(payload)
    rule_id = repo.create_notification_rule(rule)
    created = repo.get_notification_rule(rule_id)
    if not created:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Rule could not be created"
        )
    return _notification_rule_to_dict(created)


@app.put("/api/notification-rules/{rule_id}")
def api_update_notification_rule(rule_id: int, payload: NotificationRulePayload) -> dict[str, Any]:
    existing = repo.get_notification_rule(rule_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    rule = _notification_rule_from_payload(payload)
    repo.update_notification_rule(rule_id, rule)
    updated = repo.get_notification_rule(rule_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return _notification_rule_to_dict(updated)


@app.delete("/api/notification-rules/{rule_id}", status_code=204)
def api_delete_notification_rule(rule_id: int) -> Response:
    if not repo.get_notification_rule(rule_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    repo.delete_notification_rule(rule_id)
    return Response(status_code=204)


@app.get("/{path:path}")
def spa(path: str) -> FileResponse:
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Frontend has not been built. Run npm run build in ./frontend.",
    )


def _ensure_monitor(monitor_id: int) -> Monitor:
    monitor = repo.get_monitor(monitor_id)
    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found")
    return monitor


async def _fetch_for_llm(url: str, *, user_agent_mode: str = "random", timeout_seconds: int = 20):
    """Fetch a URL fresh through the configured checker so the LLM works off the
    actual current page — not the truncated saved-evidence snippet."""
    transient = Monitor(
        id=None,
        name="AI helper",
        url=url,
        enabled=True,
        check_mode=CHECK_MODE_BROWSER,
        interval_seconds=900,
        jitter_percent=0,
        rule_type=RULE_TEXT,
        selector_or_path="",
        match_mode=MATCH_CONTAINS,
        match_value="",
        user_agent_mode=user_agent_mode or "random",
        timeout_seconds=timeout_seconds,
    )
    try:
        fetched = await checker.fetch(transient)
    except Exception as exc:  # noqa: BLE001 - bubble fetch failures as 4xx
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Could not fetch the page for AI inspection: {exc}",
        ) from exc
    if fetched.status_code is None or fetched.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Could not fetch the page for AI inspection (HTTP {fetched.status_code}).",
        )
    return fetched


def _get_monitor_dict(monitor_id: int) -> dict[str, Any]:
    monitor = _ensure_monitor(monitor_id)
    quantities = repo.recent_quantities(monitor_id) if monitor.stock_mode == "quantity" else []
    return _monitor_to_dict(monitor, recent_quantities=quantities)


def _monitor_from_payload(payload: MonitorPayload) -> Monitor:
    return Monitor(
        id=None,
        name=payload.name.strip(),
        url=str(payload.url),
        enabled=payload.enabled,
        check_mode=payload.check_mode,
        interval_seconds=payload.interval_seconds,
        jitter_percent=payload.jitter_percent,
        rule_type=payload.rule_type,
        selector_or_path=payload.selector_or_path.strip(),
        match_mode=payload.match_mode,
        match_value=payload.match_value.strip(),
        user_agent_mode=payload.user_agent_mode.strip() or "random",
        timeout_seconds=payload.timeout_seconds,
        stock_mode=payload.stock_mode,
        quantity_pattern=payload.quantity_pattern.strip(),
        low_stock_threshold=payload.low_stock_threshold,
        notifications_enabled=payload.notifications_enabled,
        notify_on_stock_change=payload.notify_on_stock_change,
        notify_on_error=payload.notify_on_error,
        notify_on_challenge=payload.notify_on_challenge,
        status=STATUS_UNKNOWN,
        next_check_at=utcnow() + timedelta(seconds=30),
    )


def _monitor_fields_from_payload(payload: MonitorPayload) -> dict[str, Any]:
    return {
        "name": payload.name.strip(),
        "url": str(payload.url),
        "enabled": int(payload.enabled),
        "check_mode": payload.check_mode,
        "interval_seconds": payload.interval_seconds,
        "jitter_percent": payload.jitter_percent,
        "rule_type": payload.rule_type,
        "selector_or_path": payload.selector_or_path.strip(),
        "match_mode": payload.match_mode,
        "match_value": payload.match_value.strip(),
        "user_agent_mode": payload.user_agent_mode.strip() or "random",
        "timeout_seconds": payload.timeout_seconds,
        "stock_mode": payload.stock_mode,
        "quantity_pattern": payload.quantity_pattern.strip(),
        "low_stock_threshold": payload.low_stock_threshold,
        "notifications_enabled": int(payload.notifications_enabled),
        "notify_on_stock_change": int(payload.notify_on_stock_change),
        "notify_on_error": int(payload.notify_on_error),
        "notify_on_challenge": int(payload.notify_on_challenge),
    }


def _monitor_to_dict(
    monitor: Monitor, *, recent_quantities: list[int] | None = None
) -> dict[str, Any]:
    return {
        "id": monitor.id,
        "name": monitor.name,
        "url": monitor.url,
        "enabled": monitor.enabled,
        "check_mode": monitor.check_mode,
        "interval_seconds": monitor.interval_seconds,
        "jitter_percent": monitor.jitter_percent,
        "rule_type": monitor.rule_type,
        "selector_or_path": monitor.selector_or_path,
        "match_mode": monitor.match_mode,
        "match_value": monitor.match_value,
        "user_agent_mode": monitor.user_agent_mode,
        "timeout_seconds": monitor.timeout_seconds,
        "stock_mode": monitor.stock_mode,
        "quantity_pattern": monitor.quantity_pattern,
        "low_stock_threshold": monitor.low_stock_threshold,
        "status": monitor.status,
        "last_checked_at": _dt(monitor.last_checked_at),
        "next_check_at": _dt(_effective_next_check(monitor)),
        "failure_count": monitor.failure_count,
        "challenge_count": monitor.challenge_count,
        "cooldown_until": _dt(monitor.cooldown_until),
        "last_error": monitor.last_error,
        "last_error_type": monitor.last_error_type,
        "last_evidence": monitor.last_evidence,
        "last_quantity": monitor.last_quantity,
        "last_quantity_at": _dt(monitor.last_quantity_at),
        "last_screenshot_at": _dt(monitor.last_screenshot_at),
        "last_screenshot_error": monitor.last_screenshot_error,
        "notifications_enabled": monitor.notifications_enabled,
        "notify_on_stock_change": monitor.notify_on_stock_change,
        "notify_on_error": monitor.notify_on_error,
        "notify_on_challenge": monitor.notify_on_challenge,
        "last_screenshot_url": (
            screenshot_url(monitor.id)
            if monitor.id
            and monitor.last_screenshot_at
            and screenshot_path(settings, monitor.id).exists()
            else None
        ),
        "recent_quantities": list(recent_quantities or []),
    }


def _attempt_to_dict(attempt: CheckAttempt) -> dict[str, Any]:
    return {
        "id": attempt.id,
        "monitor_id": attempt.monitor_id,
        "status": attempt.status,
        "ok": attempt.ok,
        "duration_ms": attempt.duration_ms,
        "http_status": attempt.http_status,
        "error": attempt.error,
        "error_type": attempt.error_type,
        "evidence": attempt.evidence,
        "reason": attempt.reason,
        "created_at": _dt(attempt.created_at),
        "quantity": attempt.quantity,
    }


def _event_to_dict(row: Any) -> dict[str, Any]:
    payload = dict(row)
    payload["created_at"] = _dt(parse_dt(payload.get("created_at"))) or payload.get("created_at")
    return payload


def _notification_rule_from_payload(payload: NotificationRulePayload) -> NotificationRule:
    return NotificationRule(
        id=None,
        name=payload.name.strip(),
        enabled=payload.enabled,
        monitor_ids=list(payload.monitor_ids),
        trigger_statuses=list(payload.trigger_statuses),
        threshold=payload.threshold,
        cooldown_minutes=payload.cooldown_minutes,
    )


def _notification_rule_to_dict(rule: NotificationRule) -> dict[str, Any]:
    monitors = repo.list_monitors()
    evaluation = evaluate_notification_rule(rule, monitors)
    return {
        "id": rule.id,
        "name": rule.name,
        "enabled": rule.enabled,
        "monitor_ids": list(rule.monitor_ids),
        "trigger_statuses": list(rule.trigger_statuses),
        "threshold": rule.threshold,
        "cooldown_minutes": rule.cooldown_minutes,
        "last_triggered_at": _dt(rule.last_triggered_at),
        "last_satisfied": rule.last_satisfied,
        "current_matching_count": len(evaluation.matching_monitor_ids),
        "current_matching_monitor_ids": list(evaluation.matching_monitor_ids),
        "currently_satisfied": evaluation.satisfied,
    }


def _settings_to_dict(app_settings: AppSettings) -> dict[str, Any]:
    return {
        "ntfy_enabled": app_settings.ntfy_enabled,
        "ntfy_server": app_settings.ntfy_server,
        "ntfy_topic": app_settings.ntfy_topic,
        "ntfy_token": app_settings.ntfy_token,
        "ntfy_priority": app_settings.ntfy_priority,
        "llm_base_url": app_settings.llm_base_url,
        "llm_model": app_settings.llm_model,
        "llm_extra_params": app_settings.llm_extra_params,
        "llm_configured": bool(settings.llm_api_key),
    }


def _scheduler_status_to_dict() -> dict[str, Any]:
    browser_dependency_available = _browser_dependency_available()
    browser_checks_available = browser_dependency_available
    now = utcnow()
    monitors = repo.list_monitors()
    enabled_monitors = [monitor for monitor in monitors if monitor.enabled]
    cooling_down_count = sum(
        1
        for monitor in enabled_monitors
        if monitor.cooldown_until is not None and monitor.cooldown_until > now
    )
    due_monitor_count = repo.count_due_monitors(now)
    next_due_candidates = [
        next_check
        for monitor in enabled_monitors
        if (next_check := _effective_next_check(monitor)) is not None
    ]
    next_due_at = min(next_due_candidates, default=None)
    if not browser_dependency_available:
        browser_reason = "The page-rendering dependency is not installed"
    else:
        browser_reason = "Website checks can load and inspect rendered pages"

    return {
        "running": scheduler.is_running,
        "loop_interval_seconds": settings.check_loop_interval_seconds,
        "due_monitor_count": due_monitor_count,
        "next_due_at": _dt(next_due_at),
        "monitor_counts": {
            "total": len(monitors),
            "enabled": len(enabled_monitors),
            "paused": len(monitors) - len(enabled_monitors),
            "cooling_down": cooling_down_count,
        },
        "last_run": {
            "started_at": _dt(scheduler.last_run_started_at),
            "finished_at": _dt(scheduler.last_run_finished_at),
            "due_count": scheduler.last_run_due_count,
        },
        "last_loop_error": scheduler.last_loop_error or None,
        "last_loop_error_at": _dt(scheduler.last_loop_error_at),
        "browser_checks": {
            "available": browser_checks_available,
            "reason": browser_reason,
        },
        "database_path": str(settings.database_path.resolve()),
        "retention": {
            "events": settings.event_retention_limit,
            "attempts": settings.attempt_retention_limit,
        },
    }


def _browser_dependency_available() -> bool:
    try:
        return importlib.util.find_spec("playwright.async_api") is not None
    except ModuleNotFoundError:
        return False


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _effective_next_check(monitor: Monitor) -> datetime | None:
    if (
        monitor.next_check_at
        and monitor.cooldown_until
        and monitor.cooldown_until > monitor.next_check_at
    ):
        return monitor.cooldown_until
    return monitor.next_check_at
