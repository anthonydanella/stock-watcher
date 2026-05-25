from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import llm
from app.config import Settings
from app.models import AppSettings

# A page that carries both a stable, stock-independent container ("3 left") and a
# fragile stock-state element (".sold-out") so verification branches can be exercised.
PAGE_HTML = (
    "<html><body>"
    "<button class='add-to-cart'>Add to cart</button>"
    "<div class='availability'>3 left</div>"
    "<div class='sold-out'>Sold out</div>"
    "</body></html>"
)

# Single-state pages used to exercise the other-state-sample verification: the live
# page only ever shows one state, the sample supplies the opposite wording.
OOS_PAGE_HTML = "<html><body><div class='availability'>Out of stock</div></body></html>"
IN_STOCK_PAGE_HTML = "<html><body><div class='availability'>5 in stock now</div></body></html>"
QTY_PATTERN_BOTH = r"(?P<qty>\d+)\s*in stock now|(?P<oos>out of stock)"
QTY_PATTERN_OOS_ONLY = r"(?P<oos>out of stock)"
QTY_PATTERN_QTY_ONLY = r"(?P<qty>\d+)\s*in stock now"


def _settings() -> Settings:
    return Settings(
        data_dir=Path("."),
        database_path=Path("./x.sqlite3"),
        timezone="UTC",
        check_loop_interval_seconds=15,
        event_retention_limit=1000,
        attempt_retention_limit=5000,
        default_ntfy_server="https://ntfy.sh",
        default_ntfy_topic="",
        llm_api_key="test-key",
        llm_html_char_limit=200_000,
    )


def _app_settings() -> AppSettings:
    return AppSettings(
        ntfy_enabled=False,
        ntfy_server="",
        ntfy_topic="",
        ntfy_token="",
        ntfy_priority="default",
        llm_model="test-model",
    )


def _rule(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "stock_mode": "binary",
        "rule_type": "text",
        "selector_or_path": "",
        "match_mode": "contains",
        "match_value": "in stock",
        "quantity_pattern": "",
        "low_stock_threshold": None,
        "explanation": "test",
    }
    base.update(overrides)
    return base


def _queue_llm(
    monkeypatch: pytest.MonkeyPatch, payloads: list[dict[str, object]]
) -> dict[str, int]:
    """Make the LLM return each rule payload (JSON-encoded) in order."""
    state = {"calls": 0}

    async def fake(settings, app_settings, base_url, messages):  # noqa: ANN001
        idx = min(state["calls"], len(payloads) - 1)
        state["calls"] += 1
        return json.dumps(payloads[idx])

    monkeypatch.setattr(llm, "_chat_completion_messages", fake)
    return state


# ---------- suggest_rule (end-to-end with mocked LLM) ----------


async def test_css_rule_passes_when_selector_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    _queue_llm(monkeypatch, [_rule(rule_type="css", selector_or_path=".add-to-cart")])
    result = await llm.suggest_rule(
        _settings(), _app_settings(), html_content=PAGE_HTML, stock_mode="binary"
    )
    assert result.rule_type == "css"
    assert result.selector_or_path == ".add-to-cart"


async def test_zero_match_selector_triggers_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _queue_llm(
        monkeypatch,
        [
            _rule(rule_type="css", selector_or_path=".does-not-exist"),
            _rule(rule_type="css", selector_or_path=".add-to-cart"),
        ],
    )
    result = await llm.suggest_rule(
        _settings(), _app_settings(), html_content=PAGE_HTML, stock_mode="binary"
    )
    assert result.selector_or_path == ".add-to-cart"
    assert state["calls"] == 2


async def test_unmatched_selector_raises_after_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    _queue_llm(
        monkeypatch,
        [
            _rule(rule_type="css", selector_or_path=".nope"),
            _rule(rule_type="css", selector_or_path=".still-nope"),
        ],
    )
    with pytest.raises(llm.LLMError) as exc:
        await llm.suggest_rule(
            _settings(), _app_settings(), html_content=PAGE_HTML, stock_mode="binary"
        )
    assert ".still-nope" in str(exc.value)


