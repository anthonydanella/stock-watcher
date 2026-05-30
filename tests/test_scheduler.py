import asyncio
import threading
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.config import Settings
from app.db import connect, init_db
from app.models import Monitor
from app.repository import Repository
from app.scheduler import Scheduler, calculate_cooldown, calculate_next_check


def monitor(interval: int = 900, jitter: int = 0) -> Monitor:
    return Monitor(
        id=1,
        name="Test",
        url="https://example.com",
        enabled=True,
        check_mode="browser",
        interval_seconds=interval,
        jitter_percent=jitter,
        rule_type="text",
        selector_or_path="",
        match_mode="contains",
        match_value="stock",
        user_agent_mode="random",
        timeout_seconds=10,
    )


def test_next_check_without_jitter() -> None:
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)

    assert (
        calculate_next_check(monitor(interval=120, jitter=0), now).timestamp()
        == now.timestamp() + 120
    )


def test_next_check_has_minimum_interval() -> None:
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)

    assert (
        calculate_next_check(monitor(interval=1, jitter=0), now).timestamp() == now.timestamp() + 30
    )


def test_cooldown_grows_but_caps() -> None:
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)

    assert calculate_cooldown(1, now).timestamp() == now.timestamp() + 120
    assert calculate_cooldown(99, now).timestamp() == now.timestamp() + 7200


def test_attempt_retention_prunes_old_rows(tmp_path: Path) -> None:
    repository = repo(tmp_path, attempt_retention_limit=3)
    monitor_id = repository.create_monitor(monitor())

    for index in range(5):
        repository.add_attempt(monitor_id, "error", False, index, 500, "failed", "")

    count = repository.conn.execute("SELECT COUNT(*) FROM check_attempts").fetchone()[0]
    assert count == 3


def test_monitor_update_rejects_unknown_columns(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(monitor())

    with pytest.raises(ValueError, match="Unknown monitor update field"):
        repository.update_monitor(monitor_id, {"name = 'bad'": "Bad"})

    reloaded = repository.get_monitor(monitor_id)
    assert reloaded is not None
    assert reloaded.name == "Test"


def test_repository_uses_distinct_connections_per_thread(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    main_connection_id = id(repository.conn)
    connection_ids: list[int] = []

    def worker() -> None:
        connection_ids.append(id(repository.conn))
        repository.list_monitors()

    threads = [threading.Thread(target=worker) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert connection_ids
    assert all(connection_id != main_connection_id for connection_id in connection_ids)
    assert len(set(connection_ids)) == len(connection_ids)


@pytest.mark.asyncio
async def test_scheduler_isolates_monitor_failures(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    first_id = repository.create_monitor(monitor())
    second_id = repository.create_monitor(monitor())
    seen: list[int] = []

    async def check_monitor(next_monitor: Monitor) -> None:
        seen.append(next_monitor.id or 0)
        if next_monitor.id == first_id:
            raise RuntimeError("boom")

    scheduler = Scheduler(repository, settings(tmp_path), check_monitor)

    await scheduler.run_once()

    events = repository.list_events()
    assert first_id in seen
    assert second_id in seen
    assert any("Scheduled check failed unexpectedly" in row["message"] for row in events)


@pytest.mark.asyncio
async def test_scheduler_can_start_after_stop(tmp_path: Path) -> None:
    repository = repo(tmp_path)

    async def check_monitor(next_monitor: Monitor) -> None:
        raise AssertionError("No monitors should be due")

    scheduler = Scheduler(repository, settings(tmp_path), check_monitor)

    scheduler.start()
    await asyncio.sleep(0)
    await scheduler.stop()
    scheduler.start()
    await asyncio.sleep(0)

    assert scheduler._task is not None
    assert not scheduler._task.done()

    await scheduler.stop()


@pytest.mark.asyncio
async def test_scheduler_records_loop_failures(tmp_path: Path) -> None:
    repository = repo(tmp_path)

    async def check_monitor(next_monitor: Monitor) -> None:
        raise AssertionError("No monitors should be due")

    scheduler = Scheduler(repository, settings(tmp_path), check_monitor)

    async def fail_run_once() -> None:
        raise RuntimeError("loop boom")

    scheduler.run_once = fail_run_once  # type: ignore[method-assign]
    scheduler.start()
    await asyncio.sleep(0)
    await scheduler.stop()

    assert scheduler.last_loop_error == "loop boom"
    assert scheduler.last_loop_error_at is not None
    assert any(
        "Scheduler loop failed unexpectedly: loop boom" in row["message"]
        for row in repository.list_events()
    )


def settings(tmp_path: Path, attempt_retention_limit: int = 5000) -> Settings:
    return Settings(
        data_dir=tmp_path,
        database_path=tmp_path / "test.sqlite3",
        timezone="UTC",
        check_loop_interval_seconds=60,
        event_retention_limit=100,
        attempt_retention_limit=attempt_retention_limit,
        default_ntfy_server="https://ntfy.sh",
        default_ntfy_topic="",
        ntfy_max_attempts=3,
        ntfy_retry_backoff_seconds=0.5,
        llm_api_key="",
        llm_html_char_limit=200_000,
    )


def repo(tmp_path: Path, attempt_retention_limit: int = 5000) -> Repository:
    test_settings = settings(tmp_path, attempt_retention_limit)
    conn = connect(test_settings.database_path)
    init_db(conn)
    return Repository(conn, test_settings)
