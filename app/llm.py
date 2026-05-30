"""LLM helper for drafting a monitor's rule configuration.

Uses the OpenAI-compatible Chat Completions schema so this works against OpenAI,
Anthropic's compatibility endpoint, OpenRouter, Ollama, llama.cpp, etc. The API key
is provided via the LLM_API_KEY env var; the base URL, model ID, and extra request
params (for reasoning effort, thinking budget, etc.) come from the in-app settings.

A single helper is exposed:

- :func:`suggest_rule` — drafts the full set of rule fields (rule type, selector,
  match mode + value, or quantity regex + threshold depending on stock mode) so
  the user can configure a monitor in one click. In quantity mode it can also
  verify the proposed regex against user-pasted text from the OTHER stock state,
  guaranteeing the pattern covers both in-stock and out-of-stock wording.

The helper operates on freshly fetched HTML — there is no fallback to stored
evidence, which would only contain a truncated snippet of the page.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import httpx
from bs4 import BeautifulSoup

from app.config import Settings
from app.models import AppSettings
from app.rules import (
    evaluate_rule_diagnostics,
    normalize_for_match,
    parse_quantity,
    selector_encodes_stock_state,
)


class LLMError(Exception):
    """Raised when the LLM call cannot be completed or returns an unusable response."""


@dataclass(frozen=True)
class RuleSuggestion:
    stock_mode: str
    rule_type: str
    selector_or_path: str
    match_mode: str
    match_value: str
    quantity_pattern: str
    low_stock_threshold: int | None
    explanation: str
    raw: str


# Fallback cap when no per-request limit is supplied. Production callers pass
# settings.llm_html_char_limit explicitly so this is mostly relevant for tests
# and ad-hoc imports of prepare_html_for_llm.
HTML_LIMIT = 200_000

# Python's `re` accepts a leading inline-flag prefix like `(?i)` / `(?im)`, but it
# rejects the same construct mid-pattern ("global flags not at the start of the
# expression"), and JavaScript's RegExp constructor rejects either position. The
# backend always compiles quantity patterns with IGNORECASE|MULTILINE already, so
# these flag groups are pointless anyway. Strip every occurrence at the LLM
# boundary so saved patterns stay portable and compile cleanly.
# This intentionally does NOT match scoped variants like `(?i:...)`, lookarounds,
# named groups, or non-capturing groups — the character class excludes `:`, `=`,
# `!`, `<`, `P`, etc.
_INLINE_FLAG_GROUP = re.compile(r"\(\?[aiLmsux\-]+\)")


def _strip_inline_flag_groups(pattern: str) -> str:
    """Remove inline-flag groups that the JS-side validator won't accept and
    that, when not at the very start, also break Python's regex compiler.

    Applied to every regex we hand back to the editor — both the quantity
    pattern and a binary ``match_mode=='regex'`` operand — so a backend-valid
    pattern can't be rejected by the frontend's ``new RegExp`` validity gate."""
    if not pattern:
        return pattern
    return _INLINE_FLAG_GROUP.sub("", pattern.strip())


RULE_SUGGEST_SYSTEM_PROMPT = (
    "You configure a stock-monitoring app. Given a fresh product-page snapshot, choose "
    "the cleanest, most resilient way to detect stock and return a JSON object describing "
    "the monitor rule.\n\n"
    "The schema:\n"
    "{\n"
    '  "stock_mode": "binary" | "quantity",   // honor the user\'s requested mode\n'
    '  "rule_type": "text" | "css",            // extraction strategy\n'
    "  \"selector_or_path\": string,                  // CSS selector when rule_type=='css';\n"
    "                                                  // optional CSS scope when rule_type=='text';\n"
    "                                                  // empty string allowed for text body\n"
    '  "match_mode": "contains" | "not_contains" | "equals" | "regex" | "exists",\n'
    '  "match_value": string,                       // operand for the match (case-insensitive)\n'
    '  "quantity_pattern": string,                  // Python regex with one capture group,\n'
    "                                                  // ONLY used when stock_mode=='quantity'\n"
    '  "low_stock_threshold": integer | null,        // optional; only meaningful in quantity mode\n'
    '  "explanation": string                         // 1-2 short sentences explaining the choice\n'
    "}\n\n"
    "Guidance:\n"
    "- Prefer the most reliable extraction. CSS selectors using stable attributes "
    "(`[data-stock]`, `[data-availability]`, `.add-to-cart`, `.stock-status`, ARIA labels) "
    "beat brittle text body searches. Use `::attr(name)` for attribute extraction.\n"
    "- For binary mode, choose match_mode + match_value that yields true ONLY when the item "
    'is purchasable. Examples: contains "add to cart", not_contains "sold out", '
    'equals "InStock" (Schema.org), regex "in\\s*stock".\n'
    '- For quantity mode, set match_mode to "exists" and match_value to "". Provide a '
    "quantity_pattern using named groups: (?P<qty>...) to capture the integer quantity "
    "(digits only, no commas), and optionally (?P<oos>...) to capture an out-of-stock "
    "sentinel like 'out of stock' or 'sold out'. When oos matches and qty does not, the "
    "app records the quantity as 0. Never alternate a capturing branch with a bare "
    "literal — each branch of any | alternation must be wrapped in its named group. "
    "The pattern is already matched case-insensitively and multiline — DO NOT add "
    "inline flag groups like '(?i)' or '(?m)' anywhere (they break the JavaScript-side "
    "validator and Python rejects them mid-pattern). Choose a scope/selector that exists "
    "whether or not the item is in stock — NEVER target an element whose presence encodes "
    "the stock state (e.g. '.in-stock', '.sold-out', '[data-status=out-of-stock]'), because "
    "it vanishes in the opposite state and breaks extraction; rely on the regex's context "
    "words to find the number within stable text. Pick a low_stock_threshold ONLY if "
    "the user explicitly asks for it (otherwise null).\n"
    "- In quantity mode you may be given example text from the OTHER stock state (the live "
    "page shows only the current state). Your quantity_pattern MUST extract a signal from "
    "both the live page and every example — usually a (?P<qty>...) branch for the in-stock "
    "wording joined by | to a (?P<oos>...) branch for the out-of-stock wording.\n"
    '- When rule_type is "text", selector_or_path can be empty (full body) or a CSS scope '
    'to narrow the searched area (e.g. "#product-availability, .availability").\n'
    '- Always return values for ALL keys. Use empty string "" for unused string fields, never null.\n'
    "- Return ONLY the JSON object. No code fences, no prose."
)


async def suggest_rule(
    settings: Settings,
    app_settings: AppSettings,
    *,
    html_content: str,
    stock_mode: str,
    hint: str = "",
    current_rule_type: str = "",
    current_selector_or_path: str = "",
    other_state_sample: str = "",
) -> RuleSuggestion:
    """Ask the LLM to draft a full rule configuration for the page.

    The proposed selector is verified against `html_content` — if it matches zero
    elements (or, in quantity mode, the proposed regex doesn't parse a number from
    the extracted text), we re-prompt once with a corrective message before giving
    up. This prevents the UI from applying selectors that look plausible but don't
    actually exist in the page.

    `other_state_sample` is optional user-pasted text showing the page in the stock
    state NOT currently live (one example per line) — the page can only be fetched in
    one state at a time. In quantity mode the proposed regex is additionally verified
    against every "coverable" line of it (a line carrying a digit or a recognizable
    out-of-stock phrase), guaranteeing the pattern handles both states.
    """
    _ensure_configured(settings, app_settings)
    base_url = _base_url(app_settings)

    cleaned_html = prepare_html_for_llm(html_content, limit=settings.llm_html_char_limit)
    if not cleaned_html:
        raise LLMError("The fetched page had no usable content to inspect.")

    requested_mode = stock_mode if stock_mode in {"binary", "quantity"} else "binary"
    samples = _parse_state_samples(other_state_sample) if requested_mode == "quantity" else []
    sections: list[str] = [
        f"Requested stock mode: {requested_mode}",
    ]
    if current_rule_type or current_selector_or_path:
        sections.append(
            f"Current rule (for context): rule_type={current_rule_type or '(unset)'}, "
            f"selector_or_path={current_selector_or_path or '(none)'}"
        )
    if hint.strip():
        sections.append(f"User goal: {hint.strip()}")
    else:
        sections.append("User goal: detect stock availability reliably on this page.")
    sections.append(f"Page HTML (cleaned, truncated):\n```html\n{cleaned_html}\n```")
    if samples:
        joined = "\n".join(samples)
        sections.append(
            "Example text from the OTHER stock state (the live page above shows only the "
            f"current state). Your quantity_pattern MUST also handle these:\n```\n{joined}\n```"
        )
    sections.append("Return the JSON object now.")
    user_content = "\n\n".join(sections)

    messages = [
        {"role": "system", "content": RULE_SUGGEST_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    last_suggestion: RuleSuggestion | None = None
    last_problem = ""
    for attempt in range(2):
        raw = await _chat_completion_messages(settings, app_settings, base_url, messages)
        payload = _parse_json_payload(raw)
        suggestion = _build_rule_suggestion(payload, requested_mode, raw)
        problem = _verify_rule_suggestion(suggestion, html_content, samples)
        if not problem:
            return suggestion
        last_suggestion = suggestion
        last_problem = problem

        if attempt == 0:
            messages.append({"role": "assistant", "content": raw})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"That suggestion failed verification: {problem}. "
                        "Re-examine the HTML and any other-state examples above and propose a "
                        "different rule that actually matches elements on THIS page. Stay in the "
                        f"requested stock mode ({requested_mode}). Return the JSON object now."
                    ),
                }
            )

    detail = last_problem or "the model could not produce a working rule"
    if last_suggestion is not None and last_suggestion.selector_or_path:
        detail = f"{detail} (last tried selector_or_path={last_suggestion.selector_or_path!r})"
    raise LLMError(f"AI couldn't find a working rule on this page: {detail}.")


_OOS_SAMPLE_HINT_RE = re.compile(
    r"out\s*of\s*stock|sold\s*out|unavailable|back\s*order|pre\s*order|notify",
    re.IGNORECASE,
)


def _parse_state_samples(raw: str) -> list[str]:
    """Split a user-pasted other-state sample into normalized, non-empty lines."""
    return [
        line for line in (normalize_for_match(part) for part in (raw or "").splitlines()) if line
    ]


def _sample_is_coverable(sample: str) -> bool:
    """A sample is a hard verification fixture only if it carries an extractable
    signal — a digit (an in-stock count) or a recognizable out-of-stock phrase.
    Free-form prose with neither is passed to the model as guidance but not gated,
    so describing the page instead of pasting it can't cause a false failure."""
    return bool(re.search(r"\d", sample)) or bool(_OOS_SAMPLE_HINT_RE.search(sample))


