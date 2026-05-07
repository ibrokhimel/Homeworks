// frontend/js/editors/_equation-picker.js
// Reusable Equation Picker — opens from any toolbar button and inserts
// LaTeX (or Unicode glyphs) into a contenteditable host at the saved caret.
//
// Public API:
//   window.EquationPicker.open({
//     anchor,        // HTMLElement that triggered open (used to position the popover)
//     editor,        // contenteditable host where insertion happens
//     savedRange,    // optional Range cloned BEFORE focus moved to the trigger
//     onInsert,      // optional callback(latexOrGlyph, kind) after insertion
//   });
//   window.EquationPicker.close();
//
// Why a single instance: a second call to open() reuses the existing DOM and
// moves it to the new anchor. That sidesteps a flicker when an author clicks
// from one toolbar to another and keeps tabindex / focus state predictable.
//
// Insertion contract:
//   - Default insertion = wrap LaTeX in $...$ delimiters so existing KaTeX
//     auto-render (frontend/js/katex-render.js) renders it on the runtime
//     and inside the live preview iframe.
//   - Shift-click on a tile inserts the Unicode glyph instead, when one is
//     defined (single-char fast-path for inline use). Tiles without a Unicode
//     glyph (templates) fall back to LaTeX even with Shift held.
//   - Templates with `cursor` carry a target caret offset so the caret lands
//     inside the first {} after insertion (e.g. \frac{|}{} ).
//
// Accessibility:
//   - root has role="dialog" + aria-modal="true" + aria-label
//   - tablist with arrow-key navigation between category tabs
//   - grid with two-axis arrow-key navigation between symbol tiles
//   - Enter / Space inserts the focused tile
//   - Escape closes
//   - Focus trap: Tab/Shift-Tab cycle within the picker
//   - On close: focus returns to the original anchor (or document.body if gone)
//
// Responsive surface:
//   - Width >= 720px : anchored popover beneath the trigger (with viewport clamp)
//   - 480 <= w < 720 : centered popover (modal-y, with backdrop)
//   - w < 480        : bottom sheet (slides up, full width, inert backdrop)
//
// Dark mode: all colors come from existing CSS variables (--surface-elevated,
// --border, --accent, --text, --text-muted) so theme switching is automatic.
//
// Recently used: persisted in localStorage under "nets.equationPicker.recent"
// as an array of latex strings (most-recent-first), capped at 16. On first
// open with no history, the "Recently used" tab is hidden.
(function () {
  "use strict";

  const RECENT_KEY = "nets.equationPicker.recent";
  const RECENT_CAP = 16;

  // Single shared root + state across all open() calls. Lazily created.
  const STATE = {
    root: null,            // outer wrapper (.equation-picker-root)
    panel: null,           // inner card (.equation-picker-panel)
    backdrop: null,        // .equation-picker-backdrop
    grid: null,            // .equation-picker-grid
    searchInput: null,     // <input type="search">
    tabsRoot: null,        // .equation-picker-tabs
    activeCategoryId: null,
    activeTileIndex: 0,    // index within the current category (or search results)
    currentEntries: [],    // entries displayed in the grid right now
    anchor: null,          // trigger element
    editor: null,          // contenteditable host
    savedRange: null,      // selection saved before open
    onInsert: null,
    isOpen: false,
    keydownListener: null, // global ESC + focus-trap handler
    outsideClickListener: null,
    resizeListener: null,
    surface: "popover",    // "popover" | "centered" | "sheet"
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((s) => typeof s === "string").slice(0, RECENT_CAP);
    } catch (e) {
      return [];
    }
  }

  function saveRecent(latex) {
    try {
      const cur = loadRecent().filter((s) => s !== latex);
      cur.unshift(latex);
      const trimmed = cur.slice(0, RECENT_CAP);
      localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch (e) {
      return loadRecent();
    }
  }

  function pickSurface() {
    const w = window.innerWidth || 1200;
    if (w < 480) return "sheet";
    if (w < 720) return "centered";
    return "popover";
  }

  // ------------------------------------------------------------------
  // Selection / insertion (mirrors _rich-field.js patterns)
  // ------------------------------------------------------------------

  function restoreSelection(editor, range) {
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (range) {
      try { sel.addRange(range); return; } catch (_) {}
    }
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    sel.addRange(r);
  }

  // Insert plain text at the current caret position. The caret lands at the
  // end of the inserted text by default. If `cursorOffset` is provided, the
  // caret lands at `text.length - cursorOffset` from the end (so cursor=6 on
  // "\\frac{}{}" puts the caret right after the first `{`).
  function insertTextAtCaret(text, cursorOffset) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);

    const after = document.createRange();
    if (typeof cursorOffset === "number" && cursorOffset > 0) {
      const target = Math.max(0, text.length - cursorOffset);
      after.setStart(node, target);
    } else {
      after.setStartAfter(node);
    }
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }

  function performInsert(entry, useUnicode) {
    if (!STATE.editor) return;
    restoreSelection(STATE.editor, STATE.savedRange);

    let inserted = "";
    let kind = "latex";
    let cursorOffset = null;

    if (useUnicode && entry.unicode) {
      inserted = entry.unicode;
      kind = "unicode";
    } else {
      // LaTeX path: wrap in inline math delimiters so KaTeX renders.
      // Already-delimited templates (matrices) get $$..$$ for display style.
      const isDisplayTemplate = /\\begin\{(pmatrix|bmatrix|vmatrix|cases|aligned)\}/.test(entry.latex);
      if (isDisplayTemplate) {
        inserted = "$$" + entry.latex + "$$";
        // template entries don't use cursor offset (they're already populated
        // with placeholder a/b/c/d the author can edit afterward).
        cursorOffset = null;
      } else {
        inserted = "$" + entry.latex + "$";
        // cursor offset is measured from the END of the inserted string.
        // entry.cursor counts INSIDE the LaTeX (not counting our $ wrappers).
        // e.g. "\\frac{}{}" length=9, cursor=6 → caret at index 3 ("\\frac{|}{}").
        // We add 1 for the trailing $ so the caret is `cursor + 1` from end.
        if (typeof entry.cursor === "number") cursorOffset = entry.cursor + 1;
      }
    }

    insertTextAtCaret(inserted, cursorOffset);

    // Record in recently-used (LaTeX form is the canonical key — even when
    // the author Shift-clicked the Unicode path, the next time they want
    // the same entry they'll get it from "Recently used").
    saveRecent(entry.latex);

    // Fire input event so the editor's debounced onChange picks up the edit.
    try {
      STATE.editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } catch (_) {
      STATE.editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (typeof STATE.onInsert === "function") {
      try { STATE.onInsert(inserted, kind); } catch (_) {}
    }
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  function renderRoot() {
    const root = document.createElement("div");
    root.className = "equation-picker-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Insert equation");
    root.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "equation-picker-backdrop";

    const panel = document.createElement("div");
    panel.className = "equation-picker-panel";

    const header = document.createElement("div");
    header.className = "equation-picker-header";
    header.innerHTML =
      '<div class="equation-picker-title">Insert equation</div>' +
      '<button type="button" class="equation-picker-close" aria-label="Close equation picker">×</button>';

    const search = document.createElement("div");
    search.className = "equation-picker-search";
    search.innerHTML =
      '<input type="search" class="equation-picker-search-input" ' +
      'placeholder="Search symbols (e.g. integral, alpha, leq)" ' +
      'aria-label="Search symbols" autocomplete="off" />';

    const tabs = document.createElement("div");
    tabs.className = "equation-picker-tabs";
    tabs.setAttribute("role", "tablist");

    const grid = document.createElement("div");
    grid.className = "equation-picker-grid";
    grid.setAttribute("role", "grid");

    const hint = document.createElement("div");
    hint.className = "equation-picker-hint";
    hint.innerHTML =
      '<span>Click to insert as <code>$LaTeX$</code> · ' +
      'Shift-click for Unicode glyph · ' +
      '<kbd>Esc</kbd> to close · ' +
      '<kbd>↑↓←→</kbd> to navigate</span>';

    panel.appendChild(header);
    panel.appendChild(search);
    panel.appendChild(tabs);
    panel.appendChild(grid);
    panel.appendChild(hint);

    root.appendChild(backdrop);
    root.appendChild(panel);

    document.body.appendChild(root);

    STATE.root = root;
    STATE.backdrop = backdrop;
    STATE.panel = panel;
    STATE.tabsRoot = tabs;
    STATE.grid = grid;
    STATE.searchInput = search.querySelector(".equation-picker-search-input");

    // Wire close button + backdrop.
    header.querySelector(".equation-picker-close").addEventListener("click", () => closePicker());
    backdrop.addEventListener("click", () => closePicker());

    // Search input.
    STATE.searchInput.addEventListener("input", () => {
      onSearchChange(STATE.searchInput.value);
    });

    // Tab clicks.
    tabs.addEventListener("click", (event) => {
      const btn = event.target.closest(".equation-picker-tab");
      if (!btn || !tabs.contains(btn)) return;
      activateCategory(btn.dataset.categoryId);
      // Move focus back to the search to keep keyboard flow predictable.
      STATE.searchInput.focus();
    });

    // Grid: click handler dispatches insert. Mousedown preventDefault so the
    // editor's selection isn't lost between the trigger click and insert.
    grid.addEventListener("mousedown", (event) => {
      const tile = event.target.closest(".equation-picker-tile");
      if (!tile) return;
      event.preventDefault();
    });
    grid.addEventListener("click", (event) => {
      const tile = event.target.closest(".equation-picker-tile");
      if (!tile) return;
      const idx = Number(tile.dataset.idx);
      const entry = STATE.currentEntries[idx];
      if (!entry) return;
      performInsert(entry, !!event.shiftKey);
      // Don't close on insert — power-users want to insert a few in a row.
      // ESC or outside-click closes when they're done.
    });

    // Keyboard navigation inside the grid.
    grid.addEventListener("keydown", onGridKeydown);

    // Search input forwards arrow keys / enter into the grid.
    STATE.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusTile(0);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const entry = STATE.currentEntries[0];
        if (entry) performInsert(entry, !!event.shiftKey);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    });

    return root;
  }

  function buildTabs() {
    const recent = loadRecent();
    const items = [];
    if (recent.length) {
      items.push({ id: "recent", label: "Recent" });
    }
    for (const cat of window.EquationSymbols.CATEGORIES) {
      items.push({ id: cat.id, label: cat.label });
    }
    STATE.tabsRoot.innerHTML = items
      .map((it, i) =>
        '<button type="button" class="equation-picker-tab" ' +
          'role="tab" data-category-id="' + escHtml(it.id) + '" ' +
          'tabindex="' + (i === 0 ? "0" : "-1") + '">' +
          escHtml(it.label) +
        '</button>',
      )
      .join("");

    // Keyboard nav between tabs (left/right + Home/End).
    STATE.tabsRoot.onkeydown = (event) => {
      const key = event.key;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
      event.preventDefault();
      const tabsArr = Array.from(STATE.tabsRoot.querySelectorAll(".equation-picker-tab"));
      if (!tabsArr.length) return;
      const cur = tabsArr.findIndex((t) => t === document.activeElement);
      let next = cur;
      if (key === "ArrowLeft") next = (cur <= 0 ? tabsArr.length - 1 : cur - 1);
      if (key === "ArrowRight") next = (cur >= tabsArr.length - 1 ? 0 : cur + 1);
      if (key === "Home") next = 0;
      if (key === "End") next = tabsArr.length - 1;
      tabsArr[next].focus();
      activateCategory(tabsArr[next].dataset.categoryId);
    };
  }

  function entriesForCategory(catId) {
    if (catId === "recent") {
      const recent = loadRecent();
      const out = [];
      for (const latex of recent) {
        const e = window.EquationSymbols.lookup(latex);
        if (e) out.push(e);
      }
      return out;
    }
    const cat = window.EquationSymbols.CATEGORIES.find((c) => c.id === catId);
    return cat ? cat.entries.map((e) => ({ ...e, _categoryId: cat.id })) : [];
  }

  function activateCategory(catId) {
    STATE.activeCategoryId = catId;
    STATE.activeTileIndex = 0;
    Array.from(STATE.tabsRoot.querySelectorAll(".equation-picker-tab")).forEach((btn) => {
      const active = btn.dataset.categoryId === catId;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.tabIndex = active ? 0 : -1;
    });
    // Searching in a category resets the search box.
    STATE.searchInput.value = "";
    renderEntries(entriesForCategory(catId));
  }

  function onSearchChange(query) {
    if (!query || !query.trim()) {
      // Reverting search → re-activate current category.
      renderEntries(entriesForCategory(STATE.activeCategoryId));
      return;
    }
    const hits = window.EquationSymbols.search(query);
    renderEntries(hits);
  }

  function renderEntries(entries) {
    STATE.currentEntries = entries.slice();
    if (!entries.length) {
      STATE.grid.innerHTML =
        '<div class="equation-picker-empty">No symbols match. Try a different search term.</div>';
      return;
    }
    const html = entries
      .map(
        (entry, idx) =>
          '<button type="button" class="equation-picker-tile" ' +
            'role="gridcell" data-idx="' + idx + '" ' +
            'tabindex="' + (idx === 0 ? "0" : "-1") + '" ' +
            'aria-label="' + escHtml(entry.name || entry.latex) + '" ' +
            'title="' + escHtml((entry.name ? entry.name + " · " : "") + entry.latex) + '">' +
            '<span class="equation-picker-tile-glyph" data-tex="' + escHtml(entry.display || entry.latex) + '">' +
              escHtml(entry.unicode || entry.display || entry.latex) +
            '</span>' +
            '<span class="equation-picker-tile-label">' + escHtml(entry.name || "") + '</span>' +
          '</button>',
      )
      .join("");
    STATE.grid.innerHTML = html;
    // Render KaTeX into each tile's glyph span. Only re-render tiles that
    // actually contain LaTeX backslashes — Unicode-only glyphs render as text.
    if (window.katex && typeof window.katex.render === "function") {
      const glyphs = STATE.grid.querySelectorAll(".equation-picker-tile-glyph");
      glyphs.forEach((g) => {
        const tex = g.dataset.tex || "";
        if (tex.indexOf("\\") === -1 && tex.indexOf("{") === -1) return;
        try {
          window.katex.render(tex, g, { throwOnError: false, displayMode: false });
        } catch (_) {
          // Fall back to the text content already in place.
        }
      });
    }
  }

  function tilesArray() {
    return Array.from(STATE.grid.querySelectorAll(".equation-picker-tile"));
  }

  function focusTile(idx) {
    const tiles = tilesArray();
    if (!tiles.length) return;
    const clamped = Math.max(0, Math.min(idx, tiles.length - 1));
    tiles.forEach((t, i) => { t.tabIndex = i === clamped ? 0 : -1; });
    STATE.activeTileIndex = clamped;
    tiles[clamped].focus();
  }

  function gridColumnCount() {
    const tiles = tilesArray();
    if (!tiles.length) return 1;
    // Compute by reading the first row's offsetTop count.
    const firstTop = tiles[0].offsetTop;
    let n = 0;
    for (const t of tiles) {
      if (t.offsetTop !== firstTop) break;
      n++;
    }
    return Math.max(1, n);
  }

  function onGridKeydown(event) {
    const tiles = tilesArray();
    if (!tiles.length) return;
    const cur = tiles.findIndex((t) => t === document.activeElement);
    const key = event.key;
    let next = cur;
    if (key === "ArrowRight") next = Math.min(cur + 1, tiles.length - 1);
    else if (key === "ArrowLeft") next = Math.max(cur - 1, 0);
    else if (key === "ArrowDown") next = Math.min(cur + gridColumnCount(), tiles.length - 1);
    else if (key === "ArrowUp") {
      const back = cur - gridColumnCount();
      if (back < 0) {
        // Top row → bounce focus to the search.
        event.preventDefault();
        STATE.searchInput.focus();
        return;
      }
      next = back;
    } else if (key === "Home") next = 0;
    else if (key === "End") next = tiles.length - 1;
    else if (key === "Enter" || key === " ") {
      event.preventDefault();
      const idx = Number(tiles[cur] && tiles[cur].dataset.idx);
      const entry = STATE.currentEntries[idx];
      if (entry) performInsert(entry, !!event.shiftKey);
      return;
    } else if (key === "Escape") {
      event.preventDefault();
      closePicker();
      return;
    } else {
      return; // not a nav key — let it through (e.g., printable chars bubble to search)
    }
    if (next !== cur) {
      event.preventDefault();
      focusTile(next);
    }
  }

  // ------------------------------------------------------------------
  // Positioning
  // ------------------------------------------------------------------

  function positionPanel() {
    STATE.surface = pickSurface();
    STATE.panel.classList.remove("is-popover", "is-centered", "is-sheet");
    STATE.panel.classList.add("is-" + STATE.surface);
    STATE.root.classList.remove("is-popover", "is-centered", "is-sheet");
    STATE.root.classList.add("is-" + STATE.surface);

    if (STATE.surface !== "popover") {
      // Centered & sheet: CSS handles positioning. Clear inline styles.
      STATE.panel.style.left = "";
      STATE.panel.style.top = "";
      return;
    }

    const anchor = STATE.anchor;
    if (!anchor || !anchor.getBoundingClientRect) return;
    const rect = anchor.getBoundingClientRect();
    const panelRect = STATE.panel.getBoundingClientRect();

    const VW = window.innerWidth;
    const VH = window.innerHeight;
    const margin = 12;

    // Default: below the trigger, left-aligned to it.
    let top = rect.bottom + 8;
    let left = rect.left;
    // Clamp horizontally.
    if (left + panelRect.width > VW - margin) {
      left = Math.max(margin, VW - panelRect.width - margin);
    }
    if (left < margin) left = margin;
    // Flip vertically if it would overflow the bottom of the viewport.
    if (top + panelRect.height > VH - margin) {
      const flipped = rect.top - panelRect.height - 8;
      if (flipped >= margin) top = flipped;
      else top = Math.max(margin, VH - panelRect.height - margin);
    }
    STATE.panel.style.left = Math.round(left) + "px";
    STATE.panel.style.top = Math.round(top) + "px";
  }

  // ------------------------------------------------------------------
  // Open / close
  // ------------------------------------------------------------------

  function open(opts) {
    const o = opts || {};
    if (!STATE.root) renderRoot();

    STATE.anchor = o.anchor || null;
    STATE.editor = o.editor || null;
    STATE.savedRange = o.savedRange || null;
    STATE.onInsert = typeof o.onInsert === "function" ? o.onInsert : null;

    buildTabs();

    // Default tab: Recent if it exists, else Common.
    const recent = loadRecent();
    const initialTab = recent.length ? "recent" : "common";
    activateCategory(initialTab);

    STATE.root.hidden = false;
    STATE.isOpen = true;
    // Force the panel to lay out before measuring for popover position.
    requestAnimationFrame(() => {
      positionPanel();
      STATE.searchInput.focus();
      STATE.searchInput.select();
    });

    // Wire global listeners (idempotent — close() removes them).
    STATE.keydownListener = (event) => {
      if (event.key === "Escape" && STATE.isOpen) {
        event.preventDefault();
        closePicker();
        return;
      }
      // Focus trap: keep Tab/Shift-Tab inside the panel.
      if (event.key === "Tab" && STATE.isOpen) {
        const focusables = STATE.panel.querySelectorAll(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const list = Array.from(focusables);
        const first = list[0];
        const last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", STATE.keydownListener);

    STATE.outsideClickListener = (event) => {
      if (!STATE.isOpen) return;
      // Backdrop already handles its own click; ignore here.
      if (STATE.backdrop.contains(event.target)) return;
      if (STATE.panel.contains(event.target)) return;
      if (STATE.anchor && STATE.anchor.contains(event.target)) return;
      closePicker();
    };
    // Add on the next tick so the click that opened us doesn't immediately close.
    setTimeout(() => {
      document.addEventListener("mousedown", STATE.outsideClickListener);
    }, 0);

    STATE.resizeListener = () => positionPanel();
    window.addEventListener("resize", STATE.resizeListener);
    window.addEventListener("scroll", STATE.resizeListener, true);
  }

  function closePicker() {
    if (!STATE.isOpen) return;
    STATE.isOpen = false;
    if (STATE.root) STATE.root.hidden = true;
    if (STATE.keydownListener) {
      document.removeEventListener("keydown", STATE.keydownListener);
      STATE.keydownListener = null;
    }
    if (STATE.outsideClickListener) {
      document.removeEventListener("mousedown", STATE.outsideClickListener);
      STATE.outsideClickListener = null;
    }
    if (STATE.resizeListener) {
      window.removeEventListener("resize", STATE.resizeListener);
      window.removeEventListener("scroll", STATE.resizeListener, true);
      STATE.resizeListener = null;
    }
    // Return focus to the trigger so keyboard users land somewhere sensible.
    const anchor = STATE.anchor;
    STATE.anchor = null;
    STATE.editor = null;
    STATE.savedRange = null;
    STATE.onInsert = null;
    if (anchor && typeof anchor.focus === "function") {
      try { anchor.focus({ preventScroll: true }); } catch (_) { try { anchor.focus(); } catch (__) {} }
    }
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  window.EquationPicker = {
    open,
    close: closePicker,
    // Exposed for tests — read-only views.
    _state: STATE,
    _loadRecent: loadRecent,
    _saveRecent: saveRecent,
    _pickSurface: pickSurface,
  };
})();
