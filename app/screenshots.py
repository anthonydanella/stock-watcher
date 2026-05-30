from __future__ import annotations

from pathlib import Path

from app.config import Settings

SCREENSHOT_CONTENT_TYPE = "image/jpeg"


def screenshots_dir(settings: Settings) -> Path:
    return settings.data_dir / "screenshots"


def screenshot_path(settings: Settings, monitor_id: int) -> Path:
    return screenshots_dir(settings) / f"monitor-{monitor_id}.jpg"


def screenshot_url(monitor_id: int) -> str:
    return f"/api/monitors/{monitor_id}/screenshot"


def save_screenshot(settings: Settings, monitor_id: int, content: bytes) -> None:
    directory = screenshots_dir(settings)
    directory.mkdir(parents=True, exist_ok=True)
    screenshot_path(settings, monitor_id).write_bytes(content)


def delete_screenshot(settings: Settings, monitor_id: int) -> None:
    screenshot_path(settings, monitor_id).unlink(missing_ok=True)
