import { useEffect, useState } from "react";
import { Eyebrow, Title, Lead, Button } from "../shared/ui/primitives";
import {
  createHomework,
  listHomeworks,
  SUBJECT_GRADES,
  SUBJECT_LABELS,
  ALWAYS_HARD,
} from "./builderApi";
import { Field, TextInput, Select } from "./fields";
import type { HomeworkRow } from "./types";
import s from "./HomeworkPicker.module.css";

// Entry screen: create a fresh v2 homework, or open an existing one for editing.
export function HomeworkPicker({
  onOpen,
  onCreated,
}: {
  onOpen: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const subjects = Object.keys(SUBJECT_GRADES);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(subjects[0]);
  const [grade, setGrade] = useState(SUBJECT_GRADES[subjects[0]][0]);
  const [mode, setMode] = useState<"easy" | "hard">("hard");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<HomeworkRow[]>([]);
  const [openId, setOpenId] = useState("");

  // Keep grade valid when subject changes.
  useEffect(() => {
    const grades = SUBJECT_GRADES[subject] ?? [];
    if (!grades.includes(grade)) setGrade(grades[0]);
  }, [subject, grade]);

  useEffect(() => {
    listHomeworks()
      .then((list) => setRows(Array.isArray(list) ? list.slice(0, 25) : []))
      .catch(() => setRows([]));
  }, []);

  const create = async () => {
    if (!title.trim()) {
      setError("Give the homework a title first.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const row = await createHomework({
        title: title.trim(),
        subject,
        grade,
        mode: ALWAYS_HARD.has(subject) ? "hard" : mode,
      });
      if (row?.id) onCreated(row.id);
      else setError("Create succeeded but returned no id.");
    } catch (err) {
      setError((err as Error).message || "Couldn't create the homework.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className={`v2-shell ${s.picker}`} data-testid="builder-picker">
      <Eyebrow cyan>NETS Builder · v2 authoring</Eyebrow>
      <Title size="hero">Start a new homework.</Title>
      <Lead>
        Author the Case-Based Preview, Memory Check, Practice Arc and Boss — with
        a live preview of exactly what the student sees.
      </Lead>

      <section className={s.card}>
        <h3 className={s.cardTitle}>Create new</h3>
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} placeholder="Homework title" />
        </Field>
        <div className={s.grid2}>
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
        {!ALWAYS_HARD.has(subject) && (
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
        )}
        {ALWAYS_HARD.has(subject) && (
          <p className={s.note}>This subject is always hard mode.</p>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.actions}>
          <Button variant="blue" onClick={create} disabled={creating}>
            {creating ? "Creating…" : "Create & author →"}
          </Button>
        </div>
      </section>

      <section className={s.card}>
        <h3 className={s.cardTitle}>Open existing</h3>
        <div className={s.openRow}>
          <TextInput
            value={openId}
            onChange={setOpenId}
            placeholder="Homework id"
          />
          <Button
            variant="outline"
            onClick={() => openId.trim() && onOpen(openId.trim())}
          >
            Open
          </Button>
        </div>
        {rows.length > 0 && (
          <ul className={s.recent}>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={s.recentItem}
                  onClick={() => onOpen(row.id)}
                >
                  <span className={s.recentTitle}>
                    {row.title || "Untitled"}
                  </span>
                  <span className={s.recentMeta}>
                    {(row.subject ?? "—")}
                    {row.grade != null ? ` · G${row.grade}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
