from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.models import AppSettings
from app.webhook import WebhookClient
from tests.checker_helpers import make_monitor

WEBHOOK_URL = "https://hooks.example.com/abc"


def _settings(**overrides: object) -> AppSettings:
    base: dict[str, object] = {
        "ntfy_enabled": False,
        "ntfy_server": "https://ntfy.sh",
        "ntfy_topic": "",
        "ntfy_token": "",
        "ntfy_priority": "default",
        "webhook_enabled": True,
        "webhook_url": WEBHOOK_URL,
        "webhook_format": "custom",
        "webhook_headers": "",
    }
    base.update(overrides)
    return AppSettings(**base)  # type: ignore[arg-type]


@pytest.fixture
def no_sleep(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    delays: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)

    monkeypatch.setattr("app.webhook.asyncio.sleep", fake_sleep)
    return delays


@pytest.mark.asyncio
async def test_disabled_or_no_url_makes_no_request() -> None:
    with respx.mock(assert_all_called=False) as router:
        route = router.post(WEBHOOK_URL).mock(return_value=httpx.Response(200))
        assert await WebhookClient().send(_settings(webhook_enabled=False), None, "t", "m") is False
        assert await WebhookClient().send(_settings(webhook_url=""), None, "t", "m") is False
        assert route.call_count == 0


@pytest.mark.asyncio
async def test_custom_format_includes_monitor_context() -> None:
    with respx.mock() as router:
        route = router.post(WEBHOOK_URL).mock(return_value=httpx.Response(204))
        monitor = make_monitor()
        assert await WebhookClient().send(_settings(), monitor, "Title", "Body", "bell") is True
        body = json.loads(route.calls.last.request.content)
        assert body == {
            "title": "Title",
            "message": "Body",
            "tags": "bell",
            "monitor": monitor.name,
            "url": monitor.url,
            "status": monitor.status,
        }


@pytest.mark.asyncio
async def test_discord_format_shapes_body() -> None:
    with respx.mock() as router:
        route = router.post(WEBHOOK_URL).mock(return_value=httpx.Response(200))
        await WebhookClient().send(_settings(webhook_format="discord"), None, "Title", "Body")
        body = json.loads(route.calls.last.request.content)
        assert body == {"username": "Stock Watcher", "content": "**Title**\nBody"}


@pytest.mark.asyncio
async def test_slack_format_shapes_body() -> None:
    with respx.mock() as router:
        route = router.post(WEBHOOK_URL).mock(return_value=httpx.Response(200))
        await WebhookClient().send(_settings(webhook_format="slack"), None, "Title", "Body")
        body = json.loads(route.calls.last.request.content)
        assert body == {"text": "*Title*\nBody"}


@pytest.mark.asyncio
async def test_extra_headers_are_sent() -> None:
    with respx.mock() as router:
        route = router.post(WEBHOOK_URL).mock(return_value=httpx.Response(200))
        settings = _settings(webhook_headers='{"Authorization": "Bearer secret"}')
        await WebhookClient().send(settings, None, "t", "m")
        assert route.calls.last.request.headers["authorization"] == "Bearer secret"


@pytest.mark.asyncio
async def test_retries_transient_then_succeeds(no_sleep: list[float]) -> None:
    with respx.mock() as router:
        route = router.post(WEBHOOK_URL).mock(
            side_effect=[httpx.Response(503), httpx.Response(200)]
        )
        client = WebhookClient(max_attempts=3, backoff_seconds=0.5)
        assert await client.send(_settings(), None, "t", "m") is True
        assert route.call_count == 2
        assert no_sleep == [0.5]


@pytest.mark.asyncio
async def test_does_not_retry_permanent_rejection(no_sleep: list[float]) -> None:
    with respx.mock() as router:
        route = router.post(WEBHOOK_URL).mock(return_value=httpx.Response(400))
        client = WebhookClient(max_attempts=3, backoff_seconds=0.5)
        assert await client.send(_settings(), None, "t", "m") is False
        assert route.call_count == 1
        assert no_sleep == []
