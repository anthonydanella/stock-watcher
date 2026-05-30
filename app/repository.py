from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime
from typing import Any

from app.config import Settings
from app.db import connect
from app.models import AppSettings, CheckAttempt, Monitor, NotificationRule, parse_dt, utcnow

MONITOR_UPDATE_COLUMNS = {
    "name",
    "url",
    "enabled",
    "check_mode",
    "interval_seconds",
    "jitter_percent",
    "rule_type",
    "selector_or_path",
    "match_mode",
    "match_value",
    "user_agent_mode",
    "timeout_seconds",
    "stock_mode",
    "quantity_pattern",
    "low_stock_threshold",
    "status",
    "last_checked_at",
    "next_check_at",
    "failure_count",
    "challenge_count",
    "cooldown_until",
    "last_error",
    "last_error_type",
    "last_evidence",
    "last_quantity",
    "last_quantity_at",
    "last_screenshot_at",
    "last_screenshot_error",
    "notifications_enabled",
    "notify_on_stock_change",
    "notify_on_error",
    "notify_on_challenge",
    "tags",
}


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def monitor_from_row(row: sqlite3.Row) -> Monitor:
    keys = row.keys()
    return Monitor(
        id=row["id"],
        name=row["name"],
        url=row["url"],
        enabled=bool(row["enabled"]),
        check_mode=row["check_mode"],
        interval_seconds=row["interval_seconds"],
        jitter_percent=row["jitter_percent"],
        rule_type=row["rule_type"],
        selector_or_path=row["selector_or_path"],
        match_mode=row["match_mode"],
        match_value=row["match_value"],
        user_agent_mode=row["user_agent_mode"],
        timeout_seconds=row["timeout_seconds"],
        stock_mode=row["stock_mode"] if "stock_mode" in keys else "binary",
        quantity_pattern=row["quantity_pattern"] if "quantity_pattern" in keys else "",
        low_stock_threshold=row["low_stock_threshold"] if "low_stock_threshold" in keys else None,
        status=row["status"],
        last_checked_at=parse_dt(row["last_checked_at"]),
        next_check_at=parse_dt(row["next_check_at"]),
        failure_count=row["failure_count"],
        challenge_count=row["challenge_count"],
        cooldown_until=parse_dt(row["cooldown_until"]),
        last_error=row["last_error"],
        last_error_type=row["last_error_type"],
        last_evidence=row["last_evidence"],
        last_quantity=row["last_quantity"] if "last_quantity" in keys else None,
        last_quantity_at=parse_dt(row["last_quantity_at"]) if "last_quantity_at" in keys else None,
        last_screenshot_at=parse_dt(row["last_screenshot_at"]),
        last_screenshot_error=row["last_screenshot_error"],
        notifications_enabled=bool(row["notifications_enabled"])
        if "notifications_enabled" in keys
        else True,
        notify_on_stock_change=bool(row["notify_on_stock_change"])
        if "notify_on_stock_change" in keys
        else True,
        notify_on_error=bool(row["notify_on_error"]) if "notify_on_error" in keys else True,
        notify_on_challenge=bool(row["notify_on_challenge"])
        if "notify_on_challenge" in keys
        else True,
        tags=[str(value) for value in _json_list(row["tags"], [])] if "tags" in keys else [],
    )


def _json_list(value: Any, default: list) -> list:
    if not value:
        return list(default)
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return list(default)
    return list(parsed) if isinstance(parsed, list) else list(default)


def notification_rule_from_row(row: sqlite3.Row) -> NotificationRule:
    return NotificationRule(
        id=row["id"],
        name=row["name"],
        enabled=bool(row["enabled"]),
        monitor_ids=[int(value) for value in _json_list(row["monitor_ids"], [])],
        trigger_statuses=[
            str(value) for value in _json_list(row["trigger_statuses"], ["in_stock"])
        ],
        threshold=int(row["threshold"]),
        cooldown_minutes=int(row["cooldown_minutes"]),
        last_triggered_at=parse_dt(row["last_triggered_at"]),
        last_satisfied=bool(row["last_satisfied"]),
    )


