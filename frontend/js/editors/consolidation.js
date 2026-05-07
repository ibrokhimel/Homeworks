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
            <input class="js-bullet" type="text" value="${escapeHtml(bullet)}" placeholder="${escapeHtml(t("editor.cons.bullet_n"))} ${index + 1}" />
            <button class="icon-btn js-remove-bullet" type="button" title="${escapeHtml(t("editor.cons.remove_bullet"))}">×</button>
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
            <button class="btn btn-ghost js-clear" type="button">${escapeHtml(t("editor.clear"))}</button>
          </div>

          <p class="muted-text">${escapeHtml(t("editor.cons.help"))}</p>

          <div class="editor-grid">
            <label class="field full-span">
              <span>${escapeHtml(t("editor.cons.title"))}</span>
              <input class="js-root-field" data-key="title" type="text" value="${escapeHtml(state.title)}" placeholder="${escapeHtml(t("editor.cons.title_placeholder"))}" />
            </label>

            <div class="field full-span">
              <span>${escapeHtml(t("editor.cons.mnemonic_lock"))}</span>
              <div class="js-rich-host" data-key="mnemonic"></div>
            </div>

            <div class="field full-span">
              <span>${escapeHtml(t("editor.cons.check_prompt"))}</span>
              <div class="js-rich-host" data-key="check_prompt"></div>
            </div>

            <label class="field full-span">
              <span>${escapeHtml(t("editor.cons.check_answer"))}</span>
              <input class="js-root-field" data-key="check_answer" type="text" value="${escapeHtml(state.check_answer)}" placeholder="${escapeHtml(t("editor.cons.check_answer_placeholder"))}" />
            </label>
          </div>
        </section>

        <section class="editor-card">
          <div class="editor-header">
            <div>
              <p class="eyebrow">${escapeHtml(t("editor.cons.key_takeaways"))}</p>
              <h3>${state.bullets.length} ${escapeHtml(t(state.bullets.length === 1 ? "editor.cons.bullet_count" : "editor.cons.bullets_count"))}</h3>
            </div>
            <button class="btn btn-primary js-add-bullet" type="button">${escapeHtml(t("editor.cons.add_bullet"))}</button>
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
            key === "mnemonic" ? t("editor.cons.mnemonic_short") : t("editor.cons.check_prompt_short");
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
