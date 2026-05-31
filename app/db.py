from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    check_mode TEXT NOT NULL DEFAULT 'browser',
    interval_seconds INTEGER NOT NULL DEFAULT 900,
    jitter_percent INTEGER NOT NULL DEFAULT 20,
    rule_type TEXT NOT NULL DEFAULT 'text',
    selector_or_path TEXT NOT NULL DEFAULT '',
    match_mode TEXT NOT NULL DEFAULT 'contains',
    match_value TEXT NOT NULL DEFAULT '',
    user_agent_mode TEXT NOT NULL DEFAULT 'random',
    timeout_seconds INTEGER NOT NULL DEFAULT 20,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_checked_at TEXT,
    next_check_at TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    challenge_count INTEGER NOT NULL DEFAULT 0,
    cooldown_until TEXT,
    last_error TEXT NOT NULL DEFAULT '',
    last_error_type TEXT NOT NULL DEFAULT '',
    last_evidence TEXT NOT NULL DEFAULT '',
    last_screenshot_at TEXT,
    last_screenshot_error TEXT NOT NULL DEFAULT '',
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    notify_on_stock_change INTEGER NOT NULL DEFAULT 1,
    notify_on_error INTEGER NOT NULL DEFAULT 1,
    notify_on_challenge INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER,
    event_type TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    message TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS check_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    ok INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    http_status INTEGER,
    error TEXT NOT NULL DEFAULT '',
    error_type TEXT NOT NULL DEFAULT '',
    evidence TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    monitor_ids TEXT NOT NULL DEFAULT '[]',
    trigger_statuses TEXT NOT NULL DEFAULT '["in_stock"]',
    threshold INTEGER NOT NULL DEFAULT 1,
    cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    last_triggered_at TEXT,
    last_satisfied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(enabled, next_check_at);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_monitor_created ON check_attempts(monitor_id, created_at DESC);
"""


def connect(database_path: Path, *, check_same_thread: bool = True) -> sqlite3.Connection:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(database_path, check_same_thread=check_same_thread, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    _ensure_columns(
        conn,
        "monitors",
        {
            "last_error_type": "TEXT NOT NULL DEFAULT ''",
            "last_screenshot_at": "TEXT",
            "last_screenshot_error": "TEXT NOT NULL DEFAULT ''",
            "stock_mode": "TEXT NOT NULL DEFAULT 'binary'",
            "quantity_pattern": "TEXT NOT NULL DEFAULT ''",
            "low_stock_threshold": "INTEGER",
            "last_quantity": "INTEGER",
            "last_quantity_at": "TEXT",
            "notifications_enabled": "INTEGER NOT NULL DEFAULT 1",
            "notify_on_stock_change": "INTEGER NOT NULL DEFAULT 1",
            "notify_on_error": "INTEGER NOT NULL DEFAULT 1",
            "notify_on_challenge": "INTEGER NOT NULL DEFAULT 1",
            "tags": "TEXT NOT NULL DEFAULT '[]'",
        },
    )
    _ensure_columns(
        conn,
        "check_attempts",
        {
            "error_type": "TEXT NOT NULL DEFAULT ''",
            "reason": "TEXT NOT NULL DEFAULT ''",
            "quantity": "INTEGER",
        },
    )
    conn.execute("UPDATE monitors SET check_mode = 'browser' WHERE check_mode != 'browser'")
    conn.commit()


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
