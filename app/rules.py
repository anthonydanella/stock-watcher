from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from bs4 import BeautifulSoup

from app.models import MATCH_EQUALS, MATCH_EXISTS, MATCH_NOT_CONTAINS, MATCH_REGEX
from app.quantity import parse_quantity

EXTRACTED_TEXT_LIMIT = 4000
MATCH_CONTEXT_LIMIT = 500
MAX_MATCH_CONTEXTS = 10


@dataclass(frozen=True)
class RuleResult:
    matched: bool
    evidence: str


@dataclass(frozen=True)
class ElementMatch:
    index: int
    tag: str
    text: str
    value: str
    html: str
    attributes: dict[str, str]


@dataclass(frozen=True)
class RegexResult:
    pattern: str
    valid: bool
    matched: bool
    match_count: int
    matches: list[str]
    error: str


@dataclass(frozen=True)
class RuleDiagnostics:
    matched: bool
    evidence: str
    reason: str
    rule_type: str
    selector_or_path: str
    match_mode: str
    match_value: str
    extracted_text: str
    extracted_text_length: int
    extracted_text_is_excerpt: bool
    extracted_value: Any
    element_count: int
    elements: list[ElementMatch]
    regex: RegexResult | None
    match_contexts: list[str]
    quantity: int | None = None
    quantity_pattern: str = ""
    quantity_error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_STATE_SELECTOR_RE = re.compile(
    r"[.#]([A-Za-z0-9_-]+)"  # .class or #id
    r"|\[[\w:-]+[*^$|~]?=\s*['\"]?([^'\"\]]+)"  # [attr=value]
)
_STATE_SELECTOR_TOKENS = (
    "outofstock",
    "instock",
    "soldout",
    "backorder",
    "preorder",
    "unavailable",
)


def normalize_for_match(text: str) -> str:
    """Collapse whitespace the way extracted text is compacted, so a pasted sample
    matches a quantity pattern exactly as the live extraction would."""
    return re.sub(r"\s+", " ", text or "").strip()


def selector_encodes_stock_state(selector_or_path: str) -> str:
    """Return the first class/id/attribute-value token that encodes a stock state.

    Selectors whose *presence* depends on stock state (e.g. ``.out-of-stock`` or
    ``[data-status=in-stock]``) break quantity rules: the element exists in only one
    state, so extraction returns empty text in the other and the monitor errors
    instead of reading the opposite state. Heuristic and conservative — only class
    (``.foo``), id (``#foo``) and attribute *value* segments are inspected; stable
    attribute names like ``[data-availability]`` (the value changes but the element
    persists) are left alone. Returns the offending token, or ``""`` if none match.
    """
    if not selector_or_path:
        return ""
    for class_id, attr_value in _STATE_SELECTOR_RE.findall(selector_or_path):
        raw = class_id or attr_value
        if not raw:
            continue
        collapsed = re.sub(r"[_-]", "", raw).lower()
        if any(token in collapsed for token in _STATE_SELECTOR_TOKENS):
            return raw
    return ""


def evaluate_rule(
    rule_type: str,
    selector_or_path: str,
    match_mode: str,
    match_value: str,
    content: str,
    content_type: str = "",
) -> RuleResult:
    if rule_type == "css":
        try:
            values = _extract_css_values(content, selector_or_path)
        except ValueError as exc:
            return RuleResult(matched=False, evidence=_compact(str(exc)))
        text = "\n".join(values)
        return _match(text, match_mode, match_value, evidence=text or "No matching elements")
    if selector_or_path.strip():
        try:
            values = _extract_css_values(content, selector_or_path)
        except ValueError as exc:
            return RuleResult(matched=False, evidence=_compact(str(exc)))
        text = "\n".join(values)
        return _match(text, match_mode, match_value, evidence=text or "No matching scope text")
    return _match(content, match_mode, match_value, evidence=_compact(content))


