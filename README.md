# NETS Homework Builder — Server README

This is the operations manual for a 24/7 agent (Claude Code via OpenClaw on the Mac mini, or any
remote operator) that needs to keep this server alive, build/edit homeworks via the API, and ship
fixes without breaking running sessions.

Everything below assumes you're inside `/Users/aisigma/nets-builder/` on the Mac mini (host
`192.168.1.44`, user `aisigma`). When working from elsewhere, prefix shell commands with
`ssh aisigma@192.168.1.44`.

---

## 1. What this project is

A FastAPI + SQLite backend plus a vanilla-JS frontend that lets a teacher build a NETS-spec
homework session in the browser and preview it live. An optional AI tutor
(Vertex AI / Google Gemini) hooks into the runtime to grade open answers,
narrate the Final Boss, and write reflection feedback.

There is no build step. Python serves the frontend statically. Saves are durable.

The injected runtime template is `server/template/perfect_homework.html` — a 4 700-line file
that renders the entire session UI from 10 JS constants. The injector (`server/services/
injector.py`) regex-replaces those constants with content from the database.

---

## 2. Daily operations

### Start / stop / restart

```bash
# Inside /Users/aisigma/nets-builder

# Start (or restart if already running)
pkill -f "uvicorn server.app" 2>/dev/null
nohup ./.venv/bin/python -m uvicorn server.app:app \
  --host 0.0.0.0 --port 8000 > /tmp/nets.log 2>&1 &

# Health check
curl -sf http://localhost:8000/api/subjects | head -c 200

# Logs
tail -50 /tmp/nets.log
```

### 24/7 auto-restart (Mac mini recommended)

For reliable 24/7 operation without manual restarts on SSH disconnect or reboot, install the launchd agent:

```bash
bash scripts/install_launchd.sh
```

See `scripts/install_launchd.README.md` for status, control, and troubleshooting.

The venv at `.venv/` contains `fastapi`, `uvicorn`, `aiosqlite`, `google-genai`, `python-dotenv`.
If a deploy script ever needs to install packages, use `./.venv/bin/pip install ...` — never
the system Python.

### Where things live on disk

```
/Users/aisigma/nets-builder/
  ├── server/
  │   ├── app.py                    # FastAPI entry, static mounts, CORS
  │   ├── config.py                 # paths, env vars
  │   ├── db.py                     # SQLite (WAL, soft-delete, version snapshots)
  │   ├── routes/
  │   │   ├── homework.py           # CRUD + duplicate + restore
  │   │   ├── meta.py               # subjects, fixtures, trash, versions
  │   │   ├── ai.py                 # 4 tutor endpoints
  │   │   └── homework_page.py      # /h/{id} permanent URL + /preview iframe route
  │   ├── services/
  │   │   ├── gemini.py             # 3-tier backend (vertex → gemini_api → kimi)
  │   │   ├── tutor.py              # 4 tutor functions, JSON-schema enforced
  │   │   └── injector.py           # regex replacement of template constants
  │   ├── template/
  │   │   ├── perfect_homework.html # the runtime template (don't rewrite — patch)
  │   │   └── runtime.js            # AI tutor client glue (served at /static/runtime/runtime.js)
  │   └── prompts/runtime/          # Markdown prompts for tutor functions
  ├── frontend/
  │   ├── index.html                # Dashboard (library + trash + versions)
  │   ├── builder.html              # Editor SPA shell
  │   ├── css/app.css               # All styles (one file, ~1700 lines)
  │   └── js/
  │       ├── api.js                # fetch wrappers
  │       ├── dashboard.js          # library/trash UI
  │       ├── builder.js            # editor orchestrator + FAB + auto-save
  │       └── editors/              # one .js per phase
  ├── fixtures/                     # seed JSONs for "Load Template"
  ├── .env                          # GOOGLE_APPLICATION_CREDENTIALS, VERTEX_PROJECT, VERTEX_LOCATION
  ├── claw_api_service.json         # Vertex service-account key (gitignored)
  └── nets.db                       # SQLite (WAL: nets.db-wal + nets.db-shm)
```

---

## 3. The data model (frozen contract)

Each homework has a `content_json` blob with these top-level keys:

| Key | Type | Editor | Template constant |
|----|----|----|----|
| `meta` | object | (built-in) | injected as title/caption |
| `panels` | array | preview.js | `PANELS` |
| `quotes` | array | preview.js | `QUOTES` |
| `flashcards` | array | flashcards.js | `FLASHCARDS` |
| `memory_sprint` | array | memory-sprint.js | `MS_QUESTIONS` |
| `gb_adaptive_quiz` | array | games/adaptive-quiz.js | `GB_ADAPTIVE_QUIZ` |
| `gb_why_chain` | array | games/sentence-fill.js | `GB_WHY_CHAIN` |
| `gb_memory_match` | array | games/tile-match.js | `GB_MEMORY_MATCH` |
| `real_life` | object | real-life.js | `RL_SCENARIO` |
| `boss_questions` | array | boss.js | `BOSS_QUESTIONS` |
| `reading` | object | reading.js | `READING` |
| `consolidation` | object | consolidation.js | `CONSOLIDATION` |
| `reflection` | object | reflection.js | `REFLECTION` |

