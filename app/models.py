from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

STATUS_UNKNOWN = "unknown"
STATUS_IN_STOCK = "in_stock"
STATUS_OUT_OF_STOCK = "out_of_stock"
STATUS_LOW_STOCK = "low_stock"
STATUS_ERROR = "error"
STATUS_CHALLENGE = "challenge"
STATUS_PAUSED = "paused"

STOCK_MODE_BINARY = "binary"
STOCK_MODE_QUANTITY = "quantity"

CHECK_MODE_BROWSER = "browser"

RULE_CSS = "css"
RULE_TEXT = "text"

MATCH_CONTAINS = "contains"
MATCH_NOT_CONTAINS = "not_contains"
MATCH_EQUALS = "equals"
MATCH_REGEX = "regex"
MATCH_EXISTS = "exists"

EVENT_STATUS_CHANGE = "status_change"
EVENT_ERROR = "error"
EVENT_CHALLENGE = "challenge"
EVENT_RECOVERY = "recovery"
EVENT_MANUAL = "manual"
EVENT_NOTIFICATION_ERROR = "notification_error"
EVENT_SCREENSHOT_ERROR = "screenshot_error"
EVENT_ALERT_TRIGGERED = "alert_triggered"

ALERT_STATUSES = ("in_stock", "low_stock", "out_of_stock", "error", "challenge", "unknown")

ERROR_GENERIC = "error"
ERROR_DNS = "dns_error"
ERROR_TIMEOUT = "timeout_error"
ERROR_HTTP = "http_error"
ERROR_SELECTOR = "selector_error"
ERROR_SCREENSHOT = "screenshot_error"
ERROR_NOTIFICATION = "notification_error"
ERROR_QUANTITY_PARSE = "quantity_parse_error"

STOCK_STATUSES = {STATUS_IN_STOCK, STATUS_OUT_OF_STOCK, STATUS_LOW_STOCK}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


@dataclass
class Monitor:
    id: int | None
    name: str
    url: str
    enabled: bool
    check_mode: str
    interval_seconds: int
    jitter_percent: int
    rule_type: str
    selector_or_path: str
    match_mode: str
    match_value: str
    user_agent_mode: str
    timeout_seconds: int
    stock_mode: str = STOCK_MODE_BINARY
    quantity_pattern: str = ""
    low_stock_threshold: int | None = None
    status: str = STATUS_UNKNOWN
    last_checked_at: datetime | None = None
    next_check_at: datetime | None = None
    failure_count: int = 0
    challenge_count: int = 0
    cooldown_until: datetime | None = None
    # Stamped whenever a check moves the monitor to a different status, so the UI
    # can show "<from> → <status> · <when>" without scraping the events feed.
    last_status_change_at: datetime | None = None
    last_status_change_from: str = ""
    last_error: str = ""
    last_error_type: str = ""
    last_evidence: str = ""
    last_quantity: int | None = None
    last_quantity_at: datetime | None = None
    last_screenshot_at: datetime | None = None
    last_screenshot_error: str = ""
    notifications_enabled: bool = True
    notify_on_stock_change: bool = True
    notify_on_error: bool = True
    notify_on_challenge: bool = True
    tags: list[str] = field(default_factory=list)


@dataclass
class CheckAttempt:
    id: int
    monitor_id: int
    status: str
    ok: bool
    duration_ms: int
    http_status: int | None
    error: str
    error_type: str
    evidence: str
    reason: str
    created_at: datetime | None
    quantity: int | None = None


WEBHOOK_FORMAT_CUSTOM = "custom"
WEBHOOK_FORMAT_DISCORD = "discord"
WEBHOOK_FORMAT_SLACK = "slack"
WEBHOOK_FORMATS = (WEBHOOK_FORMAT_CUSTOM, WEBHOOK_FORMAT_DISCORD, WEBHOOK_FORMAT_SLACK)


@dataclass
class AppSettings:
    ntfy_enabled: bool
    ntfy_server: str
    ntfy_topic: str
    ntfy_token: str
    ntfy_priority: str
    # Web Push is the default channel: it works without any extra account, the
    # VAPID keys are generated and stored server-side, and devices opt in per
    # browser. Disabled channels short-circuit before any network call.
    webpush_enabled: bool = True
    webhook_enabled: bool = False
    webhook_url: str = ""
    webhook_format: str = WEBHOOK_FORMAT_CUSTOM
    webhook_headers: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = ""
    llm_extra_params: str = ""


@dataclass
class PushSubscription:
    """A browser Web Push subscription (one per device/browser that opted in).

    `endpoint` is the push-service URL the browser handed us; `p256dh`/`auth`
    are the client keys used to encrypt the payload (RFC 8291).
    """

    id: int | None
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str = ""
    created_at: datetime | None = None


@dataclass
class NotificationRule:
    """A user-defined cross-monitor alert.

    Fires an ntfy notification when at least `threshold` monitors in
    `monitor_ids` (empty list means "all monitors") are currently in one of
    `trigger_statuses`. Fires on the false→true transition so a steady-state
    condition doesn't spam. `cooldown_minutes` further suppresses re-fires
    after a recent trigger.
    """

    id: int | None
    name: str
    enabled: bool
    monitor_ids: list[int]
    trigger_statuses: list[str]
    threshold: int
    cooldown_minutes: int
    last_triggered_at: datetime | None = None
    last_satisfied: bool = False
