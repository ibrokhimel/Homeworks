"""Safe AI runtime context-debug helpers.

The debug envelope is intentionally metadata-only. It records presence flags,
lengths, route/model names, and result states, but never raw student text,
answers, screen context, prompts, or chat history.
"""
from __future__ import annotations

import json
import logging
import os
from collections.abc import Mapping
from typing import Any

_log = logging.getLogger("nets.ai.context")

_TRUTHY = {"1", "true", "yes", "on", "debug"}
_MAX_DEBUG_STRING = 160


def enabled() -> bool:
    return os.environ.get("AI_DEBUG_CONTEXT", "").strip().lower() in _TRUTHY


def present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, dict, set)):
        return bool(value)
    return True


def text_len(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    return len(str(value))


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value, 4)
    if isinstance(value, str):
        if len(value) > _MAX_DEBUG_STRING:
            return f"[redacted:{len(value)} chars]"
        return value
    if isinstance(value, Mapping):
        return {str(k): _sanitize_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_value(v) for v in value[:20]]
    return str(type(value).__name__)


def sanitize(data: Mapping[str, Any]) -> dict[str, Any]:
    return {str(k): _sanitize_value(v) for k, v in data.items()}


def with_context_debug(
    response: dict[str, Any],
    debug: Mapping[str, Any],
    *,
    route: str,
) -> dict[str, Any]:
    """Attach sanitized ``context_debug`` when AI_DEBUG_CONTEXT is enabled."""
    if not enabled():
        return response
    existing = response.get("context_debug")
    merged: dict[str, Any] = {}
    if isinstance(existing, Mapping):
        merged.update(existing)
    merged.update(debug)
    safe_debug = sanitize(merged)
    response["context_debug"] = safe_debug
    _log.info(
        "context_debug route=%s data=%s",
        route,
        json.dumps(safe_debug, ensure_ascii=False, sort_keys=True),
    )
    return response
