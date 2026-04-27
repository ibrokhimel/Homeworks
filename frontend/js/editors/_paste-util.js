// frontend/js/editors/_paste-util.js
// Light paste normalization for plain input/textarea fields.
// Strips invisible Unicode, normalizes smart punctuation, collapses whitespace.
(function () {
  "use strict";

  window.EditorUtils = window.EditorUtils || {};

  // Characters that are invisible / directionality / BOM.
  // U+200B..U+200F, U+202A..U+202E, U+2060..U+206F, U+FEFF
  const INVISIBLE_RE = /[​-‏‪-‮⁠-⁯﻿]/g;

  // Non-breaking space variants → regular space.
  // U+00A0 nbsp, U+2007 figure space, U+2009 thin space, U+202F narrow nbsp
  const NBSP_RE = /[    ]/g;

  // Smart / typographic quotes → ASCII.
  const SMART_QUOTES = [
    [/[‘’‚‛]/g, "'"], // single curly quotes, lowcaps
    [/[“”„‟]/g, '"'], // double curly quotes
    [/′/g, "'"], // prime
    [/″/g, '"'], // double prime
  ];

  // En-dash, em-dash → hyphen when in tag-like contexts is risky;
  // keep as-is by default, but provide an optional flag for strict normalization.
  // Minus sign variants → regular hyphen-minus.
  const DASH_STRICT = [
    [/[‐-―−]/g, "-"],
  ];

  /**
   * Normalize a pasted text value in-place.
   * Always applied: invisible Unicode strip, nbsp → space, smart quotes → ASCII.
   * When `options.strict` (opt-in): dashes normalized too, whitespace collapsed.
   *
   * @param {string} value - the raw string
   * @param {{strict?: boolean, collapseSpaces?: boolean}} [options]
   * @returns {string}
   */
  function normalize(value, options) {
    if (typeof value !== "string" || !value) return value;
    const opts = options || {};

    let out = value;
    out = out.replace(INVISIBLE_RE, "");
    out = out.replace(NBSP_RE, " ");
    for (const [re, rep] of SMART_QUOTES) out = out.replace(re, rep);

    if (opts.strict) {
      for (const [re, rep] of DASH_STRICT) out = out.replace(re, rep);
    }
    if (opts.collapseSpaces) {
      out = out.replace(/[ \t]+/g, " ");
    }
    return out;
  }

  /**
   * Attach a paste listener to a container that normalizes values pasted into
   * any <input> or <textarea> inside it. Runs asynchronously after paste commits
   * so the browser's own paste handling isn't short-circuited.
   *
   * @param {HTMLElement} container
   * @param {{strict?: boolean, onAfter?: (el: HTMLElement) => void}} [options]
   */
  function bindPasteNormalizer(container, options) {
    if (!container || typeof container.addEventListener !== "function") return;
    if (container._pasteBound) return;
    container._pasteBound = true;
    const opts = options || {};
    container.addEventListener("paste", (event) => {
      const target = event.target;
      if (!target || (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")) return;
      // Defer to next tick so the value already reflects the paste.
      setTimeout(() => {
        const before = target.value;
        const after = normalize(before, { strict: opts.strict, collapseSpaces: false });
        if (after !== before) {
          // Preserve caret position where possible.
          const delta = after.length - before.length;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          target.value = after;
          if (typeof start === "number") {
            try {
              target.setSelectionRange(start + delta, end + delta);
            } catch (_) {}
          }
          // Fire `input` so editor state picks up the corrected value.
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (typeof opts.onAfter === "function") opts.onAfter(target);
      }, 0);
    });
  }

  /**
   * Attach to a specific set of fields that need STRICT normalization
   * (tags, expected-answer inputs). Adds dash normalization.
   */
  function bindStrictPasteNormalizer(container, selector) {
    if (!container || typeof container.addEventListener !== "function") return;
    const key = "_pasteStrictBound_" + selector;
    if (container[key]) return;
    container[key] = true;
    container.addEventListener("paste", (event) => {
      const target = event.target;
      if (!target || !target.matches || !target.matches(selector)) return;
      setTimeout(() => {
        const before = target.value;
        const after = normalize(before, { strict: true, collapseSpaces: true });
        if (after !== before) {
          target.value = after;
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, 0);
    });
  }

  // ---------- Tab-to-spaces handler ----------
  // Converts a Tab keypress inside <textarea> and contenteditable surfaces
  // into 4 literal spaces at the caret, instead of letting the browser move
  // focus to the next form field.
  //
  // Shift+Tab still works normally (escape hatch for accessibility — user can
  // jump to the next field if needed).

  const TAB_SPACES = "    "; // 4 spaces

  function handleTextareaTab(target) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const value = target.value;
    target.value = value.substring(0, start) + TAB_SPACES + value.substring(end);
    const newCaret = start + TAB_SPACES.length;
    try {
      target.setSelectionRange(newCaret, newCaret);
    } catch (_) {}
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function handleContentEditableTab() {
    // Contenteditable uses Range API for caret-aware insertion.
    // execCommand("insertText") is the cleanest path and triggers the editor's
    // existing input listeners for autosave.
    const ok = document.execCommand && document.execCommand("insertText", false, TAB_SPACES);
    if (ok) return true;
    // Fallback: manual Range insert
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const text = document.createTextNode(TAB_SPACES);
    range.insertNode(text);
    range.setStartAfter(text);
    range.setEndAfter(text);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  // Global document-level handler — single source of truth.
  if (!window.__netsTabBound) {
    window.__netsTabBound = true;
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      if (event.shiftKey) return; // shift+tab still navigates
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const t = event.target;
      if (!t) return;

      // Plain textarea: insert 4 spaces at caret.
      if (t.tagName === "TEXTAREA") {
        event.preventDefault();
        handleTextareaTab(t);
        return;
      }

      // Contenteditable (e.g. the preview editor's rich text surface).
      if (t.isContentEditable || (t.closest && t.closest('[contenteditable="true"]'))) {
        event.preventDefault();
        handleContentEditableTab();
        return;
      }

      // Everything else (inputs, buttons, selects): leave alone — Tab should
      // still move focus so the page remains keyboard-accessible.
    });
  }

  window.EditorUtils.normalize = normalize;
  window.EditorUtils.bindPasteNormalizer = bindPasteNormalizer;
  window.EditorUtils.bindStrictPasteNormalizer = bindStrictPasteNormalizer;
})();
