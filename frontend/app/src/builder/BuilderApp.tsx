import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Eyebrow, Title, Lead } from "../shared/ui/primitives";
import { CbpEditor } from "./CbpEditor";
import { MemoryCheckEditor } from "./MemoryCheckEditor";
import { BossEditor } from "./BossEditor";
import { MetadataEditor } from "./MetadataEditor";
import { ReflectionEditor } from "./ReflectionEditor";
import { PracticeArcSection } from "./PracticeArcSection";
import { BuilderPreview } from "./BuilderPreview";
import type { PreviewSurface } from "./BuilderPreview";
import { Dashboard } from "./Dashboard";
import { emptyDraft, fromContentJson, toContentJson } from "./draft";
import { getHomework, putHomework } from "./builderApi";
import type { BuilderDraft, HomeworkRow } from "./types";
import s from "./BuilderApp.module.css";

type Section = "meta" | "cbp" | "memory" | "practice" | "boss" | "reflection";
type SaveStatus = "idle" | "saving" | "saved" | "error";

// Each editor section maps to the preview surface it opens on. Practice opens
// on Tile Match (the canonical first arc game); the author flips the preview
// surface freely via the preview tabs.
const SECTION_TO_SURFACE: Record<Section, PreviewSurface> = {
  meta: "cbp",
  cbp: "cbp",
  memory: "memory",
  practice: "tile_match",
  boss: "boss",
  reflection: "reflection",
};

const SECTIONS: { id: Section; label: string }[] = [
  { id: "meta", label: "Metadata" },
  { id: "cbp", label: "Case Preview" },
  { id: "memory", label: "Memory Check" },
  { id: "practice", label: "Practice Arc" },
  { id: "boss", label: "Boss" },
  { id: "reflection", label: "Reflection" },
];

const PREVIEW_TABS: { id: PreviewSurface; label: string }[] = [
  { id: "cbp", label: "Case" },
  { id: "flashcards", label: "Flashcards" },
  { id: "memory", label: "Memory Check" },
  { id: "tile_match", label: "Tile Match" },
  { id: "sentence_fill", label: "Sentence Fill" },
  { id: "mystery_box", label: "Mystery Box" },
  { id: "puzzle_lock", label: "Puzzle Lock" },
  { id: "adaptive_quiz", label: "Adaptive Quiz" },
  { id: "memory_palace", label: "Memory Palace" },
  { id: "ttt", label: "Tic-Tac-Toe" },
  { id: "real_life_challenge", label: "Real-Life" },
  { id: "boss", label: "Boss" },
  { id: "reflection", label: "Reflection" },
];

const SAVE_DEBOUNCE_MS = 1200;

