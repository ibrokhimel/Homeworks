# NETS Builder — Plan Dashboard

**Project:** NETS Homework Builder (working demo)
**Start:** 2026-04-24
**Stack:** FastAPI + SQLite + plain HTML/CSS/JS + Gemini API
**Reference template:** `server/template/perfect_homework.html` (4,706 lines, Apple-style)

---

## Single Source of Truth

| Document | Purpose |
|----------|---------|
| **[CONTRACTS.md](./CONTRACTS.md)** | Data model, API endpoints, enums, injector regex, contracts — **READ FIRST** |
| **[PLAN.md](./PLAN.md)** | Full implementation plan + architecture + waves |
| **[PLAN_DASHBOARD.md](./PLAN_DASHBOARD.md)** | This file — agent roles, ownership, coordination |
| **[../CLAUDE.md](../CLAUDE.md)** | Project-wide rules (framework, pronouns, etc.) |
| **[../standards/framework/06-prompts/](../standards/framework/06-prompts/)** | Prompt chains per subject (copied into `server/prompts/`) |

Before any work: read `CONTRACTS.md` fully. If anything is ambiguous, ask before changing.

---

## Agent Roles

### Claude Opus 4.7 (backend) — "The Engine Room"
**Why this agent:** #1 on SWE-bench Verified (87.6%) and SWE-bench Pro (64.3%) — multi-file coherence, precision, instruction-following. FastAPI + regex injector + SSE streaming + prompt orchestration all benefit from its strengths.

**Owns:**
- `server/app.py` — FastAPI entry, static file serving, CORS
- `server/config.py` — env loading, paths
- `server/db.py` — SQLite schema + async CRUD (aiosqlite)
- `server/routes/meta.py` — `/api/subjects`, `/api/health`
- `server/routes/homework.py` — CRUD endpoints
- `server/routes/ai.py` — `/generate` SSE endpoint
- `server/routes/export.py` — `/preview`, `/export`
- `server/services/gemini.py` — Gemini API client
- `server/services/pipeline.py` — Prompt chain orchestrator
- `server/services/injector.py` — Regex HTML injection
- `server/services/routing.py` — Enums in code form (from CONTRACTS §3)
- `requirements.txt`, `.env.example`, `README.md`

**Details reference:** CONTRACTS.md §2, §3, §4, §5, §6

**Do NOT touch:** `frontend/**`, `fixtures/**`, prompt files in `server/prompts/`

---

### GPT-5.5 (frontend) — "The Builder UI"
**Why this agent:** #1 on Terminal-Bench 2.0 (82.7%), natively omnimodal, cleaner semantic HTML/CSS/JS output. Best at rapid SPA iteration and Apple-style design execution.

