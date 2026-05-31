from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=False)


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    database_path: Path
    timezone: str
    check_loop_interval_seconds: int
    event_retention_limit: int
    attempt_retention_limit: int
    default_ntfy_server: str
    default_ntfy_topic: str
    ntfy_max_attempts: int
    ntfy_retry_backoff_seconds: float
    llm_api_key: str
    llm_html_char_limit: int
    # VAPID `sub` claim for Web Push: a mailto:/https: contact some push
    # services require. The keypair itself is generated and stored under
    # DATA_DIR on first use; only the contact is configurable.
    webpush_contact: str = "mailto:admin@example.com"


def load_settings() -> Settings:
    data_dir = Path(os.getenv("DATA_DIR", "./data")).expanduser()
    database_path = Path(
        os.getenv("DATABASE_PATH", data_dir / "stock_watcher.sqlite3")
    ).expanduser()
    return Settings(
        data_dir=data_dir,
        database_path=database_path,
        timezone=os.getenv("TZ", "UTC"),
        check_loop_interval_seconds=max(1, _int_env("CHECK_LOOP_INTERVAL_SECONDS", 15)),
        event_retention_limit=max(100, _int_env("EVENT_RETENTION_LIMIT", 1000)),
        attempt_retention_limit=max(100, _int_env("ATTEMPT_RETENTION_LIMIT", 5000)),
        default_ntfy_server=os.getenv("NTFY_SERVER", "https://ntfy.sh"),
        default_ntfy_topic=os.getenv("NTFY_TOPIC", ""),
        ntfy_max_attempts=max(1, _int_env("NTFY_MAX_ATTEMPTS", 3)),
        ntfy_retry_backoff_seconds=max(0.0, _float_env("NTFY_RETRY_BACKOFF_SECONDS", 0.5)),
        llm_api_key=os.getenv("LLM_API_KEY", "").strip(),
        llm_html_char_limit=max(4_000, _int_env("LLM_HTML_CHAR_LIMIT", 200_000)),
        webpush_contact=os.getenv("WEBPUSH_CONTACT", "mailto:admin@example.com").strip()
        or "mailto:admin@example.com",
    )


settings = load_settings()
