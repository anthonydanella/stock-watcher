"""Pydantic request models for the HTTP API and their conversion to domain models.

These shape and validate inbound request bodies for ``app.main`` and know how to
turn themselves into the persistence-layer dataclasses (``Monitor`` /
``NotificationRule``). Response shaping lives in ``app.serializers``.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator

from app.models import (
    ALERT_STATUSES,
    CHECK_MODE_BROWSER,
    MATCH_CONTAINS,
    RULE_TEXT,
    STATUS_UNKNOWN,
    STOCK_MODE_BINARY,
    Monitor,
    NotificationRule,
    utcnow,
)


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
    tags: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Monitor name must not be blank")
        return value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        # Trim, drop blanks, cap length, and dedupe case-insensitively while
        # preserving the first-seen casing and order.
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            text = item.strip()[:40].strip()
            if not text:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(text)
            if len(normalized) >= 20:
                break
        return normalized

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

    def to_monitor(self) -> Monitor:
        return Monitor(
            id=None,
            name=self.name.strip(),
            url=str(self.url),
            enabled=self.enabled,
            check_mode=self.check_mode,
            interval_seconds=self.interval_seconds,
            jitter_percent=self.jitter_percent,
            rule_type=self.rule_type,
            selector_or_path=self.selector_or_path.strip(),
            match_mode=self.match_mode,
            match_value=self.match_value.strip(),
            user_agent_mode=self.user_agent_mode.strip() or "random",
            timeout_seconds=self.timeout_seconds,
            stock_mode=self.stock_mode,
            quantity_pattern=self.quantity_pattern.strip(),
            low_stock_threshold=self.low_stock_threshold,
            notifications_enabled=self.notifications_enabled,
            notify_on_stock_change=self.notify_on_stock_change,
            notify_on_error=self.notify_on_error,
            notify_on_challenge=self.notify_on_challenge,
            tags=self.tags,
            status=STATUS_UNKNOWN,
            next_check_at=utcnow() + timedelta(seconds=30),
        )

    def to_update_fields(self) -> dict[str, Any]:
        return {
            "name": self.name.strip(),
            "url": str(self.url),
            "enabled": int(self.enabled),
            "check_mode": self.check_mode,
            "interval_seconds": self.interval_seconds,
            "jitter_percent": self.jitter_percent,
            "rule_type": self.rule_type,
            "selector_or_path": self.selector_or_path.strip(),
            "match_mode": self.match_mode,
            "match_value": self.match_value.strip(),
            "user_agent_mode": self.user_agent_mode.strip() or "random",
            "timeout_seconds": self.timeout_seconds,
            "stock_mode": self.stock_mode,
            "quantity_pattern": self.quantity_pattern.strip(),
            "low_stock_threshold": self.low_stock_threshold,
            "notifications_enabled": int(self.notifications_enabled),
            "notify_on_stock_change": int(self.notify_on_stock_change),
            "notify_on_error": int(self.notify_on_error),
            "notify_on_challenge": int(self.notify_on_challenge),
            "tags": json.dumps(self.tags),
        }


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

    def to_rule(self) -> NotificationRule:
        return NotificationRule(
            id=None,
            name=self.name.strip(),
            enabled=self.enabled,
            monitor_ids=list(self.monitor_ids),
            trigger_statuses=list(self.trigger_statuses),
            threshold=self.threshold,
            cooldown_minutes=self.cooldown_minutes,
        )


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
