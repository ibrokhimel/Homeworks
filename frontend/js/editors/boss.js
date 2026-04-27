// frontend/js/editors/boss.js
// Boss editor: edits content_json.boss_questions.

(function () {
  "use strict";

  window.Editors = window.Editors || {};

  const DAMAGE_VALUES = [10, 20, 30];

  function parseTags(raw) {
    const stripped = String(raw || "")
      .trim()
      .replace(/^\[/, "")
      .replace(/\]$/, "");

    const parts = stripped.split("|").map((segment) => segment.trim()).filter(Boolean);

    const result = { bloom: "", pisa: "", damage: "" };
    for (const part of parts) {
      const [keyRaw, ...valueParts] = part.split(":");
      const key = String(keyRaw || "").trim().toLowerCase();
      const value = valueParts.join(":").trim();

      if (key === "bloom") result.bloom = value;
      else if (key === "pisa") result.pisa = value;
      else if (key === "damage") result.damage = value;
    }
    return result;
  }

  function buildTags(bloom, pisa, dmg) {
    const bloomLabel = bloom || "L2";
    const pisaLabel = pisa || "L2";
    return `[Bloom: ${bloomLabel} | PISA: ${pisaLabel} | Damage: -${dmg} HP]`;
  }

  function updateDamageInTags(existingTags, dmg) {
    const parsed = parseTags(existingTags);
    return buildTags(parsed.bloom, parsed.pisa, dmg);
  }

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

  function normalizeQuestion(question) {
    const dmg = DAMAGE_VALUES.includes(Number(question?.dmg)) ? Number(question.dmg) : 10;

    return {
      q: question?.q || "",
      tags: question?.tags || `[Bloom: L2 | PISA: L2 | Damage: -${dmg} HP]`,
      ans: Array.isArray(question?.ans) && question.ans.length ? question.ans : [""],
      hint: question?.hint || "",
      dmg,
    };
  }

  function normalize(data) {
    return Array.isArray(data) ? data.map(normalizeQuestion) : [];
  }

  function makeQuestion() {
    return normalizeQuestion({});
  }

  function emit(state, onChange) {
    onChange(clone(state));
  }

  function renderDamageOptions(active) {
    return DAMAGE_VALUES.map(
      (value) => `<option value="${value}" ${value === Number(active) ? "selected" : ""}>${value} HP</option>`
    ).join("");
  }

  function renderAnswers(question) {
    return question.ans
      .map(
        (answer, answerIndex) => `
          <div class="option-row" data-answer-index="${answerIndex}">
            <input class="js-answer" type="text" value="${escapeHtml(answer)}" placeholder="Accepted answer ${answerIndex + 1}" />
            <button class="icon-btn js-remove-answer" type="button" title="Remove answer">×</button>
          </div>
        `
      )
      .join("");
  }

  function render(container, data, onChange) {
    const state = normalize(data);

    function repaint() {
      container.innerHTML = `
        <div class="editor-list">
          <section class="editor-card">
            <div class="editor-header">
              <div>
                <p class="eyebrow">Final Challenge</p>
                <h3>${state.length} boss question${state.length === 1 ? "" : "s"}</h3>
              </div>
              <button class="btn btn-primary js-add-question" type="button">Add boss question</button>
            </div>
            <p class="muted-text">
              Boss questions map to <strong>BOSS_QUESTIONS</strong>. Damage should usually be 10, 20, or 30 HP.
            </p>
          </section>

          ${
            state.length
              ? state
                  .map(
                    (question, index) => `
                      <section class="editor-card" data-index="${index}">
                        <div class="editor-header">
                          <div>
                            <p class="eyebrow">Boss ${index + 1}</p>
                            <h3>${escapeHtml(stripHtml(question.q) || "Untitled boss question")}</h3>
                          </div>
                          <button class="btn btn-danger js-remove-question" type="button">Remove</button>
                        </div>

                        <div class="editor-grid">
                          <label class="field full-span">
                            <span>Question</span>
                            <div class="js-rich-host" data-key="q" data-index="${index}"></div>
                          </label>

                          <label class="field">
                            <span>Damage</span>
                            <select class="js-dmg">
                              ${renderDamageOptions(question.dmg)}
                            </select>
                          </label>

                          <label class="field">
                            <span>Tags</span>
                            <input class="js-field" data-key="tags" type="text" value="${escapeHtml(question.tags)}" />
                          </label>

                          <label class="field full-span">
                            <span>Hint</span>
                            <div class="js-rich-host" data-key="hint" data-index="${index}"></div>
                          </label>
                        </div>

                        <div class="editor-card nested-card">
                          <div class="editor-header compact-header">
                            <div>
                              <p class="eyebrow">Accepted answers</p>
                              <h3>${question.ans.length} answer${question.ans.length === 1 ? "" : "s"}</h3>
                            </div>
                            <button class="btn btn-ghost js-add-answer" type="button">Add answer</button>
                          </div>
                          <div class="editor-list">
                            ${renderAnswers(question)}
                          </div>
                        </div>
                      </section>
                    `
                  )
                  .join("")
              : `<div class="empty-state glass-card inline-empty">
                  <div class="empty-orb" aria-hidden="true">👾</div>
                  <h3>No boss questions yet</h3>
                  <p>Add final challenge questions for the homework battle.</p>
                  <button class="btn btn-primary js-add-question" type="button">Add first boss question</button>
                </div>`
          }
        </div>
      `;

      // Mount RichField editors for `q` (boss question text) and `hint`.
      if (window.RichField) {
        container.querySelectorAll(".js-rich-host").forEach((host) => {
          const index = Number(host.dataset.index);
          const key = host.dataset.key;
          if (!Number.isFinite(index) || !key) return;
          const initial = state[index] ? state[index][key] : "";
          const placeholder = key === "hint" ? "Hint for student..." : "Boss question...";
          const mini = window.RichField.create({
            value: initial || "",
            placeholder,
            compact: true,
            onChange: (html) => {
              if (!state[index]) return;
              state[index][key] = html;
              syncAndEmit();
            },
          });
          host.appendChild(mini);
        });
      }
    }

    function syncAndEmit() {
      state.forEach((question) => {
        if (!Array.isArray(question.ans) || !question.ans.length) question.ans = [""];
      });
      emit(state, onChange);
    }

    container.oninput = (event) => {
      const field = event.target.closest(".js-field");
      const answer = event.target.closest(".js-answer");

      if (field) {
        const index = Number(field.closest("[data-index]")?.dataset.index);
        state[index][field.dataset.key] = field.value;
        syncAndEmit();
        return;
      }

      if (answer) {
        const questionIndex = Number(answer.closest("[data-index]")?.dataset.index);
        const answerIndex = Number(answer.closest("[data-answer-index]")?.dataset.answerIndex);
        state[questionIndex].ans[answerIndex] = answer.value;
        syncAndEmit();
      }
    };

    container.onchange = (event) => {
      const dmgSelect = event.target.closest(".js-dmg");
      if (!dmgSelect) return;

      const index = Number(dmgSelect.closest("[data-index]")?.dataset.index);
      state[index].dmg = Number(dmgSelect.value);
      state[index].tags = updateDamageInTags(state[index].tags, state[index].dmg);

      syncAndEmit();
      repaint();
    };

    container.onclick = (event) => {
      if (event.target.closest(".js-add-question")) {
        state.push(makeQuestion());
        syncAndEmit();
        repaint();
        return;
      }

      if (event.target.closest(".js-remove-question")) {
        const index = Number(event.target.closest("[data-index]")?.dataset.index);
        state.splice(index, 1);
        syncAndEmit();
        repaint();
        return;
      }

      if (event.target.closest(".js-add-answer")) {
        const index = Number(event.target.closest("[data-index]")?.dataset.index);
        state[index].ans.push("");
        syncAndEmit();
        repaint();
        return;
      }

      if (event.target.closest(".js-remove-answer")) {
        const questionIndex = Number(event.target.closest("[data-index]")?.dataset.index);
        const answerIndex = Number(event.target.closest("[data-answer-index]")?.dataset.answerIndex);
        state[questionIndex].ans.splice(answerIndex, 1);

        if (!state[questionIndex].ans.length) {
          state[questionIndex].ans.push("");
        }

        syncAndEmit();
        repaint();
      }
    };

    repaint();
    if (window.EditorUtils) {
      window.EditorUtils.bindPasteNormalizer(container);
      window.EditorUtils.bindStrictPasteNormalizer(
        container,
        'input[data-key="tags"], input.js-answer'
      );
    }
  }

  window.Editors.boss = { render };
})();
