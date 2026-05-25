from __future__ import annotations

import pytest

from app.rules import normalize_for_match, selector_encodes_stock_state


@pytest.mark.parametrize(
    "selector",
    [
        ".out-of-stock",
        ".product .sold_out",
        "#availability-instock",
        "[data-status=out-of-stock]",
        "[data-state='soldOut']",
        ".badge.unavailable",
        ".preorder-banner",
    ],
)
def test_flags_state_encoding_selectors(selector: str) -> None:
    assert selector_encodes_stock_state(selector) != ""


@pytest.mark.parametrize(
    "selector",
    [
        "",
        "#product-info",
        ".availability",  # container name, not a state value
        "[data-availability]",  # stable attribute name; value changes, element persists
        ".add-to-cart",
        "#buy-box .qty",
        ".stock-status",  # container that holds either state's text
    ],
)
def test_ignores_state_invariant_selectors(selector: str) -> None:
    assert selector_encodes_stock_state(selector) == ""


def test_normalize_collapses_whitespace() -> None:
    assert normalize_for_match("  5\n\tin   stock now  ") == "5 in stock now"
    assert normalize_for_match("") == ""
