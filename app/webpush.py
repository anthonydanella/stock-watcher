"""Web Push delivery (the default notification channel).

Generates and persists a VAPID keypair under ``DATA_DIR`` on first use, exposes
the public application-server key to the frontend, and pushes encrypted payloads
(RFC 8291) to every subscribed browser via ``pywebpush``. Subscriptions that the
push service reports as gone (404/410) are pruned automatically.

The push libraries are imported lazily so the app still boots — and ntfy /
webhook channels still work — if the optional dependency is unavailable.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from app.config import Settings
from app.models import AppSettings, Monitor, PushSubscription
from app.repository import Repository

if TYPE_CHECKING:
    from py_vapid import Vapid01

logger = logging.getLogger(__name__)

_PUSH_TTL_SECONDS = 600


class WebPushManager:
    def __init__(self, repo: Repository, settings: Settings) -> None:
        self.repo = repo
        self.settings = settings
        self._key_path: Path = settings.data_dir / "vapid_private.pem"
        self._vapid: Vapid01 | None = None
        self._public_key: str | None = None

    def _load_vapid(self) -> Vapid01:
        if self._vapid is not None:
            return self._vapid
        from py_vapid import Vapid01

        if self._key_path.exists():
            vapid = Vapid01.from_file(str(self._key_path))
        else:
            vapid = Vapid01()
            vapid.generate_keys()
            self.settings.data_dir.mkdir(parents=True, exist_ok=True)
            vapid.save_key(str(self._key_path))
        self._vapid = vapid
        return vapid

    def public_key(self) -> str:
        """Base64url application-server key for ``pushManager.subscribe``.

        Empty string if the push dependency is missing or key setup failed, in
        which case the frontend hides the "enable on this device" affordance.
        """
        if self._public_key is not None:
            return self._public_key
        try:
            from cryptography.hazmat.primitives import serialization

            public_key = self._load_vapid().public_key
            assert public_key is not None  # set by generate_keys()/from_file()
            raw = public_key.public_bytes(
                serialization.Encoding.X962,
                serialization.PublicFormat.UncompressedPoint,
            )
            self._public_key = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
        except Exception:  # noqa: BLE001 - missing dep / unreadable key: degrade gracefully
            logger.exception("Web Push is unavailable; could not load VAPID keys")
            self._public_key = ""
        return self._public_key

    @property
    def available(self) -> bool:
        return bool(self.public_key())

    async def send(
        self,
        app_settings: AppSettings,
        monitor: Monitor | None,
        title: str,
        message: str,
        tags: str = "package",
    ) -> bool:
        if not app_settings.webpush_enabled:
            return False
        subscriptions = self.repo.list_push_subscriptions()
        if not subscriptions:
            return False
        # Warm the keypair on the event-loop thread before fanning out to worker
        # threads, so the lazy cache is populated without a write race.
        if not self.public_key():
            return False
        payload = json.dumps(
            {
                "title": title,
                "body": message,
                "url": monitor.url if monitor else "/",
                "tag": tags,
            }
        )
        outcomes = await asyncio.gather(
            *(asyncio.to_thread(self._send_one, sub, payload) for sub in subscriptions)
        )
        delivered = False
        for sub, outcome in zip(subscriptions, outcomes):
            if outcome == "ok":
                delivered = True
            elif outcome == "gone":
                self.repo.delete_push_subscription(sub.endpoint)
        return delivered

    def _send_one(self, subscription: PushSubscription, payload: str) -> str:
        from pywebpush import WebPushException, webpush

        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                # The key file is guaranteed to exist: send() warms _load_vapid()
                # first. pywebpush loads a path via py_vapid.from_file.
                vapid_private_key=str(self._key_path),
                vapid_claims={"sub": self.settings.webpush_contact},
                ttl=_PUSH_TTL_SECONDS,
            )
            return "ok"
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                return "gone"  # unsubscribed or expired — caller prunes it
            logger.warning("Web Push delivery failed (status %s): %s", status, exc)
            return "fail"
        except Exception:  # noqa: BLE001 - one bad subscription must not abort the rest
            logger.exception("Unexpected Web Push error")
            return "fail"
