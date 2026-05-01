/* ============================================================
   Homeworks Landing Page — vanilla JS
   - i18n (uz/ru/en) with localStorage persistence
   - View Transitions API panel switching
   - IntersectionObserver scroll reveals
   - rAF-throttled hero parallax
   - Inline SVG icon set (matches the JSX iconPaths map)
   ============================================================ */

(function () {
  "use strict";

  // ── Icon paths (mirrors JSX iconPaths map) ──────────────────────────────
  // Available: arrowRight, book, brain, check, chevronRight, cap, layers,
  //            lock, message, play, sparkles, wand, zap
  const iconPaths = {
    arrowRight: "M5 12h14M13 5l7 7-7 7",
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z",
    brain: "M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5.23V14a4 4 0 0 0 4 4h1m6-15a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5.23V14a4 4 0 0 1-4 4h-1M9 3v18m6-18v18M9 9H6m12 0h-3M9 15H6m12 0h-3",
    check: "M20 6 9 17l-5-5",
    chevronRight: "m9 18 6-6-6-6",
    cap: "M3 8l9-5 9 5-9 5Zm5 5v4c2.5 2 5.5 2 8 0v-4M19 10v6",
    layers: "M12 3 3 8l9 5 9-5-9-5Zm-7 9 7 4 7-4M5 16l7 4 7-4",
    lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11Zm6 4v3",
    message: "M21 12a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 1 1 18-5Z",
    play: "M8 5v14l11-7L8 5Z",
    sparkles: "M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2Zm7 12 .8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14ZM5 13l.8 2.6L8 16l-2.2.4L5 19l-.8-2.6L2 16l2.2-.4L5 13Z",
    wand: "M15 4l5 5M14 5l5 5M4 20 18 6M5 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Zm14 9 .7 1.4 1.3.6-1.3.6L19 18l-.7-1.4-1.3-.6 1.3-.6L19 14Z",
    zap: "M13 2 4 14h7l-1 8 10-13h-7l1-7Z",
  };

  // Exposed for tests/debugging; no runtime dependency on this.
  if (typeof window !== "undefined") {
    window.__landingIconPaths = iconPaths;
  }

  /**
   * Render an SVG icon string. Useful if we ever need to inject icons
   * from JS (currently we ship them inline in the HTML for FOUC-free first paint).
   */
  function renderIcon(name, size) {
    size = size || 20;
    const d = iconPaths[name];
    if (!d) return "";
    return (
      '<svg width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="' + d + '"></path></svg>'
    );
  }

  // ── i18n strings (uz, ru, en) ───────────────────────────────────────────
  const i18n = {
    uz: {
      brand: "Homeworks",
      footerNote: "Interaktiv darslar uchun beta loyiha.",
      nav: {
        overview: "Umumiy",
        preview: "Ko‘rinish",
        tutor: "AI tutor",
        workflow: "Jarayon",
        launch: "Boshlash",
      },
      tryBeta: "Beta’ni sinash",
      heroBadge: "Aqlliroq uy vazifalari uchun beta loyiha",
      heroTitle: "Uy vazifasi endi majburiyatdek tuyilmaydi.",
      heroText:
        "Homeworks o‘qituvchiga oddiy topshiriq o‘rniga interaktiv dars yaratishga yordam beradi: tushuntirish, mashq, AI tutor va feedback bitta sahifada.",
      watchPreview: "Namunani ko‘rish",
      seeWorkflow: "Jarayonni ko‘rish",
      stats: [
        ["1 ta link", "dars, mashq va yordam bitta sahifada"],
        ["AI tutor", "javobni aytmay, tushunishga yo‘naltiradi"],
        ["Oson", "o‘qituvchi ulashadi, o‘quvchi darhol boshlaydi"],
      ],
      floating: { panels: "Bosqichlar", tutor: "AI tutor", grade: "Baholash" },
      overviewEyebrow: "Umumiy",
      overviewTitle: "To‘liq dars bitta chiroyli havola ichida.",
      overviewText:
        "Oddiy forma o‘rniga har bir uy vazifasi kichik darsga aylanadi: o‘qish, mashq, feedback va tutor yordami bir joyda.",
      previewEyebrow: "Ko‘rinish",
      previewTitle: "Avval tushuntiradi. Keyin tekshiradi.",
      previewText:
        "Yangi ko‘rinishda har bir bosqich aniq ajratilgan: o‘quvchi avval mavzuni o‘qiydi, keyin tekshiruvga o‘tadi va oxirida natijani ko‘radi. Tartib chalkashmaydi.",
      tutorEyebrow: "AI tutor",
      tutorTitle: "O‘quvchi savolni qanday yozsa ham, tutor ma’noni tushunadi.",
      studentLabel: "O‘quvchi",
      studentMessage: "aka narx oshsa nega keyin pul kamayib ketadi?",
      tutorLabel: "AI tutor",
      tutorMessage:
        "Chunki narx juda baland bo‘lsa, kamroq odam sotib oladi. Daromad uchun narx ham, xaridor soni ham muhim.",
      usefulTitle: "Kamroq robot. Ko‘proq foyda.",
      usefulText:
        "Tutor oddiy gaplarni ham tushunadi, mavzuni sodda tilda ochib beradi va o‘quvchini aniqroq akademik javobga yo‘naltiradi.",
      workflowEyebrow: "Jarayon",
      workflowTitle: "O‘qituvchi g‘oyasidan o‘quvchi sahifasigacha.",
      quickCardTitle: "O‘qituvchi uchun tez.",
      quickCardText:
        "Har safar uy vazifasini noldan yig‘ish shart emas. Tayyor namunadan boshlang, darsni o‘zingizga moslang va o‘quvchiga ulashing.",
      safeCardTitle: "Dizayni xavfsizroq.",
      safeCardText:
        "Keyingi beta bosqichida uzun va tasodifiy havolalar, so‘rovlar uchun chegaralar va o‘quvchi sahifalari uchun maxfiylik himoyasi qo‘shiladi.",
      launchTitle: "Uy vazifasini tushunarli darsga aylantiring.",
      launchText:
        "Oddiy topshiriq o‘rniga o‘quvchi tushunadigan, mashq qiladigan va feedback oladigan interaktiv sahifa yarating.",
      openBuilder: "Yaratishni boshlash",
      viewApi: "Kutubxonani ko‘rish",
      phone: {
        header: "Uy vazifasi",
        subject: "Kvadratik daromad",
        checkpoint: "Tekshiruv",
        aiReady: "AI tayyor",
        question: "Nega daromad grafigi avval ko‘tarilib, keyin pasayadi?",
        placeholder: "O‘quvchi javobni shu yerga yozadi...",
        continue: "Darsni davom ettirish",
      },
      lessonPanels: [
        {
          eyebrow: "1-bosqich · Tushuntirish",
          title: "Avval mavzuni o‘qing.",
          body: "O‘quvchi javob berishdan oldin mavzuni qisqa va tartibli kartochkalardan ko‘radi. Ortiqcha matn va shovqin yo‘q.",
          tag: "Tushuntirish",
        },
        {
          eyebrow: "2-bosqich · Mashq",
          title: "Javob aralash bo‘lsa ham, AI ma’noni tushunadi.",
          body: "Tizim o‘quvchining javobini kutilgan javob bilan solishtiradi va kichik xatolar uchun darrov jazolamaydi.",
          tag: "Aralash baholash",
        },
        {
          eyebrow: "3-bosqich · Yordam",
          title: "Har bir savol yonida tutor bor.",
          body: "O‘quvchi darsdan chiqmasdan tushuntirish, ishora yoki til bo‘yicha yordam so‘rashi mumkin.",
          tag: "AI yordam",
        },
      ],
      features: [
        {
          icon: "wand",
          title: "Uy vazifasini tez yaratish",
          body: "O‘qituvchi mavzu, sinf va tilni tanlaydi. Platforma tushuntirish, mashq va tekshiruv bosqichlarini tartibli ko‘rinishda tayyorlashga yordam beradi.",
        },
        {
          icon: "layers",
          title: "Bosqichma-bosqich tushuntirish",
          body: "O‘quvchi avval mavzuni tushunadi, keyin mashq qiladi. Har bir qism alohida va o‘qilishi oson ko‘rinadi.",
        },
        {
          icon: "brain",
          title: "AI yordam va feedback",
          body: "AI tutor o‘quvchining savolini tushunadi, javobni tahlil qiladi va keyingi qadamni ko‘rsatadi.",
        },
        {
          icon: "message",
          title: "Savol berish imkoniyati",
          body: "O‘quvchi darsdan chiqmasdan yordam so‘rashi mumkin. Tutor javobni tayyor aytib bermaydi, tushunishga yo‘naltiradi.",
        },
      ],
      workflow: [
        ["01", "Mavzuni tanlash", "Algebra, fizika, biologiya, ingliz tili, tarix, kimyo yoki geometriya — kerakli mavzuni tanlang."],
        ["02", "Bosqichlarni sozlash", "Tushuntirish kartalari, savollar, tekshiruv va izohlarni o‘zingizga moslang."],
        ["03", "Havolani ulashish", "O‘quvchi uchun bitta turg‘un havola yarating va sinfga yuboring."],
        ["04", "Natijani ko‘rish", "AI yordamida tekshirish va feedback orqali har bir o‘quvchining javobini tezroq tushunasiz."],
      ],
    },

    ru: {
      brand: "Homeworks",
      footerNote: "Бета-проект для интерактивных уроков.",
      nav: {
        overview: "Обзор",
        preview: "Превью",
        tutor: "AI-тьютор",
        workflow: "Процесс",
        launch: "Запуск",
      },
      tryBeta: "Попробовать бету",
      heroBadge: "Бета-проект для умных домашних заданий",
      heroTitle: "Домашка, которая не ощущается как наказание.",
      heroText:
        "Homeworks помогает учителю заменить обычное задание интерактивным уроком: объяснение, практика, AI-тьютор и обратная связь на одной странице.",
      watchPreview: "Посмотреть превью",
      seeWorkflow: "Посмотреть процесс",
      stats: [
        ["1 ссылка", "урок, практика и помощь на одной странице"],
        ["AI-тьютор", "ведёт ученика к пониманию, не выдавая готовый ответ"],
        ["Просто", "учитель делится, ученик сразу начинает"],
      ],
      floating: { panels: "Этапы", tutor: "AI-тьютор", grade: "Оценка" },
      overviewEyebrow: "Обзор",
      overviewTitle: "Полный урок внутри одной аккуратной ссылки.",
      overviewText:
        "Вместо обычной формы каждая домашка становится мини-уроком: чтение, практика, обратная связь и помощь тьютора в одном месте.",
      previewEyebrow: "Превью",
      previewTitle: "Сначала объясняет. Потом проверяет.",
      previewText:
        "В новой версии каждый этап разведён чётко: ученик сначала читает тему, затем переходит к проверке и в конце видит результат. Никакой путаницы в порядке.",
      tutorEyebrow: "AI-тьютор",
      tutorTitle: "Работает, даже когда ученик пишет вопрос неаккуратно.",
      studentLabel: "Ученик",
      studentMessage: "бро почему цена растёт а деньги потом падают?",
      tutorLabel: "AI-тьютор",
      tutorMessage:
        "Потому что при слишком высокой цене меньше людей покупают. Для выручки важны и цена, и количество покупателей.",
      usefulTitle: "Меньше робота. Больше пользы.",
      usefulText:
        "Тьютор понимает обычную живую речь, объясняет тему простыми словами и направляет ученика к более точному академическому ответу.",
      workflowEyebrow: "Процесс",
      workflowTitle: "От идеи учителя до страницы ученика.",
      quickCardTitle: "Быстро для учителя.",
      quickCardText:
        "Не нужно каждый раз собирать домашку с нуля. Начните с готового образца, настройте урок под себя и поделитесь с учеником.",
      safeCardTitle: "Безопаснее по дизайну.",
      safeCardText:
        "В следующей бета-волне появятся длинные случайные ссылки, ограничения на запросы и защита приватности на страницах учеников.",
      launchTitle: "Превратите домашку в понятный урок.",
      launchText:
        "Вместо обычного задания создайте интерактивную страницу, на которой ученик понимает, тренируется и получает обратную связь.",
      openBuilder: "Начать создание",
      viewApi: "Открыть библиотеку",
      phone: {
        header: "Домашка",
        subject: "Квадратичная выручка",
        checkpoint: "Проверка",
        aiReady: "AI готов",
        question: "Почему график выручки сначала растёт, достигает пика, а потом падает?",
        placeholder: "Ученик пишет ответ здесь...",
        continue: "Продолжить урок",
      },
      lessonPanels: [
        {
          eyebrow: "Шаг 1 · Объяснение",
          title: "Сначала разбираем тему.",
          body: "Перед ответом ученик проходит короткие и аккуратные карточки темы. Без шума и стены текста.",
          tag: "Объяснение",
        },
        {
          eyebrow: "Шаг 2 · Практика",
          title: "Ответ может быть неаккуратным — AI всё равно поймёт смысл.",
          body: "Система сравнивает ответ ученика с ожидаемым и не наказывает сразу за мелкие неточности в формулировке.",
          tag: "Смешанная оценка",
        },
        {
          eyebrow: "Шаг 3 · Помощь",
          title: "Тьютор рядом с каждым вопросом.",
          body: "Ученик может попросить подсказку, объяснение или языковую помощь, не выходя из урока.",
          tag: "AI-помощь",
        },
      ],
      features: [
        {
          icon: "wand",
          title: "Быстрая сборка для учителя",
          body: "Учитель выбирает тему, класс и язык. Платформа помогает собрать урок с этапами объяснения, практики и проверки в аккуратном виде.",
        },
        {
          icon: "layers",
          title: "Пошаговое объяснение",
          body: "Сначала ученик понимает тему, затем тренируется. Каждая часть стоит отдельно и легко читается.",
        },
        {
          icon: "brain",
          title: "AI-помощь и обратная связь",
          body: "AI-тьютор понимает вопрос ученика, разбирает ответ и подсказывает следующий шаг.",
        },
        {
          icon: "message",
          title: "Можно задавать вопросы",
          body: "Ученик может попросить помощь, не выходя из урока. Тьютор не выдаёт готовый ответ, а ведёт к пониманию.",
        },
      ],
      workflow: [
        ["01", "Выбрать тему", "Алгебра, физика, биология, английский, история, химия или геометрия — выберите нужную тему."],
        ["02", "Настроить этапы", "Подкорректируйте карточки объяснения, вопросы, проверку и пояснения под себя."],
        ["03", "Поделиться ссылкой", "Создайте одну стабильную ссылку для ученика и отправьте её классу."],
        ["04", "Посмотреть результат", "AI-помощь в проверке и обратная связь помогают быстрее понять ответ каждого ученика."],
      ],
    },

    en: {
      brand: "Homeworks",
      footerNote: "A beta project for interactive lessons.",
      nav: {
        overview: "Overview",
        preview: "Preview",
        tutor: "AI tutor",
        workflow: "How it works",
        launch: "Get started",
      },
      tryBeta: "Try the beta",
      heroBadge: "A beta project for smarter homework",
      heroTitle: "Homework that doesn’t feel like a chore.",
      heroText:
        "Homeworks helps teachers turn a plain assignment into an interactive lesson — explanation, practice, an AI tutor and feedback, all on one page.",
      watchPreview: "Watch the preview",
      seeWorkflow: "See how it works",
      stats: [
        ["One link", "lesson, practice and help on one page"],
        ["AI tutor", "guides the student to understand, without giving away the answer"],
        ["Easy", "the teacher shares, the student starts right away"],
      ],
      floating: { panels: "Steps", tutor: "AI tutor", grade: "Feedback" },
      overviewEyebrow: "Overview",
      overviewTitle: "A full lesson, inside one tidy link.",
      overviewText:
        "Instead of a plain form, every assignment becomes a small lesson: read, practice, feedback and tutor help — all in one place.",
      previewEyebrow: "Preview",
      previewTitle: "Explain first. Then check.",
      previewText:
        "Each step now sits cleanly on its own: the student reads the topic, moves to the check, and sees the result at the end. The order is easy to follow, not jumbled together.",
      tutorEyebrow: "AI tutor",
      tutorTitle: "Works even when the student types like, well, a student.",
      studentLabel: "Student",
      studentMessage: "yo why does revenue go up first then drop later",
      tutorLabel: "AI tutor",
      tutorMessage:
        "Because if the price is too high, fewer people buy. Revenue needs both a workable price and enough buyers.",
      usefulTitle: "Less robot. More signal.",
      usefulText:
        "The tutor reads everyday phrasing, explains the topic in plain language, and gently nudges the student toward a sharper academic answer.",
      workflowEyebrow: "How it works",
      workflowTitle: "From a teacher’s idea to a student-ready page.",
      quickCardTitle: "Fast for the teacher.",
      quickCardText:
        "You don’t rebuild an assignment from scratch every time. Start from a ready example, tune the lesson, and share it with your class.",
      safeCardTitle: "Safer by design.",
      safeCardText:
        "Long random links, request limits and privacy-aware student pages are coming in the next beta wave — on by default.",
      launchTitle: "Turn homework into a lesson students actually understand.",
      launchText:
        "Instead of a plain assignment, build an interactive page where the student understands the topic, practices it, and gets feedback.",
      openBuilder: "Start building",
      viewApi: "Browse the library",
      phone: {
        header: "Homework",
        subject: "Quadratic revenue",
        checkpoint: "Check",
        aiReady: "AI ready",
        question: "Why does the revenue curve rise to a peak and then fall?",
        placeholder: "Student types their answer here...",
        continue: "Continue the lesson",
      },
      lessonPanels: [
        {
          eyebrow: "Step 1 · Explain",
          title: "Read the topic first.",
          body: "Before answering, the student walks through short, tidy topic cards. No walls of text, no noise.",
          tag: "Explanation",
        },
        {
          eyebrow: "Step 2 · Practice",
          title: "The answer can be messy — the AI still gets the meaning.",
          body: "The system compares the student’s answer to the expected one and doesn’t punish them for small wording slips.",
          tag: "Smart grading",
        },
        {
          eyebrow: "Step 3 · Help",
          title: "A tutor sits next to every question.",
          body: "The student can ask for a hint, an explanation or a quick language nudge — without leaving the lesson.",
          tag: "AI help",
        },
      ],
      features: [
        {
          icon: "wand",
          title: "Quick to build, for teachers",
          body: "The teacher picks a topic, grade and language. The platform helps you lay out the explanation, practice and check stages in a clean order.",
        },
        {
          icon: "layers",
          title: "Step-by-step explanation",
          body: "The student understands the topic first, then practices it. Every part stands on its own and is easy to read.",
        },
        {
          icon: "brain",
          title: "AI help and feedback",
          body: "The AI tutor understands the student’s question, analyses the answer, and points to the next step.",
        },
        {
          icon: "message",
          title: "Students can ask questions",
          body: "The student can ask for help without leaving the lesson. The tutor doesn’t hand over the answer — it guides them to understand.",
        },
      ],
      workflow: [
        ["01", "Pick a topic", "Algebra, physics, biology, English, history, chemistry or geometry — pick the topic you need."],
        ["02", "Tune the steps", "Adjust the explanation cards, questions, the check stage and the notes until it reads the way you want."],
        ["03", "Share the link", "Generate one stable link for the student and send it to the class."],
        ["04", "Review results", "AI-assisted checking and feedback help you read each student’s answer faster."],
      ],
    },
  };

  // ── State ───────────────────────────────────────────────────────────────
  const STORAGE_KEY = "nets-landing-lang";
  const SUPPORTED_LANGS = ["uz", "ru", "en"];
  const DEFAULT_LANG = "uz";

  const state = {
    lang: DEFAULT_LANG,
    activePanel: 0,
  };

  function readStoredLang() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGS.indexOf(stored) !== -1) return stored;
    } catch (_e) { /* localStorage may be blocked */ }
    return DEFAULT_LANG;
  }

  function persistLang(lang) {
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (_e) {}
  }

  // ── Translation rendering ───────────────────────────────────────────────
  function getDeep(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function applyTranslations(lang) {
    const dict = i18n[lang] || i18n[DEFAULT_LANG];
    if (!dict) return;

    // Plain text bindings
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      const val = getDeep(dict, key);
      if (typeof val === "string") el.textContent = val;
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-title");
      const val = getDeep(dict, key);
      if (typeof val === "string") el.setAttribute("title", val);
    });

    // Stats: data-i18n-stat-value/label="<index>"
    const stats = dict.stats || [];
    document.querySelectorAll("[data-i18n-stat-value]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-stat-value"), 10);
      if (stats[i]) el.textContent = stats[i][0];
    });
    document.querySelectorAll("[data-i18n-stat-label]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-stat-label"), 10);
      if (stats[i]) el.textContent = stats[i][1];
    });

    // Features
    const features = dict.features || [];
    document.querySelectorAll("[data-i18n-feature-title]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-feature-title"), 10);
      if (features[i]) el.textContent = features[i].title;
    });
    document.querySelectorAll("[data-i18n-feature-body]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-feature-body"), 10);
      if (features[i]) el.textContent = features[i].body;
    });

    // Lesson panels (left list)
    const panels = dict.lessonPanels || [];
    document.querySelectorAll("[data-i18n-panel-eyebrow]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-panel-eyebrow"), 10);
      if (panels[i]) el.textContent = panels[i].eyebrow;
    });
    document.querySelectorAll("[data-i18n-panel-title]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-panel-title"), 10);
      if (panels[i]) el.textContent = panels[i].title;
    });

    // Workflow
    const workflow = dict.workflow || [];
    document.querySelectorAll("[data-i18n-workflow-num]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-workflow-num"), 10);
      if (workflow[i]) el.textContent = workflow[i][0];
    });
    document.querySelectorAll("[data-i18n-workflow-title]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-workflow-title"), 10);
      if (workflow[i]) el.textContent = workflow[i][1];
    });
    document.querySelectorAll("[data-i18n-workflow-body]").forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i18n-workflow-body"), 10);
      if (workflow[i]) el.textContent = workflow[i][2];
    });

    // Phone lesson card (active panel)
    renderPhonePanel(state.activePanel, false);

    // Update <html lang>
    document.documentElement.setAttribute("lang", lang);

    // Update language pills active state
    document.querySelectorAll(".lang-pill").forEach(function (pill) {
      const l = pill.getAttribute("data-lang");
      pill.classList.toggle("is-active", l === lang);
      pill.setAttribute("aria-pressed", l === lang ? "true" : "false");
    });
  }

  // ── Phone lesson-card swap with View Transitions API ────────────────────
  function renderPhonePanel(index, useTransition) {
    const dict = i18n[state.lang] || i18n[DEFAULT_LANG];
    const panels = dict.lessonPanels || [];
    const panel = panels[index];
    if (!panel) return;

    const apply = function () {
      const eyebrowEl = document.getElementById("phone-eyebrow");
      const titleEl = document.getElementById("phone-title");
      const bodyEl = document.getElementById("phone-body");
      const tagEl = document.getElementById("phone-tag");
      if (eyebrowEl) eyebrowEl.textContent = panel.eyebrow;
      if (titleEl) titleEl.textContent = panel.title;
      if (bodyEl) bodyEl.textContent = panel.body;
      if (tagEl) tagEl.textContent = panel.tag;

      // Update dots
      const dots = document.querySelectorAll("#phone-dots .phone-dot");
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === index);
      });

      // Update lesson-panel buttons in left list
      const lessonButtons = document.querySelectorAll(".lesson-panel");
      lessonButtons.forEach(function (btn, i) {
        const isActive = i === index;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    };

    if (
      useTransition &&
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      try {
        document.startViewTransition(apply);
      } catch (_e) {
        apply();
      }
    } else {
      apply();
    }
  }

  // ── Language toggle wiring ──────────────────────────────────────────────
  function setLang(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) lang = DEFAULT_LANG;
    state.lang = lang;
    persistLang(lang);
    applyTranslations(lang);
  }

  function bindLanguageToggle() {
    document.querySelectorAll(".lang-pill").forEach(function (pill) {
      pill.addEventListener("click", function () {
        const lang = pill.getAttribute("data-lang");
        if (lang) setLang(lang);
      });
    });
  }

  // ── Lesson panel selection (left list) ──────────────────────────────────
  function bindLessonPanels() {
    document.querySelectorAll(".lesson-panel").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.getAttribute("data-panel-index"), 10);
        if (Number.isNaN(idx)) return;
        if (idx === state.activePanel) return;
        state.activePanel = idx;
        renderPhonePanel(idx, true);
      });
    });
  }

  // ── IntersectionObserver reveals ────────────────────────────────────────
  function bindRevealObserver() {
    if (!("IntersectionObserver" in window)) {
      // Fallback: just show everything.
      document.querySelectorAll("[data-reveal], .stagger-parent").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    document.querySelectorAll("[data-reveal], .stagger-parent").forEach(function (el) {
      // The hero content is already marked .is-visible in the HTML — skip those.
      if (el.classList.contains("is-visible")) return;
      observer.observe(el);
    });
  }

  // ── Hero scroll parallax (rAF-throttled) ────────────────────────────────
  function bindHeroParallax() {
    const hero = document.querySelector("[data-hero-parallax]");
    if (!hero) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ticking = false;
    let lastScrollY = 0;

    function update() {
      ticking = false;
      // 0..1 progress over the first ~22% of the viewport, similar to the JSX useTransform map.
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docH > 0 ? Math.min(1, lastScrollY / docH) : 0;
      // Apply only across the early scroll range — past 22% the hero is mostly off-screen.
      const earlyProgress = Math.min(1, progress / 0.22);
      const opaqueProgress = Math.min(1, progress / 0.18);

      const y = -95 * earlyProgress;
      const scale = 1 - 0.08 * earlyProgress;
      const opacity = 1 - 0.65 * opaqueProgress;

      hero.style.transform = "translate3d(0," + y.toFixed(2) + "px, 0) scale(" + scale.toFixed(3) + ")";
      hero.style.opacity = opacity.toFixed(3);
    }

    function onScroll() {
      lastScrollY = window.scrollY || window.pageYOffset || 0;
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    // Run once to set initial state.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }

  // ── Smooth scroll for in-page anchors ───────────────────────────────────
  function bindSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        const href = a.getAttribute("href");
        if (!href || href === "#" || href.length < 2) return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        // Move focus for a11y, but don't yank scroll.
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    state.lang = readStoredLang();
    state.activePanel = 0;

    applyTranslations(state.lang);
    bindLanguageToggle();
    bindLessonPanels();
    bindRevealObserver();
    bindHeroParallax();
    bindSmoothAnchors();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
