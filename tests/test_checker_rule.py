from pathlib import Path

import pytest

from app.checker import FetchResult, StockChecker
from tests.checker_helpers import (
    BrowserModeChecker,
    DummyPage,
    FailingChecker,
    FakeChecker,
    FakeNtfy,
    make_monitor,
    repo,
    require_monitor,
    settings,
)


@pytest.mark.asyncio
async def test_rule_lab_returns_fetch_and_rule_diagnostics(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(
            200,
            "<html><body><button class='buy'>Sold out</button></body></html>",
            "text/html",
            {},
            screenshot=b"jpeg bytes",
        ),
    )
    monitor = make_monitor()
    monitor.selector_or_path = ".buy"
    monitor.match_mode = "contains"
    monitor.match_value = "add to cart"

    result = await checker.rule_lab(monitor)

    assert result["matched"] is False
    assert result["fetch"]["status_code"] == 200
    assert result["fetch"]["screenshot"].startswith("data:image/jpeg;base64,")
    assert result["diagnostics"]["element_count"] == 1
    assert result["diagnostics"]["elements"][0]["text"] == "Sold out"
    assert "Expected text to contain" in result["reason"]


@pytest.mark.asyncio
async def test_rule_lab_reports_fetch_failures_in_band(tmp_path: Path) -> None:
    checker = FailingChecker(repo(tmp_path), settings(tmp_path), FakeNtfy())

    result = await checker.rule_lab(make_monitor())

    assert result["matched"] is False
    assert result["fetch"]["status_code"] is None
    assert result["diagnostics"] is None
    assert "browser checks are disabled" in result["reason"]


@pytest.mark.asyncio
async def test_test_rule_reports_http_failures_without_matching_error_pages(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = require_monitor(repository, monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(500, "<h1>Available after maintenance</h1>", "text/html", {}),
    )

    result = await checker.test_rule(monitor)

    assert result.matched is False
    assert "HTTP status 500" in result.evidence


@pytest.mark.asyncio
async def test_test_rule_reports_challenge_pages_without_matching_content(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_monitor())
    monitor = require_monitor(repository, monitor_id)
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(
            403, "Cloudflare captcha says available", "text/html", {"server": "cloudflare"}
        ),
    )

    result = await checker.test_rule(monitor)

    assert result.matched is False
    assert result.evidence == "Challenge page detected"


@pytest.mark.asyncio
async def test_browser_mode_uses_browser_directly(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor = make_monitor()
    monitor.check_mode = "browser"
    checker = BrowserModeChecker(
        repository,
        settings(tmp_path),
        FakeNtfy(),
        FetchResult(200, "<div class='stock'>Available today</div>", "text/html", {}),
    )

    result = await checker.fetch(monitor)

    assert result.content == "<div class='stock'>Available today</div>"
    assert checker.browser_fetches == 1


@pytest.mark.asyncio
async def test_screenshot_cleanup_hides_cookie_consent_best_effort(tmp_path: Path) -> None:
    checker = StockChecker(repo(tmp_path), settings(tmp_path), FakeNtfy())
    page = DummyPage()
    blocked_page = DummyPage(fail=True)

    await checker._prepare_page_for_screenshot(page)
    await checker._prepare_page_for_screenshot(blocked_page)

    assert "cookie" in page.scripts[0].lower()
    assert "isOverlay(element, style, rect)" in page.scripts[0]
    assert blocked_page.scripts
