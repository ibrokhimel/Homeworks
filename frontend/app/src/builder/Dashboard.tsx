import { useEffect, useMemo, useState } from "react";
import { Eyebrow, Title, Lead, Button } from "../shared/ui/primitives";
import {
  createHomework,
  deleteHomework,
  duplicateHomework,
  listHomeworks,
  SUBJECT_GRADES,
  SUBJECT_LABELS,
  ALWAYS_HARD,
} from "./builderApi";
import { Field, TextInput, Select } from "./fields";
import type { HomeworkRow } from "./types";
import s from "./Dashboard.module.css";

// ---------------------------------------------------------------------------
// Dashboard — the builder home surface. Lists every authored homework as a
// responsive Apple-glass card grid (search + subject/grade/mode filters), lets
// the author spin up a fresh v2 row, and exposes per-card Open / Duplicate /
// Delete. This component is intentionally SELF-CONTAINED and routing-agnostic:
// it never decides v1-vs-v2 navigation. It hands the WHOLE row up via
// `onOpen(row)` so the parent (App.tsx, wired by the orchestrator) routes
// legacy v1 -> the old builder and v2 -> the React editor. `onCreated(id)`
// fires after a successful create so the parent can jump straight into editing.
//
// Export: NAMED export `Dashboard`. Props: `{ onOpen, onCreated }`.
// ---------------------------------------------------------------------------

export interface DashboardProps {
  /** Open an existing homework. The parent receives the WHOLE row and decides
   *  v1 (legacy) vs v2 (React) routing off `row.flow_version`. */
  onOpen: (row: HomeworkRow) => void;
  /** Fired with the new id after a successful create. */
  onCreated: (id: string) => void;
}

type ModeFilter = "all" | "easy" | "hard";

// v2 = the row was created by / migrated to the React flow. The list endpoint
// stamps `flow_version: "v2"` on those rows; legacy v1 rows have it null/absent.
function isV2(row: HomeworkRow): boolean {
  const fv =
    (row as { flow_version?: unknown }).flow_version ??
    (row.content_json?.["flow_version"] as unknown);
  return fv === "v2";
}

