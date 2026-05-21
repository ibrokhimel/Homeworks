import type {
  DraftBossMeta,
  DraftBossQuestion,
  DraftPracticeArc,
} from "./types";
import { emptyBossQuestion } from "./draft";
import { gameLabel } from "../runtime/GameHost";
import {
  EditorCard,
  Field,
  TextInput,
  TextArea,
  NumberInput,
  SmallButton,
} from "./fields";
import s from "./editors.module.css";

// The Practice Arc game keys an author can compose. Boss is implicit (always
// the last node) so it's not orderable here. Mirrors gameOrder.ts's keys.
const ARC_GAME_KEYS = [
  "tile_match",
  "sentence_fill",
  "mystery_box",
  "puzzle_lock",
  "adaptive_quiz",
  "memory_palace",
  "story_mode",
  "ttt",
  "real_life_challenge",
];

// Authors boss_meta (name, HP), boss_questions (q, accepted answers, dmg,
// text_fuzzy answer_spec) and the Practice Arc game ordering (up/down).
export function BossEditor({
  bossMeta,
  bossQuestions,
  practiceArc,
  onBossMetaChange,
  onBossQuestionsChange,
  onPracticeArcChange,
}: {
  bossMeta: DraftBossMeta;
  bossQuestions: DraftBossQuestion[];
  practiceArc: DraftPracticeArc;
  onBossMetaChange: (next: DraftBossMeta) => void;
  onBossQuestionsChange: (next: DraftBossQuestion[]) => void;
  onPracticeArcChange: (next: DraftPracticeArc) => void;
}) {
  const patchQuestion = (i: number, p: Partial<DraftBossQuestion>) =>
    onBossQuestionsChange(
      bossQuestions.map((q, idx) => (idx === i ? { ...q, ...p } : q))
    );

  const moveGame = (i: number, delta: number) => {
    const games = [...practiceArc.games];
    const j = i + delta;
    if (j < 0 || j >= games.length) return;
    [games[i], games[j]] = [games[j], games[i]];
    onPracticeArcChange({ games });
  };

  const toggleGame = (key: string) => {
    const has = practiceArc.games.includes(key);
    onPracticeArcChange({
      games: has
        ? practiceArc.games.filter((g) => g !== key)
        : [...practiceArc.games, key],
    });
  };

  return (
    <div className={s.editor}>
      <EditorCard title="Practice Arc order">
        <p className={s.help}>
          The arc plays games in this order, then the Boss (always last).
          Reorder with the arrows; toggle games on or off below.
        </p>
        <ol className={s.arcList}>
          {practiceArc.games.map((key, i) => (
            <li key={key} className={s.arcRow}>
              <span className={s.arcIndex}>{i + 1}</span>
              <span className={s.arcLabel}>{gameLabel(key)}</span>
              <span className={s.arcControls}>
                <SmallButton onClick={() => moveGame(i, -1)} disabled={i === 0}>
                  ↑
                </SmallButton>
                <SmallButton
                  onClick={() => moveGame(i, 1)}
                  disabled={i === practiceArc.games.length - 1}
                >
                  ↓
                </SmallButton>
                <SmallButton tone="danger" onClick={() => toggleGame(key)}>
                  Remove
                </SmallButton>
              </span>
            </li>
          ))}
          <li className={`${s.arcRow} ${s.arcBoss}`}>
            <span className={s.arcIndex}>★</span>
            <span className={s.arcLabel}>Boss Arena (always last)</span>
          </li>
        </ol>
        <div className={s.gamePicker}>
          {ARC_GAME_KEYS.filter((k) => !practiceArc.games.includes(k)).map(
            (key) => (
              <SmallButton key={key} onClick={() => toggleGame(key)}>
                + {gameLabel(key)}
              </SmallButton>
            )
          )}
        </div>
      </EditorCard>

      <EditorCard title="Boss">
        <Field label="Boss name">
          <TextInput
            value={bossMeta.name}
            placeholder="e.g. The Equation Wraith"
            onChange={(name) => onBossMetaChange({ ...bossMeta, name })}
          />
        </Field>
        <Field label="Max HP" hint="Total damage to defeat the boss">
          <NumberInput
            value={bossMeta.starting_hp_override}
            min={10}
            step={10}
            onChange={(starting_hp_override) =>
              onBossMetaChange({ ...bossMeta, starting_hp_override })
            }
          />
        </Field>
      </EditorCard>

      <EditorCard
        title="Boss questions"
        actions={
          <SmallButton
            tone="primary"
            onClick={() =>
              onBossQuestionsChange([...bossQuestions, emptyBossQuestion()])
            }
          >
            + Add question
          </SmallButton>
        }
      >
        {bossQuestions.length === 0 && (
          <p className={s.empty}>No boss questions yet.</p>
        )}
        {bossQuestions.map((q, i) => (
          <div key={i} className={s.subItem}>
            <div className={s.subItemHead}>
              <span className={s.subItemLabel}>Question {i + 1}</span>
              <SmallButton
                tone="danger"
                onClick={() =>
                  onBossQuestionsChange(
                    bossQuestions.filter((_, idx) => idx !== i)
                  )
                }
              >
                Remove
              </SmallButton>
            </div>
            <Field label="Question">
              <TextArea
                value={q.q}
                rows={2}
                onChange={(text) => patchQuestion(i, { q: text })}
              />
            </Field>
            <Field
              label="Expected answer"
              hint="Graded fuzzily; the primary accepted answer"
            >
              <TextInput
                value={q.answer_spec.expected}
                onChange={(expected) => {
                  const ans = [expected, ...q.ans.slice(1)];
                  patchQuestion(i, {
                    answer_spec: { ...q.answer_spec, expected },
                    ans,
                  });
                }}
              />
            </Field>
            <Field label="Damage" hint="HP drained on a correct answer">
              <NumberInput
                value={q.dmg}
                min={1}
                step={5}
                onChange={(dmg) => patchQuestion(i, { dmg })}
              />
            </Field>
          </div>
        ))}
      </EditorCard>
    </div>
  );
}
