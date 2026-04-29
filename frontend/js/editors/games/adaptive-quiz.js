// frontend/js/editors/games/adaptive-quiz.js
// Adaptive Quiz editor — uses the shared flashcard-builder-card surface so it
// stays visually consistent with the flashcards and other games. The big shift
// in this version (Wave V, 2026-04-29) is to replace the dense ad-hoc
// answer-spec form with a clearly grouped "Answer grading" subsection and a
// 2-up meta row that wraps cleanly on mobile.
//
// Data: { q, tags, tier, ans[], answer_spec, capture, hint?, media? }

(function () {
  "use strict";

  window.GameBreakEditors = window.GameBreakEditors || {};

  const TIERS = ["EASY", "MEDIUM", "HARD"];
  const ANSWER_TYPES = [
    { value: "numeric", label: "Numeric" },
    { value: "set_match", label: "Equation roots / set" },
    { value: "text_exact", label: "Text (exact)" },
    { value: "text_fuzzy", label: "Text (fuzzy)" },
    { value: "semantic", label: "Free-form (AI only)" }
  ];

  // Tier accent — same role as cluster accents on flashcards. Background tint
  // for the pill, foreground for the strip/border, complementary text color.
  const TIER_ACCENTS = {
    EASY:   { bar: "#1f7a3b", bg: "rgba(34, 197, 94, 0.16)",  text: "#1f7a3b", label: "Easy" },
    MEDIUM: { bar: "#a85400", bg: "rgba(255, 149, 0, 0.16)",  text: "#a85400", label: "Medium" },
    HARD:   { bar: "#a8281f", bg: "rgba(255, 59, 48, 0.16)",  text: "#a8281f", label: "Hard" },
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

  function tierAccent(tier) {
    return TIER_ACCENTS[tier] || TIER_ACCENTS.EASY;
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

  function defaultSpec() {
    return {
      type: "text_fuzzy",
      expected: "",
      canonical_display: "",
      allow_ai_fallback: true,
      rubric: {
        correct: "To'g'ri javob!",
        partial: "Qisman to'g'ri.",
        incorrect: "Notog'ri javob.",
      },
    };
  }

  function normalizeItem(item) {
    const spec = item?.answer_spec || defaultSpec();
    spec.rubric = spec.rubric || defaultSpec().rubric;

    // Backward compat: legacy items only had `ans[0]` and no spec.
    if (!spec.canonical_display && item?.ans && item.ans.length) {
      spec.canonical_display = item.ans[0];
      spec.expected = item.ans[0];
    }

    return {
      q: item?.q || "",
      tags: item?.tags || "[Bloom: L1 | PISA: L1]",
      tier: TIERS.includes(item?.tier) ? item.tier : "EASY",
      ans: Array.isArray(item?.ans) && item.ans.length ? item.ans : [spec.canonical_display || ""],
      answer_spec: spec,
      capture: Boolean(item?.capture),
      hint: item?.hint || "",
      media: normalizeMedia(item?.media),
    };
  }

  function normalize(items) {
    return Array.isArray(items) ? items.map(normalizeItem) : [];
  }

  function makeItem() {
    return normalizeItem({});
  }

  function emit(state, onChange) {
    state.forEach((item) => {
      if (!TIERS.includes(item.tier)) item.tier = "EASY";
      // Sync the legacy `ans` array off the canonical spec.
      item.ans = [item.answer_spec.canonical_display || ""];
    });
    onChange(clone(state));
  }

  function renderTierOptions(active) {
    return TIERS.map(
      (t) => `<option value="${t}" ${t === active ? "selected" : ""}>${TIER_ACCENTS[t].label}</option>`,
    ).join("");
  }

  function renderMediaPreview(media) {
    if (!media) {
      return `<div class="fc-media-empty"><span class="fc-media-icon" aria-hidden="true">🎯</span><span>No media — add an image or SVG to anchor the question.</span></div>`;
    }
    if (media.type === "image") {
      return `<div class="fc-media-preview"><img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt || "")}" /></div>`;
    }
    if (media.type === "svg") {
      return `<div class="fc-media-preview fc-media-svg">${media.html}</div>`;
    }
    return "";
  }

  function renderTypeSpecificFields(spec) {
    if (spec.type === "numeric") {
      return `
        <label class="aq-field">
          <span class="aq-field-label">Expected number</span>
          <input type="number" step="any" class="js-spec-field" data-key="expected" value="${escapeHtml(spec.expected)}" placeholder="42" />
        </label>
        <label class="aq-field">
          <span class="aq-field-label">Tolerance (±)</span>
          <input type="number" step="any" class="js-spec-field" data-key="tolerance" value="${escapeHtml(spec.tolerance ?? 0)}" placeholder="0.01" />
        </label>
      `;
    }
    if (spec.type === "set_match") {
      const value = Array.isArray(spec.expected) ? spec.expected.join(", ") : (spec.expected || "");
      return `
        <label class="aq-field aq-field-wide">
          <span class="aq-field-label">Expected set <span class="aq-field-hint">comma-separated, e.g. 9, -9</span></span>
          <input type="text" class="js-spec-field" data-key="expected" value="${escapeHtml(value)}" placeholder="9, -9" />
        </label>
      `;
    }
    return "";
  }

  function renderGradingBlock(item, index) {
    const spec = item.answer_spec;
    const typeOptions = ANSWER_TYPES.map(
      (t) => `<option value="${t.value}" ${t.value === spec.type ? "selected" : ""}>${t.label}</option>`,
    ).join("");

    return `
      <div class="aq-grading">
        <div class="aq-grid">
          <label class="aq-field aq-field-wide">
            <span class="aq-field-label">Canonical answer</span>
            <input type="text" class="js-spec-field" data-key="canonical_display" value="${escapeHtml(spec.canonical_display)}" placeholder="The model answer learners see if they fail" />
          </label>
          <label class="aq-field">
            <span class="aq-field-label">Type</span>
            <select class="js-spec-type">${typeOptions}</select>
          </label>

          ${renderTypeSpecificFields(spec)}

          <label class="aq-field aq-field-wide aq-toggle">
            <input type="checkbox" class="js-spec-ai" ${spec.allow_ai_fallback ? "checked" : ""} />
            <span class="aq-toggle-text">
              <span class="aq-toggle-title">Allow AI fallback</span>
              <span class="aq-toggle-sub">If the local matcher rejects, ask the tutor before marking wrong.</span>
            </span>
          </label>
        </div>

        <details class="aq-rubric">
          <summary><span>Custom rubric copy</span><span class="aq-rubric-meta">defaults shown to learners</span></summary>
          <div class="aq-grid aq-rubric-grid">
            <label class="aq-field aq-field-wide">
              <span class="aq-field-label">Correct</span>
              <textarea class="js-rubric-field" data-key="correct" rows="2">${escapeHtml(spec.rubric.correct)}</textarea>
            </label>
            <label class="aq-field aq-field-wide">
              <span class="aq-field-label">Partial</span>
              <textarea class="js-rubric-field" data-key="partial" rows="2">${escapeHtml(spec.rubric.partial)}</textarea>
            </label>
            <label class="aq-field aq-field-wide">
              <span class="aq-field-label">Incorrect</span>
              <textarea class="js-rubric-field" data-key="incorrect" rows="2">${escapeHtml(spec.rubric.incorrect)}</textarea>
            </label>
          </div>
        </details>

        <div class="aq-preview" id="preview-${index}">
          <span class="aq-preview-label">Accepted examples</span>
          <div class="aq-preview-content js-preview-content">Loading preview…</div>
        </div>
      </div>
    `;
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
            <p class="muted-text" style="margin-top:8px;">
              Each question carries a <strong>tier</strong> (Easy / Medium / Hard), a grading rule,
              optional media, and an optional hint. Tiers drive adaptive selection at runtime.
            </p>
          </section>

          ${
            state.length
              ? state
                  .map((item, index) => {
                    const accent = tierAccent(item.tier);
                    const hasMedia = !!item.media;
                    const qSummary = stripHtml(item.q) || `Untitled question ${index + 1}`;
                    return `
                      <section class="flashcard-builder-card aq-card" data-index="${index}" style="--fc-bar:${accent.bar};">
                        <div class="fc-card-head">
                          <span class="fc-card-num">Question ${index + 1}</span>
                          <span class="fc-cluster-pill" style="background:${accent.bg};color:${accent.text};">
                            ${escapeHtml(accent.label)}
                          </span>
                          <span class="aq-card-summary">${escapeHtml(qSummary).slice(0, 64)}</span>
                          <button class="btn btn-ghost btn-small js-remove-item" type="button" aria-label="Remove question">Remove</button>
                        </div>

                        <!-- Question (writable rich-text) — placed first so authors can
                             draft the prompt before deciding whether to add media. -->
                        <section class="aq-section aq-section--question">
                          <header class="aq-section-head">
                            <span class="aq-section-eyebrow">1 · Question</span>
                            <span class="aq-section-hint">What the learner sees first.</span>
                          </header>
                          <div class="fc-face">
                            <div class="js-rich-host" data-key="q" data-index="${index}"></div>
                          </div>
                        </section>

                        <section class="aq-section aq-section--media">
                          <header class="aq-section-head">
                            <span class="aq-section-eyebrow">2 · Media</span>
                            <span class="aq-section-hint">Optional image or diagram anchored above the question at runtime.</span>
                          </header>
                          <div class="fc-media-zone">
                            <div class="fc-media-toolbar">
                              <span class="fc-media-label">Media (optional)</span>
                              <div class="fc-media-actions">
                                <button type="button" class="btn btn-ghost btn-small js-aq-media-image">🖼 Image</button>
                                <button type="button" class="btn btn-ghost btn-small js-aq-media-svg">◆ SVG</button>
                                ${hasMedia ? '<button type="button" class="btn btn-ghost btn-small js-aq-media-clear">Clear</button>' : ""}
                              </div>
                            </div>
                            ${renderMediaPreview(item.media)}
                          </div>
                        </section>

                        <section class="aq-section aq-section--answer">
                          <header class="aq-section-head">
                            <span class="aq-section-eyebrow">3 · Answer</span>
                            <span class="aq-section-hint">How the runtime grades the learner's response.</span>
                          </header>
                          ${renderGradingBlock(item, index)}
                        </section>

                        <section class="aq-section aq-section--settings">
                          <header class="aq-section-head">
                            <span class="aq-section-eyebrow">4 · Settings</span>
                            <span class="aq-section-hint">Tier, capture, tags, and an optional hint.</span>
                          </header>
                          <div class="fc-meta-row aq-meta-row">
                          <div class="fc-meta-field">
                            <span class="fc-meta-label">Tier</span>
                            <select class="js-field" data-key="tier">
                              ${renderTierOptions(item.tier)}
                            </select>
                          </div>
                          <div class="fc-meta-field">
                            <span class="fc-meta-label">Notebook capture</span>
                            <select class="js-capture">
                              <option value="false" ${!item.capture ? "selected" : ""}>Off</option>
                              <option value="true" ${item.capture ? "selected" : ""}>Require photo</option>
                            </select>
                          </div>
                          <div class="fc-meta-field aq-meta-wide">
                            <span class="fc-meta-label">Tags</span>
                            <input class="js-field" data-key="tags" type="text" value="${escapeHtml(item.tags)}" placeholder="[Bloom: L1 | PISA: L1]" />
                          </div>
                          <div class="fc-meta-field aq-meta-wide">
                            <span class="fc-meta-label">🧠 Hint (optional)</span>
                            <textarea class="js-field" data-key="hint" rows="2" placeholder="A gentle nudge if the learner is stuck…">${escapeHtml(item.hint)}</textarea>
                          </div>
                          </div>
                        </section>
                      </section>
                    `;
                  })
                  .join("")
              : `<div class="empty-state glass-card inline-empty">
                  <div class="empty-orb" aria-hidden="true">🎯</div>
                  <h3>No adaptive questions</h3>
                  <p>Add a question and pick a tier to drive adaptive selection at runtime.</p>
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
          const mini = window.RichField.create({
            value: initial,
            placeholder: "Type the question here…",
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
      state.forEach((_, i) => updatePreview(i));
    }

    async function updatePreview(index) {
      const q = state[index];
      const previewEl = container.querySelector(`#preview-${index} .js-preview-content`);
      if (!previewEl) return;
      try {
        const resp = await fetch("/api/ai/answer-spec/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer_spec: q.answer_spec }),
        });
        if (!resp.ok) throw new Error("Preview failed");
        const data = await resp.json();
        const examples = (data.examples || []).map((ex) => `<code class="aq-preview-tag">${escapeHtml(ex)}</code>`).join("");
        previewEl.innerHTML = examples || `<span class="aq-preview-empty">No accepted examples yet — fill in the canonical answer.</span>`;
      } catch (err) {
        previewEl.innerHTML = `<span class="aq-preview-empty">Preview offline — backend unreachable.</span>`;
      }
    }

    container.oninput = (event) => {
      const target = event.target;
      const wrap = target.closest("[data-index]");
      if (!wrap) return;
      const index = Number(wrap.dataset.index);
      if (!Number.isFinite(index)) return;

      if (target.classList.contains("js-field")) {
        state[index][target.dataset.key] = target.value;
        emit(state, onChange);
      } else if (target.classList.contains("js-spec-field")) {
        const key = target.dataset.key;
        let val = target.value;
        if (key === "expected" && state[index].answer_spec.type === "set_match") {
          val = val.split(",").map(s => s.trim()).filter(Boolean);
        }
        state[index].answer_spec[key] = val;
        emit(state, onChange);
        updatePreview(index);
      } else if (target.classList.contains("js-rubric-field")) {
        state[index].answer_spec.rubric[target.dataset.key] = target.value;
        emit(state, onChange);
      }
    };

    container.onchange = (event) => {
      const target = event.target;
      const index = Number(target.closest("[data-index]")?.dataset.index);
      if (!Number.isFinite(index)) return;

      if (target.classList.contains("js-capture")) {
        state[index].capture = target.value === "true";
        emit(state, onChange);
      } else if (target.dataset.key === "tier") {
        state[index].tier = target.value;
        emit(state, onChange);
        repaint();
      } else if (target.classList.contains("js-spec-type")) {
        state[index].answer_spec.type = target.value;
        emit(state, onChange);
        repaint();
      } else if (target.classList.contains("js-spec-ai")) {
        state[index].answer_spec.allow_ai_fallback = target.checked;
        emit(state, onChange);
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
      const wrap = target.closest("[data-index]");
      const index = wrap ? Number(wrap.dataset.index) : -1;
      if (!Number.isFinite(index) || index < 0) return;

      if (target.closest(".js-remove-item")) {
        state.splice(index, 1);
        emit(state, onChange);
        repaint();
      } else if (target.closest(".js-aq-media-image")) {
        if (window.RichField?.openImageModal) {
          window.RichField.openImageModal((src, alt) => {
            if (!src) return;
            state[index].media = { type: "image", src, alt: alt || "" };
            emit(state, onChange);
            repaint();
          });
        }
      } else if (target.closest(".js-aq-media-svg")) {
        if (window.RichField?.openSvgModal) {
          window.RichField.openSvgModal((svgHtml) => {
            if (!svgHtml) return;
            state[index].media = { type: "svg", html: svgHtml };
            emit(state, onChange);
            repaint();
          });
        }
      } else if (target.closest(".js-aq-media-clear")) {
        state[index].media = null;
        emit(state, onChange);
        repaint();
      }
    };

    repaint();
  }

  window.GameBreakEditors.adaptiveQuiz = { render };
})();
