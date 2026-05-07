// frontend/js/editors/consolidation.js
// Consolidation editor: temporary mnemonic-lock editor.
// NOTE: current CONTRACTS.md has no content_json key for "consolidation" yet.
// Builder will render this editor, but changes are not persisted until the contract adds a consolidation key.

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
      title: safe.title || "",
      mnemonic: safe.mnemonic || "",
      bullets: Array.isArray(safe.bullets) && safe.bullets.length ? safe.bullets.map((item) => String(item ?? "")) : [""],
      check_prompt: safe.check_prompt || "",
      check_answer: safe.check_answer || "",
    };
  }

  function emit(state, onChange) {
    if (!Array.isArray(state.bullets) || !state.bullets.length) {
      state.bullets = [""];
    }

    onChange(clone(state));
  }

  function renderBullets(state) {
    return state.bullets
      .map(
        (bullet, index) => `
          <div class="option-row" data-index="${index}">
            <input class="js-bullet" type="text" value="${escapeHtml(bullet)}" placeholder="Bullet ${index + 1}" />
            <button class="icon-btn js-remove-bullet" type="button" title="Remove bullet">×</button>
          </div>
        `
      )
      .join("");
  }

  function repaint(container, state) {
    container.innerHTML = `
      <div class="editor-list">
        <section class="editor-card">
          <div class="editor-header">
            <div>
              <p class="eyebrow">${escapeHtml(t("editor.cons.eyebrow"))}</p>
              <h3>${escapeHtml(t("editor.cons.intro"))}</h3>
            </div>
            <button class="btn btn-ghost js-clear" type="button">Clear</button>
          </div>

          <p class="muted-text">
            Temporary editor. This phase is in the pipeline, but it is not contract-backed yet.
          </p>

          <div class="editor-grid">
            <label class="field full-span">
              <span>Title</span>
              <input class="js-root-field" data-key="title" type="text" value="${escapeHtml(state.title)}" placeholder="Mustahkamlash" />
            </label>

            <div class="field full-span">
              <span>Mnemonic / lock phrase</span>
              <div class="js-rich-host" data-key="mnemonic"></div>
            </div>

            <div class="field full-span">
              <span>Check prompt</span>
              <div class="js-rich-host" data-key="check_prompt"></div>
            </div>

            <label class="field full-span">
              <span>Check answer</span>
              <input class="js-root-field" data-key="check_answer" type="text" value="${escapeHtml(state.check_answer)}" placeholder="Expected answer" />
            </label>
          </div>
        </section>

        <section class="editor-card">
          <div class="editor-header">
            <div>
              <p class="eyebrow">Key takeaways</p>
              <h3>${state.bullets.length} bullet${state.bullets.length === 1 ? "" : "s"}</h3>
            </div>
            <button class="btn btn-primary js-add-bullet" type="button">Add bullet</button>
          </div>

          <div class="editor-list">
            ${renderBullets(state)}
          </div>
        </section>
      </div>
    `;
  }

  function render(container, data, onChange) {
    const state = normalize(data);

    function sync() {
      emit(state, onChange);
    }

    function refresh() {
      repaint(container, state);
      if (window.RichField) {
        container.querySelectorAll(".js-rich-host").forEach((host) => {
          const key = host.dataset.key;
          if (!key) return;
          const initial = state[key] || "";
          const placeholder =
            key === "mnemonic" ? "Short memory hook..." : "Quick self-check question...";
          const mini = window.RichField.create({
            value: initial,
            placeholder,
            compact: true,
            onChange: (html) => {
              state[key] = html;
              sync();
            },
          });
          host.appendChild(mini);
        });
      }
    }

    container.oninput = (event) => {
      const rootField = event.target.closest(".js-root-field");
      const bullet = event.target.closest(".js-bullet");

      if (rootField) {
        state[rootField.dataset.key] = rootField.value;
        sync();
        return;
      }

      if (bullet) {
        const index = Number(bullet.closest("[data-index]")?.dataset.index);
        state.bullets[index] = bullet.value;
        sync();
      }
    };

    container.onclick = (event) => {
      if (event.target.closest(".js-add-bullet")) {
        state.bullets.push("");
        sync();
        refresh();
        return;
      }

      if (event.target.closest(".js-remove-bullet")) {
        const index = Number(event.target.closest("[data-index]")?.dataset.index);
        state.bullets.splice(index, 1);
        if (!state.bullets.length) state.bullets.push("");
        sync();
        refresh();
        return;
      }

      if (event.target.closest(".js-clear")) {
        state.title = "";
        state.mnemonic = "";
        state.bullets = [""];
        state.check_prompt = "";
        state.check_answer = "";
        sync();
        refresh();
      }
    };

    refresh();
    if (window.EditorUtils) window.EditorUtils.bindPasteNormalizer(container);
  }

  window.Editors.consolidation = { render };
})();
