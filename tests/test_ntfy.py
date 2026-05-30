from __future__ import annotations

import httpx
import pytest
import respx

from app.models import AppSettings
from app.ntfy import NtfyClient

NTFY_URL = "https://ntfy.sh/alerts"


def _settings(enabled: bool = True, topic: str = "alerts") -> AppSettings:
    return AppSettings(enabled, "https://ntfy.sh", topic, "", "default")


@pytest.fixture
def no_sleep(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """Replace the backoff sleep with a recorder so tests stay instant."""
    delays: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)

    monkeypatch.setattr("app.ntfy.asyncio.sleep", fake_sleep)
    return delays


@pytest.mark.asyncio
async def test_send_disabled_or_no_topic_makes_no_request() -> None:
    with respx.mock(assert_all_called=False) as router:
        route = router.post(NTFY_URL).mock(return_value=httpx.Response(200))
        assert await NtfyClient().send(_settings(enabled=False), None, "t", "m") is False
        assert await NtfyClient().send(_settings(topic=""), None, "t", "m") is False
        assert route.call_count == 0


@pytest.mark.asyncio
async def test_send_succeeds_on_first_attempt() -> None:
    with respx.mock() as router:
        route = router.post(NTFY_URL).mock(return_value=httpx.Response(200))
        assert await NtfyClient().send(_settings(), None, "t", "m") is True
        assert route.call_count == 1


@pytest.mark.asyncio
async def test_send_retries_transient_5xx_then_succeeds(no_sleep: list[float]) -> None:
    with respx.mock() as router:
        route = router.post(NTFY_URL).mock(
            side_effect=[httpx.Response(503), httpx.Response(200)]
        )
        client = NtfyClient(max_attempts=3, backoff_seconds=0.5)
        assert await client.send(_settings(), None, "t", "m") is True
        assert route.call_count == 2
        assert no_sleep == [0.5]


@pytest.mark.asyncio
async def test_send_retries_on_timeout_then_succeeds(no_sleep: list[float]) -> None:
    with respx.mock() as router:
        route = router.post(NTFY_URL).mock(
            side_effect=[httpx.ConnectTimeout("boom"), httpx.Response(200)]
        )
        client = NtfyClient(max_attempts=3, backoff_seconds=0.5)
        assert await client.send(_settings(), None, "t", "m") is True
        assert route.call_count == 2


@pytest.mark.asyncio
async def test_send_gives_up_after_max_attempts(no_sleep: list[float]) -> None:
    with respx.mock() as router:
        route = router.post(NTFY_URL).mock(return_value=httpx.Response(503))
        client = NtfyClient(max_attempts=3, backoff_seconds=0.5)
        assert await client.send(_settings(), None, "t", "m") is False
        assert route.call_count == 3
        # One sleep between each of the three attempts except the last.
        assert no_sleep == [0.5, 1.0]


@pytest.mark.asyncio
async def test_send_does_not_retry_permanent_rejection(no_sleep: list[float]) -> None:
    with respx.mock() as router:
        route = router.post(NTFY_URL).mock(return_value=httpx.Response(403))
        client = NtfyClient(max_attempts=3, backoff_seconds=0.5)
        assert await client.send(_settings(), None, "t", "m") is False
        assert route.call_count == 1
        assert no_sleep == []


@pytest.mark.asyncio
async def test_send_honors_retry_after_header_capped(no_sleep: list[float]) -> None:
    with respx.mock() as router:
        router.post(NTFY_URL).mock(
            side_effect=[
                httpx.Response(429, headers={"Retry-After": "60"}),
                httpx.Response(200),
            ]
        )
        client = NtfyClient(max_attempts=3, backoff_seconds=0.5, max_backoff_seconds=5.0)
        assert await client.send(_settings(), None, "t", "m") is True
        # Retry-After (60s) is honored but capped to max_backoff_seconds.
        assert no_sleep == [5.0]
