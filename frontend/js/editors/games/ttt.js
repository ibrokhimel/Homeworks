// frontend/js/editors/games/ttt.js
// Tic Tac Toe vs AI editor — knowledge-gated 3x3 grid mechanic.
// Contract storage: content_json.gb_ttt: [{ id?, q, correct, distractors: [d1, d2, d3] }]
//   - id: optional stable identifier (auto-assigned via TTTHelpers.ensureItemId on emit)
//   - q: question shown when student taps a cell (HTML, supports formulas + images)
//   - correct: the right answer (string, exact match against picked option)
//   - distractors: 3 plausible-but-wrong options
// Runtime cycles through items as the student takes turns. ~12-15 items covers
// a 3-game session safely (each game = 3-5 student moves on average).
//
// Mounting:
//   window.GameBreakEditors.ttt.render(container, data, onChange, context)
//     where context = { grade, subject, tier } (defaults used if omitted).
//     When data is empty and context.grade is a number, grade-band scaffolds
//     are injected automatically and emitted immediately via onChange.

(function () {
  "use strict";

  window.GameBreakEditors = window.GameBreakEditors || {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stripHtml(value) {
    return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? []));
  }

  function normalize(items) {
    return Array.isArray(items)
      ? items.map((item, idx) => {
          const distractors = Array.isArray(item?.distractors) ? item.distractors.slice(0, 3) : [];
          while (distractors.length < 3) distractors.push("");
          return {
            id: typeof item?.id === "string" ? item.id : "",
            q: typeof item?.q === "string" ? item.q : "",
            correct: typeof item?.correct === "string" ? item.correct : "",
            distractors: distractors.map((d) => (typeof d === "string" ? d : "")),
          };
        })
      : [];
  }

  function makeItem() {
    return { id: "", q: "", correct: "", distractors: ["", "", ""] };
  }

  // Walk items and ensure every item.id is populated before emitting.
  function toEmit(state) {
    return state.map((item, idx) => {
      const id = window.TTTHelpers
        ? window.TTTHelpers.ensureItemId(item, idx)
        : (item.id || ("ttt-" + (idx + 1)));
      return {
        id,
        q: item.q,
        correct: item.correct,
        distractors: item.distractors.slice(),
      };
    });
  }

  function emit(state, onChange) {
    onChange(clone(toEmit(state)));
  }

  function summary(value) {
    const stripped = stripHtml(value);
    return stripped || "—";
  }

  function countHint(state) {
    if (!state.length) return "Add 12–15 questions for a full 3-game session";
    if (state.length < 6)
      return `${state.length} question${state.length === 1 ? "" : "s"} — too few; runtime will cycle through this list as the student plays`;
    if (state.length < 12)
      return `${state.length} questions — ok, but runtime will start cycling on long games`;
    return `${state.length} questions — comfortable for a 3-game session`;
  }

  // Derive grade band from context (falls back gracefully when TTTHelpers
  // isn't loaded yet — this should never happen in production since
  // _ttt-helpers.js loads before this file).
  function bandFromContext(ctx) {
    if (!window.TTTHelpers) return "L3-L4";
    return window.TTTHelpers.gradeBandFor(ctx.grade);
  }

  // Render per-item validation errors as inline messages.
  function renderItemErrors(item) {
    if (!window.TTTHelpers) return "";
    const result = window.TTTHelpers.validateItem(item);
    if (result.ok) return "";
    return result.errors
      .map((e) => `<p class="sf-hint sf-hint-warning ttt-validation-error">${escapeHtml(e)}</p>`)
      .join("");
  }

  function render(container, data, onChange, context) {
    if (!container) return;

    const ctx =
      context && typeof context === "object"
        ? { grade: context.grade, subject: context.subject, tier: context.tier }
        : {};

    let state = normalize(data);

    // -------------------------------------------------------------------------
    // Grade-band scaffold injection
    // If the list is empty AND we have a numeric grade, seed with 3 starters.
    // -------------------------------------------------------------------------
    let scaffoldBadge = "";
    if (
      state.length === 0 &&
      ctx.grade != null &&
      Number.isFinite(Number(ctx.grade)) &&
      window.TTTHelpers
    ) {
      const band = bandFromContext(ctx);
      const scaffolded = window.TTTHelpers.scaffoldForBand(band);
      state = normalize(scaffolded);
      scaffoldBadge = `<p class="ttt-scaffold-badge muted-text" style="font-style:italic;">
        Suggested for Grade ${Number(ctx.grade)} · ${escapeHtml(window.TTTHelpers.pisaHintForBand(band))}
      </p>`;
      // Emit immediately so the homework saves with scaffolds.
      emit(state, onChange);
    }

    const band = bandFromContext(ctx);
    const pisaHint = window.TTTHelpers ? window.TTTHelpers.pisaHintForBand(band) : "";

    function repaint() {
      container.innerHTML = `
        <div class="editor-list">
          <section class="editor-card">
            <div class="editor-header compact-header">
              <div>
                <p class="eyebrow">Tic Tac Toe vs AI</p>
                <h3>${state.length} question${state.length === 1 ? "" : "s"}</h3>
              </div>
              <button class="btn btn-primary js-add-item" type="button">Add question</button>
            </div>
            <p class="muted-text">
              Knowledge-gated 3×3 grid. Student taps a cell, answers the next question — correct answer lands the X on their cell, wrong answer scatters it to a random empty cell. AI plays optimally (minimax). 3 games per session.
            </p>
            <p class="muted-text" style="font-style:italic;">${escapeHtml(countHint(state))}</p>
            ${scaffoldBadge}
            ${pisaHint ? `<p class="ttt-band-badge muted-text" style="font-style:italic;">${escapeHtml(pisaHint)}</p>` : ""}
          </section>

          ${
            state.length
              ? state
                  .map(
                    (item, index) => `
                      <section class="editor-card nested-card" data-index="${index}">
                        <div class="editor-header compact-header">
                          <div>
                            <p class="eyebrow">Question ${index + 1}${item.id ? ` · <code>${escapeHtml(item.id)}</code>` : ""}</p>
                            <h3>${escapeHtml(summary(item.q))}</h3>
                          </div>
                          <button class="btn btn-danger js-remove-item" type="button">Remove</button>
                        </div>

                        ${renderItemErrors(item)}

                        <div class="editor-grid">
                          <div class="field full-span">
                            <span>Question</span>
                            <div class="js-rich-host" data-key="q" data-index="${index}"></div>
                          </div>

                          <div class="field full-span">
                            <span>Correct answer</span>
                            <input class="js-field ttt-correct-field ${renderCorrectFieldClass(item)}" data-key="correct" type="text" value="${escapeHtml(item.correct)}" placeholder="The right option" />
                          </div>

                          <div class="field">
                            <span>Distractor 1</span>
                            <input class="js-distractor ttt-distractor-field ${renderDistractorClass(item, 0)}" data-d="0" type="text" value="${escapeHtml(item.distractors[0])}" placeholder="Plausible wrong answer" />
                          </div>
                          <div class="field">
                            <span>Distractor 2</span>
                            <input class="js-distractor ttt-distractor-field ${renderDistractorClass(item, 1)}" data-d="1" type="text" value="${escapeHtml(item.distractors[1])}" placeholder="Plausible wrong answer" />
                          </div>
                          <div class="field">
                            <span>Distractor 3</span>
                            <input class="js-distractor ttt-distractor-field ${renderDistractorClass(item, 2)}" data-d="2" type="text" value="${escapeHtml(item.distractors[2])}" placeholder="Plausible wrong answer" />
                          </div>
                        </div>
                      </section>
                    `,
                  )
                  .join("")
              : `<div class="empty-state glass-card inline-empty">
                  <div class="empty-orb" aria-hidden="true">⭕</div>
                  <h3>No questions yet</h3>
                  <p>Add MC questions tied to this lesson. Each one gates one tile placement.</p>
                  <button class="btn btn-primary js-add-item" type="button">Add first question</button>
                </div>`
          }
        </div>
      `;

      if (window.RichField && window.RichField.create) {
        container.querySelectorAll(".js-rich-host").forEach((host) => {
          const index = Number(host.dataset.index);
          const key = host.dataset.key;
          if (!Number.isFinite(index) || !key) return;
          const initial = state[index]?.[key] || "";
          const editor = window.RichField.create({
            value: initial,
            placeholder: "Question (text, formula, image)…",
            compact: true,
            onChange: (html) => {
              if (!state[index]) return;
              state[index][key] = html;
              emit(state, onChange);
            },
          });
          host.appendChild(editor);
        });
      }
    }

    // Returns "ttt-field-error" CSS class when the correct field has a validation problem.
    function renderCorrectFieldClass(item) {
      if (!window.TTTHelpers) return "";
      const result = window.TTTHelpers.validateItem(item);
      if (result.ok) return "";
      const hasCorrectError = result.errors.some((e) => e.toLowerCase().includes("correct"));
      return hasCorrectError ? "ttt-field-error" : "";
    }

    // Returns "ttt-field-error" class when a specific distractor slot is invalid.
    function renderDistractorClass(item, dIdx) {
      if (!window.TTTHelpers) return "";
      const result = window.TTTHelpers.validateItem(item);
      if (result.ok) return "";
      const label = `Distractor ${dIdx + 1}`;
      const hasDError = result.errors.some((e) => e.includes(label));
      return hasDError ? "ttt-field-error" : "";
    }

    container.oninput = (event) => {
      const wrap = event.target.closest("[data-index]");
      if (!wrap) return;
      const index = Number(wrap.dataset.index);
      if (!Number.isFinite(index) || !state[index]) return;
      const field = event.target.closest(".js-field");
      if (field) {
        state[index][field.dataset.key] = field.value;
        emit(state, onChange);
        return;
      }
      const distractor = event.target.closest(".js-distractor");
      if (distractor) {
        const d = Number(distractor.dataset.d);
        if (Number.isFinite(d) && d >= 0 && d < 3) {
          state[index].distractors[d] = distractor.value;
          emit(state, onChange);
        }
      }
    };

    container.onclick = (event) => {
      if (event.target.closest(".js-add-item")) {
        state.push(makeItem());
        emit(state, onChange);
        repaint();
        return;
      }
      if (event.target.closest(".js-remove-item")) {
        const index = Number(event.target.closest("[data-index]")?.dataset.index);
        if (!Number.isFinite(index)) return;
        state.splice(index, 1);
        emit(state, onChange);
        repaint();
      }
    };

    repaint();
    if (window.EditorUtils) {
      window.EditorUtils.bindPasteNormalizer(container);
    }
  }

  window.GameBreakEditors.ttt = { render };
})();
