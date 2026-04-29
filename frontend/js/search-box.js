// frontend/js/search-box.js
// Tiny shared wiring for the unified `.search-box` component used on the
// dashboard, library, and quote-picker. Two responsibilities:
//   1. Toggle `.is-filled` on the wrapper based on input value, which
//      reveals the clear (×) button.
//   2. Handle clicks on `[data-search-clear]` — clear the input value
//      and dispatch a synthetic `input` event so existing listeners
//      (dashboard.js, library.js, _quote-picker.js) re-run their
//      filter/refresh logic naturally. We never hijack their state.
(function () {
  "use strict";

  function syncFilled(box) {
    const input = box.querySelector('input[type="search"]');
    if (!input) return;
    box.classList.toggle("is-filled", Boolean(input.value));
  }

  function handleInput(event) {
    const input = event.target;
    if (!input || input.tagName !== "INPUT") return;
    if (input.type !== "search") return;
    const box = input.closest(".search-box");
    if (!box) return;
    syncFilled(box);
  }

  function handleClick(event) {
    const btn = event.target.closest("[data-search-clear]");
    if (!btn) return;
    const box = btn.closest(".search-box");
    if (!box) return;
    const input = box.querySelector('input[type="search"]');
    if (!input) return;
    if (!input.value) return;
    input.value = "";
    syncFilled(box);
    // Let the page's own listener react (debounce, refresh, etc.).
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function init() {
    document.querySelectorAll(".search-box").forEach(syncFilled);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("click", handleClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