**Owns:**
- `frontend/css/app.css` — Apple-style design system (glassmorphism, SF Pro, #007AFF accent)
- `frontend/index.html` — Dashboard SPA (library grid, filters, create modal)
- `frontend/builder.html` — Builder SPA (phase sidebar, editor area, preview panel, AI modal)
- `frontend/js/api.js` — `fetch()` wrappers for all routes
- `frontend/js/dashboard.js` — Grid render, create flow, filters
- `frontend/js/builder.js` — Phase sidebar, editor loading, auto-save debounce, preview iframe
- `frontend/js/editors/preview.js` — Panel blocks editor
- `frontend/js/editors/flashcards.js` — Card CRUD table
- `frontend/js/editors/memory-sprint.js` — MC/TF/YNNG editor
- `frontend/js/editors/game-breaks.js` — Adaptive Quiz + Why Chain + Memory Match editors
- `frontend/js/editors/reading.js` — Reading passage + checkpoints (English only)
- `frontend/js/editors/real-life.js` — Scenario + 6 sub-questions editor
- `frontend/js/editors/consolidation.js` — Mnemonic lock editor
- `frontend/js/editors/boss.js` — Boss questions + damage editor
- `frontend/js/editors/reflection.js` — Summary + closing editor

**Details reference:** CONTRACTS.md §1 (data shapes to edit), §3 (enums to render), §7 (frontend contract), §8 (directory layout)

**Do NOT touch:** `server/**`, `fixtures/**`, backend logic

**Hand-off mode:** User pastes prompts to GPT web UI and copies responses into files manually.

---

### Gemini 3.1 Pro (content) — "The AI Layer"
**Why this agent:** Cheapest per token ($1.25/$10 per M) — will be the runtime production model. 2M context loads entire framework + template + textbook in one call. Tied #1 on GPQA (94.3%) for science accuracy. Best at JSON schema adherence and multimodal input.

**Owns:**
- `server/services/parser.py` — Parse AI prose output into `content_json` phase slices
- `server/prompts/**` — Augment prompt files with JSON schema appendices (do NOT rewrite existing spec — only append output-schema instructions)
- `fixtures/` — Sample `content_json` for each subject (for frontend testing without live AI)
  - `fixtures/math-algebra-g8-hard.json`
  - `fixtures/physics-g9-easy.json`
  - `fixtures/biology-g7-easy.json`
  - `fixtures/english-g10-b1.json`
  - `fixtures/history-g8.json`
  - `fixtures/kimyo-g9-hard.json`
  - `fixtures/geometriya-g8-hard.json`
- Validation: given a sample textbook chapter, run the full chain and confirm output matches CONTRACTS §1 schema exactly

**Details reference:** CONTRACTS.md §1 (output schema), §6 (Gemini call contract), existing `standards/framework/06-prompts/` (source prompts)

**Do NOT touch:** UI code, FastAPI routes, DB schema

**Hand-off mode:** User runs Gemini via web / API — agent produces fixture JSON and parser code, user pastes into repo.

---

## Wave Timeline + Ownership

| Wave | Deliverable | Opus 4.7 | GPT-5.5 | Gemini 3.1 | Sync point |
|------|-------------|----------|---------|------------|------------|
| **1** | Skeleton + CRUD | app.py, db.py, routing.py, homework.py, meta.py | index.html, builder.html, app.css, api.js, dashboard.js, builder.js (stubs) | 1 fixture for `math-algebra-g8-hard` | Create homework via UI → appears in library |
| **2** | Editing Layer | injector.py, export.py | 9 editor modules, auto-save wiring, preview iframe | 3 more fixtures (physics, biology, english) | Edit flashcards → preview iframe updates |
| **3** | AI Integration | ai.py (SSE), pipeline.py, gemini.py | AI modal progress UI (SSE consumer) | parser.py, prompt schema appendices | Paste textbook → AI generates full homework |
| **4** | Polish | Sessions routes, error handling | Filters, status badges, toast notifications | Remaining fixtures + validation pass | Export → working single-file HTML |

Each wave ends with the verification steps in CONTRACTS.md §10.

---

## Coordination Rules

1. **CONTRACTS.md is frozen during a wave.** If a contract change is needed, it must be approved by the user and all three agents notified before code changes.
2. **No agent invents schema fields.** If the schema says `ans` (not `acceptable`), use `ans`. If an agent hits a shape not in CONTRACTS, ask before extending.
3. **File ownership is strict.** Opus touches `server/**`, GPT touches `frontend/**`, Gemini touches `fixtures/**` + `parser.py`. Cross-boundary changes require a handoff note.
4. **Fixtures unblock parallelism.** Gemini produces the `math-algebra-g8-hard.json` fixture FIRST so GPT-5.5 can render all editors against real data without waiting for live AI.
5. **Integration happens at the contract boundary.** Opus serves `/api/homeworks/{id}` returning the CONTRACTS §2 shape; GPT consumes that exact shape. Neither adapts to the other — both adapt to CONTRACTS.

### Collision Prevention

Known overlap points and how to avoid conflict:

| Risk | Affected agents | Mitigation |
|------|-----------------|------------|
| **`content_json` schema drift** | ALL three | Schema changes → update CONTRACTS.md §1 FIRST, notify all agents, THEN code. No exceptions. |
| **`server/prompts/**` edits during generation** | Gemini writes, Opus reads via pipeline | Gemini only appends JSON schemas BEFORE Wave 3 start. Frozen during Wave 3. |
| **`parser.py` API surface** | Gemini writes, Opus imports | Parser public functions signed off in CONTRACTS.md before Gemini writes implementation. See below. |
| **`perfect_homework.html` template** | Injector depends on exact HTML | Template is READ-ONLY for all agents. No constant renames, no new constants without CONTRACTS update. |
| **`requirements.txt`** | Opus owns, Gemini's parser may need libs | Gemini lists required libs as `# requires: jsonschema, pydantic` comment at top of parser.py. Opus syncs. |
| **API endpoint additions** | GPT may need routes Opus hasn't built | CONTRACTS §4 is the endpoint list. If GPT needs more, add to CONTRACTS first, then Opus implements. |
| **`.env` file** | Opus owns, but contains Gemini's API key | User provides `GEMINI_API_KEY` once. Opus writes `.env.example`. Real `.env` is gitignored, not touched by any agent. |

### Parser API (frozen before Gemini writes it)

```python
# server/services/parser.py

def parse_classify(raw: str) -> dict:
    """Returns {'mode': 'easy'|'hard', 'level': str, 'reason': str}"""

def parse_preview(raw: str) -> list:
    """Returns list of PANELS objects per CONTRACTS §1"""

def parse_quotes(raw: str) -> list:
    """Returns list of quote strings"""

def parse_flashcards(raw: str) -> list:
    """Returns list of flashcard objects per CONTRACTS §1"""

def parse_memory_sprint(raw: str) -> list:
    """Returns list of MS_QUESTIONS objects per CONTRACTS §1"""

def parse_game_breaks(raw: str) -> dict:
    """Returns {'adaptive_quiz': [...], 'why_chain': [...], 'memory_match': [...]}"""

def parse_real_life(raw: str) -> dict:
    """Returns RL_SCENARIO object per CONTRACTS §1"""

def parse_boss(raw: str) -> list:
    """Returns list of BOSS_QUESTIONS objects per CONTRACTS §1"""

def parse_reflection(raw: str) -> dict:
    """Returns reflection object per CONTRACTS §1"""

# All parsers raise ParseError(phase, reason) on invalid AI output.
class ParseError(Exception):
    def __init__(self, phase: str, reason: str): ...
```

Opus's `pipeline.py` imports these by name. Signatures locked.

### No same-file writes

Verified: no file appears in two agents' ownership lists. Each file has exactly one owner.

---

## Current Status

| Task | Owner | State |
|------|-------|-------|
| Directory scaffold | Opus 4.7 | ✅ done |
| Template copied to `server/template/` | Opus 4.7 | ✅ done |
| CONTRACTS.md | Opus 4.7 | ✅ done |
| PLAN_DASHBOARD.md | Opus 4.7 | ✅ done |
| Wave 1 backend | Opus 4.7 | ⏳ pending |
| Wave 1 frontend | GPT-5.5 | ⏳ pending (awaiting hand-off brief) |
| First fixture | Gemini 3.1 | ⏳ pending (awaiting hand-off brief) |

---

## Hand-off Briefs (next step)

To kick off Wave 1, the user needs three hand-off prompts written:

- **Opus 4.7 brief** (I run this in-session): backend scaffold per CONTRACTS §2-§6
- **GPT-5.5 brief** (user pastes to ChatGPT web): frontend SPAs per CONTRACTS §1, §7, §8
- **Gemini 3.1 brief** (user pastes to Gemini web/API): first fixture + parser outline per CONTRACTS §1

Each brief includes:
1. The exact task scope
2. Pointer to CONTRACTS.md sections relevant
3. Acceptance criteria matching CONTRACTS §10 verification steps
4. What NOT to do (to prevent drift)

Ask me to write them when ready.