// content_json is stripped from the list payload, but a `progress`/`progress_pct`
// hint may ride along on some rows. Read it defensively; absent => no bar.
function readProgress(row: HomeworkRow): number | null {
  const raw =
    (row as { progress_pct?: unknown; progress?: unknown }).progress_pct ??
    (row as { progress?: unknown }).progress ??
    (row.content_json?.["progress_pct"] as unknown) ??
    (row.content_json?.["progress"] as unknown);
  const n = typeof raw === "string" ? Number(raw) : (raw as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  // Tolerate either 0..1 or 0..100.
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function subjectLabel(subject: string | null): string {
  if (!subject) return "—";
  return SUBJECT_LABELS[subject] ?? subject;
}

function modeOf(row: HomeworkRow): "easy" | "hard" | null {
  const m = (row.mode ?? "").toString().toLowerCase();
  if (row.subject && ALWAYS_HARD.has(row.subject)) return "hard";
  if (m === "easy" || m === "hard") return m;
  return null;
}

export function Dashboard({ onOpen, onCreated }: DashboardProps) {
  const subjects = useMemo(() => Object.keys(SUBJECT_GRADES), []);

  // --- list state -----------------------------------------------------------
  const [rows, setRows] = useState<HomeworkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // --- filter state ----------------------------------------------------------
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");

  // --- create form state -----------------------------------------------------
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(subjects[0]);
  const [grade, setGrade] = useState(SUBJECT_GRADES[subjects[0]][0]);
  const [mode, setMode] = useState<"easy" | "hard">("hard");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Keep the create-form grade valid when its subject changes.
  useEffect(() => {
    const grades = SUBJECT_GRADES[subject] ?? [];
    if (!grades.includes(grade)) setGrade(grades[0]);
  }, [subject, grade]);

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listHomeworks();
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setLoadError((err as Error).message || "Couldn't load your homeworks.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // --- derived: filtered rows ------------------------------------------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !(row.title ?? "").toLowerCase().includes(q)) return false;
      if (subjectFilter !== "all" && row.subject !== subjectFilter) return false;
      if (gradeFilter !== "all" && String(row.grade) !== gradeFilter) return false;
      if (modeFilter !== "all" && modeOf(row) !== modeFilter) return false;
      return true;
    });
  }, [rows, query, subjectFilter, gradeFilter, modeFilter]);

  // Grade options reflect the chosen subject (or all valid grades when "all").
  const gradeOptions = useMemo(() => {
    const set = new Set<number>();
    if (subjectFilter === "all") {
      Object.values(SUBJECT_GRADES).forEach((gs) => gs.forEach((g) => set.add(g)));
    } else {
      (SUBJECT_GRADES[subjectFilter] ?? []).forEach((g) => set.add(g));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [subjectFilter]);

  const filtersActive =
    query.trim() !== "" ||
    subjectFilter !== "all" ||
    gradeFilter !== "all" ||
    modeFilter !== "all";

  function clearFilters() {
    setQuery("");
    setSubjectFilter("all");
    setGradeFilter("all");
    setModeFilter("all");
  }

  // --- actions ---------------------------------------------------------------
  async function handleCreate() {
    if (!title.trim()) {
      setCreateError("Give the homework a title first.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const row = await createHomework({
        title: title.trim(),
        subject,
        grade,
        mode: ALWAYS_HARD.has(subject) ? "hard" : mode,
      });
      if (row?.id) {
        setTitle("");
        setShowCreate(false);
        onCreated(row.id);
      } else {
        setCreateError("Create succeeded but returned no id.");
      }
    } catch (err) {
      setCreateError((err as Error).message || "Couldn't create the homework.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(row: HomeworkRow) {
    setBusyId(row.id);
    try {
      await duplicateHomework(row.id);
      await refresh();
    } catch (err) {
      setLoadError((err as Error).message || "Couldn't duplicate that homework.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: HomeworkRow) {
    const ok = window.confirm(
      `Delete "${row.title || "Untitled"}"? This can't be undone.`
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await deleteHomework(row.id);
      await refresh();
    } catch (err) {
      setLoadError((err as Error).message || "Couldn't delete that homework.");
    } finally {
      setBusyId(null);
    }
  }

  // ---------------------------------------------------------------------------
  return (
    <main className={`v2-shell ${s.shell}`} data-testid="builder-dashboard">
      <header className={s.head}>
        <div>
          <Eyebrow>NETS Builder · v2 authoring</Eyebrow>
          <Title size="hero">Your homeworks.</Title>
          <Lead>
            Author the Case-Based Preview, Memory Check, Practice Arc and Boss —
            with a live preview of exactly what the student sees.
          </Lead>
        </div>
        <Button
          variant="blue"
          onClick={() => {
            setCreateError(null);
            setShowCreate((v) => !v);
          }}
          aria-expanded={showCreate}
          data-testid="dashboard-new-toggle"
        >
          {showCreate ? "Close" : "+ New homework"}
        </Button>
      </header>

      {/* ---- Create panel (collapsible) ------------------------------------ */}
      {showCreate && (
        <section className={s.createCard} data-testid="dashboard-create">
          <h3 className={s.createTitle}>Create new</h3>
          <Field label="Title">
            <TextInput
              value={title}
              onChange={setTitle}
              placeholder="Homework title"
            />
          </Field>
          <div className={s.createGrid}>
            <Field label="Subject">
              <Select
                value={subject}
                onChange={setSubject}
                options={subjects.map((sub) => ({
                  value: sub,
                  label: SUBJECT_LABELS[sub] ?? sub,
                }))}
              />
            </Field>
            <Field label="Grade">
              <Select<string>
                value={String(grade)}
                onChange={(g) => setGrade(Number(g))}
                options={(SUBJECT_GRADES[subject] ?? []).map((g) => ({
                  value: String(g),
                  label: `Grade ${g}`,
                }))}
              />
            </Field>
          </div>
          {!ALWAYS_HARD.has(subject) ? (
            <Field label="Mode">
              <Select<"easy" | "hard">
                value={mode}
                onChange={setMode}
                options={[
                  { value: "hard", label: "Hard" },
                  { value: "easy", label: "Easy" },
                ]}
              />
            </Field>
          ) : (
            <p className={s.note}>This subject is always hard mode.</p>
          )}
          {createError && (
            <p className={s.error} role="alert">
              {createError}
            </p>
          )}
          <div className={s.createActions}>
            <Button
              variant="blue"
              onClick={handleCreate}
              disabled={creating}
              data-testid="dashboard-create-submit"
            >
              {creating ? "Creating…" : "Create & author →"}
            </Button>
          </div>
        </section>
      )}

      {/* ---- Filter bar ---------------------------------------------------- */}
      <section className={s.filters} aria-label="Filter homeworks">
        <div className={s.searchWrap}>
          <SearchGlyph />
          <input
            className={s.search}
            type="search"
            value={query}
            placeholder="Search by title…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search homeworks by title"
            data-testid="dashboard-search"
          />
        </div>
        <div className={s.filterSelects}>
          <Select<string>
            value={subjectFilter}
            onChange={(v) => {
              setSubjectFilter(v);
              setGradeFilter("all");
            }}
            options={[
              { value: "all", label: "All subjects" },
              ...subjects.map((sub) => ({
                value: sub,
                label: SUBJECT_LABELS[sub] ?? sub,
              })),
            ]}
          />
          <Select<string>
            value={gradeFilter}
            onChange={setGradeFilter}
            options={[
              { value: "all", label: "All grades" },
              ...gradeOptions.map((g) => ({
                value: String(g),
                label: `Grade ${g}`,
              })),
            ]}
          />
          <Select<ModeFilter>
            value={modeFilter}
            onChange={setModeFilter}
            options={[
              { value: "all", label: "Any mode" },
              { value: "hard", label: "Hard" },
              { value: "easy", label: "Easy" },
            ]}
          />
          {filtersActive && (
            <button
              type="button"
              className={s.clearBtn}
              onClick={clearFilters}
              data-testid="dashboard-clear-filters"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* ---- States: loading / error / empty / grid ----------------------- */}
      {loadError && (
        <div className={s.banner} role="alert" data-testid="dashboard-error">
          <span>{loadError}</span>
          <button type="button" className={s.retryBtn} onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className={s.grid} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${s.card} ${s.cardSkeleton}`}>
              <div className={s.skLine} style={{ width: "60%" }} />
              <div className={s.skLine} style={{ width: "40%" }} />
              <div className={s.skLineWide} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty} data-testid="dashboard-empty">
          {rows.length === 0 ? (
            <>
              <p className={s.emptyTitle}>No homeworks yet.</p>
              <p className={s.emptyLead}>
                Create your first one to start authoring.
              </p>
              <Button variant="blue" onClick={() => setShowCreate(true)}>
                + New homework
              </Button>
            </>
          ) : (
            <>
              <p className={s.emptyTitle}>No matches.</p>
              <p className={s.emptyLead}>Try a different search or filter.</p>
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className={s.grid} data-testid="dashboard-grid">
          {filtered.map((row, i) => {
            const v2 = isV2(row);
            const m = modeOf(row);
            const progress = readProgress(row);
            const busy = busyId === row.id;
            return (
              <li
                key={row.id}
                className={`${s.card} ${v2 ? s.accentV2 : s.accentV1}`}
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                data-testid="dashboard-card"
              >
                <div className={s.cardTop}>
                  <span
                    className={`${s.versionBadge} ${v2 ? s.badgeV2 : s.badgeV1}`}
                    title={
                      v2
                        ? "React v2 authoring flow"
                        : "Legacy v1 homework"
                    }
                  >
                    {v2 ? "v2" : "v1"}
                  </span>
                  {m && (
                    <span className={`${s.modePill} ${m === "hard" ? s.modeHard : s.modeEasy}`}>
                      {m === "hard" ? "Hard" : "Easy"}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={s.cardTitleBtn}
                  onClick={() => onOpen(row)}
                  disabled={busy}
                  data-testid="dashboard-open"
                >
                  <span className={s.cardTitle}>{row.title || "Untitled"}</span>
                </button>

                <p className={s.cardMeta}>
                  <span>{subjectLabel(row.subject)}</span>
                  {row.grade != null && (
                    <>
                      <span className={s.dot} aria-hidden="true">
                        ·
                      </span>
                      <span>Grade {row.grade}</span>
                    </>
                  )}
                </p>

                {progress != null && (
                  <div className={s.progressWrap} aria-label={`${progress}% complete`}>
                    <div className={s.progressTrack}>
                      <div
                        className={s.progressFill}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className={s.progressPct}>{progress}%</span>
                  </div>
                )}

                <div className={s.cardActions}>
                  <button
                    type="button"
                    className={s.actOpen}
                    onClick={() => onOpen(row)}
                    disabled={busy}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className={s.actGhost}
                    onClick={() => void handleDuplicate(row)}
                    disabled={busy}
                    title="Duplicate"
                  >
                    {busy ? "…" : "Duplicate"}
                  </button>
                  <button
                    type="button"
                    className={`${s.actGhost} ${s.actDanger}`}
                    onClick={() => void handleDelete(row)}
                    disabled={busy}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function SearchGlyph() {
  return (
    <svg
      className={s.searchIcon}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default Dashboard;
