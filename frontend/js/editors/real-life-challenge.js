// frontend/js/editors/real-life-challenge.js
// Real-Life Challenge (RLC) editor: edits content_json.real_life_challenge.
//
// Coexists alongside the legacy `real-life.js` editor (which handles legacy
// content_json.real_life rows). This editor produces the new TileMatchPair-style
// `RealLifeChallengeCase` shape (Chunk A schema in server/schemas/content.py).
//
// Mounting (4-arg signature, mirrors Tile Match #137):
//   realLifeChallengeEditor(container, data, onChange, context = {})
//     where context = {grade?, subject?, tier?}
//
// Public surface:
//   window.Editors.realLifeChallenge      — { render }   (legacy registry, used by builder.js)
//   window.PhaseEditors.realLifeChallenge — function     (new namespace per plan §4a)
//
// See REAL_LIFE_CHALLENGE_BACKEND_PLAN.md §4 for the full spec.

(function () {
  "use strict";

  window.Editors = window.Editors || {};
  window.PhaseEditors = window.PhaseEditors || {};

  // ---------------------------------------------------------------------------
  // Helpers — use the canonical helpers from _real-life-challenge-helpers.js
  // when available; inline fallback so the editor still works in isolation.
  // ---------------------------------------------------------------------------

  function H() {
    return (window.RLCHelpers || {});
  }

  function gradeBandFromGrade(grade) {
    if (H().gradeBandFromGrade) return H().gradeBandFromGrade(grade);
    const g = Number(grade);
    if (!Number.isFinite(g)) return "g7_9";
    if (g <= 3) return "g1_3";
    if (g <= 6) return "g4_6";
    if (g <= 9) return "g7_9";
    return "g10_11";
  }

  function defaultPisaForGradeBand(band) {
    if (H().defaultPisaForGradeBand) return H().defaultPisaForGradeBand(band);
    return { g1_3: "L4", g4_6: "L4", g7_9: "L5", g10_11: "L6" }[band] || "L4";
  }

  function expertRoleOptions() {
    if (H().expertRoleOptions) return H().expertRoleOptions();
    return [
      "fire_inspector", "structural_engineer", "business_consultant",
      "medical_diagnostician", "agronomist", "teacher", "lawyer",
      "city_planner", "epidemiologist", "ethicist", "historian", "general",
    ];
  }

  function pisaLevelOptions() {
    return (H().pisaLevelOptions && H().pisaLevelOptions()) || ["L1", "L2", "L3", "L4", "L5", "L6"];
  }

  function tierOptions() {
    return (H().tierOptions && H().tierOptions()) || ["basic", "premium"];
  }

  function gradeBandOptions() {
    return (H().gradeBandOptions && H().gradeBandOptions()) || ["g1_3", "g4_6", "g7_9", "g10_11"];
  }

  function variantOptions() {
    return (H().variantOptions && H().variantOptions()) || ["standard", "creative_thinking"];
  }

  function buildScaffoldCase(band, role, tier) {
    if (H().buildScaffoldCase) return H().buildScaffoldCase(band, role, tier);
    return null;
  }

  function expertRoleFromSubject(subject) {
    if (H().expertRoleFromSubject) return H().expertRoleFromSubject(subject);
    return "general";
  }

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const STEP_KINDS = ["decision", "info_request", "final_decision", "concept_select", "reasoning"];
  const STEP_KIND_LABELS = {
    decision: "1-bosqich · Decision",
    info_request: "2-bosqich · Info request",
    final_decision: "3-bosqich · Final decision",
    concept_select: "4-bosqich · Concept select",
    reasoning: "5-bosqich · Reasoning",
  };
  const IMPACT_OPTIONS = ["positive", "neutral", "negative"];
  const TITLE_MAX = 200;
  const INTRO_MAX = 600;

  // ---------------------------------------------------------------------------
  // String / state utilities
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

  function defaultContext() {
    return { grade: 8, subject: "general", tier: "basic" };
  }

  function mergeContext(context) {
    const d = defaultContext();
    if (!isObj(context)) return d;
    return {
      grade: context.grade != null ? context.grade : d.grade,
      subject: context.subject != null ? context.subject : d.subject,
      tier: context.tier != null ? context.tier : d.tier,
    };
  }

  // ---------------------------------------------------------------------------
  // Normalization — accepts either a raw RealLifeChallengeCase OR null/undefined.
  // The legacy `real_life` shape (with q1..q6) is NOT mutated here — that's a
  // separate phase, edited by the legacy editor. If we receive a legacy-shaped
  // blob by mistake, we ignore it and scaffold a new RLC case.
  // ---------------------------------------------------------------------------

  function looksLikeRLCCase(data) {
    return isObj(data) && Array.isArray(data.steps) && typeof data.expert_role === "string";
  }

  function looksLikeLegacyRL(data) {
    return isObj(data) && (data.q1 || data.q2 || data.q3 || data.story);
  }

  function normalizeStep(raw, kind, index) {
    const item = isObj(raw) ? raw : {};
    const out = {
      id: typeof item.id === "string" && item.id ? item.id : `step${index + 1}`,
      kind, // kind is locked by index — we always overwrite to enforce spec order
      title: typeof item.title === "string" ? item.title : "",
      prompt: typeof item.prompt === "string" ? item.prompt : "",
    };
    if (kind === "decision" || kind === "info_request" || kind === "final_decision") {
      out.options = Array.isArray(item.options) ? item.options.map(normalizeOption) : [];
    }
    if (kind === "concept_select") {
      out.concept_chips = Array.isArray(item.concept_chips)
        ? item.concept_chips.map(normalizeChip)
        : [];
    }
    if (kind === "reasoning") {
      out.placeholder = typeof item.placeholder === "string" ? item.placeholder : "";
      const mc = Number(item.min_chars);
      out.min_chars = Number.isFinite(mc) && mc >= 20 && mc <= 1000 ? mc : 80;
      out.acceptable_keywords = Array.isArray(item.acceptable_keywords)
        ? item.acceptable_keywords.map((k) => String(k || "")).filter(Boolean)
        : [];
    }
    return out;
  }

  function normalizeOption(raw) {
    const item = isObj(raw) ? raw : {};
    const cost = isObj(item.info_cost) ? item.info_cost : null;
    const out = {
      id: typeof item.id === "string" && item.id ? item.id : "",
      label: typeof item.label === "string" ? item.label : "",
      is_correct: Boolean(item.is_correct),
      consequence: typeof item.consequence === "string" ? item.consequence : "",
    };
    if (cost) {
      out.info_cost = {
        time: typeof cost.time === "string" ? cost.time : "",
        budget: typeof cost.budget === "string" ? cost.budget : "",
        access: typeof cost.access === "string" ? cost.access : "",
      };
    }
    return out;
  }

  function normalizeChip(raw) {
    const item = isObj(raw) ? raw : {};
    return {
      id: typeof item.id === "string" && item.id ? item.id : "",
      label: typeof item.label === "string" ? item.label : "",
      is_correct: Boolean(item.is_correct),
    };
  }

  function normalizeCase(data, ctx) {
    const safeTier = ctx.tier === "premium" ? "premium" : "basic";

    if (!looksLikeRLCCase(data)) {
      // Legacy-RL or empty → start a fresh scaffold.
      const band = gradeBandFromGrade(ctx.grade);
      const role = expertRoleFromSubject(ctx.subject);
      const scaffold = buildScaffoldCase(band, role, safeTier);
      if (scaffold) return { ...scaffold, _wasLegacy: looksLikeLegacyRL(data) };
      return {
        id: "rlc_new",
        expert_role: role,
        title: "",
        intro: "",
        pisa_level: defaultPisaForGradeBand(band),
        tier: safeTier,
        grade_band: band,
        variant: "standard",
        steps: STEP_KINDS.map((k, i) => normalizeStep({}, k, i)),
        _wasLegacy: looksLikeLegacyRL(data),
      };
    }

    // Existing RLC case — normalize but preserve fields.
    const stepsIn = Array.isArray(data.steps) ? data.steps : [];
    const steps = STEP_KINDS.map((k, i) => normalizeStep(stepsIn[i], k, i));

    const tier = data.tier === "premium" ? "premium" : "basic";

    const variant = data.variant === "creative_thinking" && tier === "premium"
      ? "creative_thinking"
      : "standard";

    const out = {
      id: typeof data.id === "string" && data.id ? data.id : "rlc_new",
      expert_role: typeof data.expert_role === "string" ? data.expert_role : "general",
      title: typeof data.title === "string" ? data.title : "",
      intro: typeof data.intro === "string" ? data.intro : "",
      pisa_level: pisaLevelOptions().includes(data.pisa_level)
        ? data.pisa_level
        : defaultPisaForGradeBand(data.grade_band || gradeBandFromGrade(ctx.grade)),
      tier,
      grade_band: gradeBandOptions().includes(data.grade_band)
        ? data.grade_band
        : gradeBandFromGrade(ctx.grade),
      variant,
      steps,
    };

    // Optional forward-compat fields — pass through.
    if (Array.isArray(data.stakeholders)) {
      out.stakeholders = data.stakeholders.map((s) => ({
        id: typeof s?.id === "string" ? s.id : "",
        name: typeof s?.name === "string" ? s.name : "",
        role: typeof s?.role === "string" ? s.role : "",
        avatar_emoji: typeof s?.avatar_emoji === "string" ? s.avatar_emoji : "",
      }));
    }
    if (Array.isArray(data.consequences)) {
      out.consequences = data.consequences.map((c) => ({
        label: typeof c?.label === "string" ? c.label : "",
        impact: IMPACT_OPTIONS.includes(c?.impact) ? c.impact : "neutral",
        weight: Number.isFinite(Number(c?.weight)) ? Number(c.weight) : null,
      }));
    }
    if (typeof data.memory_palace_location === "string" && tier === "premium") {
      out.memory_palace_location = data.memory_palace_location;
    }

    return out;
  }

  // ---------------------------------------------------------------------------
  // Emit — strip UI-only flags (`_wasLegacy`) and tier-gated fields.
  // ---------------------------------------------------------------------------

  function toEmit(state) {
    const out = {
      id: state.id,
      expert_role: state.expert_role,
      title: state.title,
      intro: state.intro,
      pisa_level: state.pisa_level,
      tier: state.tier,
      grade_band: state.grade_band,
      variant: state.tier === "premium" ? state.variant : "standard",
      steps: state.steps.map((s) => {
        const step = { id: s.id, kind: s.kind, title: s.title, prompt: s.prompt };
        if (s.options) {
          step.options = s.options.map((o) => {
            const opt = {
              id: o.id,
              label: o.label,
              is_correct: Boolean(o.is_correct),
              consequence: o.consequence || "",
            };
            if (o.info_cost) opt.info_cost = { ...o.info_cost };
            return opt;
          });
        }
        if (s.concept_chips) {
          step.concept_chips = s.concept_chips.map((c) => ({
            id: c.id,
            label: c.label,
            is_correct: Boolean(c.is_correct),
          }));
        }
        if (s.kind === "reasoning") {
          step.placeholder = s.placeholder || "";
          step.min_chars = Number.isFinite(s.min_chars) ? s.min_chars : 80;
          step.acceptable_keywords = Array.isArray(s.acceptable_keywords)
            ? [...s.acceptable_keywords]
            : [];
        }
        return step;
      }),
    };

    if (Array.isArray(state.stakeholders) && state.stakeholders.length) {
      out.stakeholders = clone(state.stakeholders);
    }
    if (Array.isArray(state.consequences) && state.consequences.length) {
      out.consequences = clone(state.consequences);
    }
    // Premium-gated fields — never emit on basic.
    if (state.tier === "premium" && state.memory_palace_location) {
      out.memory_palace_location = state.memory_palace_location;
    }

    return out;
  }

  function emit(state, onChange) {
    onChange(clone(toEmit(state)));
  }

  // ---------------------------------------------------------------------------
  // Soft-warning validators — server Pydantic enforces hard rules.
  // ---------------------------------------------------------------------------

  function validateCase(state) {
    const warnings = [];
    if (!state.title.trim()) warnings.push("Title is empty.");
    if (!state.intro.trim()) warnings.push("Intro is empty (1-3 sentence scenario hook).");
    if (state.title.length > TITLE_MAX) warnings.push(`Title exceeds ${TITLE_MAX} chars.`);
    if (state.intro.length > INTRO_MAX) warnings.push(`Intro exceeds ${INTRO_MAX} chars.`);

    state.steps.forEach((s, i) => {
      const tag = `Step ${i + 1} (${s.kind})`;
      if (!s.prompt.trim()) warnings.push(`${tag}: prompt empty.`);
      if (s.kind === "decision" || s.kind === "info_request" || s.kind === "final_decision") {
        if (!s.options || s.options.length < 2) {
          warnings.push(`${tag}: needs ≥2 options.`);
        } else {
          const correct = s.options.filter((o) => o.is_correct).length;
          if (correct !== 1) warnings.push(`${tag}: must mark exactly 1 option correct (found ${correct}).`);
          if (s.options.some((o) => !o.label.trim())) warnings.push(`${tag}: every option needs a label.`);
        }
      }
      if (s.kind === "concept_select") {
        if (!s.concept_chips || s.concept_chips.length < 3) {
          warnings.push(`${tag}: needs ≥3 chips.`);
        } else {
          const correct = s.concept_chips.filter((c) => c.is_correct).length;
          if (correct !== 1) warnings.push(`${tag}: must mark exactly 1 chip correct (found ${correct}).`);
          if (s.concept_chips.some((c) => !c.label.trim())) warnings.push(`${tag}: every chip needs a label.`);
        }
      }
      if (s.kind === "reasoning") {
        if (!Number.isFinite(s.min_chars) || s.min_chars < 20 || s.min_chars > 1000) {
          warnings.push(`${tag}: min_chars must be in [20, 1000].`);
        }
      }
    });

    return warnings;
  }

  // ---------------------------------------------------------------------------
  // Render fragments
  // ---------------------------------------------------------------------------

  function renderTopBar(state, ctx) {
    const isPremium = state.tier === "premium";
    const variants = variantOptions();
    return `
      <section class="editor-card">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">Real-Life Challenge</p>
            <h3>${escapeHtml(state.title || "Untitled case")}</h3>
          </div>
        </div>

        <div class="editor-grid">
          <label class="field full-span">
            <span>Title (≤${TITLE_MAX} chars)</span>
            <input class="js-root-field" data-key="title" type="text"
              maxlength="${TITLE_MAX}" value="${escapeHtml(state.title)}"
              placeholder="e.g., Bozordagi yong'in tahlili" />
          </label>

          <label class="field full-span">
            <span>Intro (1-3 sentences, ≤${INTRO_MAX} chars)</span>
            <textarea class="js-root-field" data-key="intro" rows="3"
              maxlength="${INTRO_MAX}"
              placeholder="Scenario hook: who, where, what's at stake.">${escapeHtml(state.intro)}</textarea>
          </label>

          <label class="field">
            <span>Expert role</span>
            <select class="js-root-field" data-key="expert_role">
              ${expertRoleOptions().map(
                (r) => `<option value="${r}" ${state.expert_role === r ? "selected" : ""}>${r}</option>`
              ).join("")}
            </select>
          </label>

          <label class="field">
            <span>PISA level</span>
            <select class="js-root-field" data-key="pisa_level">
              ${pisaLevelOptions().map(
                (l) => `<option value="${l}" ${state.pisa_level === l ? "selected" : ""}>${l}</option>`
              ).join("")}
            </select>
          </label>

          <label class="field">
            <span>Tier</span>
            <select class="js-root-field" data-key="tier">
              ${tierOptions().map(
                (t) => `<option value="${t}" ${state.tier === t ? "selected" : ""}>${
                  t === "premium" ? "Premium" : "Basic"
                }</option>`
              ).join("")}
            </select>
          </label>

          <label class="field">
            <span>Grade band</span>
            <select class="js-root-field" data-key="grade_band">
              ${gradeBandOptions().map(
                (b) => `<option value="${b}" ${state.grade_band === b ? "selected" : ""}>${b}</option>`
              ).join("")}
            </select>
          </label>

          <label class="field">
            <span>Variant ${isPremium ? "" : "(creative_thinking is premium-only)"}</span>
            <select class="js-root-field" data-key="variant">
              ${variants.map((v) => {
                const disabled = v === "creative_thinking" && !isPremium ? "disabled" : "";
                const selected = state.variant === v ? "selected" : "";
                return `<option value="${v}" ${selected} ${disabled}>${v}</option>`;
              }).join("")}
            </select>
          </label>
        </div>

        ${
          ctx && state._wasLegacy
            ? `<p class="muted-text" style="margin-top:8px;">
                <strong>Note.</strong> Legacy <code>real_life</code> content was detected on this homework.
                Saving here will create a new RLC case alongside it.
              </p>`
            : ""
        }
      </section>
    `;
  }

  function renderDecisionStep(s, index) {
    return `
      <section class="editor-card nested-card rlc-step" data-step-index="${index}">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">${escapeHtml(STEP_KIND_LABELS[s.kind] || s.kind)}</p>
            <h3>${escapeHtml(s.title || "Untitled step")}</h3>
          </div>
          <button class="btn btn-ghost js-add-option" type="button">Add option</button>
        </div>

        <div class="editor-grid">
          <label class="field full-span">
            <span>Step title</span>
            <input class="js-step-field" data-key="title" type="text"
              value="${escapeHtml(s.title)}" placeholder="1-bosqich. Vaziyatni baholash" />
          </label>

          <label class="field full-span">
            <span>Prompt (student-visible)</span>
            <textarea class="js-step-field" data-key="prompt" rows="3"
              placeholder="Question shown to the student.">${escapeHtml(s.prompt)}</textarea>
          </label>
        </div>

        <div class="editor-list">
          ${(s.options || []).map((o, oi) => renderOption(o, index, oi, s.kind)).join("")}
        </div>
      </section>
    `;
  }

  function renderOption(o, stepIndex, optIndex, kind) {
    const isInfo = kind === "info_request";
    const cost = o.info_cost || { time: "", budget: "", access: "" };
    return `
      <div class="editor-card nested-card rlc-option" data-step-index="${stepIndex}" data-opt-index="${optIndex}">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">Option ${optIndex + 1} · ${escapeHtml(o.id || "—")}</p>
            <h3>${escapeHtml(o.label || "Untitled option")}</h3>
          </div>
          <button class="btn btn-danger js-remove-option" type="button">Remove</button>
        </div>

        <div class="editor-grid">
          <label class="field">
            <span>ID</span>
            <input class="js-option-field" data-key="id" type="text"
              value="${escapeHtml(o.id)}" placeholder="a" />
          </label>

          <label class="field">
            <span>Correct?</span>
            <label class="rlc-radio">
              <input class="js-correct-radio" type="radio"
                name="rlc-correct-${stepIndex}" ${o.is_correct ? "checked" : ""} />
              <span>${o.is_correct ? "Marked correct" : "Mark correct"}</span>
            </label>
          </label>

          <label class="field full-span">
            <span>Label (student-visible)</span>
            <input class="js-option-field" data-key="label" type="text"
              value="${escapeHtml(o.label)}" placeholder="Option text shown to student" />
          </label>

          <label class="field full-span">
            <span>Consequence (server-only — shown only after wrong attempt)</span>
            <textarea class="js-option-field" data-key="consequence" rows="2"
              placeholder="What happens if the student picks this option (revealed pedagogically).">${escapeHtml(o.consequence)}</textarea>
          </label>

          ${
            isInfo
              ? `
                <label class="field">
                  <span>Cost — time</span>
                  <input class="js-option-cost" data-cost-key="time" type="text"
                    value="${escapeHtml(cost.time)}" placeholder="e.g., 1 hour" />
                </label>
                <label class="field">
                  <span>Cost — budget</span>
                  <input class="js-option-cost" data-cost-key="budget" type="text"
                    value="${escapeHtml(cost.budget)}" placeholder="e.g., 50,000 so'm" />
                </label>
                <label class="field">
                  <span>Cost — access</span>
                  <input class="js-option-cost" data-cost-key="access" type="text"
                    value="${escapeHtml(cost.access)}" placeholder="e.g., expert-only" />
                </label>
              `
              : ""
          }
        </div>
      </div>
    `;
  }

  function renderConceptStep(s, index) {
    return `
      <section class="editor-card nested-card rlc-step" data-step-index="${index}">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">${escapeHtml(STEP_KIND_LABELS[s.kind])}</p>
            <h3>${escapeHtml(s.title || "Untitled step")}</h3>
          </div>
          <button class="btn btn-ghost js-add-chip" type="button">Add chip</button>
        </div>

        <div class="editor-grid">
          <label class="field full-span">
            <span>Step title</span>
            <input class="js-step-field" data-key="title" type="text"
              value="${escapeHtml(s.title)}" />
          </label>
          <label class="field full-span">
            <span>Prompt</span>
            <textarea class="js-step-field" data-key="prompt" rows="3">${escapeHtml(s.prompt)}</textarea>
          </label>
        </div>

        <div class="editor-list">
          ${(s.concept_chips || []).map((c, ci) => `
            <div class="editor-card nested-card rlc-chip" data-step-index="${index}" data-chip-index="${ci}">
              <div class="editor-header compact-header">
                <div>
                  <p class="eyebrow">Chip ${ci + 1} · ${escapeHtml(c.id || "—")}</p>
                  <h3>${escapeHtml(c.label || "Untitled chip")}</h3>
                </div>
                <button class="btn btn-danger js-remove-chip" type="button">Remove</button>
              </div>
              <div class="editor-grid">
                <label class="field">
                  <span>ID</span>
                  <input class="js-chip-field" data-key="id" type="text"
                    value="${escapeHtml(c.id)}" placeholder="c1" />
                </label>
                <label class="field">
                  <span>Correct?</span>
                  <label class="rlc-radio">
                    <input class="js-chip-correct-radio" type="radio"
                      name="rlc-chip-${index}" ${c.is_correct ? "checked" : ""} />
                    <span>${c.is_correct ? "Marked correct" : "Mark correct"}</span>
                  </label>
                </label>
                <label class="field full-span">
                  <span>Label</span>
                  <input class="js-chip-field" data-key="label" type="text"
                    value="${escapeHtml(c.label)}" placeholder="Concept label" />
                </label>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderReasoningStep(s, index) {
    const keywords = (s.acceptable_keywords || []).join(", ");
    return `
      <section class="editor-card nested-card rlc-step" data-step-index="${index}">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">${escapeHtml(STEP_KIND_LABELS[s.kind])}</p>
            <h3>${escapeHtml(s.title || "Untitled step")}</h3>
          </div>
        </div>

        <div class="editor-grid">
          <label class="field full-span">
            <span>Step title</span>
            <input class="js-step-field" data-key="title" type="text"
              value="${escapeHtml(s.title)}" />
          </label>
          <label class="field full-span">
            <span>Prompt</span>
            <textarea class="js-step-field" data-key="prompt" rows="3">${escapeHtml(s.prompt)}</textarea>
          </label>
          <label class="field">
            <span>Min chars (20-1000)</span>
            <input class="js-step-field" data-key="min_chars" type="number"
              min="20" max="1000" value="${Number(s.min_chars) || 80}" />
          </label>
          <label class="field full-span">
            <span>Placeholder (textarea hint)</span>
            <input class="js-step-field" data-key="placeholder" type="text"
              value="${escapeHtml(s.placeholder)}" />
          </label>
          <label class="field full-span">
            <span>Acceptable keywords (server-only — guides AI grader, never shown to student)</span>
            <textarea class="js-step-field" data-key="acceptable_keywords" rows="2"
              placeholder="comma-separated, e.g., risk, escape, trade-off">${escapeHtml(keywords)}</textarea>
          </label>
        </div>
      </section>
    `;
  }

  function renderStep(s, index) {
    if (s.kind === "concept_select") return renderConceptStep(s, index);
    if (s.kind === "reasoning") return renderReasoningStep(s, index);
    return renderDecisionStep(s, index);
  }

  function renderStakeholdersBlock(state) {
    const list = state.stakeholders || [];
    return `
      <section class="editor-card nested-card">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">Stakeholders (optional, schema-ready)</p>
            <h3>${list.length} stakeholder${list.length === 1 ? "" : "s"}</h3>
          </div>
          <button class="btn btn-ghost js-add-stakeholder" type="button">Add stakeholder</button>
        </div>
        <div class="editor-list">
          ${list.map((sh, idx) => `
            <div class="editor-card nested-card rlc-stakeholder" data-stake-index="${idx}">
              <div class="editor-header compact-header">
                <div><p class="eyebrow">#${idx + 1}</p><h3>${escapeHtml(sh.name || "Unnamed")}</h3></div>
                <button class="btn btn-danger js-remove-stakeholder" type="button">Remove</button>
              </div>
              <div class="editor-grid">
                <label class="field"><span>ID</span>
                  <input class="js-stake-field" data-key="id" type="text"
                    value="${escapeHtml(sh.id)}" /></label>
                <label class="field"><span>Name</span>
                  <input class="js-stake-field" data-key="name" type="text"
                    value="${escapeHtml(sh.name)}" /></label>
                <label class="field"><span>Role</span>
                  <input class="js-stake-field" data-key="role" type="text"
                    value="${escapeHtml(sh.role)}" /></label>
                <label class="field"><span>Avatar emoji</span>
                  <input class="js-stake-field" data-key="avatar_emoji" type="text"
                    value="${escapeHtml(sh.avatar_emoji)}" /></label>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderConsequencesBlock(state) {
    const list = state.consequences || [];
    return `
      <section class="editor-card nested-card">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">Consequences (optional, schema-ready)</p>
            <h3>${list.length} consequence${list.length === 1 ? "" : "s"}</h3>
          </div>
          <button class="btn btn-ghost js-add-consequence" type="button">Add consequence</button>
        </div>
        <div class="editor-list">
          ${list.map((c, idx) => `
            <div class="editor-card nested-card rlc-consequence" data-cons-index="${idx}">
              <div class="editor-header compact-header">
                <div><p class="eyebrow">#${idx + 1}</p><h3>${escapeHtml(c.label || "Unnamed")}</h3></div>
                <button class="btn btn-danger js-remove-consequence" type="button">Remove</button>
              </div>
              <div class="editor-grid">
                <label class="field full-span"><span>Label</span>
                  <input class="js-cons-field" data-key="label" type="text"
                    value="${escapeHtml(c.label)}" /></label>
                <label class="field"><span>Impact</span>
                  <select class="js-cons-field" data-key="impact">
                    ${IMPACT_OPTIONS.map((i) =>
                      `<option value="${i}" ${c.impact === i ? "selected" : ""}>${i}</option>`
                    ).join("")}
                  </select></label>
                <label class="field"><span>Weight (1-5)</span>
                  <input class="js-cons-field" data-key="weight" type="number"
                    min="1" max="5" value="${c.weight == null ? "" : c.weight}" /></label>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderPalaceBlock(state) {
    const isPremium = state.tier === "premium";
    const value = state.memory_palace_location || "";
    const warn = !isPremium && value
      ? `<small class="sf-hint sf-hint-warning">Memory Palace is premium-only — value will be stripped on save.</small>`
      : "";
    return `
      <section class="editor-card nested-card">
        <div class="editor-header compact-header">
          <div>
            <p class="eyebrow">Memory Palace location (premium, schema-ready)</p>
            <h3>${isPremium ? "Premium tier" : "Disabled — switch to Premium"}</h3>
          </div>
        </div>
        <div class="editor-grid">
          <label class="field full-span">
            <span>Location label</span>
            <input class="js-root-field" data-key="memory_palace_location" type="text"
              value="${escapeHtml(value)}" placeholder="e.g., Chorsu bozori — qovurma do'koni"
              ${isPremium ? "" : "disabled"} />
            ${warn}
          </label>
        </div>
      </section>
    `;
  }

  function renderWarnings(state) {
    const warnings = validateCase(state);
    if (!warnings.length) return "";
    return `<ul class="sf-validation sf-validation-warning">${warnings
      .map((w) => `<li>${escapeHtml(w)}</li>`)
      .join("")}</ul>`;
  }

  // ---------------------------------------------------------------------------
  // Main render entry
  // ---------------------------------------------------------------------------

  function realLifeChallengeEditor(container, data, onChange, context = {}) {
    if (!container) return;
    const ctx = mergeContext(context);
    const state = normalizeCase(data, ctx);

    let migrationEmitNeeded = !looksLikeRLCCase(data);

    function repaint() {
      container.innerHTML = `
        <div class="editor-list rlc-editor">
          ${renderTopBar(state, ctx)}
          ${renderWarnings(state)}
          ${state.steps.map((s, i) => renderStep(s, i)).join("")}
          ${renderStakeholdersBlock(state)}
          ${renderConsequencesBlock(state)}
          ${renderPalaceBlock(state)}
        </div>
      `;
    }

    container.oninput = (event) => {
      const root = event.target.closest(".js-root-field");
      const stepField = event.target.closest(".js-step-field");
      const optField = event.target.closest(".js-option-field");
      const optCost = event.target.closest(".js-option-cost");
      const chipField = event.target.closest(".js-chip-field");
      const stakeField = event.target.closest(".js-stake-field");
      const consField = event.target.closest(".js-cons-field");

      if (root) {
        const key = root.dataset.key;
        const value = root.value;
        if (key === "tier") {
          state.tier = value === "premium" ? "premium" : "basic";
          if (state.tier !== "premium") {
            state.variant = "standard";
            // Keep memory_palace_location in state so user can re-enable, but
            // emit() strips it.
          }
          emit(state, onChange);
          repaint();
          return;
        }
        if (key === "variant") {
          if (value === "creative_thinking" && state.tier !== "premium") {
            // Defensive — option is disabled but in case browser allows it.
            state.variant = "standard";
          } else {
            state.variant = value;
          }
          emit(state, onChange);
          return;
        }
        if (key === "grade_band") {
          state.grade_band = value;
          emit(state, onChange);
          return;
        }
        if (key === "pisa_level") {
          state.pisa_level = value;
          emit(state, onChange);
          return;
        }
        if (key === "expert_role") {
          state.expert_role = value;
          emit(state, onChange);
          return;
        }
        if (key === "memory_palace_location") {
          state.memory_palace_location = value;
          emit(state, onChange);
          return;
        }
        // title / intro
        state[key] = value;
        emit(state, onChange);
        return;
      }

      if (stepField) {
        const stepEl = stepField.closest("[data-step-index]");
        const idx = Number(stepEl?.dataset.stepIndex);
        const step = state.steps[idx];
        if (!step) return;
        const key = stepField.dataset.key;
        if (key === "min_chars") {
          const n = Number(stepField.value);
          step.min_chars = Number.isFinite(n) ? n : 80;
        } else if (key === "acceptable_keywords") {
          step.acceptable_keywords = String(stepField.value || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          step[key] = stepField.value;
        }
        emit(state, onChange);
        return;
      }

      if (optField) {
        const stepEl = optField.closest("[data-step-index]");
        const optEl = optField.closest("[data-opt-index]");
        const sIdx = Number(stepEl?.dataset.stepIndex);
        const oIdx = Number(optEl?.dataset.optIndex);
        const step = state.steps[sIdx];
        const opt = step?.options?.[oIdx];
        if (!opt) return;
        opt[optField.dataset.key] = optField.value;
        emit(state, onChange);
        return;
      }

      if (optCost) {
        const stepEl = optCost.closest("[data-step-index]");
        const optEl = optCost.closest("[data-opt-index]");
        const sIdx = Number(stepEl?.dataset.stepIndex);
        const oIdx = Number(optEl?.dataset.optIndex);
        const step = state.steps[sIdx];
        const opt = step?.options?.[oIdx];
        if (!opt) return;
        if (!opt.info_cost) opt.info_cost = { time: "", budget: "", access: "" };
        opt.info_cost[optCost.dataset.costKey] = optCost.value;
        emit(state, onChange);
        return;
      }

      if (chipField) {
        const stepEl = chipField.closest("[data-step-index]");
        const chipEl = chipField.closest("[data-chip-index]");
        const sIdx = Number(stepEl?.dataset.stepIndex);
        const cIdx = Number(chipEl?.dataset.chipIndex);
        const step = state.steps[sIdx];
        const chip = step?.concept_chips?.[cIdx];
        if (!chip) return;
        chip[chipField.dataset.key] = chipField.value;
        emit(state, onChange);
        return;
      }

      if (stakeField) {
        const idx = Number(stakeField.closest("[data-stake-index]")?.dataset.stakeIndex);
        const sh = state.stakeholders?.[idx];
        if (!sh) return;
        sh[stakeField.dataset.key] = stakeField.value;
        emit(state, onChange);
        return;
      }

      if (consField) {
        const idx = Number(consField.closest("[data-cons-index]")?.dataset.consIndex);
        const c = state.consequences?.[idx];
        if (!c) return;
        const key = consField.dataset.key;
        if (key === "weight") {
          const n = Number(consField.value);
          c.weight = Number.isFinite(n) ? n : null;
        } else {
          c[key] = consField.value;
        }
        emit(state, onChange);
      }
    };

    container.onchange = (event) => {
      const correctRadio = event.target.closest(".js-correct-radio");
      const chipRadio = event.target.closest(".js-chip-correct-radio");

      if (correctRadio) {
        const stepEl = correctRadio.closest("[data-step-index]");
        const optEl = correctRadio.closest("[data-opt-index]");
        const sIdx = Number(stepEl?.dataset.stepIndex);
        const oIdx = Number(optEl?.dataset.optIndex);
        const step = state.steps[sIdx];
        if (!step?.options) return;
        step.options.forEach((o, i) => {
          o.is_correct = i === oIdx;
        });
        emit(state, onChange);
        repaint();
        return;
      }

      if (chipRadio) {
        const stepEl = chipRadio.closest("[data-step-index]");
        const chipEl = chipRadio.closest("[data-chip-index]");
        const sIdx = Number(stepEl?.dataset.stepIndex);
        const cIdx = Number(chipEl?.dataset.chipIndex);
        const step = state.steps[sIdx];
        if (!step?.concept_chips) return;
        step.concept_chips.forEach((c, i) => {
          c.is_correct = i === cIdx;
        });
        emit(state, onChange);
        repaint();
      }
    };

    container.onclick = (event) => {
      // Add option
      if (event.target.closest(".js-add-option")) {
        const stepEl = event.target.closest("[data-step-index]");
        const idx = Number(stepEl?.dataset.stepIndex);
        const step = state.steps[idx];
        if (!step?.options) return;
        const nextId = String.fromCharCode(97 + step.options.length); // a, b, c...
        const opt = {
          id: nextId,
          label: "",
          is_correct: false,
          consequence: "",
        };
        if (step.kind === "info_request") {
          opt.info_cost = { time: "", budget: "", access: "" };
        }
        step.options.push(opt);
        emit(state, onChange);
        repaint();
        return;
      }

      if (event.target.closest(".js-remove-option")) {
        const stepEl = event.target.closest("[data-step-index]");
        const optEl = event.target.closest("[data-opt-index]");
        const sIdx = Number(stepEl?.dataset.stepIndex);
        const oIdx = Number(optEl?.dataset.optIndex);
        const step = state.steps[sIdx];
        if (!step?.options) return;
        step.options.splice(oIdx, 1);
        // Re-anchor correctness if we removed the only correct one.
        if (step.options.length && !step.options.some((o) => o.is_correct)) {
          step.options[0].is_correct = true;
        }
        emit(state, onChange);
        repaint();
        return;
      }

      if (event.target.closest(".js-add-chip")) {
        const stepEl = event.target.closest("[data-step-index]");
        const idx = Number(stepEl?.dataset.stepIndex);
        const step = state.steps[idx];
        if (!step?.concept_chips) return;
        step.concept_chips.push({
          id: "c" + (step.concept_chips.length + 1),
          label: "",
          is_correct: false,
        });
        emit(state, onChange);
        repaint();
        return;
      }

      if (event.target.closest(".js-remove-chip")) {
        const stepEl = event.target.closest("[data-step-index]");
        const chipEl = event.target.closest("[data-chip-index]");
        const sIdx = Number(stepEl?.dataset.stepIndex);
        const cIdx = Number(chipEl?.dataset.chipIndex);
        const step = state.steps[sIdx];
        if (!step?.concept_chips) return;
        step.concept_chips.splice(cIdx, 1);
        if (step.concept_chips.length && !step.concept_chips.some((c) => c.is_correct)) {
          step.concept_chips[0].is_correct = true;
        }
        emit(state, onChange);
        repaint();
        return;
      }

      if (event.target.closest(".js-add-stakeholder")) {
        if (!state.stakeholders) state.stakeholders = [];
        state.stakeholders.push({ id: "", name: "", role: "", avatar_emoji: "" });
        emit(state, onChange);
        repaint();
        return;
      }
      if (event.target.closest(".js-remove-stakeholder")) {
        const idx = Number(event.target.closest("[data-stake-index]")?.dataset.stakeIndex);
        if (state.stakeholders && Number.isFinite(idx)) {
          state.stakeholders.splice(idx, 1);
          emit(state, onChange);
          repaint();
        }
        return;
      }
      if (event.target.closest(".js-add-consequence")) {
        if (!state.consequences) state.consequences = [];
        state.consequences.push({ label: "", impact: "neutral", weight: null });
        emit(state, onChange);
        repaint();
        return;
      }
      if (event.target.closest(".js-remove-consequence")) {
        const idx = Number(event.target.closest("[data-cons-index]")?.dataset.consIndex);
        if (state.consequences && Number.isFinite(idx)) {
          state.consequences.splice(idx, 1);
          emit(state, onChange);
          repaint();
        }
      }
    };

    repaint();

    // Lazy-migrate: if we received a non-RLC blob (legacy or empty), persist
    // the scaffold immediately so the next save lands a valid RLC case.
    if (migrationEmitNeeded) {
      migrationEmitNeeded = false;
      emit(state, onChange);
    }

    if (window.EditorUtils && typeof window.EditorUtils.bindPasteNormalizer === "function") {
      window.EditorUtils.bindPasteNormalizer(container);
    }
  }

  // Public surface — match the legacy `{ render }` shape used by builder.js's
  // `window.Editors[editorKey].render(...)` call site, AND expose the flat
  // function on `window.PhaseEditors` per plan §4a.
  window.Editors.realLifeChallenge = { render: realLifeChallengeEditor };
  window.PhaseEditors.realLifeChallenge = realLifeChallengeEditor;
})();
