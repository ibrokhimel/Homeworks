// frontend/js/editors/games/tile-match.js
// Tile Match editor — concept ↔ definition pairs with rich content and
// per-pair metadata (tier, subject_family, concept_family, pisa_level,
// difficulty, palace flag).
//
// Contract storage: content_json.gb_tile_match (NEW canonical key —
// distinct from the legacy gb_memory_match raw 2-tuple shape, which
// the editor migrates on first edit).
//
// Pair shape (see TILE_MATCH_BACKEND_PLAN.md §1):
//   { id, left, right, tier,
//     concept_family?, subject_family?, pisa_level?, difficulty?,
//     is_palace_tile?, explanation? }
//
// Mounting:
//   tileMatchEditor(container, data, onChange, context = {})
//     where context = { grade, subject, tier } (defaults below if omitted).
//     Reads: context.grade (board size), context.subject (subject_family
//     default), context.tier (per-pair tier default).
//
// The editor tolerates extra fields on input pairs (Pydantic
// `extra="allow"`-style forward-compat) and passes them through unchanged.

(function () {
  "use strict";

  window.GameBreakEditors = window.GameBreakEditors || {};

  // ---------------------------------------------------------------------------
  // Helpers — mirror _tile-match-helpers.js so the editor still works even if
  // the helpers file isn't loaded first; the helpers file is the canonical
  // source for the regression test and for any external caller.
  // ---------------------------------------------------------------------------

  function defaultPairCountForGrade(grade) {
    const g = Number(grade);
    if (!Number.isFinite(g)) return 8;
    if (g <= 2) return 4;
    if (g <= 4) return 5;
    if (g <= 7) return 6;
    return 8;
  }

  function maxPairsForGrade(_grade) {
    return 8; // spec §1 hard cap
  }

  function subjectFamilyFromContext(subject) {
    if (subject == null) return "general";
    const s = String(subject).toLowerCase();
    if (!s) return "general";
    if (s.includes("math") || s.includes("matem")) return "math";
    if (s.includes("bio") || s.includes("biolog")) return "biology";
    if (s.includes("hist") || s.includes("tarix") || s.includes("истор")) return "history";
    if (s.includes("liter") || s.includes("adabiyot") || s.includes("литер")) return "literature";
    if (s.includes("phys") || s.includes("fizika") || s.includes("физик")) return "physics";
    if (s.includes("chem") || s.includes("kimyo") || s.includes("хими")) return "chemistry";
    if (s.includes("lang") || s.includes("til") || s.includes("язык")) return "language";
    if (s.includes("geo")) return "geography";
    return "general";
  }

  function uuidShort() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return "tm_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      }
    } catch (_e) {
      // fall through
    }
    return "tm_" + Math.random().toString(36).slice(2, 10);
  }

  // Subject family + PISA + difficulty enums (kept here so the editor can
  // render dropdowns without coupling to a remote schema fetch).
  const SUBJECT_FAMILIES = [
    "math",
    "biology",
    "history",
    "literature",
    "physics",
    "chemistry",
    "language",
    "geography",
    "general",
  ];
  const PISA_LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6"];
  const DIFFICULTIES = ["easy", "medium", "hard"];
  const TIERS = ["basic", "premium"];

  // Fields the editor manages explicitly. Anything else on the input item is
  // passed through unchanged via `_extra` (forward-compat with future schema).
  const KNOWN_FIELDS = new Set([
    "id",
    "left",
    "right",
    "tier",
    "concept_family",
    "subject_family",
    "pisa_level",
    "difficulty",
    "is_palace_tile",
    "explanation",
  ]);

  // ---------------------------------------------------------------------------
  // String / state helpers
  // ---------------------------------------------------------------------------

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stripHtml(value) {
    return String(value == null ? "" : value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value == null ? [] : value));
  }

  function summary(value) {
    const stripped = stripHtml(value);
    return stripped || "—";
  }

  function defaultContext() {
    return { grade: 8, subject: "general", tier: "basic" };
  }

  function looksLikeLegacyPair(item) {
    // Legacy gb_memory_match shape is [left, right] arrays.
    return Array.isArray(item);
  }

  function makePair(context) {
    const ctx = context || defaultContext();
    return {
      id: uuidShort(),
      left: "",
      right: "",
      tier: ctx.tier === "premium" ? "premium" : "basic",
      concept_family: "",
      subject_family: subjectFamilyFromContext(ctx.subject),
      pisa_level: "",
      difficulty: "",
      is_palace_tile: false,
      explanation: "",
    };
  }

  function normalizeOne(raw, context, index) {
    const ctx = context || defaultContext();

    // Legacy shape — [left, right] tuple.
    if (looksLikeLegacyPair(raw)) {
      return {
        id: `tm_legacy_${String(index).padStart(3, "0")}`,
        left: String(raw[0] == null ? "" : raw[0]),
        right: String(raw[1] == null ? "" : raw[1]),
        tier: "basic",
        concept_family: "",
        subject_family: subjectFamilyFromContext(ctx.subject),
        pisa_level: "",
        difficulty: "",
        is_palace_tile: false,
        explanation: "",
        _extra: {},
      };
    }

    const item = raw && typeof raw === "object" ? raw : {};

    const tier = TIERS.includes(item.tier) ? item.tier : (ctx.tier === "premium" ? "premium" : "basic");
    const subjectFamily = SUBJECT_FAMILIES.includes(item.subject_family)
      ? item.subject_family
      : subjectFamilyFromContext(ctx.subject);
    const pisaLevel = PISA_LEVELS.includes(item.pisa_level) ? item.pisa_level : "";
    const difficulty = DIFFICULTIES.includes(item.difficulty) ? item.difficulty : "";

    // Palace tiles are premium-only per spec §3 / Chunk-A schema. Defensively
    // strip the flag on basic tier so the builder never produces a row that
    // would fail server-side validation.
    let isPalace = Boolean(item.is_palace_tile);
    if (tier !== "premium") isPalace = false;

    // Pass-through bucket for forward-compat fields we don't know about.
    const extra = {};
    for (const key of Object.keys(item)) {
      if (!KNOWN_FIELDS.has(key)) extra[key] = item[key];
    }

    return {
      id: typeof item.id === "string" && item.id ? item.id : uuidShort(),
      left: typeof item.left === "string" ? item.left : "",
      right: typeof item.right === "string" ? item.right : "",
      tier,
      concept_family: typeof item.concept_family === "string" ? item.concept_family : "",
      subject_family: subjectFamily,
      pisa_level: pisaLevel,
      difficulty,
      is_palace_tile: isPalace,
      explanation: typeof item.explanation === "string" ? item.explanation : "",
      _extra: extra,
    };
  }

  function normalize(items, context) {
    if (!Array.isArray(items)) return [];
    return items.map((raw, i) => normalizeOne(raw, context, i));
  }

  // Strip the internal `_extra` bucket and merge its keys back so the
  // emitted onChange payload is a pure TileMatchPair-shaped array.
  function toEmit(state) {
    return state.map((item) => {
      const out = {
        id: item.id,
        left: item.left,
        right: item.right,
        tier: item.tier,
        concept_family: item.concept_family || "",
        subject_family: item.subject_family || "general",
        pisa_level: item.pisa_level || "",
        difficulty: item.difficulty || "",
        is_palace_tile: Boolean(item.is_palace_tile),
        explanation: item.explanation || "",
      };
      if (item._extra && typeof item._extra === "object") {
        for (const [k, v] of Object.entries(item._extra)) {
          if (!(k in out)) out[k] = v;
        }
      }
      return out;
    });
  }

  function emit(state, onChange) {
    onChange(clone(toEmit(state)));
  }

  // ---------------------------------------------------------------------------
  // Validation — soft warnings (no hard errors block save). The server
  // Pydantic model enforces hard rules; this surfaces them early.
  // ---------------------------------------------------------------------------

  function validateBoard(state, ctx) {
    const warnings = [];
    const recommended = defaultPairCountForGrade(ctx.grade);
    const cap = maxPairsForGrade(ctx.grade);

    if (state.length > recommended && state.length <= cap) {
      warnings.push(
        `Recommended pair count for Grade ${ctx.grade} is ${recommended}. You have ${state.length}.`
      );
    }
    if (state.length > cap) {
      warnings.push(`Max ${cap} pairs allowed (spec §1 hard cap).`);
    }

    const palaceCount = state.filter((p) => p.is_palace_tile).length;
    if (palaceCount > 1) {
      warnings.push(`Only one Memory Palace tile per board recommended (~5% rare). You have ${palaceCount}.`);
    }

    // Distractor rule §1 — left-side strings must be unique, right-side too.
    const lefts = new Map();
    const rights = new Map();
    for (const p of state) {
      const l = stripHtml(p.left).toLowerCase();
      const r = stripHtml(p.right).toLowerCase();
      if (l) lefts.set(l, (lefts.get(l) || 0) + 1);
      if (r) rights.set(r, (rights.get(r) || 0) + 1);
    }
    for (const [, count] of lefts) {
      if (count > 1) {
        warnings.push("Two pairs share the same left-tile text — distractor rule requires uniqueness.");
        break;
      }
    }
    for (const [, count] of rights) {
      if (count > 1) {
        warnings.push("Two pairs share the same right-tile text — distractor rule requires uniqueness.");
        break;
      }
    }

    return warnings;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function renderBoardWarnings(state, ctx) {
    const warnings = validateBoard(state, ctx);
    if (!warnings.length) return "";
    return `<ul class="sf-validation sf-validation-warning">${warnings
      .map((w) => `<li>${escapeHtml(w)}</li>`)
      .join("")}</ul>`;
  }

  function renderMetaBlock(item, index, isOpen) {
    if (!isOpen) return "";
    const isPremium = item.tier === "premium";
    return `
      <div class="editor-grid">
        <label class="field">
          <span>Subject family</span>
          <select class="js-field" data-key="subject_family">
            ${SUBJECT_FAMILIES.map(
              (s) => `<option value="${s}" ${item.subject_family === s ? "selected" : ""}>${s}</option>`
            ).join("")}
          </select>
        </label>
        <label class="field">
          <span>Concept family (free-form)</span>
          <input class="js-field" data-key="concept_family" type="text"
            value="${escapeHtml(item.concept_family)}"
            placeholder="fractions, newton_laws, photosynthesis…" />
        </label>
        <label class="field">
          <span>PISA level</span>
          <select class="js-field" data-key="pisa_level">
            <option value="" ${!item.pisa_level ? "selected" : ""}>—</option>
            ${PISA_LEVELS.map(
              (l) => `<option value="${l}" ${item.pisa_level === l ? "selected" : ""}>${l}</option>`
            ).join("")}
          </select>
        </label>
        <label class="field">
          <span>Difficulty</span>
          <select class="js-field" data-key="difficulty">
            <option value="" ${!item.difficulty ? "selected" : ""}>—</option>
            ${DIFFICULTIES.map(
              (d) => `<option value="${d}" ${item.difficulty === d ? "selected" : ""}>${d}</option>`
            ).join("")}
          </select>
        </label>
        <label class="field tm-palace-row">
          <span>Memory Palace tile (premium only, ~5% of boards)</span>
          <label class="tm-checkbox">
            <input class="js-field" data-key="is_palace_tile" type="checkbox"
              ${item.is_palace_tile ? "checked" : ""} ${isPremium ? "" : "disabled"} />
            <span>${isPremium ? "Mark as 🏛️ Palace tile" : "Switch tier to Premium to enable"}</span>
          </label>
        </label>
        ${
          isPremium
            ? `<label class="field full-span">
                <span>Explanation (premium "why this is wrong" micro-note)</span>
                <textarea class="js-field" data-key="explanation" rows="2"
                  placeholder="Optional — surfaced on tap after wrong match">${escapeHtml(item.explanation)}</textarea>
              </label>`
            : ""
        }
      </div>
    `;
  }

  function tileMatchEditor(container, data, onChange, context = {}) {
    if (!container) return;
    // Spread `context` ({grade, subject, tier}) over the safe defaults so
    // `ctx.grade`, `ctx.subject`, `ctx.tier` are always present.
    const ctx = context && typeof context === "object"
      ? {
          ...defaultContext(),
          grade: context.grade != null ? context.grade : defaultContext().grade,
          subject: context.subject != null ? context.subject : defaultContext().subject,
          tier: context.tier != null ? context.tier : defaultContext().tier,
        }
      : defaultContext();
    const state = normalize(data, ctx);
    // Per-item UI flags (collapse/expand metadata block).
    const ui = state.map(() => ({ metaOpen: false }));

    // If we received legacy data, the first emit converts it to the new shape
    // so saves go straight to gb_tile_match.
    let migrationEmitNeeded = Array.isArray(data)
      && data.length > 0
      && data.some((item) => looksLikeLegacyPair(item));

    function repaint() {
      const cap = maxPairsForGrade(ctx.grade);
      const recommended = defaultPairCountForGrade(ctx.grade);
      const atCap = state.length >= cap;

      container.innerHTML = `
        <div class="editor-list">
          <section class="editor-card">
            <div class="editor-header compact-header">
              <div>
                <p class="eyebrow">Tile Match</p>
                <h3>${state.length} pair${state.length === 1 ? "" : "s"}</h3>
              </div>
              <button class="btn btn-primary js-add-pair" type="button" ${atCap ? "disabled" : ""}>
                ${atCap ? `Max ${cap} reached` : "Add pair"}
              </button>
            </div>
            <p class="muted-text">
              Concept ↔ definition matching. Recommended pair count for Grade ${ctx.grade}: ${recommended} (max ${cap}).
              Each tile supports rich content (images, SVG, formatting). Per-pair metadata tunes Buzan color, branch-complete bonus, and Memory Palace tiles.
            </p>
            ${renderBoardWarnings(state, ctx)}
          </section>

          ${
            state.length
              ? state
                  .map((pair, index) => {
                    const isPremium = pair.tier === "premium";
                    return `
                      <section class="editor-card nested-card tm-item" data-index="${index}">
                        <div class="editor-header compact-header">
                          <div>
                            <p class="eyebrow">Pair ${index + 1} · ${escapeHtml(pair.id)}</p>
                            <h3>${escapeHtml(summary(pair.left))} ↔ ${escapeHtml(summary(pair.right))}</h3>
                          </div>
                          <button class="btn btn-danger js-remove-pair" type="button">Remove</button>
                        </div>

                        <div class="editor-grid">
                          <div class="field">
                            <span>Left tile (concept)</span>
                            <div class="js-rich-host" data-slot="left" data-index="${index}"></div>
                          </div>
                          <div class="field">
                            <span>Right tile (definition)</span>
                            <div class="js-rich-host" data-slot="right" data-index="${index}"></div>
                          </div>
                        </div>

                        <div class="editor-grid">
                          <label class="field">
                            <span>Tier</span>
                            <select class="js-field" data-key="tier">
                              ${TIERS.map(
                                (t) =>
                                  `<option value="${t}" ${pair.tier === t ? "selected" : ""}>${
                                    t === "premium" ? "Premium" : "Basic"
                                  }</option>`
                              ).join("")}
                            </select>
                            ${
                              !isPremium && pair.is_palace_tile
                                ? `<small class="sf-hint sf-hint-warning">Palace tiles auto-cleared on Basic tier.</small>`
                                : ""
                            }
                          </label>
                        </div>

                        <div class="editor-card nested-card tm-meta">
                          <div class="editor-header compact-header">
                            <div>
                              <p class="eyebrow">Metadata</p>
                              <h3>${ui[index].metaOpen ? "Editing" : "Collapsed"}</h3>
                            </div>
                            <button class="btn btn-ghost js-toggle-meta" type="button">
                              ${ui[index].metaOpen ? "Hide" : "Show"}
                            </button>
                          </div>
                          ${renderMetaBlock(pair, index, ui[index].metaOpen)}
                        </div>
                      </section>
                    `;
                  })
                  .join("")
              : `<div class="empty-state glass-card inline-empty">
                  <div class="empty-orb" aria-hidden="true">🧠</div>
                  <h3>No tile pairs</h3>
                  <p>Add concept ↔ definition pairs for the tile-match board.</p>
                  <button class="btn btn-primary js-add-pair" type="button">Add first pair</button>
                </div>`
          }
        </div>
      `;

      // Mount RichField into each slot.
      if (window.RichField && window.RichField.create) {
        container.querySelectorAll(".js-rich-host").forEach((host) => {
          const index = Number(host.dataset.index);
          const slot = host.dataset.slot;
          if (!Number.isFinite(index) || (slot !== "left" && slot !== "right")) return;
          const initial = state[index]?.[slot] || "";
          const editor = window.RichField.create({
            value: initial,
            placeholder: slot === "left" ? "Concept (term, formula, image)…" : "Definition (description, visual, example)…",
            compact: true,
            onChange: (html) => {
              state[index][slot] = html;
              emit(state, onChange);
            },
          });
          host.appendChild(editor);
        });
      }
    }

    container.oninput = (event) => {
      const itemEl = event.target.closest("[data-index]");
      if (!itemEl) return;
      const index = Number(itemEl.dataset.index);
      const item = state[index];
      if (!item) return;

      const field = event.target.closest(".js-field");
      if (!field) return;
      const key = field.dataset.key;
      if (!key) return;

      if (key === "tier") {
        item.tier = field.value === "premium" ? "premium" : "basic";
        if (item.tier !== "premium") item.is_palace_tile = false;
        emit(state, onChange);
        repaint();
        return;
      }

      if (key === "subject_family") {
        item.subject_family = SUBJECT_FAMILIES.includes(field.value) ? field.value : "general";
        emit(state, onChange);
        return;
      }

      if (key === "pisa_level") {
        item.pisa_level = PISA_LEVELS.includes(field.value) ? field.value : "";
        emit(state, onChange);
        return;
      }

      if (key === "difficulty") {
        item.difficulty = DIFFICULTIES.includes(field.value) ? field.value : "";
        emit(state, onChange);
        return;
      }

      if (key === "concept_family") {
        item.concept_family = field.value || "";
        emit(state, onChange);
        return;
      }

      if (key === "is_palace_tile") {
        item.is_palace_tile = Boolean(field.checked) && item.tier === "premium";
        emit(state, onChange);
        repaint();
        return;
      }

      if (key === "explanation") {
        item.explanation = field.value || "";
        emit(state, onChange);
        return;
      }
    };

    container.onclick = (event) => {
      if (event.target.closest(".js-add-pair")) {
        const cap = maxPairsForGrade(ctx.grade);
        if (state.length >= cap) return;
        state.push(makePair(ctx));
        ui.push({ metaOpen: false });
        emit(state, onChange);
        repaint();
        return;
      }

      const itemEl = event.target.closest("[data-index]");
      if (!itemEl) return;
      const index = Number(itemEl.dataset.index);
      if (!Number.isFinite(index)) return;

      if (event.target.closest(".js-remove-pair")) {
        state.splice(index, 1);
        ui.splice(index, 1);
        emit(state, onChange);
        repaint();
        return;
      }

      if (event.target.closest(".js-toggle-meta")) {
        ui[index].metaOpen = !ui[index].metaOpen;
        repaint();
        return;
      }
    };

    repaint();

    // Lazy-migrate legacy gb_memory_match input into gb_tile_match shape on
    // first render so the next save writes the new schema.
    if (migrationEmitNeeded) {
      migrationEmitNeeded = false;
      emit(state, onChange);
    }

    if (window.EditorUtils) {
      window.EditorUtils.bindPasteNormalizer(container);
    }
  }

  // Public surface — both the new flat function (4-arg) AND the legacy
  // `{ render }` object so the registry's `editor.render(...)` call path
  // keeps working without churn.
  window.GameBreakEditors.tileMatch = {
    render: tileMatchEditor,
  };
  // Direct reference for tests / callers that want the function.
  window.GameBreakEditors.tileMatchEditor = tileMatchEditor;
})();
