from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.checker import StockChecker
from app.config import settings
from app.db import connect, init_db
from app.llm import LLMError, suggest_rule
from app.models import (
    CHECK_MODE_BROWSER,
    EVENT_MANUAL,
    EVENT_NOTIFICATION_ERROR,
    MATCH_CONTAINS,
    RULE_TEXT,
    AppSettings,
    Monitor,
    utcnow,
)
from app.repository import Repository
from app.scheduler import Scheduler
from app.schemas import (
    MonitorPayload,
    NotificationRulePayload,
    RuleSuggestPayload,
    SettingsPayload,
)
from app.screenshots import SCREENSHOT_CONTENT_TYPE, delete_screenshot, screenshot_path
from app.serializers import (
    attempt_to_dict,
    event_to_dict,
    monitor_to_dict,
    notification_rule_to_dict,
    scheduler_status_to_dict,
    settings_to_dict,
    to_iso,
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


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/monitors")
def api_list_monitors() -> list[dict[str, Any]]:
    monitors = repo.list_monitors()
    quantities = repo.recent_quantities_by_monitor()
    return [
        monitor_to_dict(monitor, settings, recent_quantities=quantities.get(monitor.id or 0, []))
        for monitor in monitors
    ]


@app.post("/api/monitors", status_code=201)
def api_create_monitor(payload: MonitorPayload) -> dict[str, Any]:
    monitor = payload.to_monitor()
    monitor_id = repo.create_monitor(monitor)
    repo.add_event(monitor_id, EVENT_MANUAL, f"Monitor created: {monitor.name}")
    created = repo.get_monitor(monitor_id)
    return monitor_to_dict(created, settings) if created else {"id": monitor_id}


@app.get("/api/monitors/{monitor_id}")
def api_get_monitor(monitor_id: int) -> dict[str, Any]:
    return _get_monitor_dict(monitor_id)


@app.put("/api/monitors/{monitor_id}")
def api_update_monitor(monitor_id: int, payload: MonitorPayload) -> dict[str, Any]:
    _ensure_monitor(monitor_id)
    repo.update_monitor(monitor_id, payload.to_update_fields())
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
            "next_check_at": utcnow().isoformat() if enabled else to_iso(monitor.next_check_at),
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
    monitor = payload.to_monitor()
    return await checker.rule_lab(monitor)


@app.get("/api/monitors/{monitor_id}/history")
def api_monitor_history(monitor_id: int, limit: int = 50) -> list[dict[str, Any]]:
    _ensure_monitor(monitor_id)
    limit = max(1, min(limit, 200))
    return [attempt_to_dict(attempt) for attempt in repo.list_attempts(monitor_id, limit=limit)]


@app.get("/api/monitors/{monitor_id}/screenshot")
def api_monitor_screenshot(monitor_id: int) -> FileResponse:
    _ensure_monitor(monitor_id)
    path = screenshot_path(settings, monitor_id)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot not found")
    return FileResponse(path, media_type=SCREENSHOT_CONTENT_TYPE)


@app.get("/api/settings")
def api_get_settings() -> dict[str, Any]:
    return settings_to_dict(repo.get_settings(), llm_configured=bool(settings.llm_api_key))


@app.put("/api/settings")
def api_save_settings(payload: SettingsPayload) -> dict[str, Any]:
    data = payload.model_dump()
    app_settings = AppSettings(**data)
    repo.save_settings(app_settings)
    return settings_to_dict(repo.get_settings(), llm_configured=bool(settings.llm_api_key))


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
    return [event_to_dict(row) for row in repo.list_events(limit=limit)]


@app.get("/api/scheduler/status")
def api_scheduler_status() -> dict[str, Any]:
    return scheduler_status_to_dict(scheduler, repo, settings)


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
    monitors = repo.list_monitors()
    return [
        notification_rule_to_dict(rule, monitors) for rule in repo.list_notification_rules()
    ]


@app.post("/api/notification-rules", status_code=201)
def api_create_notification_rule(payload: NotificationRulePayload) -> dict[str, Any]:
    rule_id = repo.create_notification_rule(payload.to_rule())
    created = repo.get_notification_rule(rule_id)
    if not created:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Rule could not be created"
        )
    return notification_rule_to_dict(created, repo.list_monitors())


@app.put("/api/notification-rules/{rule_id}")
def api_update_notification_rule(rule_id: int, payload: NotificationRulePayload) -> dict[str, Any]:
    existing = repo.get_notification_rule(rule_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    repo.update_notification_rule(rule_id, payload.to_rule())
    updated = repo.get_notification_rule(rule_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return notification_rule_to_dict(updated, repo.list_monitors())


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
    return monitor_to_dict(monitor, settings, recent_quantities=quantities)
