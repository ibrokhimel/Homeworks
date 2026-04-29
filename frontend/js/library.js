// frontend/js/library.js
// Library page — homeworks grouped Subject ▸ Grade with a global
// language filter and search.
//
// Layout (replaces the pre-2026-04-29 flat-grid + 4-dropdown form):
//
//   [ Til: All UZ RU EN ]      [ search… ]   [ Clear ]
//
//   ▾ ∑ Algebra                              37 homeworks
//      Sinflar: [All] [5] [6] [7] (8) [9] …
//      ┌─card─┐ ┌─card─┐ ┌─card─┐
//
//   ▸ 🧬 Biology                             12 homeworks
//   ▸ ⚛ Physics                               8 homeworks
//
// Language is the cross-cutting filter (top of page). Subject is the
// section heading. Grade is a chip strip inside each section. The
// homework cards live inside the chosen grade chip.
//
// Persistence: selected language + per-section open/closed state
// + per-section selected grade chip live in localStorage so a return
// visit lands the student where they left off.
(function () {
  "use strict";

  // ── Subject metadata ─────────────────────────────────────────────────────
  // Mirrors `frontend/js/dashboard.js` so the look is consistent.
  // Family ordering pins the section sort: aniq → tabiy → til → ijtimoiy.
  const SUBJECT_ICONS = {
    "math-algebra":     "∑",
    "geometriya-g7-11": "△",
    physics:            "⚛",
    biology:            "🧬",
    "kimyo-g7-11":      "⚗",
    english:            "Aa",
    history:            "🏛",
  };

  const SUBJECT_DISPLAY = {
    "math-algebra":     { uz: "Algebra",    ru: "Алгебра",    en: "Algebra" },
    "geometriya-g7-11": { uz: "Geometriya", ru: "Геометрия",  en: "Geometry" },
    physics:            { uz: "Fizika",     ru: "Физика",     en: "Physics" },
    biology:            { uz: "Biologiya",  ru: "Биология",   en: "Biology" },
    "kimyo-g7-11":      { uz: "Kimyo",      ru: "Химия",      en: "Chemistry" },
    english:            { uz: "Ingliz tili", ru: "Английский", en: "English" },
    history:            { uz: "Tarix",      ru: "История",    en: "History" },
  };

  const FAMILY_ORDER = [
    "aniq-fanlar",
    "tabiy-fanlar",
    "til-fanlar",
    "ijtimoiy-fanlar",
  ];

  const FAMILY_COLORS = {
    "aniq-fanlar":     "#0066CC",
    "tabiy-fanlar":    "#34C759",
    "til-fanlar":      "#AF52DE",
    "ijtimoiy-fanlar": "#FF9500",
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const searchInput = document.getElementById("lib-search");
  const clearBtn    = document.getElementById("lib-clear-btn");
  const langChips   = document.getElementById("lib-lang-chips");
  const sectionsEl  = document.getElementById("lib-sections");
  const loadingEl   = document.getElementById("lib-loading");
  const errorEl     = document.getElementById("lib-error");
  const errorMsgEl  = document.getElementById("lib-error-msg");
  const emptyEl     = document.getElementById("lib-empty");
  const retryBtn    = document.getElementById("lib-retry-btn");
  const countEl     = document.getElementById("lib-count");

  // ── State ────────────────────────────────────────────────────────────────
  const STORAGE_KEY = "nets.library.v2";
  const PAGE_SIZE = 200; // server caps at 200; we paginate sequentially

  let subjectMeta = {}; // { id → { family, grades: [int] } } from /api/subjects
  let debounceTimer = null;

  const state = loadPersistedState();

  function loadPersistedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        language:      typeof parsed.language === "string" ? parsed.language : "",
        openSubjects:  parsed.openSubjects && typeof parsed.openSubjects === "object"
          ? parsed.openSubjects
          : {},
        gradeBySubject: parsed.gradeBySubject && typeof parsed.gradeBySubject === "object"
          ? parsed.gradeBySubject
          : {},
      };
    } catch (_) {
      return defaultState();
    }
  }

  function defaultState() {
    return { language: "", openSubjects: {}, gradeBySubject: {} };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // private mode / quota — silent
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // i18n helper — falls back to the literal string if i18n hasn't loaded.
  function t(key, fallback) {
    if (window.i18n && typeof window.i18n.t === "function") {
      return window.i18n.t(key, fallback);
    }
    return fallback != null ? fallback : key;
  }

  function activeUiLang() {
    if (window.i18n && typeof window.i18n.getLang === "function") {
      const lang = window.i18n.getLang();
      if (lang === "uz" || lang === "ru" || lang === "en") return lang;
    }
    return "uz";
  }

  function subjectDisplayName(subjectId) {
    const map = SUBJECT_DISPLAY[subjectId];
    if (!map) return subjectId;
    return map[activeUiLang()] || map.uz || subjectId;
  }

  function subjectIcon(subjectId) {
    return SUBJECT_ICONS[subjectId] || "N";
  }

  function subjectFamily(subjectId) {
    const m = subjectMeta[subjectId];
    return (m && m.family) || "aniq-fanlar";
  }

  function subjectFamilyColor(subjectId) {
    return FAMILY_COLORS[subjectFamily(subjectId)] || FAMILY_COLORS["aniq-fanlar"];
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(navigator.language || "uz", {
        year: "numeric", month: "short", day: "numeric",
      }).format(new Date(iso));
    } catch (_) {
      return iso.slice(0, 10);
    }
  }

  function formatCount(n) {
    const tpl = n === 1
      ? t("library.section_count_one", "1 homework")
      : t("library.section_count_other", "{n} homeworks");
    return tpl.replace("{n}", String(n));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ── Card factory ─────────────────────────────────────────────────────────
  function renderCard(hw) {
    const card = document.createElement("a");
    card.className   = "lib-card";
    card.href        = `/h/${encodeURIComponent(hw.id)}`;
    card.target      = "_blank";
    card.rel         = "noreferrer";
    card.setAttribute("aria-label", hw.title || hw.id);

    const mode = (hw.mode || "").toLowerCase();
    const chapter = hw.chapter || "";
    const subjectName = subjectDisplayName(hw.subject);
    const language = hw.language ? hw.language.toUpperCase() : "";

    // Build via DOM methods; titles can carry user text + i18n strings
    // share characters that must be escaped before reaching innerHTML.
    const header = document.createElement("div");
    header.className = "lib-card-header";

    const titleEl = document.createElement("h3");
    titleEl.className = "lib-card-title";
    titleEl.textContent = hw.title || hw.id;

    header.appendChild(titleEl);

    if (hw.mode) {
      const badge = document.createElement("span");
      badge.className = "lib-mode-badge";
      badge.dataset.mode = mode;
      badge.textContent = hw.mode;
      header.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "lib-card-meta";
    if (subjectName) {
      const p = document.createElement("span");
      p.className = "lib-card-pill";
      p.textContent = subjectName;
      meta.appendChild(p);
    }
    if (hw.grade) {
      const p = document.createElement("span");
      p.className = "lib-card-pill grade";
      p.textContent = `${t("common.grade", "Grade")} ${hw.grade}`;
      meta.appendChild(p);
    }
    if (language) {
      const p = document.createElement("span");
      p.className = "lib-card-pill";
      p.textContent = language;
      meta.appendChild(p);
    }

    card.appendChild(header);
    card.appendChild(meta);

    if (chapter) {
      const ch = document.createElement("p");
      ch.className = "lib-card-chapter";
      ch.textContent = chapter;
      card.appendChild(ch);
    }

    const time = document.createElement("time");
    time.className = "lib-card-time";
    if (hw.updated_at) time.dateTime = hw.updated_at;
    time.textContent = formatDate(hw.updated_at);
    card.appendChild(time);

    return card;
  }

  // ── Section factory ──────────────────────────────────────────────────────
  function renderSection(subjectId, items) {
    // Aggregate grades present in `items` so we don't show chips for
    // grades that have zero cards under the current language filter.
    const gradesPresent = Array.from(
      new Set(items.map(i => i.grade).filter(g => g != null))
    ).sort((a, b) => a - b);

    // Honour the persisted grade choice if it's still represented.
    let selectedGrade = state.gradeBySubject[subjectId] || "all";
    if (selectedGrade !== "all" && !gradesPresent.includes(Number(selectedGrade))) {
      selectedGrade = "all";
    }

    const section = document.createElement("details");
    section.className = "lib-section glass-card";
    section.dataset.subject = subjectId;
    section.style.setProperty("--family-color", subjectFamilyColor(subjectId));
    if (state.openSubjects[subjectId]) section.open = true;

    section.addEventListener("toggle", () => {
      state.openSubjects[subjectId] = section.open;
      persist();
    });

    // ── Summary (subject header) ──
    const summary = document.createElement("summary");
    summary.className = "lib-section-summary";

    const caret = document.createElement("span");
    caret.className = "lib-section-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▶";

    const icon = document.createElement("span");
    icon.className = "lib-section-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = subjectIcon(subjectId);

    const name = document.createElement("h3");
    name.className = "lib-section-name";
    name.textContent = subjectDisplayName(subjectId);

    const count = document.createElement("span");
    count.className = "lib-section-count";
    count.textContent = formatCount(items.length);

    summary.appendChild(caret);
    summary.appendChild(icon);
    summary.appendChild(name);
    summary.appendChild(count);
    section.appendChild(summary);

    // ── Body (grade chips + cards) ──
    const body = document.createElement("div");
    body.className = "lib-section-body";

    if (gradesPresent.length > 1) {
      const strip = document.createElement("div");
      strip.className = "lib-grade-strip";
      strip.setAttribute("role", "group");
      strip.setAttribute("aria-label", t("library.section_grade_label", "Grades"));

      const stripLabel = document.createElement("span");
      stripLabel.className = "lib-grade-strip-label";
      stripLabel.textContent = t("library.section_grade_label", "Grades");
      strip.appendChild(stripLabel);

      const allChip = makeGradeChip(
        "all",
        t("library.section_grade_all", "All"),
        selectedGrade === "all"
      );
      strip.appendChild(allChip);

      gradesPresent.forEach(g => {
        const chip = makeGradeChip(String(g), String(g), String(selectedGrade) === String(g));
        strip.appendChild(chip);
      });

      strip.addEventListener("click", (ev) => {
        const target = ev.target.closest(".lib-grade-chip");
        if (!target) return;
        const grade = target.dataset.libGrade;
        state.gradeBySubject[subjectId] = grade;
        persist();
        // Re-render only this section's grid + chip active state.
        strip.querySelectorAll(".lib-grade-chip").forEach(c => {
          c.classList.toggle(
            "is-active",
            c.dataset.libGrade === grade
          );
          c.setAttribute(
            "aria-pressed",
            c.dataset.libGrade === grade ? "true" : "false"
          );
        });
        repaintGrid(grid, items, grade);
      });

      body.appendChild(strip);
    }

    const grid = document.createElement("div");
    grid.className = "lib-grid";
    body.appendChild(grid);
    repaintGrid(grid, items, selectedGrade);

    section.appendChild(body);
    return section;
  }

  function makeGradeChip(value, label, active) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "lib-grade-chip" + (active ? " is-active" : "");
    chip.dataset.libGrade = value;
    chip.setAttribute("aria-pressed", active ? "true" : "false");
    chip.textContent = label;
    return chip;
  }

  function repaintGrid(grid, items, selectedGrade) {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const filtered = selectedGrade === "all"
      ? items
      : items.filter(hw => String(hw.grade) === String(selectedGrade));

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "lib-section-empty";
      empty.textContent = t("library.section_empty", "No homeworks for this grade.");
      grid.appendChild(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    filtered.forEach(hw => frag.appendChild(renderCard(hw)));
    grid.appendChild(frag);
  }

  // ── Group + sort ─────────────────────────────────────────────────────────
  function groupBySubject(items) {
    const groups = {};
    items.forEach(hw => {
      const key = hw.subject || "_unknown";
      (groups[key] = groups[key] || []).push(hw);
    });
    return groups;
  }

  function familyRank(subjectId) {
    const idx = FAMILY_ORDER.indexOf(subjectFamily(subjectId));
    return idx >= 0 ? idx : FAMILY_ORDER.length;
  }

  function sortedSubjectIds(groupKeys) {
    return groupKeys.slice().sort((a, b) => {
      const fa = familyRank(a);
      const fb = familyRank(b);
      if (fa !== fb) return fa - fb;
      return subjectDisplayName(a).localeCompare(subjectDisplayName(b));
    });
  }

  // ── Fetch ────────────────────────────────────────────────────────────────
  async function fetchAllItems() {
    const params = new URLSearchParams();
    if (state.language) params.set("language", state.language);
    const q = searchInput.value.trim();
    if (q) params.set("q", q);
    params.set("limit", String(PAGE_SIZE));

    let offset = 0;
    let total = 0;
    const items = [];
    while (true) {
      params.set("offset", String(offset));
      const data = await API.request(`/api/library?${params.toString()}`);
      const batch = Array.isArray(data.items) ? data.items : [];
      total = typeof data.total === "number" ? data.total : items.length + batch.length;
      items.push(...batch);
      if (!batch.length || items.length >= total) break;
      offset += PAGE_SIZE;
      // Hard safety stop — the server clamps limit at 200, so 5 pages
      // = 1000 items is more than any single school will ship in a
      // year. If we ever exceed that, fall through with a partial set
      // rather than spin forever.
      if (offset >= PAGE_SIZE * 25) break;
    }
    return { items, total };
  }

  async function loadAndRender() {
    hide(errorEl);
    hide(emptyEl);
    show(loadingEl);
    while (sectionsEl.firstChild) sectionsEl.removeChild(sectionsEl.firstChild);

    try {
      const { items, total } = await fetchAllItems();
      hide(loadingEl);
      countEl.textContent = total > 0 ? `(${total})` : "";

      if (!items.length) {
        show(emptyEl);
        return;
      }

      const groups = groupBySubject(items);
      const subjectIds = sortedSubjectIds(Object.keys(groups));
      const frag = document.createDocumentFragment();
      subjectIds.forEach(sid => {
        frag.appendChild(renderSection(sid, groups[sid]));
      });
      sectionsEl.appendChild(frag);
    } catch (err) {
      hide(loadingEl);
      errorMsgEl.textContent = err && err.message
        ? err.message
        : t("common.check_connection", "Check your connection and try again.");
      show(errorEl);
    }
  }

  // ── Subject metadata + facets ────────────────────────────────────────────
  async function loadSubjectMeta() {
    try {
      const data = await API.request("/api/subjects");
      const out = {};
      (data.subjects || []).forEach(s => {
        out[s.id] = { family: s.family, grades: s.grades || [] };
      });
      subjectMeta = out;
    } catch (_) {
      subjectMeta = {};
    }
  }

  // ── Top-bar wiring ───────────────────────────────────────────────────────
  function syncLangChipUi() {
    if (!langChips) return;
    langChips.querySelectorAll(".lib-chip").forEach(chip => {
      const v = chip.dataset.libLang || "";
      const active = v === state.language;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function onFilterChange(reload) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (reload !== false) loadAndRender();
    }, 250);
  }

  if (langChips) {
    langChips.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".lib-chip");
      if (!chip) return;
      state.language = chip.dataset.libLang || "";
      persist();
      syncLangChipUi();
      onFilterChange(true);
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => onFilterChange(true));
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      state.language = "";
      state.gradeBySubject = {};
      persist();
      syncLangChipUi();
      loadAndRender();
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener("click", loadAndRender);
  }

  // i18n change → re-render so subject names + section counts pick up
  // the new locale strings.
  if (window.i18n && typeof window.i18n.onChange === "function") {
    window.i18n.onChange(() => {
      syncLangChipUi();
      loadAndRender();
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  syncLangChipUi();
  loadSubjectMeta().then(loadAndRender);
})();
