# NETS Builder — Current State

Snapshot date: 2026-04-25.
Pair this file with `README.md`. Read both before touching anything.

This is the operational truth: what's confirmed working, what's known broken, and what an
agent should test next. Update this file whenever you ship a fix or discover a regression.

---

## Health summary

| Area | Status | Confidence |
|----|----|----|
| AI tutor backend (Vertex) | ✅ working | 100% |
| Homework CRUD + persistence | ✅ working | 100% |
| Dashboard / library / trash / versions | ✅ working | 100% |
| Export to standalone HTML | ✅ working | 100% |
| Editor → preview round-trip (10 phases) | ✅ working | ~95% |
| Live preview iframe in builder | ✅ working | 95% |
| Save durability (WAL + keepalive) | ✅ working | 95% |
| Reading / Consolidation / Reflection runtime | ⚠ display-only | 70% |
| AI tutor wired into runtime events | ⚠ partial | 70% |
| Programmatic homework generation pipeline | ❌ stubbed | 10% |

Overall: **~94% functional**. The remaining 6% is mostly polish and the
`pipeline.py` AI-generation runner (not yet implemented).

---

## What's working (verified end-to-end)

### Backend
- FastAPI app boots clean, serves frontend statically, mounts `/api/*`.
- SQLite with WAL + `synchronous=FULL`. Crashes / hard-refreshes don't lose data.
- Soft-delete + version snapshots. Restore-from-version tested.
- 4 AI tutor endpoints (`/api/ai/check-answer`, `/boss-turn`, `/reflection`, `/tutor`).
- Vertex AI active: project `unique-spirit-494018-h5`, location `us-central1`,
  models `gemini-2.5-flash` (fast) + `gemini-2.5-pro` (boss).
- Endpoints return well-formed Uzbek JSON in <2s p50.
- Trashed homeworks return 409 on `/preview` and `/export` (BUG-1, fixed).
- Auto-fallback: if Vertex fails → Gemini API → Kimi → stock responses. Sessions never stall.

### Builder UI
- All 10 phase editors load, save, and round-trip content correctly.
- RichField (contenteditable + Bold/Italic/Image/SVG toolbar) on every long-form text field:
  - Flashcards: term + def + media zone
  - Memory Sprint: prompt + explain
  - Boss: prompt + hint
  - Real Life: story + q1–q6 prompts + q1–q6 feedback
  - Reading: checkpoint feedback
  - Consolidation: mnemonic + check_prompt
  - Reflection: summary + question + spaced_rep + closing
  - Sentence Fill (game): prompt
  - Tile Match (game): both tile slots
  - Adaptive Quiz (game): prompt + media zone
- FAB "Add" button follows scroll across all phases.
- Paste normalization strips Word/Docs formatting from short inputs; preserves rich content
  in RichField hosts.
- `beforeunload` keepalive fetch flushes the latest content_json on hard refresh.
- "Test Tutor" button in builder topbar — pings all 4 AI endpoints + shows backend name.

### Runtime template (preview + export)
- All 10 content keys inject correctly into JS constants.
- Flashcard front images (structured media zone) render via `fc-front-media` slot.
- Inline images/SVGs in front term render via `term_html` (formatting tags stripped, media
  preserved).
- Back-of-card definition uses `innerHTML` so inline media renders.
- All non-flashcard rich-field renderers use `innerHTML`.
- Inline images/SVGs are clamped (max-height 180–220px, max-width 100%, object-fit contain).
- Adaptive Quiz now accepts multiple correct answers via `acceptable[]` (case-insensitive,
  whitespace-trimmed).
- Sentence Fill respects per-level `expects[]` if authored; falls back to invariant.
- Reading / Consolidation / Reflection screens injected with auto-skip when empty.

### Dashboard
- Library grid shows all homeworks with subject icon, grade badge, mode pill, status dot,
  relative-time updated.
- Library / Trash tab toggle.
- Per-card More menu: Preview, Duplicate, Version history, Move to trash.
- Versions modal with per-version Restore.
- Direct download (Export) button on each card.
- Status polling for `generating` state (5s interval).
- Error/retry state on network failures.
- Responsive grid: 3-col / 2-col / 1-col at 1024 / 640 / mobile.

---

## What's broken or limited

### High priority (degraded user experience)

**[H1] Reading / Consolidation / Reflection runtime is display-only.**
The new screens render passages and prompts, but the student can't actually answer reading
checkpoints in-runtime — answer/feedback show as static text. To fix: extend the renderers
in `perfect_homework.html` to wire input fields + an "Check" button + per-checkpoint
feedback reveal. Estimated 2–3h.

