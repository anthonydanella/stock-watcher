"""Generic outbound webhook delivery.

A single JSON POST that adapts its body shape to the target via a format preset,
so Discord, Slack, Home Assistant, Zapier, n8n, IFTTT and the like all work
without bespoke integrations:

- ``discord`` -> ``{"username", "content"}`` (Discord webhook)
- ``slack``   -> ``{"text"}`` (Slack incoming webhook, mrkdwn)
- ``custom``  -> ``{"title", "message", "status", "monitor", "url", "tags"}``
  generic JSON consumed by Home Assistant webhooks, Zapier catch hooks, etc.

Transient failures (timeouts, 429, 5xx) are retried with exponential backoff,
mirroring the ntfy client; permanent rejections fail fast.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from app.models import (
    WEBHOOK_FORMAT_DISCORD,
    WEBHOOK_FORMAT_SLACK,
    AppSettings,
    Monitor,
)

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class WebhookClient:
    def __init__(
        self,
        *,
        max_attempts: int = 3,
        backoff_seconds: float = 0.5,
        max_backoff_seconds: float = 5.0,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.max_attempts = max(1, max_attempts)
        self.backoff_seconds = max(0.0, backoff_seconds)
        self.max_backoff_seconds = max(0.0, max_backoff_seconds)
        self.timeout_seconds = timeout_seconds

    async def send(
        self,
        app_settings: AppSettings,
        monitor: Monitor | None,
        title: str,
        message: str,
        tags: str = "package",
    ) -> bool:
        url = app_settings.webhook_url.strip()
        if not app_settings.webhook_enabled or not url:
            return False
        body = self._build_body(app_settings.webhook_format, monitor, title, message, tags)
        headers = {"Content-Type": "application/json"}
        headers.update(self._extra_headers(app_settings.webhook_headers))
        content = json.dumps(body).encode("utf-8")
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for attempt in range(1, self.max_attempts + 1):
                try:
                    response = await client.post(url, content=content, headers=headers)
                except httpx.HTTPError:
                    pass  # timeout / connection error -> transient, retry
                else:
                    if response.status_code < 400:
                        return True
                    if response.status_code not in _RETRYABLE_STATUS:
                        return False
                if attempt == self.max_attempts:
                    return False
                await asyncio.sleep(
                    min(self.backoff_seconds * (2 ** (attempt - 1)), self.max_backoff_seconds)
                )
        return False

    @staticmethod
    def _build_body(
        fmt: str, monitor: Monitor | None, title: str, message: str, tags: str
    ) -> dict[str, Any]:
        if fmt == WEBHOOK_FORMAT_DISCORD:
            return {"username": "Stock Watcher", "content": f"**{title}**\n{message}"}
        if fmt == WEBHOOK_FORMAT_SLACK:
            return {"text": f"*{title}*\n{message}"}
        body: dict[str, Any] = {"title": title, "message": message, "tags": tags}
        if monitor is not None:
            body["monitor"] = monitor.name
            body["url"] = monitor.url
            body["status"] = monitor.status
        return body

    @staticmethod
    def _extra_headers(raw: str) -> dict[str, str]:
        text = (raw or "").strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except (TypeError, ValueError):
            return {}
        if not isinstance(parsed, dict):
            return {}
        return {str(key): str(value) for key, value in parsed.items()}
