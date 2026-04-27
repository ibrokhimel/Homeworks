// frontend/js/editors/games/adaptive-quiz.js
// Adaptive Quiz editor — card-styled like flashcards.
// Data: { q, tags, tier, ans[], capture, hint?, media? }

(function () {
  "use strict";

  window.GameBreakEditors = window.GameBreakEditors || {};

  const TIERS = ["EASY", "MEDIUM", "HARD"];

  const TIER_COLORS = {
    EASY:   { bg: "rgba(52, 199, 89, 0.14)",  fg: "#1f7a3b" },
    MEDIUM: { bg: "rgba(255, 149, 0, 0.14)",  fg: "#a85400" },
    HARD:   { bg: "rgba(255, 59, 48, 0.14)",  fg: "#a8281f" },
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

  function normalizeMedia(m) {
    if (!m || typeof m !== "object") return null;
    if (m.type === "image" && (m.src || "").trim()) {
      return { type: "image", src: String(m.src), alt: String(m.alt || "") };
    }
    if (m.type === "svg" && (m.html || "").trim()) {
      return { type: "svg", html: String(m.html) };
    }
    return null;
  }

  function normalize(items) {
    return Array.isArray(items)
      ? items.map((item) => ({
          q: item?.q || "",
          tags: item?.tags || "[Bloom: L1 | PISA: L1]",
          tier: TIERS.includes(item?.tier) ? item.tier : "EASY",
          ans: Array.isArray(item?.ans) && item.ans.length ? item.ans : [""],
          capture: Boolean(item?.capture),
          hint: item?.hint || "",
          media: normalizeMedia(item?.media),
        }))
      : [];
  }

  function makeItem() {
    return {
      q: "",
      tags: "[Bloom: L1 | PISA: L1]",
      tier: "EASY",
      ans: [""],
      capture: false,
      hint: "",
      media: null,
    };
  }

  function emit(state, onChange) {
    state.forEach((item) => {
      if (!Array.isArray(item.ans) || !item.ans.length) item.ans = [""];
      if (!TIERS.includes(item.tier)) item.tier = "EASY";
    });
    onChange(clone(state));
  }

  function renderTierOptions(active) {
    return TIERS.map(
      (t) => `<option value="${t}" ${t === active ? "selected" : ""}>${t}</option>`,
    ).join("");
  }

  function renderAnswers(item) {
    return item.ans
      .map(
        (ans, ansIndex) => `
          <div class="option-row" data-ans-index="${ansIndex}">
            <input class="js-answer" type="text" value="${escapeHtml(ans)}" placeholder="Accepted answer ${ansIndex + 1}" />
            <button class="icon-btn js-remove-answer" type="button" title="Remove answer">×</button>
          </div>
        `,
      )
      .join("");
  }

  function renderMediaPreview(media) {
    if (!media) {
      return `<div class="fc-media-empty">No media attached — click <strong>Image</strong> or <strong>SVG</strong> to add one.</div>`;
    }
    if (media.type === "image") {
      return `<img class="fc-media-preview-img" src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt || "")}" />`;
    }
    if (media.type === "svg") {
      return `<div class="fc-media-preview-svg">${media.html}</div>`;
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
                <p class="eyebrow">Adaptive Quiz</p>
                <h3>${state.length} question${state.length === 1 ? "" : "s"}</h3>
              </div>
              <button class="btn btn-primary js-add-item" type="button">Add question</button>
            </div>
            <p class="muted-text">
              Student types an answer. Correctness checks against <strong>ans[]</strong>. If nothing matches, the AI tutor evaluates semantically. Tier drives difficulty (EASY → HARD). Capture requires a notebook/photo.
            </p>
          </section>

          ${
            state.length
              ? state
                  .map((item, index) => {
                    const tier = item.tier;
                    const colors = TIER_COLORS[tier] || TIER_COLORS.EASY;
                    const qSummary = stripHtml(item.q) || "Untitled adaptive question";
                    return `
                      <section class="flashcard-builder-card" data-index="${index}" style="--fc-strip:${colors.fg};">
                        <div class="flashcard-builder-strip" style="background:${colors.fg};"></div>
                        <div class="flashcard-builder-header">
                          <div class="flashcard-builder-title">
                            <span class="eyebrow">Question ${index + 1}</span>
                            <h3>${escapeHtml(qSummary).slice(0, 80)}</h3>
                          </div>
                          <div class="flashcard-builder-actions">
                            <span class="status-pill" style="background:${colors.bg};color:${colors.fg};">${tier}</span>
                            <button class="btn btn-danger js-remove-item" type="button">Remove</button>
                          </div>
                        </div>

                        <div class="fc-media-zone">
                          <div class="fc-media-head">
                            <span class="fc-face-label">Media (optional)</span>
                            <div class="fc-media-tools">
                              <button class="btn btn-ghost js-card-img" type="button">🖼 Image</button>
                              <button class="btn btn-ghost js-card-svg" type="button">◆ SVG</button>
                              ${item.media ? `<button class="btn btn-ghost js-card-clear-media" type="button">Clear</button>` : ""}
                            </div>
                          </div>
                          <div class="fc-media-body">
                            ${renderMediaPreview(item.media)}
                          </div>
                        </div>

                        <div class="fc-face">
                          <div class="fc-face-label">Question</div>
                          <div class="js-rich-host" data-key="q" data-index="${index}"></div>
                        </div>

                        <div class="fc-divider"><span>↓ accepted answers below ↓</span></div>

                        <div class="fc-face">
                          <div class="fc-face-label">Accepted answers (any match = correct)</div>
                          <div class="editor-list">
                            ${renderAnswers(item)}
                          </div>
                          <button class="btn btn-ghost js-add-answer" type="button" style="align-self:flex-start;margin-top:8px;">+ Add accepted answer</button>
                        </div>

                        <div class="fc-meta-row">
                          <div class="field">
                            <span>Tier</span>
                            <select class="js-field" data-key="tier">
                              ${renderTierOptions(tier)}
                            </select>
                          </div>
                          <div class="field">
                            <span>Capture</span>
                            <select class="js-capture">
                              <option value="false" ${!item.capture ? "selected" : ""}>Off</option>
                              <option value="true" ${item.capture ? "selected" : ""}>Require notebook</option>
                            </select>
                          </div>
                          <div class="field full-span">
                            <span>Tags</span>
                            <input class="js-field" data-key="tags" type="text" value="${escapeHtml(item.tags)}" placeholder="[Bloom: L1 | PISA: L1]" />
                          </div>
                          <div class="field full-span">
                            <span>🧠 Hint (optional — shown if student struggles)</span>
                            <textarea class="js-field" data-key="hint" rows="2" placeholder="A gentle nudge toward the method...">${escapeHtml(item.hint)}</textarea>
                          </div>
                        </div>
                      </section>
                    `;
                  })
                  .join("")
              : `<div class="empty-state glass-card inline-empty">
                  <div class="empty-orb" aria-hidden="true">🎯</div>
                  <h3>No adaptive questions</h3>
                  <p>Add typed-answer questions with multiple accepted forms.</p>
                  <button class="btn btn-primary js-add-item" type="button">Add first question</button>
                </div>`
          }
        </div>
      `;

      // Mount RichField editor for the Question on each card.
      if (window.RichField && window.RichField.create) {
        container.querySelectorAll(".js-rich-host").forEach((host) => {
          const index = Number(host.dataset.index);
          const key = host.dataset.key;
          if (!Number.isFinite(index) || !key) return;
          const initial = state[index]?.[key] || "";
          const mini = window.RichField.create({
            value: initial,
            placeholder: "Type the question here...",
            compact: false,
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

    container.oninput = (event) => {
      const target = event.target;

      // Meta fields (tier, tags, hint)
      const field = target.closest && target.closest(".js-field");
      if (field) {
        const wrap = field.closest("[data-index]");
        if (!wrap) return;
        const index = Number(wrap.dataset.index);
        const key = field.dataset.key;
        if (!Number.isFinite(index) || !key) return;
        state[index][key] = field.value;
        emit(state, onChange);
        return;
      }

      // Accepted answers
      const answer = target.closest && target.closest(".js-answer");
      if (answer) {
        const itemIndex = Number(answer.closest("[data-index]")?.dataset.index);
        const ansIndex = Number(answer.closest("[data-ans-index]")?.dataset.ansIndex);
        if (!Number.isFinite(itemIndex) || !Number.isFinite(ansIndex)) return;
        state[itemIndex].ans[ansIndex] = answer.value;
        emit(state, onChange);
      }
    };

    container.onchange = (event) => {
      const capture = event.target.closest && event.target.closest(".js-capture");
      if (capture) {
        const index = Number(capture.closest("[data-index]")?.dataset.index);
        if (!Number.isFinite(index)) return;
        state[index].capture = capture.value === "true";
        emit(state, onChange);
        return;
      }
      // Tier change: repaint to refresh colors
      const field = event.target.closest && event.target.closest(".js-field");
      if (field && field.dataset.key === "tier") {
        repaint();
      }
    };

    container.onclick = (event) => {
      const target = event.target;

      if (target.closest(".js-add-item")) {
        state.push(makeItem());
        emit(state, onChange);
        repaint();
        return;
      }
      if (target.closest(".js-remove-item")) {
        const index = Number(target.closest("[data-index]")?.dataset.index);
        if (!Number.isFinite(index)) return;
        state.splice(index, 1);
        emit(state, onChange);
        repaint();
        return;
      }
      if (target.closest(".js-add-answer")) {
        const index = Number(target.closest("[data-index]")?.dataset.index);
        if (!Number.isFinite(index)) return;
        state[index].ans.push("");
        emit(state, onChange);
        repaint();
        return;
      }
      if (target.closest(".js-remove-answer")) {
        const itemIndex = Number(target.closest("[data-index]")?.dataset.index);
        const ansIndex = Number(target.closest("[data-ans-index]")?.dataset.ansIndex);
        if (!Number.isFinite(itemIndex) || !Number.isFinite(ansIndex)) return;
        state[itemIndex].ans.splice(ansIndex, 1);
        if (!state[itemIndex].ans.length) state[itemIndex].ans.push("");
        emit(state, onChange);
        repaint();
        return;
      }

      // Media: image upload
      if (target.closest(".js-card-img")) {
        const index = Number(target.closest("[data-index]")?.dataset.index);
        if (!Number.isFinite(index)) return;
        if (!window.RichField || !window.RichField.openImageModal) return;
        window.RichField.openImageModal((src, alt) => {
          if (!src) return;
          state[index].media = { type: "image", src, alt: alt || "" };
          emit(state, onChange);
          repaint();
        });
        return;
      }
      // Media: SVG insert
      if (target.closest(".js-card-svg")) {
        const index = Number(target.closest("[data-index]")?.dataset.index);
        if (!Number.isFinite(index)) return;
        if (!window.RichField || !window.RichField.openSvgModal) return;
        window.RichField.openSvgModal((svgHtml) => {
          if (!svgHtml) return;
          state[index].media = { type: "svg", html: svgHtml };
          emit(state, onChange);
          repaint();
        });
        return;
      }
      // Media: clear
      if (target.closest(".js-card-clear-media")) {
        const index = Number(target.closest("[data-index]")?.dataset.index);
        if (!Number.isFinite(index)) return;
        state[index].media = null;
        emit(state, onChange);
        repaint();
      }
    };

    repaint();
    if (window.EditorUtils) {
      window.EditorUtils.bindPasteNormalizer(container);
      window.EditorUtils.bindStrictPasteNormalizer(
        container,
        'input[data-key="tags"], input.js-answer',
      );
    }
  }

  window.GameBreakEditors.adaptiveQuiz = { render };
})();
