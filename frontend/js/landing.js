/* ============================================================
   Class A Education Landing Page — vanilla JS
   - i18n (uz/ru/en) with localStorage persistence
   - View Transitions API panel switching
   - IntersectionObserver scroll reveals (+ clip-path title wipe)
   - rAF-throttled hero + preview parallax
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
  // Brand: Class A Education — an AI-gamified K–11 LMS sold to schools (B2B).
  // EN is canonical; UZ (source/fallback) + RU use a formal register.
  const i18n = {
    uz: {
      brand: "Class A Education",
      footerNote: "© 2026 Class-A-Technologies MCHJ",
      footer: { privacy: "Maxfiylik siyosati", terms: "Foydalanish shartlari" },
      nav: {
        overview: "Bu nima",
        preview: "Ilova ichida",
        tutor: "AI repetitor",
        workflow: "Qanday ishlaydi",
        launch: "Demo so‘rash",
        privacy: "Maxfiylik",
        terms: "Shartlar",
      },
      tryBeta: "Demo so‘rash",
      requestBetaAccess: "Maktab uchun demo so‘rash",
      heroBadge: "K–11 maktablar uchun AI ta’lim tizimi",
      heroTitle: "Har qanday fanni o‘rgating. Natijani isbotlang.",
      heroText:
        "Class A Education maktabingizning o‘z darsliklarini o‘yinlashtirilgan, AI yo‘naltirgan mahorat sari yo‘lga aylantiradi — va o‘qituvchilar bilan ota-onalarga har bir o‘quvchi nimani o‘zlashtirganini aniq ko‘rsatadi. O‘zbekiston maktablari uchun: o‘zbek, rus va ingliz tillarida.",
      stats: [
        ["Sizning darsliklaringiz", "almashtirilmaydi, balki kuchaytiriladi — siz o‘qitayotgan o‘quv dasturi asosida"],
        ["IELTS · SAT · AP mos", "o‘quvchilar bitirish uchun zarur sertifikatlarga bog‘langan natija yo‘nalishlari"],
        ["2–3 kun", "maktabni ulashga — oylar emas"],
      ],
      floating: { panels: "Mahorat", tutor: "AI repetitor", grade: "Kuzatuvsiz" },
      overviewEyebrow: "Bu nima",
      overviewTitle: "Maktabingizni natijalar sari boshqaradigan yagona tizim.",
      overviewText:
        "Ustiga qo‘shilgan uy vazifasi ilovasi emas — o‘qituvchilar, o‘quvchilar va ota-onalar birlashadigan yagona AI ta’lim tizimi.",
      previewEyebrow: "Ilova ichida",
      previewTitle: "O‘quvchilar chindan ham ochgisi keladigan ta’lim.",
      previewText:
        "O‘quvchilar telefonida o‘yinlashtirilgan mahorat yo‘lini oladi — aniq taraqqiyot, keyingi to‘g‘ri sinov va javobni aytib bermay, tushunishga yordam beradigan repetitor.",
      tutorEyebrow: "AI repetitor",
      tutorTitle: "Yo‘naltiradigan — va hech qachon kuzatmaydigan haqiqiy repetitor.",
      studentLabel: "O‘quvchi",
      studentMessage: "aka nega daromad avval oshib, keyin tushib ketadi?",
      tutorLabel: "AI repetitor",
      tutorMessage:
        "Chunki narx haddan tashqari oshsa, kamroq odam sotib oladi. Daromad uchun ham mos narx, ham yetarli xaridor kerak — keling, ular muvozanatlashadigan nuqtani topamiz.",
      usefulTitle: "Kuzatuvsiz. Dizayn darajasida.",
      usefulText:
        "Class A o‘quvchining ishini uni kuzatish uchun emas, o‘rganishiga yordam berish uchun o‘qiydi. Repetitor javobni berib qo‘ymaydi, tushuntiradi — va har bir natijani Cambridge, AP va IB mezonlari bo‘yicha tekshirish mumkin.",
      workflowEyebrow: "Qanday ishlaydi",
      workflowTitle: "O‘quv dasturingizdan o‘lchanadigan natijalargacha.",
      quickCardTitle: "Choraklar emas, kunlarda ishga tushadi.",
      quickCardText:
        "Siz o‘qitayotgan o‘quv dasturi asosida ishlaymiz, shu bois hech narsani noldan qurish shart emas — AI mashq blokini nazorat qilgani uchun o‘qituvchilaringiz baholash va kuzatishga kamroq soat sarflaydi.",
      safeCardTitle: "Dizayn darajasida — avvalo maxfiylik.",
      safeCardText:
        "Bolalarni kuzatish yo‘q — veb-kamera, ko‘z harakatini kuzatish yoki tugma bosishlarini yozish yo‘q. Kundalik’ga mos, o‘quvchi ma’lumotlari birinchi kundan himoyalangan.",
      launchTitle: "Class A Education’ni maktabingizga olib keling.",
      launchText:
        "Demo so‘rang — biz pilotni sozlaymiz: sizning darsliklaringiz, sizning o‘quvchilaringiz, bir necha haftada haqiqiy natijalar.",
      phone: {
        header: "Class A",
        subject: "Algebra · Kvadratik",
        checkpoint: "Mahorat tekshiruvi",
        aiReady: "AI repetitor",
        question: "Nega daromad avval cho‘qqiga ko‘tarilib, keyin tushadi?",
        placeholder: "O‘quvchi shu yerda yechadi…",
        continue: "Davom etish",
      },
      lessonPanels: [
        {
          eyebrow: "Mahorat yo‘li",
          title: "Har bir mavzu varaqa emas, yo‘lga aylanadi.",
          body: "O‘quvchilar qisqa, tartibli mahorat bosqichlaridan o‘tadi — ko‘rinadigan taraqqiyot, o‘z sur’atida.",
          tag: "Mahorat",
          progress: 35,
          xp: "+40 XP",
        },
        {
          eyebrow: "O‘sgan sari yutib boring",
          title: "XP, kvestlar va streaklar — haqiqiy tushunish uchun mukofot.",
          body: "Tasodifiy ochkolar emas, o‘rganishga bog‘langan motivatsiya. Mavzuni o‘zlashtiring — daraja oshiring.",
          tag: "Geympley",
          progress: 70,
          xp: "+120 XP",
        },
        {
          eyebrow: "Boss Arena",
          title: "Yodlashni emas, mahoratni isbotlang.",
          body: "O‘quvchi keyingi bosqichga o‘tishdan oldin haqiqiy tushunishni tekshiradigan sinovga duch keladi.",
          tag: "Boss",
          progress: 95,
          xp: "Boss +250 XP",
        },
      ],
      features: [
        {
          icon: "book",
          title: "Darsliklaringiz asosida",
          body: "Siz o‘qitayotgan o‘quv dasturini almashtirmaymiz — kuchaytiramiz. AI har bir mavzuni o‘yinlashtirilgan, mahorat sari yo‘naltirilgan yo‘lga aylantiradi.",
        },
        {
          icon: "cap",
          title: "Davlat talab qilayotgan natijalar",
          body: "IELTS, SAT, TOEFL va AP’ga moslangan imtihon tayyorgarligi yo‘nalishlari — har bir 10–11-sinf o‘quvchisiga bitirish uchun zarur sertifikatlar.",
        },
        {
          icon: "layers",
          title: "Yagona operator tizimi",
          body: "Davomat, baholar, natijalar, ota-onalarga bildirishnomalar va uy vazifalari bir joyda — Kundalik’ga mos, ichida AI bilan.",
        },
        {
          icon: "zap",
          title: "O‘qituvchiga kamroq yuk",
          body: "AI maktabdagi mashq blokini nazorat qiladi, shu bois o‘qituvchilaringiz baholash va nazoratga kamroq vaqt sarflaydi.",
        },
      ],
      workflow: [
        ["01", "O‘quv dasturingizni moslaymiz", "Darsliklar va standartlaringizni asosiy manba sifatida yuklaymiz — odatda 2–3 kunda ishga tushadi."],
        ["02", "Yo‘nalishlarni sozlang", "Maktabingizga kerakli natija yo‘nalishlarini yoqing — IELTS, SAT, AP — va har bir sinf uchun mahorat chegaralarini belgilang."],
        ["03", "O‘quvchilar o‘ynab o‘rganadi", "O‘quvchilar mobil ilovada AI repetitor va ularni harakatda ushlab turadigan mahorat yo‘li bilan mashq qiladi."],
        ["04", "Natijalarni ko‘rasiz", "O‘qituvchilar va ota-onalar har bir o‘quvchi aslida nimani o‘zlashtirganini aniq ko‘radi — taxminlarsiz."],
      ],
    },

    ru: {
      brand: "Class A Education",
      footerNote: "© 2026 Class-A-Technologies MCHJ",
      footer: { privacy: "Политика конфиденциальности", terms: "Условия использования" },
      nav: {
        overview: "Что это",
        preview: "Внутри приложения",
        tutor: "AI-репетитор",
        workflow: "Как это работает",
        launch: "Запросить демо",
        privacy: "Приватность",
        terms: "Условия",
      },
      tryBeta: "Запросить демо",
      requestBetaAccess: "Запросить демо для школы",
      heroBadge: "AI-система обучения для школ K–11",
      heroTitle: "Учите чему угодно. Докажите результат.",
      heroText:
        "Class A Education превращает учебники вашей школы в геймифицированный путь к мастерству под управлением ИИ — и показывает учителям и родителям, что именно усвоил каждый ученик. Для школ Узбекистана: на узбекском, русском и английском.",
      stats: [
        ["Ваши учебники", "не заменяем, а усиливаем — на основе программы, которую вы уже преподаёте"],
        ["IELTS · SAT · AP", "треки результатов, привязанные к сертификатам, нужным ученику для выпуска"],
        ["2–3 дня", "на подключение школы — а не месяцы"],
      ],
      floating: { panels: "Мастерство", tutor: "AI-репетитор", grade: "Без слежки" },
      overviewEyebrow: "Что это",
      overviewTitle: "Одна система, которая ведёт вашу школу к результатам.",
      overviewText:
        "Не приложение для домашки сбоку — единая AI-система обучения, к которой подключаются учителя, ученики и родители.",
      previewEyebrow: "Внутри приложения",
      previewTitle: "Обучение, которое ученики действительно хотят открыть.",
      previewText:
        "Ученики получают геймифицированный путь к мастерству в телефоне — понятный прогресс, следующий правильный вызов и репетитор, который помогает понять, а не выдаёт ответ.",
      tutorEyebrow: "AI-репетитор",
      tutorTitle: "Настоящий репетитор, который направляет — и никогда не следит.",
      studentLabel: "Ученик",
      studentMessage: "бро почему выручка сначала растёт, а потом падает?",
      tutorLabel: "AI-репетитор",
      tutorMessage:
        "Потому что при слишком высокой цене покупает меньше людей. Для выручки нужны и рабочая цена, и достаточно покупателей — давайте найдём, где они уравновешиваются.",
      usefulTitle: "Без слежки. На уровне дизайна.",
      usefulText:
        "Class A читает работу ученика, чтобы помочь ему учиться, а не следить за ним. Репетитор не выдаёт ответ, а объясняет — и каждый результат можно проверить по критериям Cambridge, AP и IB.",
      workflowEyebrow: "Как это работает",
      workflowTitle: "От вашей программы к измеримым результатам.",
      quickCardTitle: "Запуск за дни, а не за четверти.",
      quickCardText:
        "Мы строим на программе, которую вы уже преподаёте, поэтому ничего не нужно собирать с нуля — а так как ИИ контролирует блок практики, учителя тратят меньше часов на проверку и контроль.",
      safeCardTitle: "Прежде всего — приватность.",
      safeCardText:
        "Никакой слежки за детьми — без веб-камер, отслеживания взгляда и логирования нажатий клавиш. Совместимо с Kundalik, данные учеников защищены с первого дня.",
      launchTitle: "Приведите Class A Education в вашу школу.",
      launchText:
        "Запросите демо — мы настроим пилот: ваши учебники, ваши ученики, реальные результаты за недели.",
      phone: {
        header: "Class A",
        subject: "Алгебра · Квадратичная",
        checkpoint: "Проверка мастерства",
        aiReady: "AI-репетитор",
        question: "Почему выручка растёт до пика, а затем падает?",
        placeholder: "Ученик решает здесь…",
        continue: "Продолжить",
      },
      lessonPanels: [
        {
          eyebrow: "Путь к мастерству",
          title: "Каждая тема — это путь, а не рабочий лист.",
          body: "Ученики проходят короткие аккуратные шаги мастерства — видимый прогресс, в своём темпе.",
          tag: "Мастерство",
          progress: 35,
          xp: "+40 XP",
        },
        {
          eyebrow: "Растёшь — получаешь",
          title: "XP, квесты и стрики, которые вознаграждают реальное понимание.",
          body: "Мотивация, привязанная к учёбе, а не случайные очки. Освоил тему — поднял уровень.",
          tag: "Геймификация",
          progress: 70,
          xp: "+120 XP",
        },
        {
          eyebrow: "Boss Arena",
          title: "Докажите мастерство, а не зубрёжку.",
          body: "Перед переходом дальше ученик встречает вызов, проверяющий реальное понимание.",
          tag: "Босс",
          progress: 95,
          xp: "Boss +250 XP",
        },
      ],
      features: [
        {
          icon: "book",
          title: "На основе ваших учебников",
          body: "Мы усиливаем программу, которую вы уже преподаёте, а не заменяем её. ИИ превращает каждую тему в геймифицированный путь к мастерству.",
        },
        {
          icon: "cap",
          title: "Результаты, которых теперь требует государство",
          body: "Треки подготовки к IELTS, SAT, TOEFL и AP — сертификаты, нужные каждому ученику 10–11 классов для выпуска.",
        },
        {
          icon: "layers",
          title: "Единая операторская система",
          body: "Посещаемость, оценки, успеваемость, уведомления родителям и домашка в одном месте — совместимо с Kundalik, с ИИ внутри.",
        },
        {
          icon: "zap",
          title: "Меньше нагрузки на учителя",
          body: "ИИ контролирует школьный блок практики, поэтому учителя тратят меньше часов на проверку и надзор.",
        },
      ],
      workflow: [
        ["01", "Подключаем вашу программу", "Загружаем ваши учебники и стандарты как источник истины — обычно запуск за 2–3 дня."],
        ["02", "Настраиваете треки", "Включите нужные школе треки результатов — IELTS, SAT, AP — и задайте пороги мастерства по классам."],
        ["03", "Ученики учатся в игре", "Ученики занимаются в мобильном приложении с AI-репетитором и путём к мастерству, который держит их в движении."],
        ["04", "Вы видите результаты", "Учителя и родители ясно видят, что каждый ученик действительно освоил — без догадок."],
      ],
    },

    en: {
      brand: "Class A Education",
      footerNote: "© 2026 Class-A-Technologies MCHJ",
      footer: { privacy: "Privacy Policy", terms: "Terms of Service" },
      nav: {
        overview: "What it is",
        preview: "Inside the app",
        tutor: "AI tutor",
        workflow: "How it works",
        launch: "Request a demo",
        privacy: "Privacy",
        terms: "Terms",
      },
      tryBeta: "Request a demo",
      requestBetaAccess: "Request a school demo",
      heroBadge: "AI learning system for K–11 schools",
      heroTitle: "Teach Anything. Prove it.",
      heroText:
        "Class A Education turns your school’s own textbooks into a gamified, AI-guided mastery journey — and shows teachers and parents exactly what each student has learned. Built for Uzbekistan’s schools, in Uzbek, Russian and English.",
      stats: [
        ["Your textbooks", "enhanced, never replaced — we build on the curriculum you already teach"],
        ["IELTS · SAT · AP-aligned", "outcome tracks mapped to the certificates students need to graduate"],
        ["2–3 days", "to onboard a school — not months"],
      ],
      floating: { panels: "Mastery", tutor: "AI tutor", grade: "No surveillance" },
      overviewEyebrow: "What it is",
      overviewTitle: "One system that runs your school toward outcomes.",
      overviewText:
        "Not a homework app bolted on — a single AI learning system your teachers, students and parents all plug into.",
      previewEyebrow: "Inside the app",
      previewTitle: "Learning students actually want to open.",
      previewText:
        "Students get a gamified mastery journey on their phone — clear progress, the next right challenge, and a tutor that helps them understand instead of handing over the answer.",
      tutorEyebrow: "AI tutor",
      tutorTitle: "A real tutor that guides — and never spies.",
      studentLabel: "Student",
      studentMessage: "wait why does revenue go up first then drop later",
      tutorLabel: "AI tutor",
      tutorMessage:
        "Because if the price climbs too high, fewer people buy. Revenue needs both a workable price and enough buyers — let’s find where they balance.",
      usefulTitle: "No surveillance. By design.",
      usefulText:
        "Class A reads a student’s work to help them learn — never to watch them. The tutor explains instead of handing over answers, and every result is auditable against Cambridge, AP and IB benchmarks.",
      workflowEyebrow: "How it works",
      workflowTitle: "From your curriculum to measurable outcomes.",
      quickCardTitle: "Set up in days, not terms.",
      quickCardText:
        "We build on the curriculum you already teach, so there’s nothing to rebuild from scratch — and because the AI supervises the practice block, your teachers spend fewer hours grading and chasing.",
      safeCardTitle: "Privacy-first, by design.",
      safeCardText:
        "No surveillance of children — no webcams, no eye-tracking, no keystroke logging. Kundalik-compliant, with student data protected from day one.",
      launchTitle: "Bring Class A Education to your school.",
      launchText:
        "Request a demo and we’ll set up a pilot — your textbooks, your students, real outcomes in weeks.",
      phone: {
        header: "Class A",
        subject: "Algebra · Quadratics",
        checkpoint: "Mastery check",
        aiReady: "AI tutor",
        question: "Why does revenue rise to a peak, then fall?",
        placeholder: "The student works it through here…",
        continue: "Continue",
      },
      lessonPanels: [
        {
          eyebrow: "Mastery journey",
          title: "Every topic becomes a path, not a worksheet.",
          body: "Students move through short, tidy mastery steps — progress they can see, at their own pace.",
          tag: "Mastery",
          progress: 35,
          xp: "+40 XP",
        },
        {
          eyebrow: "Earn as you grow",
          title: "XP, quests and streaks that reward real understanding.",
          body: "Motivation that’s tied to learning — not random points. Master a topic, level up.",
          tag: "Gamified",
          progress: 70,
          xp: "+120 XP",
        },
        {
          eyebrow: "Boss Arena",
          title: "Prove mastery, not memorization.",
          body: "Students face a challenge that checks real understanding before they advance.",
          tag: "Boss",
          progress: 95,
          xp: "Boss +250 XP",
        },
      ],
      features: [
        {
          icon: "book",
          title: "Built on your textbooks",
          body: "We enhance the curriculum you already teach — never replace it. The AI turns each topic into a guided, gamified path to mastery.",
        },
        {
          icon: "cap",
          title: "Outcomes the state now requires",
          body: "Exam-prep tracks aligned to IELTS, SAT, TOEFL and AP — the certificates every grade 10–11 student needs to graduate.",
        },
        {
          icon: "layers",
          title: "One operator system",
          body: "Attendance, grades, performance, parent notifications and homework in one place — Kundalik-compliant, with AI inside.",
        },
        {
          icon: "zap",
          title: "Less teacher labor",
          body: "AI supervises the at-school practice block, so your teachers spend fewer hours grading and supervising.",
        },
      ],
      workflow: [
        ["01", "We map your curriculum", "We load your textbooks and standards as the source of truth — usually live in 2–3 days."],
        ["02", "Configure tracks", "Switch on the outcome tracks your school needs — IELTS, SAT, AP — and set mastery thresholds per grade."],
        ["03", "Students learn, gamified", "Students practice on the mobile app with an AI tutor and a mastery journey that keeps them moving."],
        ["04", "You see outcomes", "Teachers and parents get a clear view of what each student has actually mastered — no guesswork."],
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
  // Safe deep-lookup: reject __proto__/constructor/prototype keys and require
  // own-property to avoid prototype-pollution surface. Why: data-i18n attribute
  // values flow into here; never let one walk into Object.prototype.
  function getDeep(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      const key = parts[i];
      if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
      const desc = Object.getOwnPropertyDescriptor(cur, key);
      if (!desc) return undefined;
      cur = desc.value;
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

      // Gamified widgets: mastery progress bar + XP pill (per-panel)
      const progressEl = document.getElementById("phone-progress");
      const xpEl = document.getElementById("phone-xp");
      if (progressEl && typeof panel.progress === "number") {
        progressEl.style.width = Math.max(0, Math.min(100, panel.progress)) + "%";
      }
      if (xpEl && panel.xp) xpEl.textContent = panel.xp;

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
      document.querySelectorAll("[data-reveal], [data-reveal-wipe], .stagger-parent").forEach(function (el) {
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

    document.querySelectorAll("[data-reveal], [data-reveal-wipe], .stagger-parent").forEach(function (el) {
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

  // ── Preview parallax (continuous scroll-progress; decorative depth only) ──
  // Gently drifts the dark preview section's glow blobs as it travels through
  // the viewport. Targets only absolutely-positioned, animation-free decorations
  // so it never fights the phone's reveal transform or its float keyframes.
  function bindPreviewParallax() {
    const section = document.getElementById("preview");
    if (!section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const blue = section.querySelector(".preview-glow--blue");
    const fuchsia = section.querySelector(".preview-glow--fuchsia");
    const phoneGlow = section.querySelector(".phone-glow");
    if (!blue && !fuchsia && !phoneGlow) return;

    let ticking = false;

    function update() {
      ticking = false;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // 0..1 as the section crosses the viewport (enters bottom → exits top)
      const total = rect.height + vh;
      const seen = vh - rect.top;
      const progress = Math.max(0, Math.min(1, seen / total));
      const centered = progress - 0.5; // -0.5..0.5

      if (blue) blue.style.transform = "translate3d(0," + (centered * -60).toFixed(1) + "px,0)";
      if (fuchsia) fuchsia.style.transform = "translate3d(0," + (centered * 60).toFixed(1) + "px,0)";
      if (phoneGlow) phoneGlow.style.transform = "translate3d(0," + (centered * -28).toFixed(1) + "px,0)";
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    update();
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
    bindPreviewParallax();
    bindSmoothAnchors();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
