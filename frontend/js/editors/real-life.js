// frontend/js/editors/real-life.js
// Real Life editor: edits content_json.real_life.

(function () {
  "use strict";

  window.Editors = window.Editors || {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Strip HTML tags for preview in section header (rich-field HTML shouldn't render
  // inside the card header h3).
  function stripHtml(value) {
    return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function textQuestion(question) {
    return {
      prompt: question?.prompt || "",
      ans: question?.ans || "",
      fb: question?.fb || "",
      capture: Boolean(question?.capture),
    };
  }

  function fieldsQuestion(question) {
    return {
      prompt: question?.prompt || "",
      fields:
        Array.isArray(question?.fields) && question.fields.length
          ? question.fields.map((field) => ({
              id: field?.id || "",
              label: field?.label || "",
              ans: field?.ans || "",
            }))
          : [{ id: "", label: "", ans: "" }],
      fb: question?.fb || "",
      capture: Boolean(question?.capture),
    };
  }

  function openQuestion(question) {
    return {
      prompt: question?.prompt || "",
      open: true,
      fb: question?.fb || "",
      capture: Boolean(question?.capture),
    };
  }

  function renderCaptureToggle(question) {
    const on = Boolean(question.capture);
    return `
      <label class="field full-span capture-toggle" style="margin-top:4px;">
        <span>📓 Notebook Capture</span>
        <div class="capture-toggle-row">
          <button type="button" class="js-capture-btn ${on ? "on" : "off"}" aria-pressed="${on}">
            <span class="capture-dot"></span>
            <span class="capture-label">${on ? "Required — student must upload notebook photo" : "Off — typed answer only"}</span>
          </button>
        </div>
      </label>
    `;
  }

  function normalize(data) {
    const safe = data && typeof data === "object" ? data : {};

    return {
      badge: safe.badge || "",
      story: safe.story || "",
      q1: textQuestion(safe.q1),
      q2: fieldsQuestion(safe.q2),
      q3: textQuestion(safe.q3),
      q4: fieldsQuestion(safe.q4),
      q5: openQuestion(safe.q5),
      q6: textQuestion(safe.q6),
      endTitle: safe.endTitle || "",
      endSub: safe.endSub || "",
    };
  }

  function emit(state, onChange) {
    onChange(clone(state));
  }

  function makeField() {
    return { id: "", label: "", ans: "" };
  }

  function renderFields(questionKey, question) {
    return question.fields
      .map(
        (field, index) => `
          <div class="editor-card nested-card" data-question="${questionKey}" data-field-index="${index}">
            <div class="editor-header compact-header">
              <div>
                <p class="eyebrow">Field ${index + 1}</p>
                <h3>${escapeHtml(field.label || "Untitled field")}</h3>
              </div>
              <button class="btn btn-danger js-remove-field" type="button">Remove</button>
            </div>

            <div class="editor-grid">
              <label class="field">
                <span>ID</span>
                <input class="js-field-row" data-key="id" type="text" value="${escapeHtml(field.id)}" placeholder="m" />
              </label>

              <label class="field">
                <span>Label</span>
                <input class="js-field-row" data-key="label" type="text" value="${escapeHtml(field.label)}" placeholder="Label" />
              </label>

              <label class="field full-span">
                <span>Answer</span>
                <input class="js-field-row" data-key="ans" type="text" value="${escapeHtml(field.ans)}" placeholder="Correct answer" />
              </label>
            </div>
          </div>
        `
      )
      .join("");
  }

  function renderTextQuestion(key, label, question) {
    return `
      <section class="editor-card" data-question="${key}">
        <div class="editor-header">
          <div>
            <p class="eyebrow">${label}</p>
            <h3>${escapeHtml(stripHtml(question.prompt) || "Untitled prompt")}</h3>
          </div>
        </div>

        <div class="editor-grid">
          <label class="field full-span">
            <span>Prompt</span>
            <div class="js-rich-host" data-path="${key}.prompt"></div>
          </label>

          <label class="field full-span">
            <span>Answer</span>
            <input class="js-q-field" data-key="ans" type="text" value="${escapeHtml(question.ans)}" placeholder="Correct answer" />
          </label>

          <label class="field full-span">
            <span>Feedback</span>
            <div class="js-rich-host" data-path="${key}.fb"></div>
          </label>

          ${renderCaptureToggle(question)}
        </div>
      </section>
    `;
  }

  function renderFieldsQuestion(key, label, question) {
    return `
      <section class="editor-card" data-question="${key}">
        <div class="editor-header">
          <div>
            <p class="eyebrow">${label}</p>
            <h3>${escapeHtml(stripHtml(question.prompt) || "Untitled prompt")}</h3>
          </div>
          <button class="btn btn-ghost js-add-field" type="button">Add field</button>
        </div>

        <div class="editor-grid">
          <label class="field full-span">
            <span>Prompt</span>
            <div class="js-rich-host" data-path="${key}.prompt"></div>
          </label>

          <label class="field full-span">
            <span>Feedback</span>
            <div class="js-rich-host" data-path="${key}.fb"></div>
          </label>

          ${renderCaptureToggle(question)}
        </div>

        <div class="editor-list">
          ${renderFields(key, question)}
        </div>
      </section>
    `;
  }

  function renderOpenQuestion(key, label, question) {
    return `
      <section class="editor-card" data-question="${key}">
        <div class="editor-header">
          <div>
            <p class="eyebrow">${label}</p>
            <h3>${escapeHtml(stripHtml(question.prompt) || "Untitled prompt")}</h3>
          </div>
        </div>

        <div class="editor-grid">
          <label class="field full-span">
            <span>Prompt</span>
            <div class="js-rich-host" data-path="${key}.prompt"></div>
          </label>

          <label class="field">
            <span>Open</span>
            <input type="text" value="true" readonly />
          </label>

          <label class="field full-span">
            <span>Feedback</span>
            <div class="js-rich-host" data-path="${key}.fb"></div>
          </label>

          ${renderCaptureToggle(question)}
        </div>
      </section>
    `;
  }

  function getByPath(obj, path) {
    const parts = String(path || "").split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function setByPath(obj, path, value) {
    const parts = String(path || "").split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") {
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function mountRichHosts(container, state, onSync) {
    if (!window.RichField) return;
    container.querySelectorAll(".js-rich-host").forEach((host) => {
      const path = host.dataset.path;
      if (!path) return;
      const initial = getByPath(state, path);
      let placeholder = "Question prompt...";
      if (path === "story") placeholder = "Multi-line scenario story...";
      else if (path.endsWith(".fb")) placeholder = "Feedback shown after answer...";
      const mini = window.RichField.create({
        value: initial || "",
        placeholder,
        compact: path !== "story",
        onChange: (html) => {
          setByPath(state, path, html);
          onSync();
        },
      });
      host.appendChild(mini);
    });
  }

  function repaint(container, state) {
    container.innerHTML = `
      <div class="editor-list">
        <section class="editor-card">
          <div class="editor-header">
            <div>
              <p class="eyebrow">Real Life</p>
              <h3>Scenario and 6 questions</h3>
            </div>
          </div>

          <div class="editor-grid">
            <label class="field">
              <span>Badge</span>
              <input class="js-root-field" data-key="badge" type="text" value="${escapeHtml(state.badge)}" placeholder="VAZIFA · Scenario name" />
            </label>

            <label class="field full-span">
              <span>Story</span>
              <div class="js-rich-host" data-path="story"></div>
            </label>

            <label class="field">
              <span>End title</span>
              <input class="js-root-field" data-key="endTitle" type="text" value="${escapeHtml(state.endTitle)}" placeholder="Great finish title" />
            </label>

            <label class="field">
              <span>End subtitle</span>
              <input class="js-root-field" data-key="endSub" type="text" value="${escapeHtml(state.endSub)}" placeholder="Final encouragement" />
            </label>
          </div>
        </section>

        ${renderTextQuestion("q1", "Q1 · Direct answer", state.q1)}
        ${renderFieldsQuestion("q2", "Q2 · Multi-field", state.q2)}
        ${renderTextQuestion("q3", "Q3 · Direct answer", state.q3)}
        ${renderFieldsQuestion("q4", "Q4 · Multi-field", state.q4)}
        ${renderOpenQuestion("q5", "Q5 · Open response", state.q5)}
        ${renderTextQuestion("q6", "Q6 · Direct answer", state.q6)}
      </div>
    `;
  }

  function render(container, data, onChange) {
    const state = normalize(data);

    function sync() {
      ["q2", "q4"].forEach((key) => {
        if (!Array.isArray(state[key].fields) || !state[key].fields.length) {
          state[key].fields = [makeField()];
        }
      });

      state.q5.open = true;
      emit(state, onChange);
    }

    function refresh() {
      repaint(container, state);
      mountRichHosts(container, state, sync);
    }

    container.oninput = (event) => {
      const rootField = event.target.closest(".js-root-field");
      const qField = event.target.closest(".js-q-field");
      const rowField = event.target.closest(".js-field-row");

      if (rootField) {
        state[rootField.dataset.key] = rootField.value;
        sync();
        return;
      }

      if (qField) {
        const qKey = qField.closest("[data-question]")?.dataset.question;
        state[qKey][qField.dataset.key] = qField.value;
        sync();
        return;
      }

      if (rowField) {
        const qKey = rowField.closest("[data-question]")?.dataset.question;
        const fieldIndex = Number(rowField.closest("[data-field-index]")?.dataset.fieldIndex);
        state[qKey].fields[fieldIndex][rowField.dataset.key] = rowField.value;
        sync();
      }
    };

    container.onclick = (event) => {
      const captureBtn = event.target.closest(".js-capture-btn");
      if (captureBtn) {
        const qKey = captureBtn.closest("[data-question]")?.dataset.question;
        if (qKey && state[qKey]) {
          state[qKey].capture = !state[qKey].capture;
          sync();
          refresh();
        }
        return;
      }

      if (event.target.closest(".js-add-field")) {
        const qKey = event.target.closest("[data-question]")?.dataset.question;
        state[qKey].fields.push(makeField());
        sync();
        refresh();
        return;
      }

      if (event.target.closest(".js-remove-field")) {
        const qKey = event.target.closest("[data-question]")?.dataset.question;
        const fieldIndex = Number(event.target.closest("[data-field-index]")?.dataset.fieldIndex);
        state[qKey].fields.splice(fieldIndex, 1);
        if (!state[qKey].fields.length) state[qKey].fields.push(makeField());
        sync();
        refresh();
      }
    };

    refresh();
    if (window.EditorUtils) {
      window.EditorUtils.bindPasteNormalizer(container);
      window.EditorUtils.bindStrictPasteNormalizer(
        container,
        '.js-q-field[data-key="ans"], .js-field-row[data-key="ans"]'
      );
    }
  }

  window.Editors.realLife = { render };
})();
