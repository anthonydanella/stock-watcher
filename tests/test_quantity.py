from __future__ import annotations

import importlib
import json
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.checker import FetchResult
from app.models import (
    ERROR_QUANTITY_PARSE,
    STATUS_IN_STOCK,
    STATUS_LOW_STOCK,
    STATUS_OUT_OF_STOCK,
    STOCK_MODE_QUANTITY,
    Monitor,
)
from app.rules import parse_quantity
from tests.checker_helpers import FakeChecker, FakeNtfy, repo, require_monitor, settings


def make_quantity_monitor(threshold: int | None = 2) -> Monitor:
    return Monitor(
        id=None,
        name="Console",
        url="https://example.com/console",
        enabled=True,
        check_mode="browser",
        interval_seconds=900,
        jitter_percent=0,
        rule_type="css",
        selector_or_path=".stock",
        match_mode="exists",
        match_value="",
        user_agent_mode="random",
        timeout_seconds=10,
        stock_mode=STOCK_MODE_QUANTITY,
        quantity_pattern=r"(\d+)\s*left",
        low_stock_threshold=threshold,
    )


# ---------- parse_quantity ----------


def test_parse_quantity_default_pattern_picks_first_integer() -> None:
    result = parse_quantity(None, "Only 7 left in stock", "")
    assert result.quantity == 7
    assert result.error == ""


def test_parse_quantity_with_capture_group_uses_first_group() -> None:
    result = parse_quantity(None, "warehouse: 12 units, retail: 4", r"warehouse:\s*(\d+)")
    assert result.quantity == 12


def test_parse_quantity_returns_none_when_no_match() -> None:
    result = parse_quantity(None, "sold out", r"(\d+)\s*left")
    assert result.quantity is None
    assert "did not match" in result.error.lower()


def test_parse_quantity_passes_through_numeric_extracted_value() -> None:
    result = parse_quantity(8, "", "")
    assert result.quantity == 8


def test_parse_quantity_passes_through_numeric_string() -> None:
    result = parse_quantity("12", "", "")
    assert result.quantity == 12


def test_parse_quantity_handles_list_of_values() -> None:
    result = parse_quantity(["", "5"], "", "")
    assert result.quantity == 5


def test_parse_quantity_rejects_invalid_regex() -> None:
    result = parse_quantity(None, "5 left", "(unclosed")
    assert result.quantity is None
    assert "invalid quantity regex" in result.error.lower()


def test_parse_quantity_oos_named_group_returns_zero() -> None:
    result = parse_quantity(None, "Currently out of stock", r"(?P<oos>out\s*of\s*stock|sold\s*out)")
    assert result.quantity == 0
    assert result.error == ""


def test_parse_quantity_qty_takes_precedence_over_oos() -> None:
    pattern = r"(?P<qty>\d+)\s*left|(?P<oos>out\s*of\s*stock)"
    result = parse_quantity(None, "Only 5 left in stock", pattern)
    assert result.quantity == 5
    assert result.error == ""


def test_parse_quantity_qty_wins_even_when_oos_appears_first_in_text() -> None:
    pattern = r"(?P<qty>\d+)\s*left|(?P<oos>out\s*of\s*stock)"
    result = parse_quantity(None, "Sometimes out of stock — currently 3 left", pattern)
    assert result.quantity == 3


def test_parse_quantity_falls_back_to_oos_when_qty_absent() -> None:
    pattern = r"(?P<qty>\d+)\s*left|(?P<oos>out\s*of\s*stock)"
    result = parse_quantity(None, "Currently out of stock", pattern)
    assert result.quantity == 0


def test_parse_quantity_named_groups_no_match_reports_no_match() -> None:
    pattern = r"(?P<qty>\d+)\s*left|(?P<oos>sold\s*out)"
    result = parse_quantity(None, "Free shipping over $50", pattern)
    assert result.quantity is None
    assert "did not match" in result.error.lower()


# ---------- checker quantity flow ----------