def _check_state_samples(pattern: str, samples: list[str]) -> str | None:
    """Return None when the pattern extracts a stock signal from every coverable
    sample, else a message naming the first one it fails (fed into the retry)."""
    for sample in samples:
        if not _sample_is_coverable(sample):
            continue
        if parse_quantity(None, sample, pattern).quantity is None:
            return (
                f"it did not extract a stock signal from the other-state example {sample!r} "
                "(the pattern must match both the live page and every example)"
            )
    return None


def _verify_rule_suggestion(
    suggestion: RuleSuggestion, html_content: str, samples: list[str] | None = None
) -> str:
    """Return an empty string if the suggestion looks usable, otherwise an
    explanation that can be fed back into the LLM as a correction."""
    diagnostics = evaluate_rule_diagnostics(
        suggestion.rule_type,
        suggestion.selector_or_path,
        suggestion.match_mode,
        suggestion.match_value,
        html_content,
        quantity_pattern=suggestion.quantity_pattern
        if suggestion.stock_mode == "quantity"
        else None,
    )

    # CSS rule type: a selector that matches no elements is the most common
    # failure — flag it before anything else so the LLM gets clear feedback.
    if suggestion.rule_type == "css" and diagnostics.element_count == 0:
        return f"selector_or_path={suggestion.selector_or_path!r} matched 0 elements on the page"
    # Text rule type with a non-empty scope: same check, different message.
    if suggestion.rule_type == "text" and suggestion.selector_or_path.strip():
        if diagnostics.element_count == 0:
            return f"scope selector {suggestion.selector_or_path!r} matched 0 elements on the page"

    if suggestion.stock_mode == "quantity":
        fragile = selector_encodes_stock_state(suggestion.selector_or_path)
        if fragile:
            return (
                f"selector_or_path={suggestion.selector_or_path!r} targets the stock-state token "
                f"{fragile!r}, which exists in only one state; scope to a container present in both "
                "states and let the quantity_pattern find the number"
            )
        if not suggestion.quantity_pattern:
            return "quantity_pattern was empty even though stock_mode is 'quantity'"
        if diagnostics.quantity is None:
            problem = diagnostics.quantity_error or "no integer was captured"
            return (
                f"quantity_pattern={suggestion.quantity_pattern!r} could not extract a number "
                f"from the targeted text ({problem})"
            )
        sample_problem = _check_state_samples(suggestion.quantity_pattern, samples or [])
        if sample_problem:
            return sample_problem

    return ""


