# NETS Homework Builder — Working Demo

## Context
Framework decomposition (00-06) and prompt chains (7 subjects) are done. Now we build a working demo: a Dashboard + Library + Homework Builder app in HTML/CSS/JS with a Python backend and Gemini AI integration. The Perfect Homework HTML (4,706 lines, 220KB) is the renderer — we build an editor/builder around it that injects content via regex replacement (proven by `build_5math.py`).

## Architecture

```
Frontend (2 SPAs, plain HTML/CSS/JS)     Backend (FastAPI + SQLite)     AI (Vertex AI Gemini)
┌─────────────┐  ┌──────────────┐       ┌──────────────────────┐       ┌──────────────┐
│ Dashboard   │  │ Builder      │  ←→   │ /api/homeworks CRUD  │  ←→   │ Gemini API   │
│ (index.html)│  │ (builder.html│       │ /api/generate (SSE)  │       │ via service  │
│ Library grid│  │ Phase editors│       │ /api/preview (HTML)  │       │ account key  │
│ Create/Open │  │ Live preview │       │ /api/export          │       └──────────────┘
└─────────────┘  └──────────────┘       │ /api/session         │
                                        │ SQLite + injector.py │
                                        └──────────────────────┘
```

## File Structure

```
nets-builder/
├── server/
│   ├── app.py                    # FastAPI entry, static files, CORS
│   ├── routes/
│   │   ├── homework.py           # CRUD: list, create, get, update, delete
│   │   ├── ai.py                 # POST /generate → SSE pipeline stream
│   │   └── export.py             # GET /preview (iframe), GET /export (download)
│   ├── services/
│   │   ├── gemini.py             # Gemini API client (API key, google-genai SDK)
│   │   ├── injector.py           # Regex injection into Perfect Homework HTML
│   │   └── pipeline.py           # Prompt chain orchestrator (classify → phases)
│   ├── db.py                     # SQLite: homeworks, sessions, responses tables
│   └── template/
│       └── perfect_homework.html # Copy of 8-Algebra reference template
│
├── frontend/
│   ├── index.html                # Dashboard SPA
│   ├── builder.html              # Builder SPA
│   ├── css/app.css               # Apple-style glassmorphism (matches HW template)
│   └── js/
│       ├── api.js                # fetch() wrappers
│       ├── dashboard.js          # Library grid, create modal
│       ├── builder.js            # Phase sidebar, preview bridge
│       └── editors/
│           ├── preview.js        # Panel blocks editor
│           ├── flashcards.js     # Card table CRUD
│           ├── memory-sprint.js  # MC/TF/YNNG question editor
│           ├── game-breaks.js    # AQ + Sentence Fill + Memory Match editors
│           ├── real-life.js      # Scenario + sub-questions
│           ├── boss.js           # Boss questions + damage
│           └── reflection.js     # Summary + closing
│
├── config.py                     # Paths, port, GEMINI_API_KEY
└── requirements.txt              # fastapi, uvicorn, aiosqlite, google-genai, httpx
```

## The Injection Contract (9 Constants)

The Perfect Homework HTML is data-driven. All content lives in 9 JS constants:

| Constant | Type | Phase | Shape |
|----------|------|-------|-------|
| `PANELS` | array | Preview | `[{id, title, pages: [{blocks: [{type, text}]}]}]` |
| `QUOTES` | array | Preview | `["string", ...]` |
| `FLASHCARDS` | array | Flash Cards | `[{term, def, cluster}]` |
| `MS_QUESTIONS` | array | Memory Sprint | `[{type, prompt, options, correct, explain, tags}]` |
| `GB_ADAPTIVE_QUIZ` | array | Game Breaks | `[{q, tier, ans[], capture, tags}]` |
| `GB_WHY_CHAIN` | array | Game Breaks | `[{q, inv, reprompts[]}]` |
| `GB_MEMORY_MATCH` | array | Game Breaks | `[["left", "right"], ...]` |
| `RL_SCENARIO` | object | Real-Life | `{badge, story, q1..q6, endTitle, endSub}` |
| `BOSS_QUESTIONS` | array | Final Boss | `[{q, tags, ans[], hint, dmg}]` |

`injector.py` does regex replacement for each constant — identical to `build_5math.py` but generalized.

## Phase Routing Table