def attempt_from_row(row: sqlite3.Row) -> CheckAttempt:
    keys = row.keys()
    return CheckAttempt(
        id=row["id"],
        monitor_id=row["monitor_id"],
        status=row["status"],
        ok=bool(row["ok"]),
        duration_ms=row["duration_ms"],
        http_status=row["http_status"],
        error=row["error"],
        error_type=row["error_type"],
        evidence=row["evidence"],
        reason=row["reason"],
        created_at=parse_dt(row["created_at"]),
        quantity=row["quantity"] if "quantity" in keys else None,
    )


class Repository:
    def __init__(self, conn: sqlite3.Connection | None, settings: Settings):
        self.settings = settings
        self._database_path = settings.database_path
        self._local = threading.local()

        if conn is not None:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA busy_timeout = 30000")
            self._local.conn = conn

    @property
    def conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = connect(self._database_path)
            self._local.conn = conn
        return conn

    def list_monitors(self) -> list[Monitor]:
        rows = self.conn.execute("SELECT * FROM monitors ORDER BY name COLLATE NOCASE").fetchall()
        return [monitor_from_row(row) for row in rows]

    def list_due_monitors(self, now: datetime, limit: int = 25) -> list[Monitor]:
        rows = self.conn.execute(
            """
            SELECT * FROM monitors
            WHERE enabled = 1
              AND (next_check_at IS NULL OR next_check_at <= ?)
              AND (cooldown_until IS NULL OR cooldown_until <= ?)
            ORDER BY COALESCE(next_check_at, '1970-01-01T00:00:00+00:00')
            LIMIT ?
            """,
            (now.isoformat(), now.isoformat(), limit),
        ).fetchall()
        return [monitor_from_row(row) for row in rows]

    def count_due_monitors(self, now: datetime) -> int:
        row = self.conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM monitors
            WHERE enabled = 1
              AND (next_check_at IS NULL OR next_check_at <= ?)
              AND (cooldown_until IS NULL OR cooldown_until <= ?)
            """,
            (now.isoformat(), now.isoformat()),
        ).fetchone()
        return int(row["count"])

    def get_monitor(self, monitor_id: int) -> Monitor | None:
        row = self.conn.execute("SELECT * FROM monitors WHERE id = ?", (monitor_id,)).fetchone()
        return monitor_from_row(row) if row else None

    def create_monitor(self, monitor: Monitor) -> int:
        cursor = self.conn.execute(
            """
            INSERT INTO monitors (
                name, url, enabled, check_mode, interval_seconds, jitter_percent,
                rule_type, selector_or_path, match_mode, match_value, user_agent_mode,
                timeout_seconds, stock_mode, quantity_pattern, low_stock_threshold,
                status, next_check_at,
                notifications_enabled, notify_on_stock_change, notify_on_error, notify_on_challenge,
                tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                monitor.name,
                monitor.url,
                int(monitor.enabled),
                monitor.check_mode,
                monitor.interval_seconds,
                monitor.jitter_percent,
                monitor.rule_type,
                monitor.selector_or_path,
                monitor.match_mode,
                monitor.match_value,
                monitor.user_agent_mode,
                monitor.timeout_seconds,
                monitor.stock_mode,
                monitor.quantity_pattern,
                monitor.low_stock_threshold,
                monitor.status,
                _dt(monitor.next_check_at),
                int(monitor.notifications_enabled),
                int(monitor.notify_on_stock_change),
                int(monitor.notify_on_error),
                int(monitor.notify_on_challenge),
                json.dumps(monitor.tags),
            ),
        )
        self.conn.commit()
        row_id = cursor.lastrowid
        assert row_id is not None  # a successful INSERT always populates lastrowid
        return row_id

    def update_monitor(self, monitor_id: int, fields: dict[str, Any]) -> None:
        if not fields:
            return
        unknown_fields = sorted(set(fields) - MONITOR_UPDATE_COLUMNS)
        if unknown_fields:
            raise ValueError(f"Unknown monitor update field(s): {', '.join(unknown_fields)}")
        fields = {**fields, "updated_at": utcnow().isoformat()}
        assignments = ", ".join(f"{key} = ?" for key in fields)
        self.conn.execute(
            f"UPDATE monitors SET {assignments} WHERE id = ?",
            [*fields.values(), monitor_id],
        )
        self.conn.commit()

    def delete_monitor(self, monitor_id: int) -> None:
        self.conn.execute("DELETE FROM monitors WHERE id = ?", (monitor_id,))
        self.conn.commit()

    def add_event(
        self,
        monitor_id: int | None,
        event_type: str,
        message: str,
        old_status: str | None = None,
        new_status: str | None = None,
        evidence: str = "",
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO events (monitor_id, event_type, old_status, new_status, message, evidence)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (monitor_id, event_type, old_status, new_status, message, evidence[:2000]),
        )
        self.conn.execute(
            """
            DELETE FROM events
            WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT ?)
            """,
            (self.settings.event_retention_limit,),
        )
        self.conn.commit()

    def list_events(self, limit: int = 100) -> list[sqlite3.Row]:
        return self.conn.execute(
            """
            SELECT e.*, m.name AS monitor_name
            FROM events e
            LEFT JOIN monitors m ON m.id = e.monitor_id
            ORDER BY e.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    def add_attempt(
        self,
        monitor_id: int,
        status: str,
        ok: bool,
        duration_ms: int,
        http_status: int | None,
        error: str = "",
        evidence: str = "",
        error_type: str = "",
        reason: str = "",
        quantity: int | None = None,
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO check_attempts
                (monitor_id, status, ok, duration_ms, http_status, error, error_type, evidence, reason, quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                monitor_id,
                status,
                int(ok),
                duration_ms,
                http_status,
                error[:1000],
                error_type[:80],
                evidence[:2000],
                reason[:1000],
                quantity,
            ),
        )
        self.conn.execute(
            """
            DELETE FROM check_attempts
            WHERE id NOT IN (SELECT id FROM check_attempts ORDER BY id DESC LIMIT ?)
            """,
            (self.settings.attempt_retention_limit,),
        )
        self.conn.commit()

    def recent_quantities(self, monitor_id: int, limit: int = 30) -> list[int]:
        rows = self.conn.execute(
            """
            SELECT quantity FROM check_attempts
            WHERE monitor_id = ? AND quantity IS NOT NULL
            ORDER BY id DESC
            LIMIT ?
            """,
            (monitor_id, limit),
        ).fetchall()
        return [int(row["quantity"]) for row in rows if row["quantity"] is not None]

    def recent_quantities_by_monitor(self, limit: int = 30) -> dict[int, list[int]]:
        rows = self.conn.execute(
            """
            SELECT monitor_id, quantity FROM (
                SELECT monitor_id, quantity,
                       ROW_NUMBER() OVER (PARTITION BY monitor_id ORDER BY id DESC) AS rn
                FROM check_attempts
                WHERE quantity IS NOT NULL
            )
            WHERE rn <= ?
            ORDER BY monitor_id, rn ASC
            """,
            (limit,),
        ).fetchall()
        result: dict[int, list[int]] = {}
        for row in rows:
            result.setdefault(int(row["monitor_id"]), []).append(int(row["quantity"]))
        return result

    def list_attempts(self, monitor_id: int, limit: int = 50) -> list[CheckAttempt]:
        rows = self.conn.execute(
            """
            SELECT *
            FROM check_attempts
            WHERE monitor_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (monitor_id, limit),
        ).fetchall()
        return [attempt_from_row(row) for row in rows]

    def get_settings(self) -> AppSettings:
        rows = self.conn.execute("SELECT key, value FROM app_settings").fetchall()
        data = {row["key"]: row["value"] for row in rows}
        return AppSettings(
            ntfy_enabled=data.get("ntfy_enabled", "0") == "1",
            ntfy_server=data.get("ntfy_server", self.settings.default_ntfy_server),
            ntfy_topic=data.get("ntfy_topic", self.settings.default_ntfy_topic),
            ntfy_token=data.get("ntfy_token", ""),
            ntfy_priority=data.get("ntfy_priority", "default"),
            llm_base_url=data.get("llm_base_url", "https://api.openai.com/v1"),
            llm_model=data.get("llm_model", ""),
            llm_extra_params=data.get("llm_extra_params", ""),
        )

    def list_notification_rules(self) -> list[NotificationRule]:
        rows = self.conn.execute(
            "SELECT * FROM notification_rules ORDER BY name COLLATE NOCASE"
        ).fetchall()
        return [notification_rule_from_row(row) for row in rows]

    def get_notification_rule(self, rule_id: int) -> NotificationRule | None:
        row = self.conn.execute(
            "SELECT * FROM notification_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        return notification_rule_from_row(row) if row else None

    def create_notification_rule(self, rule: NotificationRule) -> int:
        cursor = self.conn.execute(
            """
            INSERT INTO notification_rules (
                name, enabled, monitor_ids, trigger_statuses,
                threshold, cooldown_minutes
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                rule.name,
                int(rule.enabled),
                json.dumps(rule.monitor_ids),
                json.dumps(rule.trigger_statuses),
                rule.threshold,
                rule.cooldown_minutes,
            ),
        )
        self.conn.commit()
        row_id = cursor.lastrowid
        assert row_id is not None  # a successful INSERT always populates lastrowid
        return row_id

    def update_notification_rule(self, rule_id: int, rule: NotificationRule) -> None:
        self.conn.execute(
            """
            UPDATE notification_rules SET
                name = ?,
                enabled = ?,
                monitor_ids = ?,
                trigger_statuses = ?,
                threshold = ?,
                cooldown_minutes = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                rule.name,
                int(rule.enabled),
                json.dumps(rule.monitor_ids),
                json.dumps(rule.trigger_statuses),
                rule.threshold,
                rule.cooldown_minutes,
                utcnow().isoformat(),
                rule_id,
            ),
        )
        self.conn.commit()

    def delete_notification_rule(self, rule_id: int) -> None:
        self.conn.execute("DELETE FROM notification_rules WHERE id = ?", (rule_id,))
        self.conn.commit()

    def update_notification_rule_state(
        self,
        rule_id: int,
        *,
        last_satisfied: bool,
        last_triggered_at: datetime | None,
    ) -> None:
        self.conn.execute(
            """
            UPDATE notification_rules
            SET last_satisfied = ?,
                last_triggered_at = ?
            WHERE id = ?
            """,
            (int(last_satisfied), _dt(last_triggered_at), rule_id),
        )
        self.conn.commit()

    def save_settings(self, app_settings: AppSettings) -> None:
        values = {
            "ntfy_enabled": "1" if app_settings.ntfy_enabled else "0",
            "ntfy_server": app_settings.ntfy_server.rstrip("/"),
            "ntfy_topic": app_settings.ntfy_topic.strip(),
            "ntfy_token": app_settings.ntfy_token.strip(),
            "ntfy_priority": app_settings.ntfy_priority,
            "llm_base_url": app_settings.llm_base_url.strip().rstrip("/"),
            "llm_model": app_settings.llm_model.strip(),
            "llm_extra_params": app_settings.llm_extra_params.strip(),
        }
        self.conn.executemany(
            """
            INSERT INTO app_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            values.items(),
        )
        self.conn.commit()