# ---------- helpers ----------


def prepare_html_for_llm(content: str, limit: int = HTML_LIMIT) -> str:
    """Strip noisy nodes from HTML and truncate so it fits in an LLM prompt.

    Scripts are removed EXCEPT for `<script type="application/ld+json">` blocks,
    which carry schema.org structured data (often the cleanest signal for stock
    availability on product pages).
    """
    if not content:
        return ""
    from bs4 import Comment

    try:
        soup = BeautifulSoup(content, "html.parser")
    except Exception:
        return _truncate(content, limit)
    for tag in soup.find_all("script"):
        type_attr = tag.get("type")
        type_str = type_attr if isinstance(type_attr, str) else ""
        if type_str.strip().lower() != "application/ld+json":
            tag.decompose()
    for tag in soup(["style", "noscript", "svg", "iframe", "template", "link", "meta", "path"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda value: isinstance(value, Comment)):
        comment.extract()
    serialized = str(soup)
    serialized = re.sub(r"\s+", " ", serialized).strip()
    return _truncate(serialized, limit)


def _truncate(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + "..."


def _ensure_configured(settings: Settings, app_settings: AppSettings) -> None:
    if not settings.llm_api_key:
        raise LLMError(
            "LLM_API_KEY is not set. Add it to the deployment environment to enable AI suggestions."
        )
    if not app_settings.llm_model.strip():
        raise LLMError("LLM model is not configured. Set a model ID in Settings.")


def _base_url(app_settings: AppSettings) -> str:
    base_url = (app_settings.llm_base_url or "https://api.openai.com/v1").strip().rstrip("/")
    if not base_url:
        raise LLMError("LLM base URL is not configured.")
    return base_url


async def _chat_completion_messages(
    settings: Settings,
    app_settings: AppSettings,
    base_url: str,
    messages: list[dict[str, str]],
) -> str:
    body: dict[str, object] = {
        "model": app_settings.llm_model.strip(),
        "messages": messages,
    }
    extras = _parse_extra_params(app_settings.llm_extra_params)
    body.update(extras)

    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    url = f"{base_url}/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise LLMError(f"LLM request failed: {exc}") from exc

    if response.status_code >= 400:
        detail = _excerpt(response.text)
        raise LLMError(f"LLM endpoint returned HTTP {response.status_code}: {detail}")

    try:
        data = response.json()
    except ValueError as exc:
        raise LLMError("LLM endpoint returned non-JSON response") from exc

    content = _extract_message_content(data)
    if not content:
        raise LLMError("LLM response did not include any message content")
    return content


def _parse_extra_params(raw: str) -> dict[str, object]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMError(f"LLM extra params is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise LLMError("LLM extra params must be a JSON object")
    return parsed


def _extract_message_content(data: object) -> str:
    if not isinstance(data, dict):
        return ""
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return ""


_JSON_OBJECT_RE = re.compile(r"\{[\s\S]*\}")


def _parse_json_payload(content: str) -> dict[str, Any]:
    stripped = content.strip()
    candidate = stripped
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z0-9]*\s*", "", candidate)
        candidate = re.sub(r"```\s*$", "", candidate).strip()
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        match = _JSON_OBJECT_RE.search(stripped)
        if not match:
            raise LLMError("LLM response did not contain a JSON object")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise LLMError(f"LLM response was not valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise LLMError("LLM response JSON must be an object")
    return parsed


def _optional_str(payload: dict[str, Any], key: str, default: str = "") -> str:
    value = payload.get(key, default)
    if value is None:
        return default
    if not isinstance(value, str):
        return default
    return value.strip()


def _build_rule_suggestion(
    payload: dict[str, Any], requested_mode: str, raw: str
) -> RuleSuggestion:
    stock_mode = _optional_str(payload, "stock_mode", requested_mode) or requested_mode
    if stock_mode not in {"binary", "quantity"}:
        stock_mode = requested_mode

    rule_type = _optional_str(payload, "rule_type", "text") or "text"
    if rule_type not in {"text", "css"}:
        rule_type = "text"

    match_mode = _optional_str(payload, "match_mode", "contains") or "contains"
    if match_mode not in {"contains", "not_contains", "equals", "regex", "exists"}:
        match_mode = "contains"

    quantity_pattern = _strip_inline_flag_groups(_optional_str(payload, "quantity_pattern"))
    if stock_mode == "quantity" and quantity_pattern:
        try:
            re.compile(quantity_pattern)
        except re.error as exc:
            raise LLMError(
                f"LLM produced an invalid quantity regex: {quantity_pattern!r} ({exc})"
            ) from exc

    match_value = _optional_str(payload, "match_value")
    if match_mode == "regex" and match_value:
        match_value = _strip_inline_flag_groups(match_value)
        try:
            re.compile(match_value)
        except re.error as exc:
            raise LLMError(
                f"LLM produced an invalid match_value regex: {match_value!r} ({exc})"
            ) from exc

    threshold_raw = payload.get("low_stock_threshold")
    low_stock_threshold: int | None = None
    if isinstance(threshold_raw, bool):
        low_stock_threshold = None
    elif isinstance(threshold_raw, (int, float)) and threshold_raw >= 0:
        low_stock_threshold = int(threshold_raw)
    elif isinstance(threshold_raw, str) and threshold_raw.strip().isdigit():
        low_stock_threshold = int(threshold_raw.strip())

    explanation = _optional_str(payload, "explanation")

    # Quantity mode forces match assertion away from the binary fields so they don't
    # affect status downstream — the checker uses quantity exclusively.
    if stock_mode == "quantity":
        match_mode = "exists"
        match_value = ""

    return RuleSuggestion(
        stock_mode=stock_mode,
        rule_type=rule_type,
        selector_or_path=_optional_str(payload, "selector_or_path"),
        match_mode=match_mode,
        match_value=match_value,
        quantity_pattern=quantity_pattern,
        low_stock_threshold=low_stock_threshold,
        explanation=explanation,
        raw=raw,
    )


def _excerpt(value: str, limit: int = 200) -> str:
    compact = " ".join((value or "").split())
    return compact if len(compact) <= limit else compact[: limit - 3] + "..."