@pytest.mark.asyncio
async def test_check_monitor_quantity_above_threshold_is_in_stock(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor(threshold=2))
    monitor = require_monitor(repository, monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Only 7 left</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = require_monitor(repository, monitor_id)
    assert updated.status == STATUS_IN_STOCK
    assert updated.last_quantity == 7
    attempts = repository.list_attempts(monitor_id)
    assert attempts[0].quantity == 7


@pytest.mark.asyncio
async def test_check_monitor_quantity_at_or_below_threshold_is_low_stock(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor(threshold=3))
    monitor = require_monitor(repository, monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>2 left</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = require_monitor(repository, monitor_id)
    assert updated.status == STATUS_LOW_STOCK
    assert updated.last_quantity == 2


@pytest.mark.asyncio
async def test_check_monitor_quantity_zero_is_out_of_stock(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor(threshold=2))
    monitor = require_monitor(repository, monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>0 left</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = require_monitor(repository, monitor_id)
    assert updated.status == STATUS_OUT_OF_STOCK
    assert updated.last_quantity == 0


def make_quantity_monitor_with_oos(threshold: int | None = 2) -> Monitor:
    monitor = make_quantity_monitor(threshold=threshold)
    monitor.quantity_pattern = r"(?P<qty>\d+)\s*left|(?P<oos>out\s*of\s*stock|sold\s*out)"
    return monitor


@pytest.mark.asyncio
async def test_check_monitor_quantity_oos_pattern_treats_text_as_zero(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor_with_oos(threshold=2))
    monitor = require_monitor(repository, monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Out of stock</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = require_monitor(repository, monitor_id)
    assert updated.status == STATUS_OUT_OF_STOCK
    assert updated.last_quantity == 0


@pytest.mark.asyncio
async def test_check_monitor_quantity_oos_pattern_still_reads_count(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor_with_oos(threshold=2))
    monitor = require_monitor(repository, monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>Only 6 left</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = require_monitor(repository, monitor_id)
    assert updated.status == STATUS_IN_STOCK
    assert updated.last_quantity == 6


@pytest.mark.asyncio
async def test_check_monitor_quantity_parse_failure_records_error(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor(threshold=2))
    monitor = require_monitor(repository, monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>currently unavailable</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    updated = require_monitor(repository, monitor_id)
    assert updated.status == "error"
    assert updated.last_error_type == ERROR_QUANTITY_PARSE
    assert updated.last_quantity is None


@pytest.mark.asyncio
async def test_check_monitor_low_stock_triggers_notification(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor(threshold=3))
    monitor = require_monitor(repository, monitor_id)
    ntfy = FakeNtfy()
    checker = FakeChecker(
        repository,
        settings(tmp_path),
        ntfy,
        FetchResult(200, "<div class='stock'>1 left</div>", "text/html", {}),
    )

    await checker.check_monitor(monitor)

    assert any("low stock" in message.lower() for _, message in ntfy.messages)


# ---------- LLM suggest-rule API ----------


def load_app(monkeypatch, tmp_path, *, llm_api_key: str = "test-key"):  # noqa: ANN001
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    # Empty string still counts as "set", so dotenv (override=False) will not clobber it.
    monkeypatch.setenv("LLM_API_KEY", llm_api_key)
    import app.config

    importlib.reload(app.config)
    import app.main

    return importlib.reload(app.main).app


def _stub_checker_fetch(
    monkeypatch, *, content: str, content_type: str = "text/html", status_code: int = 200
) -> None:
    import app.main
    from app.checker import FetchResult

    async def fake_fetch(monitor):  # noqa: ANN001
        return FetchResult(
            status_code=status_code, content=content, content_type=content_type, headers={}
        )

    monkeypatch.setattr(app.main.checker, "fetch", fake_fetch)


def _configure_llm(client: TestClient, *, model: str = "gpt-4o-mini") -> None:
    client.put(
        "/api/settings",
        json={
            "ntfy_enabled": False,
            "ntfy_server": "https://ntfy.sh",
            "ntfy_topic": "",
            "ntfy_token": "",
            "ntfy_priority": "default",
            "llm_base_url": "https://api.openai.com/v1",
            "llm_model": model,
            "llm_extra_params": "",
        },
    )


def test_llm_suggest_rule_requires_api_key(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path, llm_api_key="")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(monkeypatch, content="<html><body>3 left</body></html>")

    response = client.post(
        "/api/llm/suggest-rule",
        json={"url": "https://example.com/product", "hint": ""},
    )

    assert response.status_code == 422
    assert "LLM_API_KEY" in response.json()["detail"]


def test_llm_suggest_rule_requires_model(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _stub_checker_fetch(monkeypatch, content="<html><body>3 left</body></html>")

    response = client.post(
        "/api/llm/suggest-rule",
        json={"url": "https://example.com/product", "hint": ""},
    )

    assert response.status_code == 422
    assert "model" in response.json()["detail"].lower()


def test_llm_suggest_rule_fetch_failure_returns_422(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(monkeypatch, content="<html>err</html>", status_code=503)

    response = client.post(
        "/api/llm/suggest-rule",
        json={"url": "https://example.com/product", "hint": ""},
    )

    assert response.status_code == 422
    assert "fetch" in response.json()["detail"].lower()


def test_llm_suggest_rule_returns_rule(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(
        monkeypatch,
        content=(
            "<html><body>"
            "<button class='add-to-cart'>Add to cart</button>"
            "<span data-stock='available'>In stock</span>"
            "</body></html>"
        ),
    )

    llm_payload = {
        "stock_mode": "binary",
        "rule_type": "css",
        "selector_or_path": "[data-stock]::attr(data-stock)",
        "match_mode": "equals",
        "match_value": "available",
        "quantity_pattern": "",
        "low_stock_threshold": None,
        "explanation": "Reads the data-stock attribute and confirms it equals 'available'.",
    }
    with respx.mock(assert_all_called=False) as router:
        router.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(llm_payload)}}]},
            )
        )
        response = client.post(
            "/api/llm/suggest-rule",
            json={
                "url": "https://example.com/product",
                "hint": "Notify me when available",
                "stock_mode": "binary",
            },
        )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["rule_type"] == "css"
    assert data["selector_or_path"] == "[data-stock]::attr(data-stock)"
    assert data["match_mode"] == "equals"
    assert data["match_value"] == "available"
    assert data["stock_mode"] == "binary"
    assert "available" in data["explanation"].lower()


def test_llm_suggest_rule_quantity_mode_forces_exists(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(
        monkeypatch,
        content="<html><body><span class='inventory'>12 units available</span></body></html>",
    )

    llm_payload = {
        "stock_mode": "quantity",
        "rule_type": "css",
        "selector_or_path": ".inventory",
        "match_mode": "contains",
        "match_value": "units",
        "quantity_pattern": "(\\d+)\\s*units",
        "low_stock_threshold": 3,
        "explanation": "Extracts the integer before 'units'.",
    }
    with respx.mock(assert_all_called=False) as router:
        router.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(llm_payload)}}]},
            )
        )
        response = client.post(
            "/api/llm/suggest-rule",
            json={
                "url": "https://example.com/product",
                "hint": "Track stock count, alert when 3 or fewer",
                "stock_mode": "quantity",
            },
        )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["stock_mode"] == "quantity"
    assert data["match_mode"] == "exists"
    assert data["match_value"] == ""
    assert data["quantity_pattern"] == r"(\d+)\s*units"
    assert data["low_stock_threshold"] == 3


