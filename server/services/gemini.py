"""
AI client with 3-tier fallback: Vertex AI (preferred) -> Gemini API key -> Kimi (Moonshot).

Selects the first available backend at import time. Exposes:
  - generate(prompt, context, model, json_mode, temperature) -> str
  - generate_json(prompt, context, model, schema_hint) -> dict
  - health_check() -> bool
  - ACTIVE_BACKEND: str  ("vertex" | "gemini_api" | "kimi" | "none")

Module is importable without any credentials; failures surface at call time.
"""
import json
import asyncio
import os
from typing import Optional

import httpx

from ..config import (
    GEMINI_API_KEY,
    VERTEX_CREDENTIALS_PATH,
    VERTEX_PROJECT,
    VERTEX_LOCATION,
    KIMI_API_KEY,
    KIMI_BASE_URL,
)

# Model names — google-genai handles the vertex vs gemini routing, but Kimi has its own.
FAST_MODEL = "gemini-2.5-flash"
PRO_MODEL = "gemini-2.5-pro"
KIMI_FAST_MODEL = "kimi-k2-turbo-preview"
KIMI_PRO_MODEL = "kimi-k2.5"


def _resolve_vertex_project(creds_path: str) -> str:
    """If VERTEX_PROJECT isn't set, extract it from the service account JSON."""
    if VERTEX_PROJECT:
        return VERTEX_PROJECT
    try:
        with open(creds_path, "r", encoding="utf-8") as f:
            return json.load(f).get("project_id", "")
    except Exception:
        return ""


def _detect_backend() -> str:
    """Decide which backend to use. Called once at module import."""
    if VERTEX_CREDENTIALS_PATH and os.path.exists(VERTEX_CREDENTIALS_PATH):
        return "vertex"
    if GEMINI_API_KEY and GEMINI_API_KEY != "your_api_key_here":
        return "gemini_api"
    if KIMI_API_KEY:
        return "kimi"
    return "none"


ACTIVE_BACKEND: str = _detect_backend()

# Cached clients
_genai_client = None  # google-genai client (vertex or gemini_api mode)
_kimi_client: Optional[httpx.AsyncClient] = None


def _get_genai_client():
    global _genai_client
    if _genai_client is not None:
        return _genai_client

    from google import genai  # lazy import

    if ACTIVE_BACKEND == "vertex":
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = VERTEX_CREDENTIALS_PATH
        project = _resolve_vertex_project(VERTEX_CREDENTIALS_PATH)
        if not project:
            raise RuntimeError(
                f"Vertex project not set and could not be read from {VERTEX_CREDENTIALS_PATH}"
            )
        _genai_client = genai.Client(
            vertexai=True,
            project=project,
            location=VERTEX_LOCATION,
        )
    elif ACTIVE_BACKEND == "gemini_api":
        _genai_client = genai.Client(api_key=GEMINI_API_KEY)
    else:
        raise RuntimeError(f"genai client not available for backend={ACTIVE_BACKEND}")
    return _genai_client


def _get_kimi_client() -> httpx.AsyncClient:
    global _kimi_client
    if _kimi_client is None:
        if not KIMI_API_KEY:
            raise RuntimeError("KIMI_API_KEY not configured")
        _kimi_client = httpx.AsyncClient(
            base_url=KIMI_BASE_URL,
            headers={
                "Authorization": f"Bearer {KIMI_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )
    return _kimi_client


async def _generate_via_genai(
    full_prompt: str,
    model: str,
    json_mode: bool,
    temperature: float,
) -> str:
    from google.genai import types  # lazy import
    client = _get_genai_client()
    config = types.GenerateContentConfig(
        temperature=temperature,
        response_mime_type="application/json" if json_mode else "text/plain",
    )
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
            model=model,
            contents=full_prompt,
            config=config,
        ),
    )
    return response.text


async def _generate_via_kimi(
    full_prompt: str,
    model: str,
    json_mode: bool,
    temperature: float,
) -> str:
    """Kimi exposes an OpenAI-compatible chat completions endpoint."""
    # Map gemini model names to kimi equivalents
    if model == FAST_MODEL:
        kimi_model = KIMI_FAST_MODEL
    elif model == PRO_MODEL:
        kimi_model = KIMI_PRO_MODEL
    else:
        kimi_model = model  # let user pass kimi-native name directly

    client = _get_kimi_client()
    payload = {
        "model": kimi_model,
        "messages": [{"role": "user", "content": full_prompt}],
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    r = await client.post("/chat/completions", json=payload)
    r.raise_for_status()
    data = r.json()
    return data["choices"][0]["message"]["content"]


async def generate(
    prompt: str,
    context: str = "",
    model: str = FAST_MODEL,
    json_mode: bool = False,
    temperature: float = 0.7,
) -> str:
    """Send prompt + context, return raw text. Routes to active backend."""
    full_prompt = prompt
    if context:
        full_prompt = f"{prompt}\n\n---\n\nCONTEXT:\n{context}"

    if ACTIVE_BACKEND in ("vertex", "gemini_api"):
        return await _generate_via_genai(full_prompt, model, json_mode, temperature)
    if ACTIVE_BACKEND == "kimi":
        return await _generate_via_kimi(full_prompt, model, json_mode, temperature)
    raise RuntimeError(
        "No AI backend configured. Set VERTEX_CREDENTIALS_PATH, GEMINI_API_KEY, or KIMI_API_KEY in .env"
    )


async def generate_json(
    prompt: str,
    context: str = "",
    model: str = FAST_MODEL,
    schema_hint: dict | None = None,
) -> dict:
    """Force JSON output, parse and return dict. Strips markdown fences on fallback."""
    full_prompt = prompt
    if schema_hint:
        full_prompt += (
            "\n\n---\n\nRespond with valid JSON matching this schema exactly:\n"
            + json.dumps(schema_hint, indent=2)
        )

    raw = await generate(full_prompt, context, model, json_mode=True, temperature=0.3)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            raise RuntimeError(
                f"AI backend ({ACTIVE_BACKEND}) returned invalid JSON: {raw[:200]}..."
            ) from e


async def health_check() -> bool:
    """Quick round-trip test. Returns True on success."""
    if ACTIVE_BACKEND == "none":
        return False
    try:
        await generate("Say 'ok'", model=FAST_MODEL, temperature=0)
        return True
    except Exception:
        return False
