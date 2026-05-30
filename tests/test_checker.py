from pathlib import Path

import pytest

from app.checker import FetchResult
from app.models import (
    ERROR_DNS,
    ERROR_HTTP,
    ERROR_SELECTOR,
    ERROR_TIMEOUT,
    EVENT_CHALLENGE,
    EVENT_ERROR,
    EVENT_NOTIFICATION_ERROR,
    EVENT_SCREENSHOT_ERROR,
    EVENT_STATUS_CHANGE,
    STATUS_CHALLENGE,
    STATUS_ERROR,
    STATUS_IN_STOCK,
    STATUS_OUT_OF_STOCK,
    AppSettings,
)
from app.screenshots import screenshot_path
from tests.checker_helpers import (
    BrokenNtfy,
    FailingChecker,
    FakeChecker,
    FakeNtfy,
    RejectingNtfy,
    make_monitor,
    repo,
    settings,
)


@pytest.mark.asyncio
async def test_check_monitor_records_in_stock_transition(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Available today</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    assert updated.status == STATUS_IN_STOCK
    assert ntfy.messages[0][0] == "Stock checker active"


@pytest.mark.asyncio
async def test_check_monitor_saves_latest_screenshot(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(
            200,
            "<div class='stock'>Available today</div>",
            "text/html",
            {},
            screenshot=b"latest screenshot",
        ),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    assert updated.status == STATUS_IN_STOCK
    assert updated.last_screenshot_at is not None
    assert updated.last_screenshot_error == ""
    assert screenshot_path(settings(tmp_path), monitor_id).read_bytes() == b"latest screenshot"


@pytest.mark.asyncio
async def test_check_monitor_sends_initial_out_of_stock_notification(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Sold out</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    attempts = repository.list_attempts(monitor_id)
    assert updated.status == STATUS_OUT_OF_STOCK
    assert "Expected text to contain" in attempts[0].reason
    assert ntfy.messages == [
        (
            "Stock checker active",
            "Console: initial check completed, current status is out of stock.",
        )
    ]


@pytest.mark.asyncio
async def test_check_monitor_records_match_centered_evidence_for_long_text(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.match_value = "in stock now"
    monitor_id = repository.create_monitor(monitor)
    monitor = repository.get_monitor(monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(
            200,
            f"<div class='stock'>IRRELEVANT_START {'Navigation Menu ' * 500} Ships today. In Stock Now for pickup.</div>",
            "text/html",
            {},
        ),
    )

    await checker.check_monitor(monitor)

    attempts = repository.list_attempts(monitor_id)
    assert attempts[0].status == STATUS_IN_STOCK
    assert "In Stock Now" in attempts[0].evidence
    assert "IRRELEVANT_START" not in attempts[0].evidence


@pytest.mark.asyncio
async def test_check_monitor_keeps_unchanged_out_of_stock_silent(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.status = STATUS_OUT_OF_STOCK
    monitor_id = repository.create_monitor(monitor)
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Sold out</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    assert updated.status == STATUS_OUT_OF_STOCK
    assert ntfy.messages == []


@pytest.mark.asyncio
async def test_check_monitor_detects_challenge_and_notifies(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(403, "Attention required. Verify you are human.", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    assert updated.status == STATUS_CHALLENGE
    assert updated.cooldown_until is not None
    assert updated.next_check_at == updated.cooldown_until
    assert ntfy.messages[0][0] == "Stock checker challenge"


@pytest.mark.asyncio
async def test_check_monitor_uses_cooldown_as_next_check_for_repeated_errors(
    tmp_path: Path,
) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.interval_seconds = 30
    monitor.failure_count = 2
    monitor_id = repository.create_monitor(monitor)
    repository.update_monitor(monitor_id, {"failure_count": 2})
    monitor = repository.get_monitor(monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(503, "<h1>Service unavailable</h1>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    assert updated.status == STATUS_ERROR
    assert updated.failure_count == 3
    assert updated.cooldown_until is not None
    assert updated.next_check_at == updated.cooldown_until


@pytest.mark.asyncio
async def test_check_monitor_classifies_http_errors(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(503, "<h1>Service unavailable</h1>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    attempts = repository.list_attempts(monitor_id)
    assert updated.status == STATUS_ERROR
    assert updated.last_error_type == ERROR_HTTP
    assert attempts[0].error_type == ERROR_HTTP
    assert "successful HTTP response" in attempts[0].reason


@pytest.mark.asyncio
async def test_check_monitor_classifies_selector_errors(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.selector_or_path = "div["
    monitor_id = repository.create_monitor(monitor)
    monitor = repository.get_monitor(monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(200, "<div>Available today</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    attempts = repository.list_attempts(monitor_id)
    assert updated.status == STATUS_ERROR
    assert updated.last_error_type == ERROR_SELECTOR
    assert attempts[0].error_type == ERROR_SELECTOR
    assert "Invalid CSS selector" in attempts[0].reason
    assert "Invalid CSS selector" in updated.last_error


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("exc", "error_type"),
    [
        (TimeoutError("Navigation timed out"), ERROR_TIMEOUT),
        (OSError("getaddrinfo failed for example.invalid"), ERROR_DNS),
    ],
)
async def test_check_monitor_classifies_fetch_exceptions(
    tmp_path: Path,
    exc: Exception,
    error_type: str,
) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    checker = FailingChecker(repository, settings(tmp_path), FakeNtfy(), exc)

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    attempts = repository.list_attempts(monitor_id)
    assert updated.status == STATUS_ERROR
    assert updated.last_error_type == error_type
    assert attempts[0].error_type == error_type
    assert "Fetch failed before the rule could be evaluated" in attempts[0].reason


@pytest.mark.asyncio
async def test_check_monitor_records_screenshot_error_event(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(
            200,
            "<div class='stock'>Available today</div>",
            "text/html",
            {},
            screenshot_error="page screenshot failed",
        ),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    events = repository.list_events()
    assert updated.status == STATUS_IN_STOCK
    assert updated.last_screenshot_error == "page screenshot failed"
    assert any(row["event_type"] == EVENT_SCREENSHOT_ERROR for row in events)


@pytest.mark.asyncio
async def test_check_monitor_survives_ntfy_failure(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        BrokenNtfy(),
        FetchResult(200, "<div class='stock'>Available today</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    events = repository.list_events()
    assert updated.status == STATUS_IN_STOCK
    assert any(row["event_type"] == EVENT_NOTIFICATION_ERROR for row in events)


@pytest.mark.asyncio
async def test_check_monitor_records_rejected_configured_notification(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    repository.save_settings(AppSettings(True, "https://ntfy.sh", "stock-alerts", "", "default"))
    monitor_id = repository.create_monitor(make_monitor())
    monitor = repository.get_monitor(monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        RejectingNtfy(),
        FetchResult(200, "<div class='stock'>Available today</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    events = repository.list_events()
    assert any(row["event_type"] == EVENT_NOTIFICATION_ERROR for row in events)


@pytest.mark.asyncio
async def test_check_monitor_master_toggle_suppresses_notifications(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.notifications_enabled = False
    monitor_id = repository.create_monitor(monitor)
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Available today</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    events = repository.list_events()
    assert updated.status == STATUS_IN_STOCK
    assert ntfy.messages == []
    # Events are still recorded — only the push is silenced.
    assert any(row["event_type"] == EVENT_STATUS_CHANGE for row in events)


@pytest.mark.asyncio
async def test_check_monitor_stock_change_toggle_only(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.notify_on_stock_change = False
    monitor_id = repository.create_monitor(monitor)
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Available today</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    events = repository.list_events()
    assert updated.status == STATUS_IN_STOCK
    assert ntfy.messages == []
    assert any(row["event_type"] == EVENT_STATUS_CHANGE for row in events)


@pytest.mark.asyncio
async def test_check_monitor_challenge_toggle_off(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.notify_on_challenge = False
    monitor_id = repository.create_monitor(monitor)
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(403, "Attention required. Verify you are human.", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    events = repository.list_events()
    assert updated.status == STATUS_CHALLENGE
    assert ntfy.messages == []
    assert any(row["event_type"] == EVENT_CHALLENGE for row in events)


@pytest.mark.asyncio
async def test_check_monitor_error_toggle_off(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.notify_on_error = False
    monitor.failure_count = 2
    monitor_id = repository.create_monitor(monitor)
    repository.update_monitor(monitor_id, {"failure_count": 2})
    monitor = repository.get_monitor(monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(503, "<h1>Service unavailable</h1>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = repository.get_monitor(monitor_id)
    events = repository.list_events()
    assert updated.status == STATUS_ERROR
    assert updated.failure_count == 3
    assert ntfy.messages == []
    assert any(row["event_type"] == EVENT_ERROR for row in events)
