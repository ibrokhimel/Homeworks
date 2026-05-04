// frontend/js/editors/games/memory-palace.js
// Memory Palace (Method of Loci) builder editor.
// Contract storage: content_json.gb_memory_palace = { palaces: [...], concepts: [...] }
//
// Mounting (4-arg signature, mirrors TTT/Tile Match/RLC):
//   window.GameBreakEditors.memoryPalace.render(container, data, onChange, context)
//     where context = { grade?, subject?, tier? }
//
// Helpers are provided by _memory-palace-helpers.js (must load first).
// Falls back gracefully if helpers are not yet loaded.

(function () {
  "use strict";

  window.GameBreakEditors = window.GameBreakEditors || {};

  // ---------------------------------------------------------------------------
  // Helpers — delegate to MemoryPalaceHelpers when available; inline fallback.
  // ---------------------------------------------------------------------------

  function H() {
    return window.MemoryPalaceHelpers || {};
  }

  function subjectFamilyFor(subject) {
    if (H().subjectFamilyFor) return H().subjectFamilyFor(subject);
    return "universal";
  }

  function gradeBandFor(grade) {
    if (H().gradeBandFor) return H().gradeBandFor(grade);
    const g = Number(grade);
    if (!Number.isFinite(g)) return "mid";
    if (g <= 4) return "low";
    if (g <= 7) return "mid";
    return "high";
  }

  function getCatalogForSubject(subject) {
    if (H().getCatalogForSubject) return H().getCatalogForSubject(subject);
    return [];
  }

  function scaffoldFor(context) {
    if (H().scaffoldFor) return H().scaffoldFor(context);
    return { palaces: [], concepts: [] };
  }

  function ensureConceptId(concept, idx) {
    if (H().ensureConceptId) return H().ensureConceptId(concept, idx);
    if (concept && typeof concept.id === "string" && concept.id.trim()) return concept.id;
    return "mp-c" + (idx + 1);
  }

  function validatePalace(palace) {
    if (H().validatePalace) return H().validatePalace(palace);
    return { ok: true, errors: [] };
  }

  function validateConcept(concept) {
    if (H().validateConcept) return H().validateConcept(concept);
    return { ok: true, errors: [] };
  }

  function validateGame(game) {
    if (H().validateGame) return H().validateGame(game);
    return { ok: true, errors: [] };
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  function isObj(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
  }

  // Normalize the whole game object: ensure palaces + concepts arrays exist.
  function normalizeGame(data) {
    const safe = isObj(data) ? data : {};
    const palaces = Array.isArray(safe.palaces)
      ? safe.palaces.map(normalizePalace)
      : [];
    const concepts = Array.isArray(safe.concepts)
      ? safe.concepts.map(normalizeConcept)
      : [];
    return { palaces: palaces, concepts: concepts };
  }

  function normalizePalace(raw) {
    const p = isObj(raw) ? raw : {};
    const locs = Array.isArray(p.locations) ? p.locations.map(normalizeLocation) : [];
    while (locs.length < 5) locs.push({ name: "", sensory_cue: "" });
    const out = {
      key: typeof p.key === "string" ? p.key : "",
      name: typeof p.name === "string" ? p.name : "",
      icon: typeof p.icon === "string" ? p.icon : "",
      description: typeof p.description === "string" ? p.description : "",
      subject_family: typeof p.subject_family === "string" ? p.subject_family : "universal",
      tier: p.tier === "premium" ? "premium" : "basic",
      locations: locs.slice(0, 5),
    };
    return out;
  }

  function normalizeLocation(raw) {
    const l = isObj(raw) ? raw : {};
    return {
      name: typeof l.name === "string" ? l.name : "",
      sensory_cue: typeof l.sensory_cue === "string" ? l.sensory_cue : "",
    };
  }

  function normalizeConcept(raw, idx) {
    const c = isObj(raw) ? raw : {};
    return {
      id: typeof c.id === "string" && c.id.trim() ? c.id : ("mp-c" + ((idx || 0) + 1)),
      term: typeof c.term === "string" ? c.term : "",
      description: typeof c.description === "string" ? c.description : "",
      image_cue: typeof c.image_cue === "string" ? c.image_cue : "",
    };
  }

  function makeEmptyPalace() {
    return {
      key: "",
      name: "",
      icon: "",
      description: "",
      subject_family: "universal",
      tier: "basic",
      locations: [
        { name: "", sensory_cue: "" },
        { name: "", sensory_cue: "" },
        { name: "", sensory_cue: "" },
        { name: "", sensory_cue: "" },
        { name: "", sensory_cue: "" },
      ],
    };
  }

  function makeEmptyConcept(idx) {
    return { id: "mp-c" + (idx + 1), term: "", description: "", image_cue: "" };
  }

  // ---------------------------------------------------------------------------
  // Emit helper — auto-fills concept ids before emitting.
  // ---------------------------------------------------------------------------

  function toEmit(state) {
    const palaces = clone(state.palaces);
    const concepts = clone(state.concepts).map(function (c, i) {
      return Object.assign({}, c, { id: ensureConceptId(c, i) });
    });
    return { palaces: palaces, concepts: concepts };
  }

  function emit(state, onChange) {
    onChange(clone(toEmit(state)));
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  function renderValidationErrors(errors) {
    if (!errors || !errors.length) return "";
    return errors
      .map(function (e) {
        return '<p class="sf-hint sf-hint-warning mp-validation-error">' + escapeHtml(e) + "</p>";
      })
      .join("");
  }

  function renderPalaceCard(palace, index, state, onChange) {
    const result = validatePalace(palace);
    const MIN_PALACES = 4;
    const canRemove = state.palaces.length > MIN_PALACES;

    const locationsHtml = palace.locations
      .map(function (loc, li) {
        return (
          '<div class="mp-location-row nested-card" data-loc-idx="' + li + '">' +
          '<div class="editor-grid">' +
          '<div class="field">' +
          '<label class="field-label">Location ' + (li + 1) + ' name</label>' +
          '<input type="text" class="input mp-loc-name" data-palace-idx="' + index + '" data-loc-idx="' + li + '" value="' + escapeHtml(loc.name) + '" placeholder="e.g. Front door">' +
          '</div>' +
          '<div class="field">' +
          '<label class="field-label">Sensory cue</label>' +
          '<input type="text" class="input mp-loc-cue" data-palace-idx="' + index + '" data-loc-idx="' + li + '" value="' + escapeHtml(loc.sensory_cue) + '" placeholder="Vivid multi-sensory hint...">' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join("");

    return (
      '<section class="editor-card nested-card mp-palace-card" data-palace-idx="' + index + '">' +
      '<div class="editor-header compact-header">' +
      '<div>' +
      '<p class="eyebrow">Palace ' + (index + 1) +
      (palace.key ? ' · <code>' + escapeHtml(palace.key) + '</code>' : '') +
      '</p>' +
      '<h3>' + escapeHtml(palace.icon ? palace.icon + ' ' : '') + escapeHtml(palace.name || '(unnamed palace)') + '</h3>' +
      '</div>' +
      '<button class="btn btn-danger mp-remove-palace" type="button" data-palace-idx="' + index + '"' +
      (canRemove ? '' : ' disabled title="Need at least 4 palaces"') + '>Remove</button>' +
      '</div>' +
      renderValidationErrors(result.errors) +
      '<div class="editor-grid">' +
      '<div class="field">' +
      '<label class="field-label">Key (unique identifier)</label>' +
      '<input type="text" class="input mp-palace-key" data-palace-idx="' + index + '" value="' + escapeHtml(palace.key) + '" placeholder="e.g. bio_cell">' +
      '</div>' +
      '<div class="field">' +
      '<label class="field-label">Name</label>' +
      '<input type="text" class="input mp-palace-name" data-palace-idx="' + index + '" value="' + escapeHtml(palace.name) + '" placeholder="e.g. Inside the Cell">' +
      '</div>' +
      '<div class="field">' +
      '<label class="field-label">Icon (emoji)</label>' +
      '<input type="text" class="input mp-palace-icon" data-palace-idx="' + index + '" value="' + escapeHtml(palace.icon) + '" placeholder="🏠">' +
      '</div>' +
      '<div class="field">' +
      '<label class="field-label">Subject family</label>' +
      '<input type="text" class="input mp-palace-subject-family" data-palace-idx="' + index + '" value="' + escapeHtml(palace.subject_family) + '" placeholder="bio / chem / universal…">' +
      '</div>' +
      '<div class="field full-span">' +
      '<label class="field-label">Description</label>' +
      '<input type="text" class="input mp-palace-description" data-palace-idx="' + index + '" value="' + escapeHtml(palace.description) + '" placeholder="Brief list of 5 locations…">' +
      '</div>' +
      '</div>' +
      '<p class="eyebrow" style="margin-top:12px;">5 Locations</p>' +
      locationsHtml +
      '</section>'
    );
  }

  function renderCatalogPicker(catalog, state, onChange) {
    const selectedKeys = {};
    state.palaces.forEach(function (p) {
      if (p.key) selectedKeys[p.key] = true;
    });

    const chips = catalog
      .map(function (palace) {
        const checked = selectedKeys[palace.key] ? " mp-chip-selected" : "";
        return (
          '<button class="mp-catalog-chip' + checked + '" type="button" data-catalog-key="' + escapeHtml(palace.key) + '">' +
          escapeHtml(palace.icon || "") + " " + escapeHtml(palace.name) +
          "</button>"
        );
      })
      .join("");

    return (
      '<div class="mp-catalog-picker">' +
      '<p class="muted-text">Select ≥4 palaces for this homework. Click a palace to toggle selection, then click <strong>Materialise selected</strong> to load them into the editor.</p>' +
      '<div class="mp-catalog-chips">' + chips + '</div>' +
      '<div class="mp-catalog-actions" style="margin-top:8px;">' +
      '<button class="btn btn-primary mp-materialise-btn" type="button">Materialise selected</button>' +
      '</div>' +
      '</div>'
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  function render(container, data, onChange, context) {
    if (!container) return;

    const ctx = isObj(context)
      ? { grade: context.grade, subject: context.subject, tier: context.tier }
      : {};

    let state = normalizeGame(data);

    // Seed scaffold if empty and we have context.
    if (state.palaces.length === 0) {
      const scaffold = scaffoldFor(ctx);
      state = normalizeGame(scaffold);
      // Emit immediately so the homework saves with scaffolds.
      emit(state, onChange);
    }

    const family = subjectFamilyFor(ctx.subject);
    const band = gradeBandFor(ctx.grade);
    const catalog = getCatalogForSubject(ctx.subject);

    // Track whether picker overlay is open.
    let pickerOpen = false;

    function repaint() {
      const gameValidation = validateGame(state);

      container.innerHTML =
        '<div class="editor-list">' +

        // ── Top bar ──────────────────────────────────────────────────────────
        '<section class="editor-card">' +
        '<div class="editor-header">' +
        '<div>' +
        '<p class="eyebrow">Memory Palace — Method of Loci</p>' +
        '<h3>' + state.palaces.length + ' palace' + (state.palaces.length !== 1 ? 's' : '') +
        ' · ' + state.concepts.length + ' concept' + (state.concepts.length !== 1 ? 's' : '') + '</h3>' +
        '</div>' +
        '<button class="btn btn-secondary mp-add-custom-btn" type="button">+ Custom palace</button>' +
        '</div>' +
        '<p class="muted-text">' +
        'Subject: <strong>' + escapeHtml(ctx.subject || '(none)') + '</strong> → family: <strong>' + escapeHtml(family) + '</strong> · ' +
        'Grade band: <strong>' + escapeHtml(band) + '</strong>' +
        '</p>' +
        (gameValidation.errors.length
          ? '<div class="mp-game-errors">' + renderValidationErrors(gameValidation.errors) + '</div>'
          : '') +
        '</section>' +

        // ── Palaces section ──────────────────────────────────────────────────
        '<section class="editor-card">' +
        '<div class="editor-header compact-header">' +
        '<div>' +
        '<p class="eyebrow">Palaces</p>' +
        '<h3>Select and edit memory locations</h3>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button class="btn btn-secondary mp-open-picker-btn" type="button">Add from catalog</button>' +
        '</div>' +
        '</div>' +
        '<p class="muted-text">Each palace needs exactly 5 locations with vivid sensory cues.</p>' +
        (pickerOpen
          ? renderCatalogPicker(catalog, state, onChange)
          : '') +
        '</section>' +

        state.palaces
          .map(function (palace, idx) {
            return renderPalaceCard(palace, idx, state, onChange);
          })
          .join("") +

        // ── Concepts section ─────────────────────────────────────────────────
        '<section class="editor-card">' +
        '<div class="editor-header compact-header">' +
        '<div>' +
        '<p class="eyebrow">Concepts</p>' +
        '<h3>' + state.concepts.length + ' concept' + (state.concepts.length !== 1 ? 's' : '') + ' (min 3)</h3>' +
        '</div>' +
        '<button class="btn btn-primary mp-add-concept-btn" type="button">Add concept</button>' +
        '</div>' +
        '<p class="muted-text">Students will place these concepts into the palace locations. Each concept needs a term; description and image cue are optional but highly recommended.</p>' +
        '</section>' +

        state.concepts
          .map(function (concept, idx) {
            const result = validateConcept(concept);
            return (
              '<section class="editor-card nested-card mp-concept-card" data-concept-idx="' + idx + '">' +
              '<div class="editor-header compact-header">' +
              '<div>' +
              '<p class="eyebrow">Concept ' + (idx + 1) +
              ' · <code>' + escapeHtml(ensureConceptId(concept, idx)) + '</code></p>' +
              '<h3>' + escapeHtml(concept.term || '(no term yet)') + '</h3>' +
              '</div>' +
              '<button class="btn btn-danger mp-remove-concept" type="button" data-concept-idx="' + idx + '"' +
              (state.concepts.length > 3 ? '' : ' disabled title="Need at least 3 concepts"') + '>Remove</button>' +
              '</div>' +
              renderValidationErrors(result.errors) +
              '<div class="editor-grid">' +
              '<div class="field">' +
              '<label class="field-label">Term</label>' +
              '<input type="text" class="input mp-concept-term" data-concept-idx="' + idx + '" value="' + escapeHtml(concept.term) + '" placeholder="e.g. Mitochondria">' +
              '</div>' +
              '<div class="field">' +
              '<label class="field-label">Description</label>' +
              '<input type="text" class="input mp-concept-description" data-concept-idx="' + idx + '" value="' + escapeHtml(concept.description) + '" placeholder="Short definition…">' +
              '</div>' +
              '<div class="field full-span">' +
              '<label class="field-label">Image cue (vivid mental image)</label>' +
              '<input type="text" class="input mp-concept-image-cue" data-concept-idx="' + idx + '" value="' + escapeHtml(concept.image_cue) + '" placeholder="Imagine a glowing power station…">' +
              '</div>' +
              '</div>' +
              '</section>'
            );
          })
          .join("") +

        '</div>'; // .editor-list

      bindEvents();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Event binding
    // ──────────────────────────────────────────────────────────────────────────

    function bindEvents() {
      // ── Top bar ────────────────────────────────────────────────────────────
      const addCustomBtn = container.querySelector(".mp-add-custom-btn");
      if (addCustomBtn) {
        addCustomBtn.addEventListener("click", function () {
          const newState = clone(state);
          newState.palaces.push(makeEmptyPalace());
          state = newState;
          emit(state, onChange);
          repaint();
        });
      }

      // ── Picker toggle ───────────────────────────────────────────────────────
      const openPickerBtn = container.querySelector(".mp-open-picker-btn");
      if (openPickerBtn) {
        openPickerBtn.addEventListener("click", function () {
          pickerOpen = !pickerOpen;
          repaint();
        });
      }

      // ── Catalog chip toggling ───────────────────────────────────────────────
      container.querySelectorAll(".mp-catalog-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          chip.classList.toggle("mp-chip-selected");
        });
      });

      // ── Materialise selected catalog palaces ────────────────────────────────
      const materialiseBtn = container.querySelector(".mp-materialise-btn");
      if (materialiseBtn) {
        materialiseBtn.addEventListener("click", function () {
          const selectedChips = container.querySelectorAll(".mp-catalog-chip.mp-chip-selected");
          const selectedKeys = {};
          selectedChips.forEach(function (chip) {
            const k = chip.dataset.catalogKey;
            if (k) selectedKeys[k] = true;
          });

          // Build a map of current palace keys
          const existingKeys = {};
          state.palaces.forEach(function (p) {
            if (p.key) existingKeys[p.key] = true;
          });

          // Add newly selected palaces that aren't already in state
          const newPalaces = clone(state.palaces);
          catalog.forEach(function (p) {
            if (selectedKeys[p.key] && !existingKeys[p.key]) {
              newPalaces.push(normalizePalace(clone(p)));
            }
          });

          // Remove palaces that were deselected (only catalog palaces, not custom ones)
          const catalogKeys = {};
          catalog.forEach(function (p) { if (p.key) catalogKeys[p.key] = true; });

          const filtered = newPalaces.filter(function (p) {
            // Keep custom palaces (not in catalog) always.
            if (!catalogKeys[p.key]) return true;
            // Keep catalog palaces only if still selected.
            return selectedKeys[p.key];
          });

          const newState = clone(state);
          newState.palaces = filtered.map(normalizePalace);
          state = newState;
          pickerOpen = false;
          emit(state, onChange);
          repaint();
        });
      }

      // ── Remove palace ───────────────────────────────────────────────────────
      container.querySelectorAll(".mp-remove-palace").forEach(function (btn) {
        if (btn.disabled) return;
        btn.addEventListener("click", function () {
          const idx = parseInt(btn.dataset.palaceIdx, 10);
          if (isNaN(idx)) return;
          const MIN_PALACES = 4;
          if (state.palaces.length <= MIN_PALACES) {
            alert("At least " + MIN_PALACES + " palaces are required.");
            return;
          }
          const newState = clone(state);
          newState.palaces.splice(idx, 1);
          state = newState;
          emit(state, onChange);
          repaint();
        });
      });

      // ── Palace field edits ─────────────────────────────────────────────────
      ["mp-palace-key", "mp-palace-name", "mp-palace-icon", "mp-palace-description", "mp-palace-subject-family"].forEach(function (cls) {
        container.querySelectorAll("." + cls).forEach(function (input) {
          input.addEventListener("input", function () {
            const idx = parseInt(input.dataset.palaceIdx, 10);
            if (isNaN(idx)) return;
            const fieldMap = {
              "mp-palace-key": "key",
              "mp-palace-name": "name",
              "mp-palace-icon": "icon",
              "mp-palace-description": "description",
              "mp-palace-subject-family": "subject_family",
            };
            const field = fieldMap[cls];
            if (!field) return;
            const newState = clone(state);
            newState.palaces[idx][field] = input.value;
            state = newState;
            emit(state, onChange);
          });
        });
      });

      // ── Location name and cue edits ─────────────────────────────────────────
      container.querySelectorAll(".mp-loc-name, .mp-loc-cue").forEach(function (input) {
        input.addEventListener("input", function () {
          const pi = parseInt(input.dataset.palaceIdx, 10);
          const li = parseInt(input.dataset.locIdx, 10);
          if (isNaN(pi) || isNaN(li)) return;
          const field = input.classList.contains("mp-loc-name") ? "name" : "sensory_cue";
          const newState = clone(state);
          newState.palaces[pi].locations[li][field] = input.value;
          state = newState;
          emit(state, onChange);
        });
      });

      // ── Add concept ─────────────────────────────────────────────────────────
      const addConceptBtn = container.querySelector(".mp-add-concept-btn");
      if (addConceptBtn) {
        addConceptBtn.addEventListener("click", function () {
          const newState = clone(state);
          newState.concepts.push(makeEmptyConcept(newState.concepts.length));
          state = newState;
          emit(state, onChange);
          repaint();
        });
      }

      // ── Remove concept ──────────────────────────────────────────────────────
      container.querySelectorAll(".mp-remove-concept").forEach(function (btn) {
        if (btn.disabled) return;
        btn.addEventListener("click", function () {
          const idx = parseInt(btn.dataset.conceptIdx, 10);
          if (isNaN(idx)) return;
          if (state.concepts.length <= 3) {
            alert("At least 3 concepts are required.");
            return;
          }
          const newState = clone(state);
          newState.concepts.splice(idx, 1);
          // Re-assign ids sequentially after removal
          newState.concepts = newState.concepts.map(function (c, i) {
            return Object.assign({}, c, { id: ensureConceptId(c, i) });
          });
          state = newState;
          emit(state, onChange);
          repaint();
        });
      });

      // ── Concept field edits ─────────────────────────────────────────────────
      ["mp-concept-term", "mp-concept-description", "mp-concept-image-cue"].forEach(function (cls) {
        container.querySelectorAll("." + cls).forEach(function (input) {
          input.addEventListener("input", function () {
            const idx = parseInt(input.dataset.conceptIdx, 10);
            if (isNaN(idx)) return;
            const fieldMap = {
              "mp-concept-term": "term",
              "mp-concept-description": "description",
              "mp-concept-image-cue": "image_cue",
            };
            const field = fieldMap[cls];
            if (!field) return;
            const newState = clone(state);
            newState.concepts[idx][field] = input.value;
            state = newState;
            emit(state, onChange);
          });
        });
      });
    }

    repaint();
  }

  window.GameBreakEditors.memoryPalace = { render: render };
})();
