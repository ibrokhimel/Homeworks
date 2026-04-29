// frontend/js/editors/games/ttt.js
// Tic Tac Toe vs AI editor — knowledge-gated 3x3 grid mechanic.
// Contract storage: content_json.gb_ttt: [{ q, correct, distractors: [d1, d2, d3] }]
//   - q: question shown when student taps a cell (HTML, supports formulas + images)
//   - correct: the right answer (string, exact match against picked option)
//   - distractors: 3 plausible-but-wrong options
// Runtime cycles through items as the student takes turns. ~12-15 items covers
// a 3-game session safely (each game = 3-5 student moves on average).

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
      ? items.map((item) => {
          const distractors = Array.isArray(item?.distractors) ? item.distractors.slice(0, 3) : [];
          while (distractors.length < 3) distractors.push("");
          return {
            q: typeof item?.q === "string" ? item.q : "",
            correct: typeof item?.correct === "string" ? item.correct : "",
            distractors: distractors.map((d) => (typeof d === "string" ? d : "")),
          };
        })
      : [];
  }

  function makeItem() {
    return { q: "", correct: "", distractors: ["", "", ""] };
  }

  function emit(state, onChange) {
    onChange(clone(state));
  }

  function summary(value) {
    const stripped = stripHtml(value);
    return stripped || "—";
  }

  function countHint(state) {
    if (!state.length) return "Add 12-15 questions for a full 3-game session";
    if (state.length < 6) return `${state.length} question${state.length === 1 ? "" : "s"} — too few; runtime will cycle through this list as the student plays`;
    if (state.length < 12) return `${state.length} questions — ok, but runtime will start cycling on long games`;
    return `${state.length} questions — comfortable for a 3-game session`;
  }

  function render(container, data, onChange) {
    const state = normalize(data);

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
          </section>

          ${
            state.length
              ? state
                  .map(
                    (item, index) => `
                      <section class="editor-card nested-card" data-index="${index}">
                        <div class="editor-header compact-header">
                          <div>
                            <p class="eyebrow">Question ${index + 1}</p>
                            <h3>${escapeHtml(summary(item.q))}</h3>
                          </div>
                          <button class="btn btn-danger js-remove-item" type="button">Remove</button>
                        </div>

                        <div class="editor-grid">
                          <div class="field full-span">
                            <span>Question</span>
                            <div class="js-rich-host" data-key="q" data-index="${index}"></div>
                          </div>

                          <div class="field full-span">
                            <span>Correct answer</span>
                            <input class="js-field" data-key="correct" type="text" value="${escapeHtml(item.correct)}" placeholder="The right option" />
                          </div>

                          <div class="field">
                            <span>Distractor 1</span>
                            <input class="js-distractor" data-d="0" type="text" value="${escapeHtml(item.distractors[0])}" placeholder="Plausible wrong answer" />
                          </div>
                          <div class="field">
                            <span>Distractor 2</span>
                            <input class="js-distractor" data-d="1" type="text" value="${escapeHtml(item.distractors[1])}" placeholder="Plausible wrong answer" />
                          </div>
                          <div class="field">
                            <span>Distractor 3</span>
                            <input class="js-distractor" data-d="2" type="text" value="${escapeHtml(item.distractors[2])}" placeholder="Plausible wrong answer" />
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