**[H2] No programmatic homework generator.**
`server/services/pipeline.py` is a stub. The endpoint `POST /api/homeworks/{id}/generate`
doesn't exist yet. To wire it: load the per-subject prompt chain from
`../standards/framework/06-prompts/{subject}/`, run them sequentially through `tutor.py`'s
JSON-enforced calls, assemble the result into content_json, PUT it. Stream progress via SSE.
Estimated 4–6h.

**[H3] AI tutor not yet bound to in-template events.**
`runtime.js` exposes `window.NETS_AI.{checkAnswer, bossTurn, reflectionFeedback, tutor}`
and listens for `nets:submit` CustomEvents — but the template's existing question handlers
(boss submit, real-life submit, reading checkpoint) don't yet dispatch those events. The
runtime is plumbed; the template just doesn't ring its doorbell yet. To fix: add ~5 lines
inside each phase's submit handler to dispatch the event. Estimated 1–2h.

### Medium priority (polish)

**[M1] New screens (reading/consolidation/reflection) use inline styles.**
Functional but visually inconsistent with the rest of the template. Should get dedicated
CSS classes matching the existing screen aesthetic.

**[M2] Skip-gesture (edge-swipe) not extended to the 3 new screens.**
Current behavior: edge-swipe overlay stays inactive for reading/consolidation/reflection.
Acceptable for preview — worth fixing for production.

**[M3] Phase progress dots don't advance for the 3 new screens.**
They share their parent stage's segment. Needs `setStage()` extension.

**[M4] Adaptive Quiz: if the author provides only one tier, the adapter clones the items
into easy/medium/hard.** Scoring works; content repeats across tiers. Workaround: author
distinct items per tier. Real fix: skip the runtime tier escalation when only one tier
is authored.

### Low priority (cosmetic / known limitations)

**[L1] AI tutor field naming drift in some smoke-test docs.**
The actual contract uses `boss_question` / `hp_remaining` / `damage_value` /
`expected_answers` for `/boss-turn`, and `homework_summary` / `student_reflection` for
`/reflection`. Some older briefs mention shorter names — those are wrong. `runtime.js`
calls the right contract.

**[L2] Side-peek prev/next flashcard terms use textContent (not innerHTML).**
Inline images don't show in the side previews — only in the current card's front. By
design, but flag if a teacher complains.

**[L3] Dashboard subject filter not implemented.** Library shows all homeworks. Add a
subject-family chip filter row when the library grows past ~20 cards.

---

## Test queue (what to verify next)

Run these on the Mac whenever someone changes the relevant area. Curl examples assume
`curl -s http://localhost:8000`.

### Smoke (run after every server restart)

```bash
curl -sf /api/subjects > /dev/null && echo OK
curl -sf /api/ai/status | grep -q '"backend":"vertex"' && echo VERTEX_OK
curl -sf /api/homeworks > /dev/null && echo HW_LIST_OK
```

### Builder ↔ runtime parity (run after editor or injector changes)

For each of the 13 keys (10 arrays + meta + 2 objects), create a homework via PUT with
a one-item fixture and grep the preview output for the expected constant. The E2E smoke
script lives in this repo's history (Wave 2 sub-agent transcript) — reuse it.

Specifically watch for:

- `const FLASHCARDS = [...]` contains your test cluster name.
- `const RL_SCENARIO = {` contains `"questions":` (template-shape) — confirms RL adapter ran.
- `const READING = {`, `const CONSOLIDATION = {`, `const REFLECTION = {` all present
  with payload (post-Wave 2 fix).
- `acceptable: [...]` present in `GB_ADAPTIVE_QUIZ` items with multi-answer fixtures.
- `chain[i].expect` matches `expects[i]` for sentence-fill items with per-level expects.

### AI tutor (run after gemini.py / tutor.py / .env changes)

```bash
# All four should return 200 with non-empty content
curl -X POST /api/ai/check-answer -H 'Content-Type: application/json' \
  -d '{"question":"2+2?","expected":"4","student_answer":"4","context":""}'

curl -X POST /api/ai/boss-turn -H 'Content-Type: application/json' \
  -d '{"boss_question":"x²-5x+6=0?","hp_remaining":150,"student_answer":"2,3",
       "expected_answers":["2,3"],"damage_value":20}'

curl -X POST /api/ai/reflection -H 'Content-Type: application/json' \
  -d '{"homework_summary":"8 q, 6 correct","student_reflection":"hard"}'

curl -X POST /api/ai/tutor -H 'Content-Type: application/json' \
  -d '{"question":"What is a square root?","prior_attempts":[]}'
```

### Persistence (run after db.py or save-flow changes)