def evaluate_rule_diagnostics(
    rule_type: str,
    selector_or_path: str,
    match_mode: str,
    match_value: str,
    content: str,
    content_type: str = "",
    quantity_pattern: str | None = None,
) -> RuleDiagnostics:
    elements: list[ElementMatch] = []
    extracted_value: Any = None
    extraction_failure = ""

    if rule_type == "css":
        try:
            extracted_elements = _extract_css_matches(content, selector_or_path, compact=False)
            elements = [_compact_element_match(element) for element in extracted_elements]
            values = [element.value for element in extracted_elements if element.value]
        except ValueError as exc:
            values = []
            extraction_failure = _compact(str(exc))
        extracted_text = "\n".join(values)
        extracted_value = values
        evidence = extracted_text or extraction_failure or "No matching elements"
    elif selector_or_path.strip():
        try:
            extracted_elements = _extract_css_matches(content, selector_or_path, compact=False)
            elements = [_compact_element_match(element) for element in extracted_elements]
            values = [element.value for element in extracted_elements if element.value]
        except ValueError as exc:
            values = []
            extraction_failure = _compact(str(exc))
        extracted_text = "\n".join(values)
        extracted_value = extracted_text
        evidence = extracted_text or extraction_failure or "No matching scope text"
    else:
        extracted_text = _document_text(content, content_type)
        extracted_value = extracted_text
        evidence = _compact(extracted_text or content)

    match = _match_diagnostics(extracted_text, match_mode, match_value, evidence)
    diagnostic_text, diagnostic_text_is_excerpt = _diagnostic_text(
        extracted_text, match["match_contexts"]
    )
    reason = extraction_failure or match["reason"]
    quantity_value: int | None = None
    quantity_used = ""
    quantity_error = ""
    if quantity_pattern is not None:
        result = parse_quantity(extracted_value, extracted_text, quantity_pattern)
        quantity_value = result.quantity
        quantity_used = result.pattern
        quantity_error = result.error
    return RuleDiagnostics(
        matched=match["matched"],
        evidence=match["evidence"],
        reason=reason,
        rule_type=rule_type,
        selector_or_path=selector_or_path,
        match_mode=match_mode,
        match_value=match_value,
        extracted_text=diagnostic_text,
        extracted_text_length=len(extracted_text),
        extracted_text_is_excerpt=diagnostic_text_is_excerpt,
        extracted_value=extracted_value,
        element_count=len(elements),
        elements=elements[:20],
        regex=match["regex"],
        match_contexts=match["match_contexts"],
        quantity=quantity_value,
        quantity_pattern=quantity_used,
        quantity_error=quantity_error,
    )


def _extract_css_values(content: str, selector_or_path: str) -> list[str]:
    return [
        element.value
        for element in _extract_css_matches(content, selector_or_path, compact=False)
        if element.value
    ]


def _extract_css_matches(
    content: str, selector_or_path: str, compact: bool = True
) -> list[ElementMatch]:
    selector, attr = _split_attr_selector(selector_or_path)
    if not selector:
        return []
    soup = BeautifulSoup(content, "html.parser")
    try:
        elements = soup.select(selector)
    except Exception as exc:
        raise ValueError(f"Invalid CSS selector: {selector}") from exc
    matches: list[ElementMatch] = []
    for index, element in enumerate(elements, start=1):
        if attr:
            value = element.get(attr)
            if isinstance(value, list):
                extracted = " ".join(value)
            elif value is not None:
                extracted = str(value)
            else:
                extracted = ""
        else:
            extracted = element.get_text(" ", strip=True)
        text = element.get_text(" ", strip=True)
        matches.append(
            ElementMatch(
                index=index,
                tag=element.name or "",
                text=_compact(text, 500) if compact else text,
                value=_compact(extracted, 500) if compact else extracted,
                html=_compact(str(element), 500) if compact else str(element),
                attributes=_element_attributes(element),
            )
        )
    return matches


def _compact_element_match(element: ElementMatch) -> ElementMatch:
    return ElementMatch(
        index=element.index,
        tag=element.tag,
        text=_compact(element.text, 500),
        value=_compact(element.value, 500),
        html=_compact(element.html, 500),
        attributes=element.attributes,
    )


def _split_attr_selector(selector_or_path: str) -> tuple[str, str | None]:
    selector_or_path = selector_or_path.strip()
    match = re.search(r"::attr\(([^)]+)\)$", selector_or_path)
    if not match:
        return selector_or_path, None
    return selector_or_path[: match.start()].strip(), match.group(1).strip()


def _match(text: str, match_mode: str, match_value: str, evidence: str) -> RuleResult:
    details = _match_diagnostics(text, match_mode, match_value, evidence)
    return RuleResult(matched=details["matched"], evidence=details["evidence"])