The DB stores the **builder-native** shape. The injector rewrites it into the **template-native**
shape on every preview render — never on save. This means changing the template's expected shape
is safe (just patch the adapter).

Full shapes for each key are documented in `CONTRACTS.md` at the project root.

---

## 4. API reference (curl examples)

All endpoints are under `http://localhost:8000`.

### Homeworks (CRUD)

```bash
# List
curl -s /api/homeworks

# Create
curl -s -X POST /api/homeworks -H 'Content-Type: application/json' -d '{
  "subject":"math-algebra","grade":8,"mode":"hard","title":"Kvadrat Tenglama"
}'

# Read
curl -s /api/homeworks/HW-20260424-004

# Save (full content_json)
curl -s -X PUT /api/homeworks/HW-20260424-004 \
  -H 'Content-Type: application/json' -d @content.json

# Soft-delete (moves to trash)
curl -s -X DELETE /api/homeworks/HW-20260424-004

# Duplicate
curl -s -X POST /api/homeworks/HW-20260424-004/duplicate
```

### Trash + versions

```bash
curl -s /api/trash
curl -s -X POST /api/homeworks/{id}/restore
curl -s /api/homeworks/{id}/versions
curl -s -X POST /api/homeworks/{id}/versions/{ver_id}/restore
```

### Permanent share URL

`GET /h/{id}` returns the rendered homework with the AI runtime baked in.
The same body is also served from `/api/homeworks/{id}/preview` (used by the
builder iframe; trashed homeworks return **409** on both URLs).

### AI tutor

```bash
curl -s /api/ai/status
# {"backend":"vertex","model_fast":"gemini-2.5-flash",...}

curl -s -X POST /api/ai/check-answer -H 'Content-Type: application/json' -d '{
  "question":"2+2?","expected":"4","student_answer":"4","context":""
}'

curl -s -X POST /api/ai/boss-turn -H 'Content-Type: application/json' -d '{
  "boss_question":"x²-5x+6=0?","hp_remaining":150,
  "student_answer":"2,3","expected_answers":["2,3","x1=2,x2=3"],
  "damage_value":20
}'

curl -s -X POST /api/ai/reflection -H 'Content-Type: application/json' -d '{
  "homework_summary":"8 questions, 6 correct",
  "student_reflection":"It was hard"
}'

curl -s -X POST /api/ai/tutor -H 'Content-Type: application/json' -d '{
  "question":"What is a square root?","prior_attempts":[]
}'
```

The `boss-turn` and `reflection` endpoints use **specific** field names — don't guess. The wrong
names return 422.

### Meta

```bash
curl -s /api/subjects             # subject + grade band catalog
curl -s /api/fixtures             # available seed templates
curl -s /api/fixtures/{name}      # one fixture's content_json
```

---

## 5. Environment variables (.env)

```
GOOGLE_APPLICATION_CREDENTIALS=/Users/aisigma/nets-builder/claw_api_service.json
VERTEX_PROJECT=unique-spirit-494018-h5
VERTEX_LOCATION=us-central1
GEMINI_MODEL_FAST=gemini-2.5-flash
GEMINI_MODEL_PRO=gemini-2.5-pro
```

If Vertex breaks, set `GEMINI_API_KEY=...` and the gemini.py module falls back to direct API.
If both are missing, it falls back to a Kimi (Moonshot) endpoint (set `KIMI_API_KEY`).
If all three are missing, AI endpoints return 503 — the runtime gracefully degrades to stock
feedback so user sessions never stall.

---

## 6. How an automation agent should build a homework

The "happy path" for an agent that wants to programmatically generate a full homework:

1. `POST /api/homeworks` → grab the new `id`.
2. Read the subject's prompt chain from
   `standards/framework/06-prompts/{subject}/` — it's a sequence of `.md` files
   (classify → extract → preview → flashcards → sprint → game-breaks → real-life
    → boss → reflection).
3. Run each prompt against Vertex (the active backend). Use `services/tutor.py:_run_prompt`
   as a reference for how to call Gemini with JSON schema enforcement.
4. Assemble all phase outputs into a single content_json object that matches the
   shape table in §3.
5. `PUT /api/homeworks/{id}` with the assembled blob.
6. `GET /api/homeworks/{id}/preview` and grep for the 10 const declarations to confirm
   nothing got dropped.
7. Done — hand the user the builder URL `/builder.html?id={id}` or the share URL `/h/{id}`.

A reference pipeline lives at `server/services/pipeline.py` (stub — flesh out with the
prompt-chain runner). When wired, expose it as `POST /api/homeworks/{id}/generate` with
SSE progress updates.

---

## 7. Multi-agent coordination

When more than one operator (Claude, OpenClaw, a teammate, a cron) might be editing files
on this Mac:

- **Always GET-then-PUT for shared files.** Before overwriting `injector.py` or
  `perfect_homework.html`, fetch the current remote copy via SFTP, diff against your local
  base, and merge if drifted. Never blind-overwrite.
