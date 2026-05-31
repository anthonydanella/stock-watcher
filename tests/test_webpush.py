from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models import AppSettings
from app.webpush import WebPushManager
from tests.checker_helpers import repo as make_repo
from tests.checker_helpers import settings as make_settings


def _app_settings(*, webpush_enabled: bool = True) -> AppSettings:
    return AppSettings(
        False, "https://ntfy.sh", "", "", "default", webpush_enabled=webpush_enabled
    )


def _manager(tmp_path: Path) -> WebPushManager:
    return WebPushManager(make_repo(tmp_path), make_settings(tmp_path))


def test_public_key_is_generated_and_persisted(tmp_path: Path) -> None:
    manager = _manager(tmp_path)
    key = manager.public_key()
    assert key  # base64url application server key
    assert (tmp_path / "vapid_private.pem").exists()
    # A fresh manager over the same data dir reuses the persisted key.
    assert WebPushManager(make_repo(tmp_path), make_settings(tmp_path)).public_key() == key
    assert manager.available is True


@pytest.mark.asyncio
async def test_send_without_subscriptions_returns_false(tmp_path: Path) -> None:
    manager = _manager(tmp_path)
    assert await manager.send(_app_settings(), None, "t", "m") is False


@pytest.mark.asyncio
async def test_send_when_disabled_returns_false(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)
    repo.add_push_subscription("https://push.example.com/1", "p256dh", "auth")
    manager = WebPushManager(repo, make_settings(tmp_path))
    assert await manager.send(_app_settings(webpush_enabled=False), None, "t", "m") is False


@pytest.mark.asyncio
async def test_send_delivers_to_subscriptions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = make_repo(tmp_path)
    repo.add_push_subscription("https://push.example.com/1", "key-1", "auth-1")
    manager = WebPushManager(repo, make_settings(tmp_path))

    calls: list[dict] = []

    def fake_webpush(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    monitor = None
    assert await manager.send(_app_settings(), monitor, "Title", "Body", "bell") is True
    assert len(calls) == 1
    assert calls[0]["subscription_info"] == {
        "endpoint": "https://push.example.com/1",
        "keys": {"p256dh": "key-1", "auth": "auth-1"},
    }
    assert json.loads(calls[0]["data"]) == {
        "title": "Title",
        "body": "Body",
        "url": "/",
        "tag": "bell",
    }


@pytest.mark.asyncio
async def test_send_prunes_gone_subscription(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from pywebpush import WebPushException

    repo = make_repo(tmp_path)
    repo.add_push_subscription("https://push.example.com/gone", "k", "a")
    manager = WebPushManager(repo, make_settings(tmp_path))

    class _Resp:
        status_code = 410

    def fake_webpush(**kwargs: object) -> None:
        exc = WebPushException("subscription gone")
        exc.response = _Resp()  # type: ignore[assignment]
        raise exc

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    assert await manager.send(_app_settings(), None, "t", "m") is False
    assert repo.count_push_subscriptions() == 0  # expired subscription was pruned
