"""Parse a non-negative integer quantity from extracted rule output.

Quantity parsing is a distinct concern from match-rule evaluation: it turns the
text (or value) a rule extracts into a number that the checker compares against
a low-stock threshold. ``app.rules`` calls :func:`parse_quantity` while building
diagnostics, and ``app.llm`` uses it to verify AI-suggested quantity regexes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

DEFAULT_QUANTITY_PATTERN = r"\d+"


@dataclass(frozen=True)
class QuantityResult:
    quantity: int | None
    pattern: str
    error: str


def parse_quantity(extracted_value: Any, extracted_text: str, pattern: str) -> QuantityResult:
    """Parse a non-negative integer from extracted rule output.

    Resolution order:
    1. If `pattern` is empty and `extracted_value` is already numeric, use it.
    2. Otherwise compile `pattern` (default `\\d+`) and search `extracted_text`.
       - If the pattern uses the named-group convention (`qty` and/or `oos`),
         iterate every match: the first `qty` group capturing digits wins; if no
         `qty` match is found but any `oos` group matched, return 0 (out of stock).
       - Otherwise (legacy/unnamed patterns) return the first non-empty capture
         group from the first match, or the whole match.
    """
    pattern_used = pattern.strip() or DEFAULT_QUANTITY_PATTERN

    if not pattern.strip():
        numeric = _coerce_numeric(extracted_value)
        if numeric is not None:
            return QuantityResult(quantity=numeric, pattern="", error="")

    try:
        compiled = re.compile(pattern_used, flags=re.IGNORECASE | re.MULTILINE)
    except re.error as exc:
        return QuantityResult(
            quantity=None, pattern=pattern_used, error=f"Invalid quantity regex: {exc}"
        )

    haystack = extracted_text or ""
    if not haystack:
        numeric = _coerce_numeric(extracted_value)
        if numeric is not None:
            return QuantityResult(quantity=numeric, pattern=pattern_used, error="")
        return QuantityResult(quantity=None, pattern=pattern_used, error="Extracted text was empty")

    group_names = set(compiled.groupindex)
    if "qty" in group_names or "oos" in group_names:
        oos_seen = False
        any_match = False
        for match in compiled.finditer(haystack):
            any_match = True
            named = match.groupdict()
            qty_raw = named.get("qty")
            if qty_raw and qty_raw.strip():
                digits = re.sub(r"[^\d]", "", qty_raw)
                if digits:
                    try:
                        return QuantityResult(quantity=int(digits), pattern=pattern_used, error="")
                    except ValueError:
                        pass
            oos_raw = named.get("oos")
            if oos_raw and oos_raw.strip():
                oos_seen = True
        if oos_seen:
            return QuantityResult(quantity=0, pattern=pattern_used, error="")
        if not any_match:
            return QuantityResult(
                quantity=None,
                pattern=pattern_used,
                error="Quantity regex did not match the extracted text",
            )
        return QuantityResult(
            quantity=None,
            pattern=pattern_used,
            error="Quantity regex matched, but neither 'qty' nor 'oos' captured a usable value",
        )

    match = compiled.search(haystack)
    if not match:
        return QuantityResult(
            quantity=None,
            pattern=pattern_used,
            error="Quantity regex did not match the extracted text",
        )

    raw: str | None = None
    if match.groups():
        for group in match.groups():
            if group is not None and str(group).strip():
                raw = str(group)
                break
    if raw is None:
        raw = match.group(0)

    digits = re.sub(r"[^\d]", "", raw)
    if not digits:
        return QuantityResult(
            quantity=None, pattern=pattern_used, error=f"Matched value '{raw}' has no digits"
        )
    try:
        return QuantityResult(quantity=int(digits), pattern=pattern_used, error="")
    except ValueError:
        return QuantityResult(
            quantity=None, pattern=pattern_used, error=f"Could not parse '{raw}' as integer"
        )


def _coerce_numeric(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        return int(value) if value >= 0 else None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            number = float(stripped)
        except ValueError:
            return None
        if number < 0:
            return None
        return int(number)
    if isinstance(value, list):
        for item in value:
            number = _coerce_numeric(item)
            if number is not None:
                return number
    return None