// F6 Builder shell. Pick/create a homework, then a two-pane authoring surface:
// left = section editors, right = a LIVE preview rendered with the real runtime
// components fed the author's draft. Saves debounce to PUT /api/homeworks/{id}.
export function BuilderApp() {
  const [hwId, setHwId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("cbp");
  const [surface, setSurface] = useState<PreviewSurface>("cbp");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // Load the unredacted authoring blob when a homework is opened/created.
  const openHomework = useCallback(async (id: string, seed?: BuilderDraft) => {
    setHwId(id);
    setLoadError(null);
    if (seed) {
      setDraft(seed);
      return;
    }
    try {
      const row = await getHomework(id);
      setDraft(fromContentJson(row.content_json ?? {}));
    } catch (err) {
      setLoadError((err as Error).message || "Couldn't load this homework.");
      setDraft(emptyDraft());
    }
  }, []);

  // Debounced autosave. Each draft change schedules a single PUT.
  const scheduleSave = useCallback(
    (id: string, next: BuilderDraft) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      dirtyRef.current = true;
      setSaveStatus("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          await putHomework(id, { content_json: toContentJson(next) });
          dirtyRef.current = false;
          setSaveStatus("saved");
          setSaveError(null);
        } catch (err) {
          setSaveStatus("error");
          setSaveError((err as Error).message || "Save failed.");
        }
      }, SAVE_DEBOUNCE_MS);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const updateDraft = useCallback(
    (next: BuilderDraft) => {
      setDraft(next);
      if (hwId) scheduleSave(hwId, next);
    },
    [hwId, scheduleSave]
  );

  // Keep the preview surface in sync when the editor section changes.
  const selectSection = (next: Section) => {
    setSection(next);
    setSurface(SECTION_TO_SURFACE[next]);
  };

  if (!hwId || !draft) {
    // The dashboard is the app entry. v2 homeworks open in THIS React builder;
    // legacy v1 homeworks route to the old builder.html (additive — v1 authoring
    // is untouched). New homeworks are always created v2, so open in-place.
    const openRow = (row: HomeworkRow) => {
      if (row.flow_version === "v2") {
        openHomework(row.id);
      } else {
        window.location.href = `/builder.html?id=${encodeURIComponent(row.id)}`;
      }
    };
    return (
      <Dashboard
        onOpen={openRow}
        onCreated={(id) => openHomework(id, emptyDraft())}
      />
    );
  }

  return (
    <div className={s.builder} data-testid="builder-app">
      <header className={s.topbar}>
        <div className={s.brand}>
          <Eyebrow cyan>NETS Builder · v2</Eyebrow>
          <span className={s.hwId}>{hwId}</span>
        </div>
        <nav className={s.sectionTabs} aria-label="Editor sections">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              className={`${s.tab} ${section === sec.id ? s.tabActive : ""}`}
              onClick={() => selectSection(sec.id)}
            >
              {sec.label}
            </button>
          ))}
        </nav>
        <div className={s.saveStatus} data-status={saveStatus}>
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && "✓ Saved"}
          {saveStatus === "error" && (
            <span className={s.saveErr} title={saveError ?? ""}>
              Save failed
            </span>
          )}
          {saveStatus === "idle" && "All changes saved"}
        </div>
      </header>

      {loadError && (
        <p className={s.loadErr} role="alert">
          {loadError}
        </p>
      )}

      <div className={s.panes}>
        <div className={s.editorPane}>
          {section === "meta" && (
            <MetadataEditor
              value={draft.meta}
              onChange={(meta) => updateDraft({ ...draft, meta })}
            />
          )}
          {section === "cbp" && (
            <CbpEditor
              value={draft.case_based_preview}
              onChange={(case_based_preview) =>
                updateDraft({ ...draft, case_based_preview })
              }
            />
          )}
          {section === "memory" && (
            <MemoryCheckEditor
              flashcards={draft.flashcards}
              memoryCheck={draft.memory_check}
              onFlashcardsChange={(flashcards) =>
                updateDraft({ ...draft, flashcards })
              }
              onMemoryCheckChange={(memory_check) =>
                updateDraft({ ...draft, memory_check })
              }
            />
          )}
          {section === "practice" && (
            <PracticeArcSection draft={draft} updateDraft={updateDraft} />
          )}
          {section === "boss" && (
            <BossEditor
              bossMeta={draft.boss_meta}
              bossQuestions={draft.boss_questions}
              onBossMetaChange={(boss_meta) =>
                updateDraft({ ...draft, boss_meta })
              }
              onBossQuestionsChange={(boss_questions) =>
                updateDraft({ ...draft, boss_questions })
              }
            />
          )}
          {section === "reflection" && (
            <ReflectionEditor
              value={draft.reflection}
              onChange={(reflection) => updateDraft({ ...draft, reflection })}
            />
          )}
        </div>

        <div className={s.previewPane}>
          <div className={s.previewTabs} aria-label="Preview surface">
            {PREVIEW_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${s.previewTab} ${surface === t.id ? s.previewTabActive : ""}`}
                onClick={() => setSurface(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <BuilderPreview draft={draft} surface={surface} />
        </div>
      </div>
    </div>
  );
}

// Re-export so a host that wants a quick "no homework yet" frame can render it.
export function BuilderEmpty() {
  return (
    <main className="v2-shell">
      <Eyebrow cyan>NETS Builder</Eyebrow>
      <Title size="hero">Pick a homework to author.</Title>
      <Lead>Open an existing v2 homework or create a fresh one to begin.</Lead>
      <div style={{ marginTop: 24 }}>
        <Button variant="blue" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </main>
  );
}
