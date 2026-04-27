"""
DEPRECATED (2026-04-24): This module orchestrated AI generation of full homework content
from textbooks. That use case has been removed. Homework content is now authored via the
Builder UI or loaded from fixtures/*.json.

The AI has been repurposed as a RUNTIME TUTOR — see services/tutor.py for the new layer.
This file is kept for git history. Do not import from it. Safe to delete in a future cleanup.
"""
"""
Prompt chain orchestrator.

Reads prompt files from PROMPTS_DIR, calls Gemini per phase in the
routing pipeline, and yields SSE-formatted events. Parser integration
is stubbed with TODO markers — the parser agent will fill those in.

Skeleton contract:
  async for event in run_pipeline(hw_id, textbook_text, chapter, section):
      yield event
"""
import json
from typing import AsyncIterator

from ..config import PROMPTS_DIR
from ..services.routing import get_phases
from ..services import gemini
from ..db import get_homework, update_homework, set_status


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _event(event_type: str, data: dict) -> str:
    """Format a single SSE event."""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _load_prompt(subject: str, filename: str) -> str:
    """Load a prompt file from server/prompts/{subject}/{filename}."""
    path = PROMPTS_DIR / subject / filename
    if not path.exists():
        raise FileNotFoundError(f"Prompt missing: {path}")
    return path.read_text(encoding="utf-8")


# Map phase key → (hard_filename, easy_filename).
# For phases that share a file across modes, both entries point to the same file.
PHASE_PROMPT_FILE = {
    "preview":         ("preview-hard.md",   "preview-easy.md"),
    "flashcards":      ("flashcards.md",     "flashcards.md"),
    "memory_sprint":   ("memory-sprint.md",  "memory-sprint.md"),
    "reading":         ("reading.md",        "reading.md"),
    "game_breaks":     ("game-breaks.md",    "game-breaks.md"),
    "real_life":       ("real-life.md",      "real-life.md"),
    "consolidation":   ("consolidation.md",  "consolidation.md"),
    "final_challenge": ("final-challenge.md", "final-challenge.md"),
    "reflection":      ("reflection.md",     "reflection.md"),
}


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def run_pipeline(
    hw_id: str,
    textbook_text: str,
    chapter: str,
    section: str,
) -> AsyncIterator[str]:
    """
    Orchestrates the full prompt chain.
    Yields SSE-formatted strings for consumption by the /generate route.
    """
    hw = await get_homework(hw_id)
    if not hw:
        yield _event("error", {"phase": "load", "message": f"Homework {hw_id} not found"})
        return

    subject = hw["subject"]
    grade = hw["grade"]
    mode = hw["mode"]
    family = hw["family"]

    await set_status(hw_id, "generating")
    yield _event("start", {"id": hw_id, "subject": subject, "grade": grade, "mode": mode})

    # -----------------------------------------------------------------
    # Step 1: CLASSIFY (optional — only if the subject ships classify.md)
    # -----------------------------------------------------------------
    try:
        classify_path = PROMPTS_DIR / subject / "classify.md"
        if classify_path.exists():
            classify_prompt = _load_prompt(subject, "classify.md")
            yield _event("classify", {"status": "start"})
            raw = await gemini.generate(
                f"{classify_prompt}\n\n---\n\nTEXTBOOK CONTENT:\n{textbook_text}",
                temperature=0.2,
            )
            # TODO: parser.parse_classify(raw) — Gemini agent will provide this
            yield _event("classify", {"status": "done", "raw": raw[:500]})
    except Exception as e:
        yield _event("error", {"phase": "classify", "message": str(e)})

    # -----------------------------------------------------------------
    # Step 2: Run each phase in the pipeline
    # -----------------------------------------------------------------
    phases = get_phases(family, mode)
    content = hw.get("content_json") or {}

    for phase in phases:
        try:
            yield _event("phase", {"phase": phase, "status": "start"})

            # Determine prompt file for this phase+mode
            mapping = PHASE_PROMPT_FILE.get(phase)
            if not mapping:
                yield _event(
                    "phase",
                    {"phase": phase, "status": "skip", "reason": "no prompt file mapped"},
                )
                continue

            fname = mapping[0] if mode == "hard" else mapping[1]
            if not fname:
                yield _event(
                    "phase",
                    {"phase": phase, "status": "skip", "reason": "no prompt file mapped"},
                )
                continue

            prompt = _load_prompt(subject, fname)

            # Build context from prior phase outputs (exclude the meta block)
            prior = {k: v for k, v in content.items() if k not in ("meta",)}
            context = (
                f"TEXTBOOK CONTENT:\n{textbook_text}\n\n"
                f"CHAPTER: {chapter}\nSECTION: {section}\n\n"
                f"PRIOR PHASES:\n{json.dumps(prior, ensure_ascii=False, indent=2)[:3000]}"
            )

            raw = await gemini.generate(prompt, context, temperature=0.5)

            # TODO: Call parser.parse_{phase}(raw) → returns typed data
            # For now, store raw output placeholder for debugging
            parsed_placeholder = {"_raw_pending_parser": raw[:1000]}

            # TODO: content[phase_key] = parsed_data
            # (phase_key mapping will live in parser.py or be derived here)

            yield _event("phase", {"phase": phase, "status": "done", "preview": raw[:300]})
        except Exception as e:
            yield _event("error", {"phase": phase, "message": str(e)})

    # -----------------------------------------------------------------
    # Step 3: Save + finalize
    # -----------------------------------------------------------------
    await update_homework(hw_id, {"content_json": content})
    await set_status(hw_id, "ready")
    yield _event("done", {"id": hw_id, "status": "ready"})