def test_llm_suggest_rule_rejects_invalid_quantity_regex(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(monkeypatch, content="<html><body>5 left</body></html>")

    llm_payload = {
        "stock_mode": "quantity",
        "rule_type": "text",
        "selector_or_path": "",
        "match_mode": "exists",
        "match_value": "",
        "quantity_pattern": "(unclosed",
        "low_stock_threshold": None,
        "explanation": "broken",
    }
    with respx.mock(assert_all_called=False) as router:
        router.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(llm_payload)}}]},
            )
        )
        response = client.post(
            "/api/llm/suggest-rule",
            json={"url": "https://example.com/product", "stock_mode": "quantity"},
        )

    assert response.status_code == 422
    assert "regex" in response.json()["detail"].lower()


def test_llm_suggest_rule_retries_when_selector_misses(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    """First suggestion targets a non-existent selector; verifier feeds the model
    a corrective follow-up; second suggestion picks a selector that exists."""
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(
        monkeypatch,
        content=("<html><body><span class='real-stock'>In stock</span></body></html>"),
    )

    miss = {
        "stock_mode": "binary",
        "rule_type": "css",
        "selector_or_path": ".does-not-exist",
        "match_mode": "contains",
        "match_value": "stock",
        "quantity_pattern": "",
        "low_stock_threshold": None,
        "explanation": "first guess",
    }
    hit = {
        "stock_mode": "binary",
        "rule_type": "css",
        "selector_or_path": ".real-stock",
        "match_mode": "contains",
        "match_value": "stock",
        "quantity_pattern": "",
        "low_stock_threshold": None,
        "explanation": "corrected to the real selector",
    }
    with respx.mock(assert_all_called=False) as router:
        router.post("https://api.openai.com/v1/chat/completions").mock(
            side_effect=[
                httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(miss)}}]}),
                httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(hit)}}]}),
            ]
        )
        response = client.post(
            "/api/llm/suggest-rule",
            json={"url": "https://example.com/product", "stock_mode": "binary"},
        )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["selector_or_path"] == ".real-stock"
    assert "corrected" in data["explanation"].lower()


def test_llm_suggest_rule_rejects_persistently_missing_selector(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    """If both attempts target a selector that matches no elements, the endpoint
    surfaces a 4xx with the specific selector that failed — no silent apply."""
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(
        monkeypatch,
        content="<html><body><span class='real-stock'>In stock</span></body></html>",
    )

    miss = {
        "stock_mode": "binary",
        "rule_type": "css",
        "selector_or_path": ".availability",
        "match_mode": "contains",
        "match_value": "stock",
        "quantity_pattern": "",
        "low_stock_threshold": None,
        "explanation": "guess",
    }
    with respx.mock(assert_all_called=False) as router:
        router.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(miss)}}]},
            )
        )
        response = client.post(
            "/api/llm/suggest-rule",
            json={"url": "https://example.com/product", "stock_mode": "binary"},
        )

    assert response.status_code == 422
    detail = response.json()["detail"].lower()
    assert ".availability" in detail
    assert "0 elements" in detail


