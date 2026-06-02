"""Response shaping for the HTTP API: turn domain models into JSON-ready dicts.

Kept separate from ``app.main`` (routes) and ``app.schemas`` (request models).
Functions take their dependencies (settings, repository, scheduler, monitors)
explicitly rather than reaching for module globals, so they stay pure and the
test suite's ``importlib.reload(app.main)`` isolation keeps working.
"""

from __future__ import annotations

import importlib.util
from datetime import datetime
from typing import Any

from app.config import Settings
from app.models import AppSettings, CheckAttempt, Monitor, NotificationRule, parse_dt, utcnow
from app.notification_rules import evaluate_rule as evaluate_notification_rule
from app.repository import Repository
from app.scheduler import Scheduler
from app.screenshots import screenshot_path, screenshot_url


def to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def effective_next_check(monitor: Monitor) -> datetime | None:
    if (
        monitor.next_check_at
        and monitor.cooldown_until
        and monitor.cooldown_until > monitor.next_check_at
    ):
        return monitor.cooldown_until
    return monitor.next_check_at


def browser_dependency_available() -> bool:
    try:
        return importlib.util.find_spec("playwright.async_api") is not None
    except ModuleNotFoundError:
        return False


def monitor_to_dict(
    monitor: Monitor, settings: Settings, *, recent_quantities: list[int] | None = None
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
        "last_checked_at": to_iso(monitor.last_checked_at),
        "next_check_at": to_iso(effective_next_check(monitor)),
        "failure_count": monitor.failure_count,
        "challenge_count": monitor.challenge_count,
        "cooldown_until": to_iso(monitor.cooldown_until),
        "last_status_change_at": to_iso(monitor.last_status_change_at),
        "last_status_change_from": monitor.last_status_change_from,
        "last_error": monitor.last_error,
        "last_error_type": monitor.last_error_type,
        "last_evidence": monitor.last_evidence,
        "last_quantity": monitor.last_quantity,
        "last_quantity_at": to_iso(monitor.last_quantity_at),
        "last_screenshot_at": to_iso(monitor.last_screenshot_at),
        "last_screenshot_error": monitor.last_screenshot_error,
        "notifications_enabled": monitor.notifications_enabled,
        "notify_on_stock_change": monitor.notify_on_stock_change,
        "notify_on_error": monitor.notify_on_error,
        "notify_on_challenge": monitor.notify_on_challenge,
        "tags": list(monitor.tags),
        "last_screenshot_url": (
            screenshot_url(monitor.id)
            if monitor.id
            and monitor.last_screenshot_at
            and screenshot_path(settings, monitor.id).exists()
            else None
        ),
        "recent_quantities": list(recent_quantities or []),
    }


def attempt_to_dict(attempt: CheckAttempt) -> dict[str, Any]:
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
        "created_at": to_iso(attempt.created_at),
        "quantity": attempt.quantity,
    }


def event_to_dict(row: Any) -> dict[str, Any]:
    payload = dict(row)
    payload["created_at"] = to_iso(parse_dt(payload.get("created_at"))) or payload.get("created_at")
    return payload


def notification_rule_to_dict(rule: NotificationRule, monitors: list[Monitor]) -> dict[str, Any]:
    evaluation = evaluate_notification_rule(rule, monitors)
    return {
        "id": rule.id,
        "name": rule.name,
        "enabled": rule.enabled,
        "monitor_ids": list(rule.monitor_ids),
        "trigger_statuses": list(rule.trigger_statuses),
        "threshold": rule.threshold,
        "cooldown_minutes": rule.cooldown_minutes,
        "last_triggered_at": to_iso(rule.last_triggered_at),
        "last_satisfied": rule.last_satisfied,
        "current_matching_count": len(evaluation.matching_monitor_ids),
        "current_matching_monitor_ids": list(evaluation.matching_monitor_ids),
        "currently_satisfied": evaluation.satisfied,
    }


def settings_to_dict(
    app_settings: AppSettings,
    *,
    llm_configured: bool,
    webpush_public_key: str = "",
    webpush_subscriptions: int = 0,
) -> dict[str, Any]:
    return {
        "ntfy_enabled": app_settings.ntfy_enabled,
        "ntfy_server": app_settings.ntfy_server,
        "ntfy_topic": app_settings.ntfy_topic,
        "ntfy_token": app_settings.ntfy_token,
        "ntfy_priority": app_settings.ntfy_priority,
        "webpush_enabled": app_settings.webpush_enabled,
        "webhook_enabled": app_settings.webhook_enabled,
        "webhook_url": app_settings.webhook_url,
        "webhook_format": app_settings.webhook_format,
        "webhook_headers": app_settings.webhook_headers,
        "llm_base_url": app_settings.llm_base_url,
        "llm_model": app_settings.llm_model,
        "llm_extra_params": app_settings.llm_extra_params,
        "llm_configured": llm_configured,
        # Read-only Web Push status for the UI: the public key the browser needs
        # to subscribe, and how many devices are currently subscribed.
        "webpush_public_key": webpush_public_key,
        "webpush_configured": bool(webpush_public_key),
        "webpush_subscriptions": webpush_subscriptions,
    }


def scheduler_status_to_dict(
    scheduler: Scheduler, repo: Repository, settings: Settings
) -> dict[str, Any]:
    browser_dependency = browser_dependency_available()
    browser_checks_available = browser_dependency
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
        if (next_check := effective_next_check(monitor)) is not None
    ]
    next_due_at = min(next_due_candidates, default=None)
    if not browser_dependency:
        browser_reason = "The page-rendering dependency is not installed"
    else:
        browser_reason = "Website checks can load and inspect rendered pages"

    return {
        "running": scheduler.is_running,
        "loop_interval_seconds": settings.check_loop_interval_seconds,
        "due_monitor_count": due_monitor_count,
        "next_due_at": to_iso(next_due_at),
        "monitor_counts": {
            "total": len(monitors),
            "enabled": len(enabled_monitors),
            "paused": len(monitors) - len(enabled_monitors),
            "cooling_down": cooling_down_count,
        },
        "last_run": {
            "started_at": to_iso(scheduler.last_run_started_at),
            "finished_at": to_iso(scheduler.last_run_finished_at),
            "due_count": scheduler.last_run_due_count,
        },
        "last_loop_error": scheduler.last_loop_error or None,
        "last_loop_error_at": to_iso(scheduler.last_loop_error_at),
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