- **One uvicorn restart per deploy batch.** If two agents both restart in quick succession,
  the second `pkill` may kill the first agent's freshly-started process. Wait until
  `tail -1 /tmp/nets.log` shows `Application startup complete` before triggering another.
- **Lane discipline.** AI work touches `routes/ai.py + services/{gemini,tutor}.py + runtime.js +
  builder.html topbar`. Editor work touches `frontend/js/editors/*` + `injector.py` shape
  adapters + `perfect_homework.html` content blocks. Dashboard work touches `index.html +
  dashboard.js + routes/{homework,meta,homework_page}.py`. Stay in your lane unless coordinating.
- **md5 verify after upload.** If the bytes on disk don't match what you intended, restart
  the upload — never assume.

---

## 8. Troubleshooting

| Symptom | First thing to check |
|----|----|
| `/api/subjects` returns nothing | `tail /tmp/nets.log` — uvicorn probably crashed at boot. Look for the traceback near the bottom. |
| `/api/ai/*` returns 500 | `curl /api/ai/status` — confirms which backend is active. If `none`, the .env or service-account key is wrong. |
| `/preview` returns 200 but the page is blank | Open it, view source, search for `const FLASHCARDS`. If the array is empty when content exists, the injector regex didn't match — `injector.py` shape adapter probably broken. |
| Preview crashes with a JS error like `Cannot read 'term' of undefined` | A shape adapter's output doesn't match what the template expects. Open `perfect_homework.html` and find the `renderXxx` function for that constant — its expected fields are the ground truth. |
| `PUT` returns 409 with `{code: TRASHED}` | Homework is in trash. `POST /restore` first. |
| Saves silently fail | Check `/tmp/nets.log` for SQLite "database is locked" — another process holds a write lock. WAL mode mostly prevents this, but a stuck transaction can do it. Restart uvicorn. |
| Frontend changes don't show up | Hard-refresh (Cmd-Shift-R). The frontend is served by FastAPI's static handler — there's no cache layer, but browsers cache aggressively. |

---

## 9. What NOT to do

- Don't `git push` from this machine. The user manages git separately.
- Don't change `content_json` field names — the database has historical data in those keys.
- Don't rewrite `perfect_homework.html` from scratch — every line was hand-tuned. Patch.
- Don't switch databases. SQLite + WAL is enough for a 30-student classroom and was chosen
  deliberately for portability.
- Don't add framework dependencies (React, Vue, Tailwind). The frontend stays vanilla.
- Don't bypass the injector's runtime_context block in preview mode — that's how the AI
  tutor gets its DOM hooks.

---

## 10. Backup & recovery

### Daily snapshot

Run `bash scripts/backup_db.sh` from the repo root to create an online backup (safe with the server running):

```bash
cd /Users/aisigma/nets-builder
bash scripts/backup_db.sh              # uses ./nets.db and ./backups/
bash scripts/backup_db.sh /path/to/nets.db /path/to/backups/  # custom paths
```

Each backup:
- Uses SQLite `.backup` command (online, no server shutdown needed).
- Gzips the snapshot (typically 30-40% of original size).
- Stores with timestamp: `nets-YYYYMMDD-HHMMSS.db.gz`.
- Automatically deletes backups older than 14 days.

Recommended **crontab line** for daily 2 AM snapshot:

```
0 2 * * * cd /Users/aisigma/nets-builder && bash scripts/backup_db.sh >> /tmp/backup.log 2>&1
```

### Restore from a backup

To restore from any snapshot:

```bash
bash scripts/restore_db.sh backups/nets-20260427-180000.db.gz
bash scripts/restore_db.sh backups/nets-20260427-180000.db.gz ./nets-restored.db  # custom target
```

The script:
- Decompresses `.gz` files to a temp location if needed.
- Renames the existing database to `nets.db.pre-restore-{timestamp}` (never overwrites).
- Copies the backup into place.
- Verifies integrity with `PRAGMA integrity_check`.
- Bails immediately if verification fails (safety copy remains on disk).

### Where backups should live

**Recommendation: AWS S3 + local disk**.

Rationale:
- 14 daily gzipped backups ≈ 5–10 GB (nets.db is ~2.3 GB uncompressed).
- S3 Glacier Deep Archive costs ~$0.004/GB/month; daily syncs via `aws s3 sync` or a cron wrapper are negligible.
- Keep local backups for fast recovery; offload to S3 for disaster recovery (disk failure, ransomware).

Example cron wrapper (after daily backup completes):

```bash
0 3 * * * aws s3 sync /Users/aisigma/nets-builder/backups/ s3://your-backup-bucket/nets-backups/ \
  --delete --storage-class DEEP_ARCHIVE >> /tmp/s3_sync.log 2>&1
```

Alternatively, use an external USB drive or Dropbox sync — the key is **off-machine storage**.

---

## 11. See also

- `STATE.md` (next door) — what's working, what's broken, what to test next.
- `CONTRACTS.md` — full content_json schema.
- `PLAN.md` / `PLAN_DASHBOARD.md` — historical implementation plan.
- `standards/framework/` (in the parent vault) — the pedagogy spec the homeworks must obey.