```python
PIPELINE = {
    ("aniq-fanlar",    "easy"): [preview, flashcards, sprint, game_breaks(2), reflection],
    ("aniq-fanlar",    "hard"): [preview, flashcards, sprint, game_breaks(3), real_life, consolidation?, boss, reflection],
    ("tabiy-fanlar",   "easy"): [preview, flashcards, sprint, game_breaks(2), reflection],
    ("tabiy-fanlar",   "hard"): [preview, flashcards, sprint, game_breaks(3), real_life, consolidation?, boss, reflection],
    ("til-fanlar",     "hard"): [preview, flashcards, sprint, reading, game_breaks(3), real_life, consolidation?, boss, reflection],
    ("ijtimoiy-fanlar","hard"): [preview, flashcards, sprint, game_breaks(3), consolidation?, boss, reflection],
}

ALWAYS_HARD = {"english", "history"}
MANDATORY_GAME = {
    "math-algebra": "adaptive_quiz",  "physics": "adaptive_quiz",
    "biology": "adaptive_quiz",       "english": "adaptive_quiz",
    "geometriya": "adaptive_quiz",    "kimyo": "adaptive_quiz",  # puzzle_lock = v2
    "history": "tile_match",
}
```

Builder sidebar shows only the phases from the matched pipeline. User picks subject → grade → mode → sidebar renders the correct phase list.

## AI Pipeline (Prompt Chain Execution)

`POST /api/homeworks/{id}/generate` with `{textbook_text, chapter, section}`:

1. **CLASSIFY** — Load `06-prompts/{subject}/classify.md`, send to Gemini → get mode + level
2. **EXTRACT** — Parse textbook text into concepts, terms, formulas
3. **Per-phase generation** — For each phase in the pipeline:
   - Load the matching prompt file from `06-prompts/{subject}/`
   - Append JSON output schema instruction (so AI returns parseable JSON)
   - Send to Gemini with textbook context + prior phase outputs
   - Parse response into the matching constant shape
   - Stream progress via SSE to frontend
4. **VALIDATE** — Lightweight check (Bloom/PISA tags present, HP correct, format counts)
5. **SAVE** — Write `content_json` to SQLite, set status = "ready"

The frontend shows a real-time progress bar as phases generate. Each completed phase auto-populates its editor.

## Backend Details

**SQLite tables:**
- `homeworks` — id, title, subject, grade, mode, family, status, content_json, created_at
- `sessions` — id, homework_id, student_name, started_at, phase_scores
- `responses` — id, session_id, phase, question_id, answer, correct, time_ms

**Gemini client** uses `google-genai` SDK with a plain API key (stored in `config.py` or `.env`). No service account needed — direct Gemini API, not Vertex AI.

## Frontend Details

**Dashboard** — Apple-style grid of homework cards. Each card: subject icon, title, grade badge, mode pill (Easy/Hard), status (draft/generating/ready). "New Homework" opens a modal: select subject → grade → mode → creates record → opens builder.

**Builder** — Left sidebar: ordered phase list (accordion). Click phase to expand its editor. Right area: active phase editor. Top bar: homework title + AI generate button + preview button + export button. Preview opens injected HTML in an `<iframe>` panel or modal.

**Phase editors** are simple forms that directly map to the 9 JS constants. Add/remove rows for flashcards, questions, panels. Type selectors for sprint format (MC/TF/YNNG). Game picker for game breaks.

## Implementation Waves

### Wave 1 — Skeleton + CRUD (first)
- FastAPI app with static file serving
- SQLite schema + homework CRUD routes
- Dashboard HTML with library grid
- Builder HTML shell with sidebar
- Wire: create → open builder flow

### Wave 2 — Editing Layer
- All 7 phase editors (pure frontend, no AI)
- Auto-save on edit (PUT /api/homeworks/{id})
- `injector.py` + preview route
- Live preview iframe in builder

**Milestone: can manually build a homework and preview/export it**

### Wave 3 — AI Integration
- `gemini.py` — service account auth + Gemini calls
- `pipeline.py` — prompt chain orchestrator
- Phase output parsers (JSON schema enforcement)
- SSE streaming to frontend progress UI

**Milestone: paste textbook text → AI generates full homework**

### Wave 4 — Polish
- Export as downloadable HTML
- Session tracking (student answers + timing)
- Error handling for AI failures
- Dashboard filters and status updates

## Critical Files

| File | Role |
|------|------|
| `perfect_homework/Math_Algebra/8-Algebra/Perfect Homework.html` | THE template (4,706 lines) |
| `perfect_homework/Math_Algebra/5-Math/build_5math.py` | Proven injection pattern |
| `standards/framework/06-prompts/*/flow.md` | Phase routing per subject |
| `standards/framework/06-prompts/*/classify.md` | Mode classification prompts |
| `nets-builder/.env` | Gemini API key (GEMINI_API_KEY=...) |

## Verification

1. Start server: `cd nets-builder && uvicorn server.app:app --reload`
2. Open `http://localhost:8000` → dashboard loads with library
3. Create homework → builder opens with correct phase sidebar
4. Edit flashcards manually → preview updates in iframe
5. Click "Generate with AI" → SSE progress shows, phases fill in
6. Click "Export" → downloads working single-file HTML
7. Open exported HTML → full homework session plays correctly
