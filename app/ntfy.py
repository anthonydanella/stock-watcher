from __future__ import annotations

import httpx

from app.models import AppSettings, Monitor


class NtfyClient:
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
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, content=message.encode("utf-8"), headers=headers)
                return response.status_code < 400
        except httpx.HTTPError:
            return False