def test_llm_suggest_rule_strips_inline_flag_prefix(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    """Same sanitization applied through the full-rule suggester."""
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(
        monkeypatch,
        content="<html><body><span class='inventory'>9 left</span></body></html>",
    )

    llm_payload = {
        "stock_mode": "quantity",
        "rule_type": "css",
        "selector_or_path": ".inventory",
        "match_mode": "exists",
        "match_value": "",
        "quantity_pattern": r"(?im)(\d+)\s*left",
        "low_stock_threshold": None,
        "explanation": "matches integer before 'left' (case-insensitive)",
    }
    with respx.mock(assert_all_called=False) as router:
        router.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(llm_payload)}}]},
            )
        )
        response = client.post(
            "/api/llm/suggest-rule",
            json={"url": "https://example.com/product", "stock_mode": "quantity"},
        )

    assert response.status_code == 200, response.text
    assert response.json()["quantity_pattern"] == r"(\d+)\s*left"


def test_llm_suggest_rule_verifies_other_state_sample(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    """The live page is out of stock; the user supplies the in-stock wording. The
    first regex only covers the live OOS page, so the other-state sample forces a
    retry whose pattern handles both states."""
    app = load_app(monkeypatch, tmp_path, llm_api_key="test-key")
    client = TestClient(app)
    _configure_llm(client)
    _stub_checker_fetch(
        monkeypatch,
        content="<html><body><div class='availability'>Out of stock</div></body></html>",
    )

    def _quantity_payload(pattern: str) -> dict[str, object]:
        return {
            "stock_mode": "quantity",
            "rule_type": "text",
            "selector_or_path": ".availability",
            "match_mode": "exists",
            "match_value": "",
            "quantity_pattern": pattern,
            "low_stock_threshold": None,
            "explanation": "extracts the stock signal",
        }

    miss = _quantity_payload(r"(?P<oos>out of stock)")
    hit = _quantity_payload(r"(?P<qty>\d+)\s*in stock now|(?P<oos>out of stock)")
    with respx.mock(assert_all_called=False) as router:
        router.post("https://api.openai.com/v1/chat/completions").mock(
            side_effect=[
                httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(miss)}}]}),
                httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(hit)}}]}),
            ]
        )
        response = client.post(
            "/api/llm/suggest-rule",
            json={
                "url": "https://example.com/product",
                "stock_mode": "quantity",
                "other_state_sample": "5 in stock now",
            },
        )

    assert response.status_code == 200, response.text
    assert (
        response.json()["quantity_pattern"] == r"(?P<qty>\d+)\s*in stock now|(?P<oos>out of stock)"
    )


# ---------- repository round-trip ----------


def test_repository_round_trips_quantity_fields(tmp_path: Path) -> None:
    repository = repo(tmp_path)
    monitor_id = repository.create_monitor(make_quantity_monitor(threshold=4))
    repository.update_monitor(
        monitor_id, {"last_quantity": 9, "last_quantity_at": "2026-05-21T00:00:00+00:00"}
    )
    repository.add_attempt(
        monitor_id, "in_stock", True, 100, 200, "", "Quantity: 9", "", "", quantity=9
    )

    fetched = require_monitor(repository, monitor_id)
    assert fetched.stock_mode == STOCK_MODE_QUANTITY
    assert fetched.quantity_pattern == r"(\d+)\s*left"
    assert fetched.low_stock_threshold == 4
    assert fetched.last_quantity == 9

    attempts = repository.list_attempts(monitor_id)
    assert attempts[0].quantity == 9


def test_settings_api_exposes_llm_config(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path, llm_api_key="sk-test")
    client = TestClient(app)

    settings_response = client.get("/api/settings")

    assert settings_response.status_code == 200
    data = settings_response.json()
    assert data["llm_configured"] is True
    assert data["llm_base_url"] == "https://api.openai.com/v1"
    assert data["llm_model"] == ""


def test_settings_api_rejects_invalid_extra_params(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    response = client.put(
        "/api/settings",
        json={
            "ntfy_enabled": False,
            "ntfy_server": "https://ntfy.sh",
            "ntfy_topic": "",
            "ntfy_token": "",
            "ntfy_priority": "default",
            "llm_base_url": "https://api.openai.com/v1",
            "llm_model": "gpt-4o-mini",
            "llm_extra_params": "not-json",
        },
    )

    assert response.status_code == 422
