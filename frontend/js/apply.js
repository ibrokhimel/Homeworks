/* ============================================================
   Homeworks — Apply page (vanilla JS)
   - i18n (uz/ru/en), shares the landing.js localStorage key
   - Lang pill toggle
   - Client-side validation + honeypot-safe submit
   ============================================================ */

(function () {
  "use strict";

  // STORAGE_KEY is shared with landing.js so the language picked on the
  // landing page persists into the apply form.
  var STORAGE_KEY = "nets-landing-lang";
  var SUPPORTED_LANGS = ["uz", "ru", "en"];
  var DEFAULT_LANG = "uz";

  // Tight, non-backtracking email regex; semgrep-safe.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_RE = /^[+\-\d\s()]+$/;
  var PHONE_MIN = 4;
  var PHONE_MAX = 40;

  var i18n = {
    uz: { brand: "Homeworks", apply: {
      title: "Platformaga ariza",
      subtitle: "Bizga oz narsani ayting — biz tez orada javob beramiz.",
      submit: "Yuborish", submitSending: "Yuborilmoqda…",
      success: "Rahmat! Arizangiz qabul qilindi. Tez orada bog‘lanamiz.",
      back: "← Bosh sahifa", footer: "© 2026 — beta loyiha.",
      label: { full_name: "To‘liq ism", email: "Email", role: "Rol", school: "Maktab / tashkilot", city: "Shahar", grades: "Sinflar", subjects: "Fanlar", phone: "Telefon", message: "Izoh" },
      placeholder: { full_name: "Aliyev Akmal", email: "you@example.com", school: "Maktab #1", city: "Toshkent", phone: "+998 90 123 45 67", message: "Bizga oz narsani yozing…" },
      role: { placeholder: "Tanlang…", teacher: "O‘qituvchi", student: "O‘quvchi", parent: "Ota-ona", admin: "Maktab rahbari", other: "Boshqa" },
      error: { required: "Iltimos, majburiy maydonlarni to‘ldiring.", email: "Email manzili noto‘g‘ri ko‘rinmoqda.", phone: "Telefon raqami noto‘g‘ri ko‘rinmoqda.", network: "Yuborib bo‘lmadi. Iltimos, keyinroq urinib ko‘ring.", server: "Server xatosi. Iltimos, keyinroq urinib ko‘ring." }
    } },
    ru: { brand: "Homeworks", apply: {
      title: "Заявка на платформу",
      subtitle: "Расскажите коротко о себе — мы скоро свяжемся.",
      submit: "Отправить", submitSending: "Отправка…",
      success: "Спасибо! Заявка получена. Мы скоро напишем.",
      back: "← На главную", footer: "© 2026 — бета-проект.",
      label: { full_name: "Полное имя", email: "Email", role: "Роль", school: "Школа / организация", city: "Город", grades: "Классы", subjects: "Предметы", phone: "Телефон", message: "Комментарий" },
      placeholder: { full_name: "Алиев Акмал", email: "you@example.com", school: "Школа №1", city: "Ташкент", phone: "+998 90 123 45 67", message: "Напишите пару слов…" },
      role: { placeholder: "Выберите…", teacher: "Учитель", student: "Ученик", parent: "Родитель", admin: "Администрация", other: "Другое" },
      error: { required: "Заполните, пожалуйста, обязательные поля.", email: "Email выглядит некорректно.", phone: "Номер телефона выглядит некорректно.", network: "Не удалось отправить. Попробуйте позже.", server: "Ошибка сервера. Попробуйте позже." }
    } },
    en: { brand: "Homeworks", apply: {
      title: "Apply to the platform",
      subtitle: "Tell us a bit about yourself — we'll get back to you soon.",
      submit: "Submit", submitSending: "Sending…",
      success: "Thanks! Your application is in. We'll be in touch shortly.",
      back: "← Home", footer: "© 2026 — beta project.",
      label: { full_name: "Full name", email: "Email", role: "Role", school: "School / organisation", city: "City", grades: "Grades", subjects: "Subjects", phone: "Phone", message: "Message" },
      placeholder: { full_name: "Akmal Aliyev", email: "you@example.com", school: "School #1", city: "Tashkent", phone: "+998 90 123 45 67", message: "A few words about your situation…" },
      role: { placeholder: "Choose…", teacher: "Teacher", student: "Student", parent: "Parent", admin: "School admin", other: "Other" },
      error: { required: "Please fill in the required fields.", email: "That email doesn't look right.", phone: "That phone number doesn't look right.", network: "Couldn't submit. Please try again later.", server: "Server error. Please try again later." }
    } }
  };

  var state = { lang: DEFAULT_LANG };

  function readStoredLang() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGS.indexOf(stored) !== -1) return stored;
    } catch (_e) { /* localStorage may be blocked */ }
    return DEFAULT_LANG;
  }

  function persistLang(lang) {
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (_e) {}
  }

  // Walk via Object.entries so we never index an object by a caller-supplied
  // computed key — inherited keys (__proto__, …) cannot be reached.
  function getDeep(root, path) {
    var parts = path.split(".");
    var cur = root;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      var want = parts[i];
      var entries = Object.entries(cur);
      var next = undefined;
      for (var j = 0; j < entries.length; j++) {
        if (entries[j][0] === want) { next = entries[j][1]; break; }
      }
      if (next === undefined) return undefined;
      cur = next;
    }
    return cur;
  }

  function tr(lang, key) {
    var dict = i18n[lang] || i18n[DEFAULT_LANG];
    var v = getDeep(dict, key);
    return typeof v === "string" ? v : "";
  }

  function applyTranslations(lang) {
    var dict = i18n[lang] || i18n[DEFAULT_LANG];
    if (!dict) return;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = getDeep(dict, el.getAttribute("data-i18n"));
      if (typeof v === "string") el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var v = getDeep(dict, el.getAttribute("data-i18n-placeholder"));
      if (typeof v === "string") el.setAttribute("placeholder", v);
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var v = getDeep(dict, el.getAttribute("data-i18n-title"));
      if (typeof v !== "string") return;
      if (el.tagName === "TITLE") el.textContent = v + " · Homeworks";
      else el.setAttribute("title", v);
    });
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll(".lang-pill").forEach(function (pill) {
      var l = pill.getAttribute("data-lang");
      pill.classList.toggle("is-active", l === lang);
      pill.setAttribute("aria-pressed", l === lang ? "true" : "false");
    });
  }

  function setLang(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) lang = DEFAULT_LANG;
    state.lang = lang;
    persistLang(lang);
    applyTranslations(lang);
  }

  function bindLanguageToggle() {
    document.querySelectorAll(".lang-pill").forEach(function (pill) {
      pill.addEventListener("click", function () {
        var lang = pill.getAttribute("data-lang");
        if (lang) setLang(lang);
      });
    });
  }

  function clearFieldErrors(form) {
    form.querySelectorAll(".field").forEach(function (f) { f.removeAttribute("data-invalid"); });
    form.querySelectorAll(".field-error").forEach(function (e) { e.textContent = ""; e.hidden = true; });
  }

  function markInvalid(form, name, msg) {
    var input = form.querySelector('[name="' + name + '"]');
    if (!input) return;
    var wrap = input.closest(".field");
    if (wrap) wrap.setAttribute("data-invalid", "true");
    var err = form.querySelector('.field-error[data-error-for="' + name + '"]');
    if (err && msg) { err.textContent = msg; err.hidden = false; }
  }

  function showStatus(el, lang, msgKey, stateName) {
    if (!el) return;
    el.textContent = tr(lang, msgKey);
    el.setAttribute("data-state", stateName);
  }

  function clearStatus(el) {
    if (!el) return;
    el.textContent = "";
    el.removeAttribute("data-state");
  }

  function validate(form, lang) {
    clearFieldErrors(form);
    var firstInvalid = null;
    var required = ["full_name", "email", "role"];
    for (var i = 0; i < required.length; i++) {
      var name = required[i];
      var el = form.elements[name];
      var val = el ? String(el.value || "").trim() : "";
      if (!val) {
        markInvalid(form, name, tr(lang, "apply.error.required"));
        if (!firstInvalid) firstInvalid = el;
      }
    }
    var emailEl = form.elements["email"];
    var emailVal = emailEl ? String(emailEl.value || "").trim() : "";
    if (emailVal && !EMAIL_RE.test(emailVal)) {
      markInvalid(form, "email", tr(lang, "apply.error.email"));
      if (!firstInvalid) firstInvalid = emailEl;
    }
    var phoneEl = form.elements["phone"];
    var phoneVal = phoneEl ? String(phoneEl.value || "").trim() : "";
    if (phoneVal) {
      var ok = PHONE_RE.test(phoneVal) && phoneVal.length >= PHONE_MIN && phoneVal.length <= PHONE_MAX;
      if (!ok) {
        markInvalid(form, "phone", tr(lang, "apply.error.phone"));
        if (!firstInvalid) firstInvalid = phoneEl;
      }
    }
    return firstInvalid;
  }

  function collectPayload(form) {
    var data = Object.fromEntries(new FormData(form));
    Object.keys(data).forEach(function (k) {
      if (typeof data[k] === "string") data[k] = data[k].trim();
    });
    return data;
  }

  function handleResponse(res, statusEl) {
    if (res.status === 201 || res.status === 200) {
      showStatus(statusEl, state.lang, "apply.success", "ok");
      return { ok: true };
    }
    return res.json().catch(function () { return null; }).then(function (body) {
      var key = res.status >= 500 ? "apply.error.server" : "apply.error.network";
      if (body && typeof body === "object") {
        var serverMsg = body.detail || body.message || body.error;
        if (typeof serverMsg === "string" && serverMsg.length > 0 && serverMsg.length < 240) {
          statusEl.textContent = serverMsg;
          statusEl.setAttribute("data-state", "err");
          return { ok: false };
        }
      }
      showStatus(statusEl, state.lang, key, "err");
      return { ok: false };
    });
  }

  function bindForm() {
    var form = document.getElementById("apply-form");
    if (!form) return;
    var statusEl = document.getElementById("apply-status");
    var submitBtn = form.querySelector(".apply-submit");
    var submitDefaultText = submitBtn ? submitBtn.textContent : "";

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      clearStatus(statusEl);
      var firstInvalid = validate(form, state.lang);
      if (firstInvalid) {
        var topKey = "apply.error.required";
        var nm = firstInvalid.getAttribute("name");
        if (nm === "email" && String(firstInvalid.value || "").trim()) topKey = "apply.error.email";
        else if (nm === "phone") topKey = "apply.error.phone";
        showStatus(statusEl, state.lang, topKey, "err");
        try { firstInvalid.focus(); } catch (_e) {}
        return;
      }
      var payload = collectPayload(form);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = tr(state.lang, "apply.submitSending") || submitDefaultText;
      }
      fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin"
      })
        .then(function (res) { return handleResponse(res, statusEl); })
        .then(function (out) { if (out && out.ok) form.reset(); })
        .catch(function () { showStatus(statusEl, state.lang, "apply.error.network", "err"); })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = tr(state.lang, "apply.submit") || submitDefaultText;
          }
        });
    });
  }

  function init() {
    state.lang = readStoredLang();
    applyTranslations(state.lang);
    bindLanguageToggle();
    bindForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
