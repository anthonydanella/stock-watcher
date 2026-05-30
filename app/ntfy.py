from __future__ import annotations

import asyncio

import httpx

from app.models import AppSettings, Monitor

# Statuses worth retrying: ntfy/upstream rate limiting plus transient server errors.
# Everything else in the 4xx/5xx range (401/403/404/...) is a permanent rejection
# where retrying only delays the recorded failure.
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class NtfyClient:
    """Delivers ntfy notifications, retrying transient failures with backoff.

    A dropped alert is a silent failure of the app's core promise, so transient
    problems (timeouts, connection errors, 429, and 5xx responses) are retried a
    few times with exponential backoff. Permanent rejections (e.g. 401/403/404)
    fail fast so the failure surfaces promptly instead of after wasted retries.
    """

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
        settings: AppSettings,
        monitor: Monitor | None,
        title: str,
        message: str,
        tags: str = "package",
    ) -> bool:
        if not settings.ntfy_enabled or not settings.ntfy_topic:
            return False
        url = f"{settings.ntfy_server.rstrip('/')}/{settings.ntfy_topic.lstrip('/')}"
        headers = {
            "Title": title,
            "Tags": tags,
            "Priority": settings.ntfy_priority,
        }
        if monitor:
            headers["Click"] = monitor.url
        if settings.ntfy_token:
            headers["Authorization"] = f"Bearer {settings.ntfy_token}"
        body = message.encode("utf-8")
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for attempt in range(1, self.max_attempts + 1):
                retry_after: float | None = None
                try:
                    response = await client.post(url, content=body, headers=headers)
                except httpx.HTTPError:
                    pass  # timeout / connection error -> transient, fall through to retry
                else:
                    if response.status_code < 400:
                        return True
                    if response.status_code not in _RETRYABLE_STATUS:
                        return False
                    retry_after = _parse_retry_after(response.headers.get("Retry-After"))
                if attempt == self.max_attempts:
                    return False
                await asyncio.sleep(self._delay(attempt, retry_after))
        return False

    def _delay(self, attempt: int, retry_after: float | None) -> float:
        if retry_after is not None:
            return min(retry_after, self.max_backoff_seconds)
        return min(self.backoff_seconds * (2 ** (attempt - 1)), self.max_backoff_seconds)


def _parse_retry_after(value: str | None) -> float | None:
    """Parse a delta-seconds ``Retry-After`` header; ignore the HTTP-date form."""
    if not value:
        return None
    try:
        seconds = float(value.strip())
    except ValueError:
        return None
    return seconds if seconds >= 0 else None
