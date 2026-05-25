from __future__ import annotations

import asyncio
import random
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from app.config import Settings
from app.models import EVENT_ERROR, STATUS_ERROR, Monitor, utcnow
from app.repository import Repository


def calculate_next_check(monitor: Monitor, now: datetime | None = None) -> datetime:
    now = now or utcnow()
    jitter_percent = max(0, min(100, monitor.jitter_percent))
    interval = max(30, monitor.interval_seconds)
    jitter_window = int(interval * jitter_percent / 100)
    offset = random.randint(-jitter_window, jitter_window) if jitter_window else 0
    return now + timedelta(seconds=max(30, interval + offset))


def calculate_cooldown(failure_count: int, now: datetime | None = None) -> datetime:
    now = now or utcnow()
    minutes = min(120, 2 ** min(max(failure_count, 1), 7))
    return now + timedelta(minutes=minutes)


class Scheduler:
    def __init__(
        self,
        repo: Repository,
        settings: Settings,
        check_monitor: Callable[[Monitor], Awaitable[None]],
    ):
        self.repo = repo
        self.settings = settings
        self.check_monitor = check_monitor
        self._task: asyncio.Task[None] | None = None
        self._stopping = asyncio.Event()
        self._run_lock = asyncio.Lock()
        self.last_loop_error: str = ""
        self.last_loop_error_at: datetime | None = None
        self.last_run_started_at: datetime | None = None
        self.last_run_finished_at: datetime | None = None
        self.last_run_due_count: int = 0

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stopping.clear()
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._stopping.set()
        if self._task:
            await self._task

    async def run_once(self) -> None:
        async with self._run_lock:
            self.last_run_started_at = datetime.now(timezone.utc)
            due = self.repo.list_due_monitors(self.last_run_started_at)
            self.last_run_due_count = len(due)
            try:
                if due:
                    await asyncio.gather(*(self._run_monitor_safely(monitor) for monitor in due))
            finally:
                self.last_run_finished_at = datetime.now(timezone.utc)

    async def _run_monitor_safely(self, monitor: Monitor) -> None:
        try:
            await self.check_monitor(monitor)
        except Exception as exc:  # noqa: BLE001 - scheduler must keep future ticks alive
            if monitor.id is not None:
                self.repo.add_event(
                    monitor.id,
                    EVENT_ERROR,
                    f"Scheduled check failed unexpectedly: {exc}",
                    monitor.status,
                    STATUS_ERROR,
                )

    async def _loop(self) -> None:
        while not self._stopping.is_set():
            try:
                await self.run_once()
            except Exception as exc:  # noqa: BLE001 - keep the background loop alive
                self.last_loop_error = str(exc)
                self.last_loop_error_at = datetime.now(timezone.utc)
                self.repo.add_event(None, EVENT_ERROR, f"Scheduler loop failed unexpectedly: {exc}")
            try:
                await asyncio.wait_for(
                    self._stopping.wait(),
                    timeout=self.settings.check_loop_interval_seconds,
                )
            except asyncio.TimeoutError:
                pass
