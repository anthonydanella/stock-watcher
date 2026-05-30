"""OpenAI-compatible Chat Completions transport for the LLM rule helper.

Speaks the OpenAI Chat Completions schema so the same code works against OpenAI,
Anthropic's compatibility endpoint, OpenRouter, Ollama, llama.cpp, etc. The API
key comes from ``Settings`` (the LLM_API_KEY env var); the base URL, model, and
extra request params come from the in-app ``AppSettings``. ``app.llm`` builds the
messages and interprets the returned content.
"""

from __future__ import annotations

import json

import httpx

from app.config import Settings
from app.models import AppSettings


class LLMError(Exception):
    """Raised when the LLM call cannot be completed or returns an unusable response."""


def ensure_configured(settings: Settings, app_settings: AppSettings) -> None:
    if not settings.llm_api_key:
        raise LLMError(
            "LLM_API_KEY is not set. Add it to the deployment environment to enable AI suggestions."
        )
    if not app_settings.llm_model.strip():
        raise LLMError("LLM model is not configured. Set a model ID in Settings.")


def resolve_base_url(app_settings: AppSettings) -> str:
    base_url = (app_settings.llm_base_url or "https://api.openai.com/v1").strip().rstrip("/")
    if not base_url:
        raise LLMError("LLM base URL is not configured.")
    return base_url


async def chat_completion(
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


def _excerpt(value: str, limit: int = 200) -> str:
    compact = " ".join((value or "").split())
    return compact if len(compact) <= limit else compact[: limit - 3] + "..."