async def test_quantity_rule_forces_exists_and_clears_operand(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Even if the model fills binary match fields, quantity mode must ignore them.
    _queue_llm(
        monkeypatch,
        [
            _rule(
                stock_mode="quantity",
                rule_type="text",
                selector_or_path="",
                match_mode="contains",
                match_value="leftover",
                quantity_pattern=r"(?P<qty>\d+)\s*left",
            )
        ],
    )
    result = await llm.suggest_rule(
        _settings(), _app_settings(), html_content=PAGE_HTML, stock_mode="quantity"
    )
    assert result.stock_mode == "quantity"
    assert result.match_mode == "exists"
    assert result.match_value == ""
    assert result.quantity_pattern == r"(?P<qty>\d+)\s*left"


async def test_quantity_rule_rejects_fragile_selector(monkeypatch: pytest.MonkeyPatch) -> None:
    # `.sold-out` exists on the page (so it clears the element-count check) but encodes
    # stock state, so the verifier must reject it and the retry's stable scope wins.
    state = _queue_llm(
        monkeypatch,
        [
            _rule(
                stock_mode="quantity",
                rule_type="css",
                selector_or_path=".sold-out",
                quantity_pattern=r"(?P<qty>\d+)",
            ),
            _rule(
                stock_mode="quantity",
                rule_type="text",
                selector_or_path=".availability",
                quantity_pattern=r"(?P<qty>\d+)\s*left",
            ),
        ],
    )
    result = await llm.suggest_rule(
        _settings(), _app_settings(), html_content=PAGE_HTML, stock_mode="quantity"
    )
    assert result.selector_or_path == ".availability"
    assert state["calls"] == 2


async def test_empty_html_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    _queue_llm(monkeypatch, [_rule()])
    with pytest.raises(llm.LLMError):
        await llm.suggest_rule(_settings(), _app_settings(), html_content="", stock_mode="binary")


# ---------- quantity mode: other-state-sample verification ----------


def _quantity_rule(pattern: str) -> dict[str, object]:
    return _rule(
        stock_mode="quantity",
        rule_type="text",
        selector_or_path=".availability",
        quantity_pattern=pattern,
    )


async def test_quantity_rule_covering_both_states_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    # Live page is out of stock; the user pastes the in-stock wording as the other state.
    _queue_llm(monkeypatch, [_quantity_rule(QTY_PATTERN_BOTH)])
    result = await llm.suggest_rule(
        _settings(),
        _app_settings(),
        html_content=OOS_PAGE_HTML,
        stock_mode="quantity",
        other_state_sample="5 in stock now",
    )
    assert result.quantity_pattern == QTY_PATTERN_BOTH


async def test_quantity_rule_missing_other_state_branch_triggers_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # First attempt only handles the live OOS page; the in-stock sample forces a retry
    # that returns a pattern covering both states.
    state = _queue_llm(
        monkeypatch,
        [_quantity_rule(QTY_PATTERN_OOS_ONLY), _quantity_rule(QTY_PATTERN_BOTH)],
    )
    result = await llm.suggest_rule(
        _settings(),
        _app_settings(),
        html_content=OOS_PAGE_HTML,
        stock_mode="quantity",
        other_state_sample="5 in stock now",
    )
    assert result.quantity_pattern == QTY_PATTERN_BOTH
    assert state["calls"] == 2


async def test_quantity_rule_unmatchable_sample_raises_after_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Both attempts ignore the in-stock sample -> strict failure naming the example.
    _queue_llm(
        monkeypatch, [_quantity_rule(QTY_PATTERN_OOS_ONLY), _quantity_rule(QTY_PATTERN_OOS_ONLY)]
    )
    with pytest.raises(llm.LLMError) as exc:
        await llm.suggest_rule(
            _settings(),
            _app_settings(),
            html_content=OOS_PAGE_HTML,
            stock_mode="quantity",
            other_state_sample="5 in stock now",
        )
    assert "5 in stock now" in str(exc.value)


async def test_quantity_rule_prose_sample_is_not_a_hard_fixture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A prose sample with no digit / no OOS phrase is guidance only; a qty-only pattern
    # that satisfies the live in-stock page is accepted without being gated on the prose.
    _queue_llm(monkeypatch, [_quantity_rule(QTY_PATTERN_QTY_ONLY)])
    result = await llm.suggest_rule(
        _settings(),
        _app_settings(),
        html_content=IN_STOCK_PAGE_HTML,
        stock_mode="quantity",
        other_state_sample="the number near the buy box",
    )
    assert result.quantity_pattern == QTY_PATTERN_QTY_ONLY


async def test_binary_rule_ignores_other_state_sample(monkeypatch: pytest.MonkeyPatch) -> None:
    # The other-state sample only governs quantity-mode regex verification; in binary
    # mode it must not gate the suggestion.
    _queue_llm(monkeypatch, [_rule(rule_type="css", selector_or_path=".add-to-cart")])
    result = await llm.suggest_rule(
        _settings(),
        _app_settings(),
        html_content=PAGE_HTML,
        stock_mode="binary",
        other_state_sample="5 in stock now",
    )
    assert result.selector_or_path == ".add-to-cart"


# ---------- _build_rule_suggestion (direct unit coverage) ----------


def test_build_forces_exists_in_quantity_mode() -> None:
    payload = _rule(
        stock_mode="quantity",
        match_mode="contains",
        match_value="x",
        quantity_pattern=r"(?P<qty>\d+)",
    )
    suggestion = llm._build_rule_suggestion(payload, "quantity", raw="{}")
    assert suggestion.match_mode == "exists"
    assert suggestion.match_value == ""


def test_build_strips_inline_flags_from_quantity_pattern() -> None:
    payload = _rule(stock_mode="quantity", quantity_pattern=r"(?im)(?P<qty>\d+)\s*left")
    suggestion = llm._build_rule_suggestion(payload, "quantity", raw="{}")
    assert suggestion.quantity_pattern == r"(?P<qty>\d+)\s*left"


def test_build_strips_mid_pattern_inline_flag_from_quantity_pattern() -> None:
    # A mid-pattern '(?i)' breaks Python's regex compiler entirely, so the sanitizer
    # must strip it wherever it appears — not just a leading prefix.
    payload = _rule(
        stock_mode="quantity", quantity_pattern=r"(?P<qty>\d+)|(?i)(?P<oos>out of stock)"
    )
    suggestion = llm._build_rule_suggestion(payload, "quantity", raw="{}")
    assert suggestion.quantity_pattern == r"(?P<qty>\d+)|(?P<oos>out of stock)"


def test_build_strips_inline_flags_from_match_value_regex() -> None:
    # The fix: a Python-valid but JS-invalid operand must be normalized so the
    # frontend's `new RegExp` validity gate can't reject a backend-valid rule.
    payload = _rule(match_mode="regex", match_value=r"(?i)in\s*stock")
    suggestion = llm._build_rule_suggestion(payload, "binary", raw="{}")
    assert suggestion.match_value == r"in\s*stock"


def test_build_does_not_strip_inline_flags_from_literal_operand() -> None:
    # Only regex operands are sanitized; a literal `contains` value is left intact.
    payload = _rule(match_mode="contains", match_value="(?i)not a regex")
    suggestion = llm._build_rule_suggestion(payload, "binary", raw="{}")
    assert suggestion.match_value == "(?i)not a regex"


def test_build_raises_on_invalid_quantity_regex() -> None:
    payload = _rule(stock_mode="quantity", quantity_pattern=r"(?P<qty>\d+")
    with pytest.raises(llm.LLMError):
        llm._build_rule_suggestion(payload, "quantity", raw="{}")


def test_build_raises_on_invalid_match_value_regex() -> None:
    payload = _rule(match_mode="regex", match_value=r"(unclosed")
    with pytest.raises(llm.LLMError):
        llm._build_rule_suggestion(payload, "binary", raw="{}")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (3, 3),
        (3.0, 3),
        ("5", 5),
        (-1, None),
        (True, None),
        ("not-a-number", None),
        (None, None),
    ],
)
def test_build_threshold_parsing(raw: object, expected: int | None) -> None:
    payload = _rule(
        stock_mode="quantity", quantity_pattern=r"(?P<qty>\d+)", low_stock_threshold=raw
    )
    suggestion = llm._build_rule_suggestion(payload, "quantity", raw="{}")
    assert suggestion.low_stock_threshold == expected


def test_build_coerces_unknown_modes_to_safe_defaults() -> None:
    payload = _rule(stock_mode="weird", rule_type="xpath", match_mode="bogus", match_value="x")
    suggestion = llm._build_rule_suggestion(payload, "binary", raw="{}")
    assert suggestion.stock_mode == "binary"
    assert suggestion.rule_type == "text"
    assert suggestion.match_mode == "contains"
