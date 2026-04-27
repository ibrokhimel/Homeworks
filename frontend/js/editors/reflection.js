// frontend/js/editors/reflection.js
// Reflection editor: edits content_json.reflection.

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

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function normalize(data) {
    const safe = data && typeof data === "object" ? data : {};

    return {
      summary: safe.summary || "",
      question: safe.question || "",
      spaced_rep: safe.spaced_rep || "",
      closing: safe.closing || "",
    };
  }

  function emit(state, onChange) {
    onChange(clone(state));
  }

  function render(container, data, onChange) {
    const state = normalize(data);

    function repaint() {
      container.innerHTML = `
        <div class="editor-list">
          <section class="editor-card">
            <div class="editor-header">
              <div>
                <p class="eyebrow">Reflection</p>
                <h3>Final summary and spaced repetition</h3>
              </div>
              <button class="btn btn-ghost js-clear" type="button">Clear</button>
            </div>
            <p class="muted-text">
              Reflection maps to <strong>content_json.reflection</strong>. Keep it short, formal Uzbek, and useful for review.
            </p>
          </section>

          <section class="editor-card">
            <div class="editor-grid">
              <label class="field full-span">
                <span>Summary</span>
                <div class="js-rich-host" data-key="summary"></div>
              </label>

              <label class="field full-span">
                <span>Reflection question</span>
                <div class="js-rich-host" data-key="question"></div>
              </label>

              <label class="field full-span">
                <span>Spaced repetition</span>
                <div class="js-rich-host" data-key="spaced_rep"></div>
              </label>

              <label class="field full-span">
                <span>Closing</span>
                <div class="js-rich-host" data-key="closing"></div>
              </label>
            </div>
          </section>
        </div>
      `;

      if (window.RichField) {
        const placeholders = {
          summary: "Bugun siz...",
          question: "Siz uchun eng muhim qoida qaysi bo'ldi?",
          spaced_rep: "Ertaga 3 ta misolni qayta ishlang...",
          closing: "Ajoyib ish!",
        };
        container.querySelectorAll(".js-rich-host").forEach((host) => {
          const key = host.dataset.key;
          if (!key) return;
          const initial = state[key] || "";
          const mini = window.RichField.create({
            value: initial,
            placeholder: placeholders[key] || "",
            compact: true,
            onChange: (html) => {
              state[key] = html;
              emit(state, onChange);
            },
          });
          host.appendChild(mini);
        });
      }
    }

    container.oninput = (event) => {
      const field = event.target.closest(".js-field");
      if (!field) return;

      state[field.dataset.key] = field.value;
      emit(state, onChange);
    };

    container.onclick = (event) => {
      if (!event.target.closest(".js-clear")) return;

      state.summary = "";
      state.question = "";
      state.spaced_rep = "";
      state.closing = "";
      emit(state, onChange);
      repaint();
    };

    repaint();
    if (window.EditorUtils) window.EditorUtils.bindPasteNormalizer(container);
  }

  window.Editors.reflection = { render };
})();
