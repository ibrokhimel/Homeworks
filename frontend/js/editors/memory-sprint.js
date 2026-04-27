// frontend/js/editors/memory-sprint.js
// Memory Sprint editor: edits content_json.memory_sprint.
//
// Card-styled like flashcards / adaptive-quiz.
// Data shape: [{type, prompt, subtitle, tags, explain, options[], correct}]
//   type     = "MC" | "TF" | "YNNG"  (legacy "KO" accepted on input, normalized to "MC")
//   prompt   = rich HTML (image/SVG/bold/italic supported via RichField)
//   subtitle = short single-line hint shown under prompt
//   tags     = "[Bloom: LX | PISA: LX]" string
//   explain  = rich HTML, post-answer explanation
//   options  = string[]; for TF locked to ["To'g'ri","Noto'g'ri"], YNNG locked to
//              ["Ha","Yo'q","Ma'lum emas"], MC freely edited (defaults 4 blanks)
//   correct  = 0-based index into options (clamped on type switch)

(function () {
  "use strict";

  window.Editors = window.Editors || {};

  const TYPES = [
    { value: "MC",   label: "Ko'p variantli (MC)" },
    { value: "TF",   label: "To'g'ri / Noto'g'ri (TF)" },
    { value: "YNNG", label: "Ha / Yo'q / Ma'lum emas (YNNG)" },
  ];

  const TYPE_COLORS = {
    MC:   { bg: "rgba(0, 122, 255, 0.14)",  fg: "#004fb3" },
    TF:   { bg: "rgba(52, 199, 89, 0.14)",  fg: "#1f7a3b" },
    YNNG: { bg: "rgba(175, 82, 222, 0.14)", fg: "#7028a6" },
  };

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

  function canonType(t) {
    // Accept legacy "KO" as MC.
    if (t === "KO") return "MC";
    return ["MC", "TF", "YNNG"].includes(t) ? t : "MC";
  }

  function defaultOptions(type) {
    if (type === "TF") return ["To'g'ri", "Noto'g'ri"];
    if (type === "YNNG") return ["Ha", "Yo'q", "Ma'lum emas"];
    return ["", "", "", ""];
  }

  function normalizeQuestion(question) {
    const type = canonType(question?.type);
    const fixed = type === "TF" || type === "YNNG";
    let options;
    if (fixed) {
      // For TF/YNNG, force the canonical localized labels.
      options = defaultOptions(type);
    } else {
      options = Array.isArray(question?.options) && question.options.length
        ? question.options.map((o) => String(o ?? ""))
        : defaultOptions(type);
    }
    const maxIndex = Math.max(0, options.length - 1);
    const parsedCorrect = Number(question?.correct);
    const correct = Number.isFinite(parsedCorrect)
      ? Math.min(Math.max(Math.trunc(parsedCorrect), 0), maxIndex)
      : 0;

    return {
      type,
      prompt: question?.prompt || "",
      subtitle: question?.subtitle || "",
      tags: question?.tags || "[Bloom: L1 | PISA: L1]",
      explain: question?.explain || "",
      options,
      correct,
    };
  }

  function normalize(data) {
    return Array.isArray(data) ? data.map(normalizeQuestion) : [];
  }

  function makeQuestion() {
    return normalizeQuestion({ type: "MC" });
  }

  function emit(state, onChange) {
    onChange(clone(state));
  }

  function renderTypeOptions(active) {
    return TYPES.map(
      (t) => `<option value="${t.value}" ${t.value === active ? "selected" : ""}>${escapeHtml(t.label)}</option>`,
    ).join("");
  }

  function renderOptionInputs(question, qIndex) {
    const fixed = question.type === "TF" || question.type === "YNNG";
    return question.options
      .map((option, optionIndex) => {
        const isCorrect = optionIndex === question.correct;
        return `
          <div class="ms-option-row ${isCorrect ? "is-correct" : ""}" data-option-index="${optionIndex}">
            <label class="ms-correct-pick" title="Mark as correct answer">
              <input
                class="js-correct-pick"
                type="radio"
                name="ms-correct-${qIndex}"
                value="${optionIndex}"
                ${isCorrect ? "checked" : ""}
              />
              <span class="ms-correct-dot" aria-hidden="true"></span>
              <span class="ms-correct-letter">${String.fromCharCode(65 + optionIndex)}</span>
            </label>
            <input
              class="js-option"
              type="text"
              value="${escapeHtml(option)}"
              placeholder="Option ${optionIndex + 1}"
              ${fixed ? "readonly" : ""}
            />
            ${
              !fixed
                ? `<button class="icon-btn js-remove-option" type="button" title="Remove option" aria-label="Remove option">×</button>`
                : `<span class="ms-locked-pill" title="Fixed by type">locked</span>`
            }
          </div>
        `;
      })
      .join("");
  }

  function injectStylesOnce() {
    if (document.getElementById("memory-sprint-inline-styles")) return;
    const style = document.createElement("style");
    style.id = "memory-sprint-inline-styles";
    style.textContent = `
      .ms-options-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 10px;
      }
      .ms-option-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid var(--border, #e5e5ea);
        border-radius: 12px;
        background: var(--surface, #fff);
        transition: border-color 120ms ease, background 120ms ease;
      }
      .ms-option-row.is-correct {
        border-color: #34c759;
        background: rgba(52, 199, 89, 0.08);
      }
      .ms-option-row > input.js-option {
        min-width: 0;
        width: 100%;
      }
      .ms-correct-pick {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        user-select: none;
        padding: 2px 4px;
      }
      .ms-correct-pick input[type="radio"] {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        pointer-events: none;
      }
      .ms-correct-dot {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid #c7c7cc;
        background: #fff;
        display: inline-block;
        position: relative;
        transition: border-color 120ms ease, background 120ms ease;
      }
      .ms-option-row.is-correct .ms-correct-dot {
        border-color: #34c759;
        background: #34c759;
      }
      .ms-option-row.is-correct .ms-correct-dot::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 6px;
        width: 4px;
        height: 8px;
        border: solid #fff;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
      .ms-correct-letter {
        font-weight: 700;
        font-size: 13px;
        color: #6e6e73;
        min-width: 14px;
        text-align: center;
      }
      .ms-option-row.is-correct .ms-correct-letter { color: #1f7a3b; }
      .ms-locked-pill {
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #8e8e93;
        background: rgba(142, 142, 147, 0.12);
        border-radius: 999px;
        padding: 2px 8px;
      }
      .ms-options-actions { margin-top: 10px; display: flex; gap: 8px; }
    `;
    document.head.appendChild(style);
  }

  function render(container, data, onChange) {
    injectStylesOnce();
    const state = normalize(data);

    function repaint() {
      container.innerHTML = `
        <div class="editor-list">
          <section class="editor-card">
            <div class="editor-header">
              <div>
                <p class="eyebrow">Memory Sprint</p>
                <h3>${state.length} question${state.length === 1 ? "" : "s"}</h3>
              </div>
              <button class="btn btn-primary js-add-question" type="button">Add question</button>
            </div>
            <p class="muted-text">
              Tap-only formats: <strong>MC</strong>, <strong>TF</strong>, <strong>YNNG</strong>. Mix at least two formats.
              Pick the correct answer with the green radio. Tags must stay like <strong>[Bloom: L1 | PISA: L1]</strong>.
            </p>
          </section>

          ${
            state.length
              ? state
                  .map((question, index) => {
                    const colors = TYPE_COLORS[question.type] || TYPE_COLORS.MC;
                    const summary = stripHtml(question.prompt) || "Untitled question";
                    const fixed = question.type === "TF" || question.type === "YNNG";
                    return `
                      <section class="flashcard-builder-card" data-index="${index}" style="--fc-bar:${colors.fg};">
                        <div class="fc-card-head">
                          <span class="fc-card-num">Question ${index + 1}</span>
                          <span class="fc-cluster-pill" style="background:${colors.bg};color:${colors.fg};">
                            ${escapeHtml(question.type)}
                          </span>
                          <button class="btn btn-ghost btn-small js-remove-question" type="button" aria-label="Remove question">Remove</button>
                        </div>

                        <div class="fc-face">
                          <span class="fc-face-label">Prompt</span>
                          <div class="js-rich-host" data-path="prompt" data-index="${index}"></div>
                        </div>

                        <div class="editor-grid" style="margin-top:10px;">
                          <label class="field full-span">
                            <span>Subtitle (optional, single line)</span>
                            <input
                              class="js-field"
                              data-key="subtitle"
                              type="text"
                              value="${escapeHtml(question.subtitle)}"
                              placeholder="Short hint shown under the prompt"
                            />
                          </label>
                        </div>

                        <div class="fc-divider" aria-hidden="true">
                          <span class="fc-divider-line"></span>
                          <span class="fc-divider-chip">↓ options ↓</span>
                          <span class="fc-divider-line"></span>
                        </div>

                        <div class="fc-face">
                          <div class="fc-face-label" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                            <span>Options &middot; pick the correct one</span>
                            <select class="js-type" data-index="${index}" style="font-size:12px;padding:4px 8px;border-radius:8px;">
                              ${renderTypeOptions(question.type)}
                            </select>
                          </div>
                          <div class="ms-options-grid">
                            ${renderOptionInputs(question, index)}
                          </div>
                          ${
                            !fixed
                              ? `<div class="ms-options-actions">
                                  <button class="btn btn-ghost btn-small js-add-option" type="button">+ Add option</button>
                                </div>`
                              : ""
                          }
                        </div>

                        <div class="fc-face">
                          <span class="fc-face-label">Explanation (shown after answer)</span>
                          <div class="js-rich-host" data-path="explain" data-index="${index}"></div>
                        </div>

                        <div class="fc-meta-row">
                          <div class="fc-meta-field">
                            <span class="fc-meta-label">Tags</span>
                            <input
                              class="js-field"
                              data-key="tags"
                              type="text"
                              value="${escapeHtml(question.tags)}"
                              placeholder="[Bloom: L1 | PISA: L1]"
                            />
                          </div>
                        </div>
                      </section>
                    `;
                  })
                  .join("")
              : `<div class="empty-state glass-card inline-empty">
                  <div class="empty-orb" aria-hidden="true">⚡</div>
                  <h3>No sprint questions yet</h3>
                  <p>Add quick recall questions for the memory sprint stage.</p>
                  <button class="btn btn-primary js-add-question" type="button">Add first question</button>
                </div>`
          }
        </div>
      `;

      mountRichHosts();
    }

    function mountRichHosts() {
      if (!window.RichField || !window.RichField.create) return;
      container.querySelectorAll(".js-rich-host").forEach((host) => {
        const index = Number(host.dataset.index);
        const path = host.dataset.path;
        if (!Number.isFinite(index) || !path || !state[index]) return;
        const initial = state[index][path] || "";
        const placeholder = path === "prompt"
          ? "Question prompt — supports image/SVG/bold/italic..."
          : "Why this answer is correct (visual or bolded keywords welcome)...";
        const mini = window.RichField.create({
          value: initial,
          placeholder,
          compact: true,
          onChange: (html) => {
            if (!state[index]) return;
            state[index][path] = html;
            syncAndEmit();
          },
        });
        host.appendChild(mini);
      });
    }

    function syncAndEmit() {
      state.forEach((question) => {
        const max = Math.max(0, question.options.length - 1);
        if (!Number.isFinite(question.correct) || question.correct < 0 || question.correct > max) {
          question.correct = 0;
        }
      });
      emit(state, onChange);
    }

    function refresh() {
      repaint();
    }

    container.oninput = (event) => {
      const target = event.target;

      const field = target.closest && target.closest(".js-field");
      if (field) {
        const wrap = field.closest("[data-index]");
        if (!wrap) return;
        const index = Number(wrap.dataset.index);
        if (!Number.isFinite(index) || !state[index]) return;
        state[index][field.dataset.key] = field.value;
        syncAndEmit();
        return;
      }

      const option = target.closest && target.closest(".js-option");
      if (option && !option.readOnly) {
        const wrap = option.closest("[data-index]");
        const optWrap = option.closest("[data-option-index]");
        if (!wrap || !optWrap) return;
        const questionIndex = Number(wrap.dataset.index);
        const optionIndex = Number(optWrap.dataset.optionIndex);
        if (!Number.isFinite(questionIndex) || !Number.isFinite(optionIndex)) return;
        state[questionIndex].options[optionIndex] = option.value;
        syncAndEmit();
      }
    };

    container.onchange = (event) => {
      const target = event.target;

      // Type switch — re-shape options and clamp correct.
      const typeSelect = target.closest && target.closest(".js-type");
      if (typeSelect) {
        const wrap = typeSelect.closest("[data-index]");
        if (!wrap) return;
        const index = Number(wrap.dataset.index);
        if (!Number.isFinite(index) || !state[index]) return;
        const nextType = canonType(typeSelect.value);
        const wasFixed = state[index].type === "TF" || state[index].type === "YNNG";
        const nextFixed = nextType === "TF" || nextType === "YNNG";
        state[index].type = nextType;
        if (nextFixed) {
          state[index].options = defaultOptions(nextType);
        } else if (wasFixed) {
          // Switching from TF/YNNG → MC: seed 4 blanks.
          state[index].options = defaultOptions("MC");
        }
        // Clamp correct.
        const max = Math.max(0, state[index].options.length - 1);
        if (state[index].correct > max) state[index].correct = 0;
        syncAndEmit();
        refresh();
        return;
      }

      // Correct picker (radio).
      const correctPick = target.closest && target.closest(".js-correct-pick");
      if (correctPick) {
        const wrap = correctPick.closest("[data-index]");
        if (!wrap) return;
        const index = Number(wrap.dataset.index);
        if (!Number.isFinite(index) || !state[index]) return;
        const value = Number(correctPick.value);
        if (!Number.isFinite(value)) return;
        state[index].correct = value;
        syncAndEmit();
        // Light repaint — only update is-correct class on rows.
        const rows = wrap.querySelectorAll(".ms-option-row");
        rows.forEach((row) => {
          const ri = Number(row.dataset.optionIndex);
          row.classList.toggle("is-correct", ri === value);
          const radio = row.querySelector(".js-correct-pick");
          if (radio) radio.checked = ri === value;
        });
      }
    };

    container.onclick = (event) => {
      const target = event.target;

      if (target.closest(".js-add-question")) {
        state.push(makeQuestion());
        syncAndEmit();
        refresh();
        return;
      }

      if (target.closest(".js-remove-question")) {
        const wrap = target.closest("[data-index]");
        if (!wrap) return;
        const index = Number(wrap.dataset.index);
        if (!Number.isFinite(index)) return;
        state.splice(index, 1);
        syncAndEmit();
        refresh();
        return;
      }

      if (target.closest(".js-add-option")) {
        const wrap = target.closest("[data-index]");
        if (!wrap) return;
        const index = Number(wrap.dataset.index);
        if (!Number.isFinite(index) || !state[index]) return;
        if (state[index].type !== "MC") return;
        state[index].options.push("");
        syncAndEmit();
        refresh();
        return;
      }

      if (target.closest(".js-remove-option")) {
        const wrap = target.closest("[data-index]");
        const optWrap = target.closest("[data-option-index]");
        if (!wrap || !optWrap) return;
        const questionIndex = Number(wrap.dataset.index);
        const optionIndex = Number(optWrap.dataset.optionIndex);
        if (!Number.isFinite(questionIndex) || !Number.isFinite(optionIndex)) return;
        if (state[questionIndex].type !== "MC") return;
        state[questionIndex].options.splice(optionIndex, 1);
        if (!state[questionIndex].options.length) state[questionIndex].options.push("");
        if (state[questionIndex].correct >= state[questionIndex].options.length) {
          state[questionIndex].correct = 0;
        }
        syncAndEmit();
        refresh();
      }
    };

    refresh();
    if (window.EditorUtils) {
      window.EditorUtils.bindPasteNormalizer(container);
      window.EditorUtils.bindStrictPasteNormalizer(
        container,
        'input[type="text"]',
      );
    }
  }

  window.Editors.memorySprint = { render };
})();
