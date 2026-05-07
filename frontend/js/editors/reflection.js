// frontend/js/editors/reflection.js
// Reflection editor: edits content_json.reflection.

(function () {
  "use strict";

  window.Editors = window.Editors || {};

  function t(key, fallback) {
    if (window.i18n && typeof window.i18n.t === "function") {
      return window.i18n.t(key, fallback);
    }
    return typeof fallback !== "undefined" ? fallback : key;
  }

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
                <p class="eyebrow">${escapeHtml(t("editor.refl.eyebrow"))}</p>
                <h3>${escapeHtml(t("editor.refl.intro"))}</h3>
              </div>
              <button class="btn btn-ghost js-clear" type="button">${escapeHtml(t("editor.clear"))}</button>
            </div>
            <p class="muted-text">
              Reflection maps to <strong>content_json.reflection</strong>. Keep it short, formal Uzbek, and useful for review.
            </p>
          </section>

          <section class="editor-card">
            <div class="editor-grid">
              <div class="field full-span">
                <span>${escapeHtml(t("editor.refl.summary"))}</span>
                <div class="js-rich-host" data-key="summary"></div>
              </div>

              <div class="field full-span">
                <span>${escapeHtml(t("editor.refl.prompt"))}</span>
                <div class="js-rich-host" data-key="question"></div>
              </div>

              <div class="field full-span">
                <span>${escapeHtml(t("editor.refl.spaced_rep"))}</span>
                <div class="js-rich-host" data-key="spaced_rep"></div>
              </div>

              <div class="field full-span">
                <span>Closing</span>
                <div class="js-rich-host" data-key="closing"></div>
              </div>
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
