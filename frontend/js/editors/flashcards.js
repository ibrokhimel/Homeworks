// frontend/js/editors/flashcards.js
// Flashcards editor: edits content_json.flashcards.
// Data shape: [{term, def, cluster, hint?, media?}] where
//   term    = front-of-card rich HTML (short title / formula)
//   def     = back-of-card rich HTML (explanation)
//   cluster = QOIDA | MISOL | TAHLIL | METOD
//   hint    = optional plain-text mnemonic ("🧠 Yodlash usuli")
//   media   = optional { type: "image"|"svg", src?: string, html?: string, alt?: string }
//
// Legacy cards without hint/media are normalized to hint="" and media=null.
// Legacy cards with a plain-text term still display fine — RichField wraps
// plain text in <p> automatically on load.

(function () {
  "use strict";

  window.Editors = window.Editors || {};

  // i18n shortcut. Falls back to the key/fallback if i18n hasn't loaded.
  function t(key, fallback) {
    if (window.i18n && typeof window.i18n.t === "function") {
      return window.i18n.t(key, fallback);
    }
    return typeof fallback !== "undefined" ? fallback : key;
  }

  const CLUSTERS = [
    { value: "QOIDA", label: "Qoida" },
    { value: "MISOL", label: "Misol" },
    { value: "TAHLIL", label: "Tahlil" },
    { value: "METOD", label: "Metod" },
  ];

  function escapeAttr(value) {
    return String(value ?? "").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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
    return JSON.parse(JSON.stringify(value ?? []));
  }

  function normalizeMedia(media) {
    if (!media || typeof media !== "object") return null;
    const type = media.type === "svg" ? "svg" : media.type === "image" ? "image" : null;
    if (!type) return null;
    if (type === "image") {
      const src = typeof media.src === "string" ? media.src : "";
      if (!src) return null;
      return { type: "image", src, alt: typeof media.alt === "string" ? media.alt : "" };
    }
    // svg
    const html = typeof media.html === "string" ? media.html : "";
    if (!html) return null;
    return { type: "svg", html };
  }

  function normalizeCard(card) {
    const cluster = CLUSTERS.some((c) => c.value === card?.cluster) ? card.cluster : "QOIDA";
    return {
      term: card?.term || "",
      def: card?.def || "",
      cluster,
      hint: typeof card?.hint === "string" ? card.hint : "",
      media: normalizeMedia(card?.media),
    };
  }

  function normalize(data) {
    return Array.isArray(data) ? data.map(normalizeCard) : [];
  }

  function makeCard() {
    return { term: "", def: "", cluster: "QOIDA", hint: "", media: null };
  }

  function emit(state, onChange) {
    onChange(clone(state));
  }

  function renderClusterOptions(active) {
    return CLUSTERS.map(
      (c) =>
        `<option value="${c.value}" ${c.value === active ? "selected" : ""}>${escapeHtml(c.label)}</option>`,
    ).join("");
  }

  function clusterAccent(cluster) {
    // Palette mirrors the runtime FC_CLUSTER_DOT in perfect_homework.html
    // so the builder card and the live card glow with the same color.
    switch (cluster) {
      case "QOIDA":
        return { bg: "rgba(10, 132, 255, 0.12)", bar: "#0A84FF", text: "#0040b3" };
      case "MISOL":
        return { bg: "rgba(48, 209, 88, 0.12)", bar: "#30D158", text: "#1b7a34" };
      case "TAHLIL":
        return { bg: "rgba(191, 90, 242, 0.12)", bar: "#BF5AF2", text: "#7028a6" };
      case "METOD":
        return { bg: "rgba(255, 159, 10, 0.12)", bar: "#FF9F0A", text: "#a65f00" };
      default:
        return { bg: "rgba(0, 0, 0, 0.06)", bar: "#8e8e93", text: "#3a3a3c" };
    }
  }

  function renderMediaPreview(media) {
    if (!media) {
      return `
        <div class="fc-media-empty">
          <span class="fc-media-icon" aria-hidden="true">🖼</span>
          <span class="fc-media-msg">${escapeHtml(t("editor.fc.media_msg"))}</span>
        </div>
      `;
    }
    if (media.type === "image") {
      return `
        <div class="fc-media-preview">
          <img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt || "")}" />
        </div>
      `;
    }
    if (media.type === "svg") {
      // media.html is trusted (was stripped of scripts when inserted).
      return `<div class="fc-media-preview fc-media-svg">${media.html}</div>`;
    }
    return "";
  }

  function render(container, data, onChange) {
    const state = normalize(data);

    function repaint() {
      container.innerHTML = `
        <div class="editor-list">
          <section class="editor-card">
            <div class="editor-header">
              <div>
                <p class="eyebrow">${escapeHtml(t("editor.fc.eyebrow"))}</p>
                <h3>${state.length} ${escapeHtml(t(state.length === 1 ? "editor.fc.card_count" : "editor.fc.cards_count"))}</h3>
              </div>
              <button class="btn btn-primary js-add-card" type="button">${escapeHtml(t("editor.fc.add_card"))}</button>
            </div>
            <p class="muted-text">${escapeHtml(t("editor.fc.intro"))}</p>
          </section>

          ${
            state.length
              ? state
                  .map((card, index) => {
                    const accent = clusterAccent(card.cluster);
                    const hasMedia = !!card.media;
                    return `
                      <section class="flashcard-builder-card" data-index="${index}" style="--fc-bar:${accent.bar};">
                        <div class="fc-card-head">
                          <span class="fc-card-num">${escapeHtml(t("editor.fc.card_n"))} ${index + 1}</span>
                          <span class="fc-cluster-pill" style="background:${accent.bg};color:${accent.text};">
                            ${escapeHtml(card.cluster)}
                          </span>
                          <button class="btn btn-ghost btn-small js-remove-card" type="button" aria-label="${escapeAttr(t("editor.fc.remove"))}">${escapeHtml(t("editor.fc.remove"))}</button>
                        </div>

                        <div class="fc-media-zone">
                          <div class="fc-media-toolbar">
                            <span class="fc-media-label">${escapeHtml(t("editor.fc.media_label"))}</span>
                            <div class="fc-media-actions">
                              <button type="button" class="btn btn-ghost btn-small js-fc-media-image">🖼 Image</button>
                              <button type="button" class="btn btn-ghost btn-small js-fc-media-svg">◆ SVG</button>
                              ${hasMedia ? `<button type="button" class="btn btn-ghost btn-small js-fc-media-clear">${escapeHtml(t("editor.clear"))}</button>` : ""}
                            </div>
                          </div>
                          ${renderMediaPreview(card.media)}
                        </div>

                        <div class="fc-face">
                          <span class="fc-face-label">${escapeHtml(t("editor.fc.front"))}</span>
                          <div class="js-rich-host" data-key="term" data-index="${index}"></div>
                        </div>

                        <div class="fc-divider" aria-hidden="true">
                          <span class="fc-divider-line"></span>
                          <span class="fc-divider-chip">↻ ${escapeHtml(t("editor.fc.back").toLowerCase())}</span>
                          <span class="fc-divider-line"></span>
                        </div>

                        <div class="fc-face">
                          <span class="fc-face-label">${escapeHtml(t("editor.fc.back"))}</span>
                          <div class="js-rich-host" data-key="def" data-index="${index}"></div>
                        </div>

                        <div class="fc-meta-row">
                          <div class="fc-meta-field">
                            <span class="fc-meta-label">${escapeHtml(t("editor.fc.cluster"))}</span>
                            <select class="js-field" data-key="cluster">
                              ${renderClusterOptions(card.cluster)}
                            </select>
                          </div>
                          <div class="fc-meta-field fc-meta-hint">
                            <span class="fc-meta-label">🧠 ${escapeHtml(t("editor.fc.hint"))}</span>
                            <textarea class="js-field" data-key="hint" rows="2"
                              placeholder="${escapeAttr(t("editor.fc.hint_placeholder"))}">${escapeHtml(card.hint)}</textarea>
                          </div>
                        </div>
                      </section>
                    `;
                  })
                  .join("")
              : `<div class="empty-state glass-card inline-empty">
                  <div class="empty-orb" aria-hidden="true">🃏</div>
                  <h3>${escapeHtml(t("editor.fc.empty_h3"))}</h3>
                  <p>${escapeHtml(t("editor.fc.empty_text"))}</p>
                  <button class="btn btn-primary js-add-card" type="button">${escapeHtml(t("editor.fc.add_first_card"))}</button>
                </div>`
          }
        </div>
      `;

      // Mount RichField editors for `term` (front) and `def` (back).
      if (window.RichField) {
        container.querySelectorAll(".js-rich-host").forEach((host) => {
          const index = Number(host.dataset.index);
          const key = host.dataset.key;
          if (!Number.isFinite(index) || !key) return;
          const initial = state[index] ? state[index][key] : "";
          const mini = window.RichField.create({
            value: initial || "",
            placeholder:
              key === "term"
                ? "e.g. Kvadrat tenglama — ax² + bx + c = 0"
                : "Explanation or definition...",
            compact: true,
            onChange: (html) => {
              if (!state[index]) return;
              state[index][key] = html;
              emit(state, onChange);
            },
          });
          host.appendChild(mini);
        });
      }
    }

    function cardIndexFromEvent(event) {
      const wrap = event.target.closest("[data-index]");
      if (!wrap) return -1;
      const i = Number(wrap.dataset.index);
      return Number.isFinite(i) ? i : -1;
    }

    container.oninput = (event) => {
      const field = event.target.closest(".js-field");
      if (!field) return;
      const index = cardIndexFromEvent(event);
      if (index < 0) return;
      const key = field.dataset.key;
      if (!key || !state[index]) return;
      // cluster comes through onchange, hint is a textarea firing input.
      if (key === "cluster") return;
      state[index][key] = field.value;
      emit(state, onChange);
    };

    container.onchange = (event) => {
      const field = event.target.closest(".js-field");
      if (!field || field.dataset.key !== "cluster") return;
      const index = cardIndexFromEvent(event);
      if (index < 0 || !state[index]) return;
      state[index].cluster = field.value;
      emit(state, onChange);
      repaint();
    };

    container.onclick = (event) => {
      if (event.target.closest(".js-add-card")) {
        state.push(makeCard());
        emit(state, onChange);
        repaint();
        return;
      }

      if (event.target.closest(".js-remove-card")) {
        const index = cardIndexFromEvent(event);
        if (index < 0) return;
        state.splice(index, 1);
        emit(state, onChange);
        repaint();
        return;
      }

      if (event.target.closest(".js-fc-media-image")) {
        const index = cardIndexFromEvent(event);
        if (index < 0 || !state[index] || !window.RichField) return;
        window.RichField.openImageModal((src, alt) => {
          state[index].media = { type: "image", src, alt: alt || "" };
          emit(state, onChange);
          repaint();
        });
        return;
      }

      if (event.target.closest(".js-fc-media-svg")) {
        const index = cardIndexFromEvent(event);
        if (index < 0 || !state[index] || !window.RichField) return;
        window.RichField.openSvgModal((svgCode) => {
          // openSvgModal already strips <script> before invoking the callback.
          state[index].media = { type: "svg", html: svgCode };
          emit(state, onChange);
          repaint();
        });
        return;
      }

      if (event.target.closest(".js-fc-media-clear")) {
        const index = cardIndexFromEvent(event);
        if (index < 0 || !state[index]) return;
        state[index].media = null;
        emit(state, onChange);
        repaint();
        return;
      }
    };

    repaint();
    if (window.EditorUtils) window.EditorUtils.bindPasteNormalizer(container);
  }

  window.Editors.flashcards = { render };
})();