1. Create homework, type into a flashcard, hard-refresh browser, reopen.
   The typed text must persist.
2. Make 3 edits, check `/api/homeworks/{id}/versions` returns ≥3 entries.
3. Restore an old version, confirm content matches.
4. Trash + restore — content_json byte-identical before/after.

### Export (run after export.py or template changes)

```bash
curl -s /api/homeworks/{id}/export > out.html
grep -c 'NETS_CTX' out.html       # must be 0
grep -c 'runtime.js' out.html     # must be 0
grep -c 'const PANELS' out.html   # must be 1
```

Open `out.html` in a browser — the full homework session must run offline.

---

## Recently fixed (last 24h)

| Bug | Severity | Fix |
|----|----|----|
| Trashed homework `/preview` returned 200 | BLOCKER | export.py + homework.py now return 409 with `{code:TRASHED}` |
| Flashcard front showing raw HTML tags | HIGH | injector strips formatting tags but preserves inline `<img>`/`<svg>` (`_strip_text_tags_keep_media`); template uses `innerHTML` for term_html |
| Flashcard front media not rendering | HIGH | added `fc-front-media` slot in template DOM, renderer writes structured media HTML there |
| Flashcard back media too large | MEDIUM | CSS clamps to max-height 180px, max-width 100%, object-fit contain |
| Hint inside flashcard back face | LOW | moved to `.fc-user-hint` element below the card scene; auto-hides when empty |
| Adaptive Quiz only honored first answer | HIGH | injector emits `acceptable[]`; runtime evaluator iterates with case-insensitive trim |
| Sentence Fill per-level expect was always invariant | HIGH | editor exposes `expects[]` UI; injector maps `chain[i].expect = expects[i] || inv` |
| Reading/Consolidation/Reflection didn't render | HIGH | added template constants + 3 new screens + auto-skip for empty content |
| Memory Sprint card ergonomics | MEDIUM | redesigned with flashcard-style card, type pill, ergonomic correct radio, 2-up options grid |
| FAB didn't follow scroll on sentence-fill / tile-match | MEDIUM | removed `.nested-card` wrapper from those editors so the FAB selector finds the add button |
| `/api/ai/*` 422 on every call | BLOCKER | replaced `*args, **kwargs` decorator with inline try/except per endpoint |

---

## Don't regress

These behaviors are easy to break with a careless refactor. Keep them green.

- **Save flow on hard-refresh.** `beforeunload` triggers a `fetch(... , {keepalive:true})`
  to PUT the latest content_json. If you change `builder.js`'s save logic, re-test by
  typing into a card and hitting Cmd-Shift-R.
- **Quotes auto-wrap.** Plain strings in `quotes[]` get wrapped to `{t,a}` by the injector.
  If you "clean up" the adapter, old fixtures break.
- **Memory match shape.** DB stores `[[left, right]]` arrays. Template needs
  `{a,b,confirmQ,correct}`. The adapter is load-bearing.
- **Real-Life shape adapter.** DB has `q1..q6`. Template has `questions:[...]`. Massive
  reshape happens on every preview. If you "simplify" it, the template breaks.
- **Empty-state placeholders.** Every constant has a fallback so a brand-new draft
  doesn't crash the template. Don't remove them.
- **Trashed-block on preview/export.** A user pasting an old `/preview` URL after deletion
  must get 409, not a stale render.

---

## Quick map: where to fix what

| Symptom | First file to look at |
|----|----|
| Editor UI misbehaving | `frontend/js/editors/{phase}.js` |
| Editor saves but preview doesn't show | `server/services/injector.py` shape adapter |
| Preview shows empty constant | template's regex pattern in injector probably no longer matches |
| Preview crashes with `Cannot read X` | `perfect_homework.html` `renderXxx` function |
| AI endpoint returns 422 | `server/routes/ai.py` Pydantic model |
| AI returns garbage | `server/services/tutor.py` prompt or `services/gemini.py` JSON parsing |
| Dashboard list empty | `server/routes/homework.py` list query |
| Export contains AI hooks | `server/routes/export.py` — must call `inject(..., runtime_context=None)` |
| Database file ballooning | `server/db.py` version retention; consider trimming old snapshots |

---

## Final note

When in doubt: read the file, don't guess. The template is `server/template/perfect_homework.html`,
the injector is `server/services/injector.py`, and they're the two files that hold the
truth about how content flows from DB to user. Everything else is a thin shell.

---

## Auth Model — Wave A5
Decision pending. See `docs/AUTH_MODEL.md` for the proposal (option B—token-in-URL—recommended).
Telegram helper: `scripts/test_telegram.sh` — supply `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env vars to test.