def _match_diagnostics(
    text: str, match_mode: str, match_value: str, evidence: str
) -> dict[str, Any]:
    haystack = text or ""
    needle = match_value or ""
    regex: RegexResult | None = None
    match_contexts: list[str] = []
    if match_mode == MATCH_EXISTS:
        matched = bool(haystack)
        reason = (
            "Extracted value is non-empty."
            if matched
            else "Expected a non-empty extracted value, but extraction returned nothing."
        )
    elif match_mode == MATCH_EQUALS:
        matched = haystack.strip().lower() == needle.strip().lower()
        reason = (
            "Extracted value equals the operand."
            if matched
            else f"Expected equality with '{_compact(needle, 120)}', but extracted '{_compact(haystack, 120)}'."
        )
    elif match_mode == MATCH_REGEX:
        try:
            compiled = re.compile(needle, flags=re.IGNORECASE | re.MULTILINE)
            matches: list[str] = []
            match_count = 0
            for match in compiled.finditer(haystack):
                match_count += 1
                if len(matches) < MAX_MATCH_CONTEXTS:
                    matches.append(_compact(match.group(0), 160))
                if len(match_contexts) < MAX_MATCH_CONTEXTS:
                    match_contexts.append(_match_context(haystack, match.start(), match.end()))
            matched = match_count > 0
            regex = RegexResult(
                pattern=needle,
                valid=True,
                matched=matched,
                match_count=match_count,
                matches=matches,
                error="",
            )
            reason = (
                "Regex matched extracted text."
                if matched
                else "Regex was valid, but did not match the extracted text."
            )
        except re.error as exc:
            matched = False
            error = f"Invalid regex: {needle} ({exc})"
            regex = RegexResult(
                pattern=needle, valid=False, matched=False, match_count=0, matches=[], error=error
            )
            reason = error
    elif match_mode == MATCH_NOT_CONTAINS:
        index = haystack.lower().find(needle.lower()) if needle else -1
        matched = index == -1
        if not matched:
            match_contexts.append(_match_context(haystack, index, index + len(needle)))
        reason = (
            "Forbidden text was absent."
            if matched
            else f"Expected text not to contain '{_compact(needle, 120)}', but it was present."
        )
    else:
        index = haystack.lower().find(needle.lower()) if needle else 0
        matched = index != -1
        if matched and needle:
            match_contexts.append(_match_context(haystack, index, index + len(needle)))
        reason = (
            "Extracted text contains the operand."
            if matched
            else f"Expected text to contain '{_compact(needle, 120)}', but it was not found."
        )
    diagnostic_evidence = (
        regex.error
        if regex and not regex.valid
        else match_contexts[0]
        if match_contexts
        else _compact(evidence)
    )
    return {
        "matched": matched,
        "evidence": diagnostic_evidence,
        "reason": reason,
        "regex": regex,
        "match_contexts": match_contexts,
    }


def _document_text(content: str, content_type: str) -> str:
    if "html" not in content_type.lower() and "<" not in content[:200]:
        return content
    soup = BeautifulSoup(content, "html.parser")
    for element in soup(["script", "style", "noscript"]):
        element.decompose()
    return soup.get_text(" ", strip=True)


def _element_attributes(element) -> dict[str, str]:  # noqa: ANN001
    attributes: dict[str, str] = {}
    for key, value in list(element.attrs.items())[:8]:
        if isinstance(value, list):
            attributes[str(key)] = _compact(" ".join(str(item) for item in value), 160)
        else:
            attributes[str(key)] = _compact(str(value), 160)
    return attributes


def _compact(value: str, limit: int = 500) -> str:
    compacted = re.sub(r"\s+", " ", value).strip()
    if len(compacted) > limit:
        return compacted[: limit - 3] + "..."
    return compacted


def _diagnostic_text(value: str, match_contexts: list[str]) -> tuple[str, bool]:
    compacted = _compact(value, EXTRACTED_TEXT_LIMIT)
    if len(compacted) <= EXTRACTED_TEXT_LIMIT and len(value) <= EXTRACTED_TEXT_LIMIT:
        return compacted, False
    if match_contexts:
        return match_contexts[0], True
    return compacted, True


def _match_context(value: str, start: int, end: int, limit: int = MATCH_CONTEXT_LIMIT) -> str:
    if not value:
        return ""
    start = max(0, min(start, len(value)))
    end = max(start, min(end, len(value)))
    if start == end:
        end = min(len(value), start + 1)
    if len(value) <= limit:
        return _compact(value, limit)

    prefix = "... "
    suffix = " ..."
    available = max(20, limit - len(prefix) - len(suffix))
    match_length = end - start
    context_budget = max(0, available - match_length)
    before = context_budget // 2
    after = context_budget - before

    window_start = max(0, start - before)
    window_end = min(len(value), end + after)
    if window_start == 0:
        window_end = min(len(value), available)
    elif window_end == len(value):
        window_start = max(0, len(value) - available)

    excerpt = value[window_start:window_end]
    if window_start > 0:
        excerpt = f"{prefix}{excerpt}"
    if window_end < len(value):
        excerpt = f"{excerpt}{suffix}"
    return _compact(excerpt, limit)
