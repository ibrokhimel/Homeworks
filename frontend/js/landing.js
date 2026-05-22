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

  // ── i18n strings (uz, ru, en) ────────────────────────────────────
  // `uz` and `ru` are seeded with the same English copy as `en` (placeholders that the
  // orchestrator replaces with real translations). All three locales share an identical
  // key structure so every binding resolves to a string in every language.
  const i18n = {
    uz: {
      "brand": "NETS",
      "footerNote": "NETS — Class A Education / Class-A-Technologies MCHJ mahsuloti. Toshkent, O‘zbekiston. ZRU-547 talablariga muvofiq. Intellektual mulk Adliya vazirligida ro‘yxatdan o‘tkazilgan.",
      "footer": {
        "brand": "Class A Education",
        "links": "Maktablar uchun · Ota-onalar uchun · O‘qituvchilar uchun · Savol-javob · Bog‘lanish",
        "languages": "O‘zbek · Русский · English"
      },
      "nav": {
        "overview": "Qanday ishlaydi",
        "preview": "Uy vazifasi",
        "tutor": "Yo‘nalishlar",
        "workflow": "Maktabingiz uchun",
        "launch": "Savol-javob"
      },
      "tryBeta": "Demoga yoziling",
      "bookDemo": "Demoga yoziling",
      "seeWorkflow": "NETS qanday ishlashini ko‘ring",
      "heroBadge": "O‘zbekistonda, o‘zbek maktablari uchun, jahon standartlarida yaratilgan",
      "heroTitle": "O‘zbekiston kutgan maktab operatsion tizimi.",
      "heroText": "NETS to‘liq o‘quv jarayonini boshqarish tizimini, AI asosidagi uy vazifasi mexanizmini va xalqaro tan olingan sertifikat yo‘nalishlari kutubxonasini — o‘zbek, rus va ingliz tillarida — birlashtiradi. O‘zbekistonda, o‘zbek maktablari uchun, jahon standartlarida yaratilgan.",
      "stats": [
        ["3 ta til", "Butun platforma bo‘ylab o‘zbek, rus va ingliz tillarida"],
        ["Yagona platforma", "LMS, uy vazifasi mexanizmi va sertifikat yo‘nalishlari bir joyda"],
        ["Ikki hafta", "imzolangan shartnomadan jonli NETS maktabigacha"]
      ],
      "floating": {
        "panels": "Maktablar",
        "tutor": "Yo‘nalishlar",
        "grade": "Natijalar"
      },
      "overviewEyebrow": "Maktablar uchun nima o‘zgardi",
      "overviewTitle": "So‘nggi ikki yil ichida o‘zbek maktablari uchun uchta narsa o‘zgardi.",
      "overviewText": "Bitiruv qoidalari, asosiy o‘quv dasturi va ota-onalar talablari — barchasi o‘zgardi. Maktablar ularning har birini bir vaqtning o‘zida qondirishi kerak.",
      "features": [
        {
          "title": "Bitiruv talablari",
          "body": "10 va 11-sinflar endi bitirish uchun tan olingan til sertifikatiga muhtoj — IELTS, CEFR yoki TOEFL. Maktabingiz har bir o‘quvchini ushbu bosqichdan o‘tishga tayyorlashi kerak."
        },
        {
          "title": "Asosiy o‘quv dasturi",
          "body": "Yirik akademik fanlar 10–11-sinflarning asosiy o‘zagidan chiqarildi. Endi o‘quvchilarning tahsilini IT va tillar belgilaydi. Maktabingizga qolgan fanlarda chuqurlik, qo‘shilganlarida esa qat’iylik kerak."
        },
        {
          "title": "Ota-onalar talablari",
          "body": "Ota-onalar xalqaro maktablar bera oladigan natijalarni ko‘rmoqda va ayni shu natijalarni Sizning maktabingizdan ham kutmoqda. Maktabingiz nimani o‘rgatishini emas, nimani yetishtirishini ko‘rsatishi kerak."
        }
      ],
      "delivers": {
        "eyebrow": "Maktablar nimaga ega bo‘ladi",
        "title": "Maktablar NETS’ni tanlaydi, chunki u bir vaqtning o‘zida uchta natijani beradi.",
        "lead": "Siz allaqachon o‘qitayotgan o‘quv dasturini puxta egallash, o‘quvchilar o‘zlari bilan olib ketadigan tan olingan sertifikatlar va maktabingiz uchun operatsion aniqlik — yagona platformada.",
        "items": [
          {
            "title": "Siz allaqachon o‘qitayotgan o‘quv dasturini puxta egallash",
            "body": "Matematika, tabiiy fanlar, tillar, ijtimoiy fanlar — barchasi mavjud darsliklaringiz, dars rejalaringiz va ish dasturingizga moslangan. NETS Siz o‘qitayotgan narsani kuchaytiradi, hech qachon almashtirmaydi."
          },
          {
            "title": "O‘quvchilar o‘zlari bilan olib ketadigan tan olingan sertifikatlar",
            "body": "IELTS, TOEFL, CEFR’ga moslangan ingliz tili, SAT Math, SAT Reading & Writing, AP’ga moslangan fan yo‘nalishlari hamda IT va AI asoslari — o‘quvchilar har kuni foydalanadigan aynan shu platformada beriladi. Yagona platforma. Yagona shartnoma. Har bir natija qamrab olingan."
          },
          {
            "title": "Maktabingiz uchun operatsion aniqlik",
            "body": "Har bir o‘quvchi, har bir fan, ota-onalar bilan har bir suhbat, har bir hisobot — bir joyda. Kundalik hisobotlaringizni avtomatik to‘ldiradi. ZRU-547 talablariga muvofiq. O‘zbek maktablari aslida qanday ishlashiga moslab yaratilgan."
          }
        ]
      },
      "workflowEyebrow": "Qanday ishlaydi",
      "workflowTitle": "O‘quvchining NETS bilan o‘tadigan kuni avvalgisidan ancha soddaroq.",
      "workflow": [
        ["Ertalabki dars", "Ertalabki dars", "O‘qituvchi maktabingizning mavjud darsliklaridan foydalanadi. NETS o‘sha kunning dars rejasini, slaydlarini, ishlangan misollarini va belgilangan uy vazifasini taqdim etadi. Yangi o‘quv dasturi yo‘q. Almashtiruvchi materiallar yo‘q."],
        ["Uy vazifasi bloki", "Maktabdagi uy vazifasi bloki", "O‘quvchilar o‘sha kunning uy vazifasini maktabda, nazorat ostidagi blok davomida, NETS ichida planshet yoki noutbukda bajaradi. Xonada bitta o‘qituvchi. Platformaning AI ustozi yoqilgan. Tashqi AI vositalari o‘chirilgan."],
        ["AI baholaydi", "O‘qituvchi nazorati ostida AI baholashi", "NETS ishni amalga oshirilayotgani zahoti baholaydi. Ko‘rib chiqish navbati faqat o‘qituvchi e’tiborini talab qiladigan javoblarni ajratib ko‘rsatadi. O‘qituvchilar kechalarini baholashga sarflashni to‘xtatadi; bu vaqtni ularga muhtoj o‘quvchilarga bag‘ishlaydi."],
        ["Uydagi kech", "Uydagi kech", "O‘quvchilar istalgan darsni qayta ko‘rib chiqishi, o‘z natija yo‘nalishini o‘rganishi yoki shunchaki dam olishi mumkin. Uy vazifasi allaqachon bajarilgan — maktabda, o‘qituvchi ishtirokida."]
      ],
      "day": {
        "supporting": "Nazorat ostidagi blok dizayni tasodif emas. Aynan shu NETS’ga AI’ni o‘quvchining yo‘lkesari emas, o‘qituvchining vositasiga aylantirish imkonini beradi. Cambridge, AP Capstone va International Baccalaureate — barchasi shu bir tushunchaga tayanadi: akademik halollikni haqiqiy qiladigan narsa nazorat dasturi emas, jarayonni kuzatishdir. NETS bu tushunchani dasturiy ta’minotda amalga oshiradi va o‘qituvchilaringizga buni puxta bajarish uchun zarur vaqt va ko‘rinuvchanlikni beradi."
      },
      "previewEyebrow": "Uy vazifasi mexanizmi ichida",
      "previewTitle": "NETS uy vazifasini noldan qayta yaratdi.",
      "previewText": "Ko‘pgina platformalar tarqatma materiallarni qayta o‘rab beradi. NETS esa har bir topshiriqni o‘quvchilar tugatishni o‘zi tanlaydigan hikoyaga aylantiradi.",
      "lessonPanels": [
        {
          "eyebrow": "1-bosqich · Tanishtiruv",
          "title": "Hayotiy hikoya rivojlanadi.",
          "body": "Qahramon muammoga duch keladi. O‘quvchi oqibat ochilishidan oldin uchta qaror qabul qiladi. Javob ortidagi formula yoki tamoyil hali nomlanmaydi. O‘quvchi tanlovini qiladi, nima yuz berishini ko‘radi va natijadan saboq oladi.",
          "tag": "Tanishtiruv"
        },
        {
          "eyebrow": "2-bosqich · O‘rganish",
          "title": "Endi tamoyillar bevosita o‘rganiladi.",
          "body": "Hikoyadan kelib chiqqan atamalar va qonuniyatlar to‘g‘ridan-to‘g‘ri o‘rganiladi. Fleshkartalar. Ta’riflar. Ishlangan misollar. O‘quvchi nihoyat o‘zi kashf etgan narsalarning nomlariga ega bo‘ladi.",
          "tag": "O‘rganish"
        },
        {
          "eyebrow": "3-bosqich · Mashq",
          "title": "O‘yin shaklidagi mashqlar tamoyilni qo‘llaydi.",
          "body": "Real Life Challenge dastlabki hikoyani yangi raqamlar bilan qayta o‘ynaydi va o‘quvchi formulani o‘zi aniqlashi kerak — sinov ular javobni eslab qolganini emas; ilgari ko‘rmagan muammoni yecha olishini tekshiradi.",
          "tag": "Mashq"
        },
        {
          "eyebrow": "4-bosqich · Boss Arena",
          "title": "Yagona yuqori mas’uliyatli baholash lahzasi.",
          "body": "O‘quvchi ilgari duch kelmagan yangi vaziyat. Bu yerda ularning yodlash qobiliyati emas — fikrlash mahorati o‘lchanadi.",
          "tag": "Boss Arena"
        }
      ],
      "homework": {
        "detail": "Birinchi urinishdayoq puxta egallashga erisha olmagan o‘quvchilar bir xil tushuncha uchun boshqa hikoyani oladi — uch martagacha. Qiyinchilik o‘qituvchi uchun ma’lumotga aylanadi, hech qachon o‘quvchiga qo‘yilgan muvaffaqiyatsizlik belgisiga emas. Topshiriqlarni oson bajarib ketadigan o‘quvchilar ham ma’lumot beradi — kontent juda osonmi, o‘quvchi sinfdan oldinda ketayaptimi, qiyinchilik darajasini o‘zgartirish kerakmi."
      },
      "phone": {
        "header": "Uy vazifasi",
        "subject": "Real Life Challenge",
        "checkpoint": "Boss Arena",
        "aiReady": "AI ustoz yoqilgan",
        "question": "Yaqin atrofda yangi do‘kon ochilib, narxlaringizni tushiradi. Daromadingizga nima bo‘ladi va nega?",
        "placeholder": "O‘quvchi javobni shu yerda mulohaza qilib yozadi...",
        "continue": "Darsni davom ettirish"
      },
      "tracks": {
        "eyebrow": "O‘quvchilar olib keta oladigan sertifikatlar",
        "title": "Har bir NETS o‘quvchisi tan olingan manzilga yetaklovchi yo‘nalishda.",
        "lead": "NETS Natija Yo‘nalishlari Kutubxonasi o‘quvchilar maktabni bitirgach ehtiyoj sezadigan sertifikat va ko‘nikmalarni qamrab oladi — tayyorgarlik so‘nggi sinfda emas, birinchi kundan boshlanadi.",
        "items": [
          {
            "name": "IELTS",
            "body": "Cambridge IELTS talablariga moslangan to‘liq tayyorgarlik. Listening, Reading, Writing, Speaking. Bitiruv talablari uchun CEFR’ga bog‘langan."
          },
          {
            "name": "TOEFL",
            "body": "ETS talablariga moslangan. Maqsadli imtihoni amerikacha bo‘lgan o‘quvchilar uchun parallel tayyorgarlik."
          },
          {
            "name": "SAT Math va SAT Reading and Writing",
            "body": "College Board talablariga moslangan. AQSh universitetlariga kirishni maqsad qilgan o‘quvchilar uchun."
          },
          {
            "name": "AP’ga moslangan fan yo‘nalishlari",
            "body": "Asosiy fanlarda universitet darajasidagi chuqurlik — universitetda ilg‘or kurslarga tayyorlanayotgan o‘quvchilar uchun."
          },
          {
            "name": "K1–4 Boshqotirma Kutubxonasi",
            "body": "Boshlang‘ich yillar uchun o‘yin shaklidagi poydevor o‘rganish. Puxta egallash shu yerdan boshlanadi."
          },
          {
            "name": "IT va AI Asoslari",
            "body": "10–11-sinf o‘quv dasturi endi asosiy o‘zakda talab qilayotgan bilimlarga moslangan. Amaliy, qo‘llaniladigan, zamonaviy."
          }
        ],
        "closing": "NETS o‘quvchisi bitiruvi bog‘liq bo‘lgan sertifikatga tayyorlanishni 11-sinfgacha kutib o‘tirmaydi. Ular maktabi NETS’ni yoqqan kundan boshlab unga qarab harakat qiladi."
      },
      "learner": {
        "eyebrow": "NETS’ni kim bitiradi",
        "title": "Biz o‘quvchilaringiz qanday baho olishinigina emas, kimga aylanishini o‘lchaymiz.",
        "lead": "NETS har bir fan va har bir yo‘nalish bo‘ylab oltita o‘quvchi xususiyatini kuzatadi. Ota-onalar farzandining rivojlanish manzarasini ko‘radi. O‘qituvchilar nima samara berayotganini ko‘radi. Maktablar nimani yetishtirayotganini ko‘radi.",
        "items": [
          {
            "title": "Izlanuvchanlar",
            "body": "Javobga shoshilishdan oldin to‘g‘ri savollar beradigan o‘quvchilar."
          },
          {
            "title": "Fikrlovchilar",
            "body": "Faqat tanish emas, yangi vaziyatlarda ham mulohaza yurita oladigan o‘quvchilar."
          },
          {
            "title": "Muloqotchilar",
            "body": "O‘z mulohazasini ikki tilda himoya qila oladigan o‘quvchilar."
          },
          {
            "title": "Tamoyilli",
            "body": "O‘z ishiga egalik qiladigan va boshqalarning hissasini halol e’tirof etadigan o‘quvchilar."
          },
          {
            "title": "Mushohadali",
            "body": "Faqat nimani o‘rganganini emas, qanday o‘rganishini ham tasvirlab bera oladigan o‘quvchilar."
          },
          {
            "title": "Faol",
            "body": "Kelib, sabot bilan harakat qilib, ishni oxiriga yetkazadigan o‘quvchilar."
          }
        ],
        "supporting": "International Baccalaureate Learner Profile va Cambridge Learner Attributes’ning eng yaxshi jihatlaridan ilhomlangan. O‘zbek o‘quvchilari uchun yaratilgan. Maktabingizdagi har bir sinfda kuzatib boriladi."
      },
      "roles": {
        "eyebrow": "Maktabingizga aloqador har bir kishi uchun yaratilgan",
        "title": "NETS har bir rolga aynan kerak bo‘lganini — va faqat kerak bo‘lganini beradi.",
        "items": [
          {
            "title": "O‘quvchilar uchun",
            "body": "Har bir dars, yo‘nalish, topshiriq va baho bitta ilovada. AI ustoz ular qiynalganda tushuntiradi. Har bir natija yo‘nalishi bo‘yicha taraqqiyoti ularga ko‘rinib turadi. Ular qayta ko‘rishni istagan darsga hech qachon kirish huquqini yo‘qotmaydi."
          },
          {
            "title": "O‘qituvchilar uchun",
            "body": "O‘quv dasturingizga mos dars rejalari, slaydlar va uy vazifalari — foydalanishga tayyor. AI baholagan ishlar, faqat inson e’tiborini talab qiladigan narsani ajratib ko‘rsatadigan Ko‘rib chiqish navbati bilan. Har bir o‘quvchining ko‘nikma va xususiyatlari rivoji o‘quvchilar ishlagani sayin yangilanib turadi. O‘rnatilgan nazorat nuqtalari bilan capstone kuzatuvi. Kundalik bilan mos hisobotlar."
          },
          {
            "title": "Ota-onalar uchun",
            "body": "Farzandining taraqqiyoti, yo‘nalishi, xususiyatlari rivoji, capstone va o‘qituvchi xabarlari — qo‘llarida, o‘zbek, rus yoki ingliz tilida. Maktabda nima yuz berayotganini chinakam ko‘rish — choragiga bir bo‘ladigan ota-onalar yig‘ilishi emas."
          },
          {
            "title": "Maktab ma’muriyati uchun",
            "body": "Har bir baho, sinf va o‘quvchi — o‘zlashtirish, davomat, faollik. Yo‘nalishlar bo‘yicha sinflarning tayyorlik darajasi. O‘qituvchilarning ish yuki taqsimoti. Capstone galereyalari. Kundalik’ni avtomatik to‘ldiradigan hisobotlar."
          }
        ]
      },
      "uzbekistan": {
        "eyebrow": "Dizayni bo‘yicha avvalo mahalliy",
        "title": "Toshkentda ishlab chiqilgan. O‘zbek maktablari uchun yaratilgan. Jahon standartlarida.",
        "items": [
          {
            "title": "Ikki tilda taqdim etish",
            "body": "To‘liq o‘zbek va rus tillarida. Ingliz tili har bir yo‘nalish bo‘yicha mavjud."
          },
          {
            "title": "O‘quv dasturiga moslangan",
            "body": "O‘zbekiston milliy o‘quv dasturi doirasi. 2030 PISA maqsadlari yo‘l ko‘rsatuvchi yulduz sifatida."
          },
          {
            "title": "Kundalik bilan integratsiyalashgan",
            "body": "Kundalik’ni avtomatik to‘ldiradi. Takroriy hisobot yo‘q."
          },
          {
            "title": "ZRU-547 ga muvofiq",
            "body": "O‘zbekistonning ma’lumotlar maxfiyligi to‘g‘risidagi qonuniga muvofiq yaratilgan."
          },
          {
            "title": "Intellektual mulk ro‘yxatdan o‘tgan",
            "body": "Class-A-Technologies MCHJ nomidan Adliya vazirligida ro‘yxatdan o‘tkazilgan."
          },
          {
            "title": "Bitiruvga tayyor",
            "body": "Yangi 10–11-sinf talabi uchun yaratilgan IELTS va CEFR tayyorgarligi."
          }
        ]
      },
      "onboarding": {
        "eyebrow": "Ishga tushirish",
        "title": "Bozordagi eng tezkor maktab joriy etilishi.",
        "steps": [
          {
            "num": "1–3-kunlar",
            "title": "O‘quv dasturi kiritiladi",
            "body": "Mavjud o‘quv dasturi materiallaringiz NETS’ga kiritiladi. Darsliklaringiz, dars rejalaringiz va o‘qituvchilar uchun resurslaringiz. Sizning kontentingiz haqiqat manbai bo‘lib qoladi."
          },
          {
            "num": "4–7-kunlar",
            "title": "O‘qituvchilarni tayyorlash",
            "body": "O‘qituvchilar qisqa tanishtiruv kursini o‘taydi. Ko‘pchilik birinchi haftadayoq platformani yaxshi o‘zlashtiradi."
          },
          {
            "num": "8–10-kunlar",
            "title": "O‘quvchilar va ota-onalar",
            "body": "O‘quvchilar va ota-onalar sinf darslari orqali platforma bilan tanishtiriladi."
          },
          {
            "num": "11–14-kunlar",
            "title": "Dastlabki nazorat ostidagi bloklar",
            "body": "Dastlabki nazorat ostidagi uy vazifasi bloklari o‘tkaziladi. Class A xodimlari kuzatib boradi va yordam beradi."
          },
          {
            "num": "15-kundan boshlab",
            "title": "Jonli platforma",
            "body": "NETS maktabingizning operatsion va o‘quv platformasiga aylanadi."
          }
        ],
        "subline": "Bir nechta filialingiz bormi? Ikkinchi va keyingi kampuslar tezroq ishga tushadi — kontentingiz allaqachon kutubxonada."
      },
      "configs": {
        "eyebrow": "Konfiguratsiyalar",
        "title": "NETS maktabingizga moslashadi, lekin buyurtma asosidagi mahsulotga aylanmaydi.",
        "standard": {
          "title": "NETS Standard",
          "body": "NETS’ni operatsion va o‘quv tizimi sifatida boshdan-oxir joriy etishni istagan maktablar uchun. Universal mahsulot, maktabingiz tuzilmasiga moslangan. Ikki haftalik ishga tushirish. Har bir o‘quvchi uchun narx. Ko‘pchilik maktablar tanlaydigan yo‘l."
        },
        "configurable": {
          "title": "NETS Configurable",
          "body": "Mavjud tizimini almashtirishga hali tayyor bo‘lmagan maktablar uchun. Muayyan NETS yuzalarini — uy vazifasi mexanizmi, natija yo‘nalishi, ota-onalar ilovasini — allaqachon mavjud tizimingizga ulang. Hajm asosida kelishilgan narx."
        },
        "subline": "NETS buyurtmaga moslanmaydi, balki ijaraga olinadi. Maktabingiz mahsulotni sozlaydi; mahsulot esa mahsulotligicha qoladi. Aynan shu uni tezkor, zamonaviy va o‘quvchilaringizga kerak bo‘lgan jahon standartlariga mos saqlaydi."
      },
      "trackRecord": {
        "eyebrow": "Ishonch",
        "title": "Nimani o‘lchasak, shuni ko‘rsatamiz.",
        "body": "NETS hali erishmagan natijalarni va’da qilmaydi. Biz o‘lchaganimizda shaffoflikni va’da qilamiz — o‘quvchining oltita xususiyat bo‘yicha rivojlanishi, maktabingiz o‘qitayotgan o‘quv dasturi bo‘yicha o‘zlashtirishi, har bir natija yo‘nalishi bo‘yicha tayyorligi. NETS’ni qo‘llayotgan maktablar muhim ma’lumotlarni har kuni ko‘rib turadi. Sinflar NETS ostida birinchi yilini va birinchi sertifikat imtihonlarini yakunlagani sayin, biz o‘sha o‘quvchilar erishgan natijalarni e’lon qilamiz. Shu paytgacha esa maktablardan bizni hali isbotlay olmagan da’volarimizga emas, platformada o‘zlari ko‘ra oladigan narsaga qarab baholashlarini so‘raymiz.",
        "subline": "Bu — International Baccalaureate, Cambridge International va College Board tutadigan ayni yondashuv. Avval natijaga erishiladi, keyin u nomlanadi."
      },
      "faq": {
        "eyebrow": "Ko‘p beriladigan savollar",
        "title": "Maktablar shartnoma imzolashdan oldin beradigan savollar.",
        "items": [
          {
            "q": "NETS o‘qituvchilarimizning o‘rnini bosadimi?",
            "a": "Yo‘q. NETS o‘qituvchilaringizga ko‘rinuvchanlik, qaytarib beriladigan vaqt va hozir ularda bo‘lmagan vositalarni beradi. Nazorat ostidagi blok dizayni xonada o‘qituvchini aniq talab qiladi — bu rol ixtiyoriy emas, balki muhim. NETS maktabingizga avval bir necha mutaxassisni talab qilgan ishni uy vazifasi soatlarida bitta nazoratchi o‘qituvchi qamrab olishi imkonini beradi."
          },
          {
            "q": "NETS Kundalik’ning o‘rnini bosadimi?",
            "a": "Yo‘q. Kundalik majburiy milliy hisobot tizimingiz bo‘lib qoladi. NETS Kundalik’ning ustida turadi va uni avtomatik to‘ldiradi. Maktabingiz takroriy ma’lumot kiritishni to‘xtatadi. Kundalik rasmiy hujjat bo‘lib qoladi."
          },
          {
            "q": "NETS qaysi tilda?",
            "a": "Butun platforma uchun to‘liq o‘zbek va rus tillarida. Ingliz tili har bir yo‘nalish bo‘yicha mavjud, ayniqsa xalqaro sertifikatlarga moslangan natija yo‘nalishlari uchun. Ota-onalar o‘zi afzal ko‘rgan tilni tanlaydi; o‘quvchilar o‘zinikini; o‘qituvchilar o‘zinikini."
          },
          {
            "q": "Bizning darsliklarimizdan foydalanasizmi?",
            "a": "Ha. Maktabingizning mavjud darsliklari va dars rejalari haqiqat manbai bo‘lib qoladi. NETS ularni kuchaytiradi — uy vazifasi mexanizmi, natija yo‘nalishlari, operatsion qatlamni qo‘shadi — lekin hech qachon ularning o‘rnini bosmaydi."
          },
          {
            "q": "O‘quvchilar ma’lumotlarini qanday boshqarasiz?",
            "a": "NETS O‘zbekistonning ma’lumotlar maxfiyligi to‘g‘risidagi ZRU-547 qonuniga muvofiq yaratilgan. O‘quvchi ma’lumotlari turishi kerak bo‘lgan joyda turadi. Maktab ma’murlari qanday ma’lumot yig‘ilishi va u qayerda saqlanishini to‘liq ko‘rib turadi."
          },
          {
            "q": "O‘quvchilar uy vazifasini ChatGPT yordamida bajarsa-chi?",
            "a": "NETS uy vazifasi maktabda nazorat ostidagi blok davomida bajariladi. Xonada o‘qituvchi bor. Tashqi AI vositalari esa yo‘q. Capstone loyihalari kabi yuqori mas’uliyatli ishlar uchun o‘qituvchingiz ish o‘quvchining o‘ziniki ekanini hujjatlashtirilgan tarzda tasdiqlaydi — bu aynan Cambridge, AP Capstone va International Baccalaureate qo‘llaydigan yondashuvdir."
          }
        ]
      },
      "cta": {
        "title": "Ushbu sahifadan jonli NETS maktabigacha uch qadam.",
        "steps": [
          {
            "title": "1. Ishlaydigan demo",
            "body": "Biz direktoringiz va o‘quv rahbariyatingizni o‘quv dasturingiz allaqachon yuklangan jonli NETS akkaunti orqali olib o‘tamiz. 90 daqiqa."
          },
          {
            "title": "2. Sinov kelishuvi",
            "body": "Bitta kampus yoki bitta sinf oralig‘i, aniqlangan muvaffaqiyat mezonlari, belgilangan muddatli sinov narxi."
          },
          {
            "title": "3. Ikki haftadan so‘ng",
            "body": "NETS ishga tushadi."
          }
        ],
        "primary": "Demoga so‘rov yuboring",
        "secondary": "NETS o‘quvchisining ota-onasi bilan suhbatlashing"
      }
    },
    ru: {
      "brand": "NETS",
      "footerNote": "NETS — продукт Class A Education / Class-A-Technologies MCHJ. Ташкент, Узбекистан. Соответствует требованиям ZRU-547. ИС зарегистрирована в Adliya vazirligi.",
      "footer": {
        "brand": "Class A Education",
        "links": "Для школ · Для родителей · Для учителей · FAQ · Контакты",
        "languages": "O‘zbek · Русский · English"
      },
      "nav": {
        "overview": "Как это работает",
        "preview": "Домашние задания",
        "tutor": "Треки",
        "workflow": "Для вашей школы",
        "launch": "FAQ"
      },
      "tryBeta": "Записаться на демо",
      "bookDemo": "Записаться на демо",
      "seeWorkflow": "Посмотреть, как работает NETS",
      "heroBadge": "Создано в Узбекистане — для узбекских школ — по мировым стандартам",
      "heroTitle": "Операционная система для школы, которую Узбекистан ждал.",
      "heroText": "NETS объединяет полноценную систему управления обучением, модуль домашних заданий на базе AI и библиотеку треков к международно признанным сертификатам — на узбекском, русском и английском языках. Создано в Узбекистане, для узбекских школ, по мировым стандартам.",
      "stats": [
        ["3 языка", "Узбекский, русский и английский — на всей платформе"],
        ["Одна платформа", "LMS, модуль домашних заданий и треки сертификации — вместе"],
        ["Две недели", "от подписания договора до запуска NETS в школе"]
      ],
      "floating": {
        "panels": "Школы",
        "tutor": "Треки",
        "grade": "Результаты"
      },
      "overviewEyebrow": "Что изменилось для школ",
      "overviewTitle": "За последние два года для узбекских школ изменились три вещи.",
      "overviewText": "Требования к выпуску, базовая программа и ожидания родителей — всё это сдвинулось одновременно. Школе нужно соответствовать каждому из этих требований.",
      "features": [
        {
          "title": "Требования к выпускным сертификатам",
          "body": "Ученикам 10–11-го классов для получения аттестата теперь нужен признанный языковой сертификат — IELTS, CEFR или TOEFL. Ваша школа должна подготовить каждого ученика к этой планке."
        },
        {
          "title": "Базовая программа",
          "body": "Ряд ключевых предметов исключён из обязательного ядра 10–11-го классов. IT и иностранные языки теперь формируют основу учебного плана. Школе нужна глубина в том, что осталось, и строгость в том, что добавилось."
        },
        {
          "title": "Ожидания родителей",
          "body": "Родители видят, что дают международные школы, и хотят тех же результатов от вашей. Вашей школе нужно показывать, что она производит, — не только то, чему учит."
        }
      ],
      "delivers": {
        "eyebrow": "Что получают школы",
        "title": "Школы выбирают NETS, потому что он решает три задачи одновременно.",
        "lead": "Освоение программы, которую вы уже преподаёте, признанные сертификаты в руках выпускников и операционная прозрачность для школы — в одной платформе.",
        "items": [
          {
            "title": "Освоение программы, которую вы уже преподаёте",
            "body": "Математика, естественные науки, языки, обществознание — всё выровнено по вашим действующим учебникам, поурочным планам и рабочим программам. NETS усиливает то, что вы преподаёте, и никогда не подменяет это."
          },
          {
            "title": "Признанные сертификаты, которые останутся у выпускников",
            "body": "IELTS, TOEFL, английский по CEFR, SAT Math, SAT Reading & Writing, предметные треки по AP, основы IT и AI — всё внутри той же платформы, которой ученики пользуются каждый день. Одна платформа. Один договор. Все результаты."
          },
          {
            "title": "Операционная прозрачность для вашей школы",
            "body": "Каждый ученик, каждый предмет, каждый разговор с родителем, каждый отчёт — в одном месте. Данные передаются в Kundalik автоматически. Соответствует ZRU-547. Разработано под реальную работу узбекских школ."
          }
        ]
      },
      "workflowEyebrow": "Как это работает",
      "workflowTitle": "Учебный день ученика с NETS проще, чем всё, что было раньше.",
      "workflow": [
        ["Урок", "Утренний урок", "Учитель работает с действующими учебниками вашей школы. NETS выводит поурочный план, слайды, разобранные примеры и заданное домашнее задание. Никакой новой программы. Никакой замены материалов."],
        ["Домашняя работа", "Блок домашней работы в школе", "Ученики выполняют домашнее задание дня на планшете или ноутбуке, внутри NETS, во время контролируемого блока в школе. В классе один учитель. AI-тьютор платформы включён. Внешние AI-инструменты отключены."],
        ["Проверка AI", "Проверка AI с контролем учителя", "NETS оценивает работу по мере выполнения. Очередь проверки выводит только те ответы, которые требуют взгляда учителя. Учителя перестают тратить вечера на проверку — и тратят это время на тех, кому оно действительно нужно."],
        ["Вечер дома", "Вечер дома", "Ученики могут вернуться к любому уроку, изучить свой трек или просто отдохнуть. Домашняя работа уже сделана — в школе, в присутствии учителя."]
      ],
      "day": {
        "supporting": "Формат контролируемого блока — не случайное решение. Именно так NETS превращает AI в инструмент учителя, а не в лазейку для ученика. Cambridge, AP Capstone и International Baccalaureate опираются на ту же идею: контроль процесса, а не программы-детекторы — вот что делает академическую честность реальной. NETS воплощает эту идею в программном обеспечении и даёт вашим учителям время и обзор, необходимые для качественной работы."
      },
      "previewEyebrow": "Внутри модуля домашних заданий",
      "previewTitle": "NETS переосмыслил домашнее задание с нуля.",
      "previewText": "Большинство платформ просто оцифровывают рабочие листы. NETS превращает каждое задание в историю, которую ученик сам хочет дочитать до конца.",
      "lessonPanels": [
        {
          "eyebrow": "Этап 1 · Preview",
          "title": "Разворачивается история из реальной жизни.",
          "body": "Герой сталкивается с проблемой. Ученик принимает три решения — прежде чем увидит последствия. Формула или принцип, стоящий за ответом, ещё не назван. Ученик делает выбор, видит результат и учится на нём.",
          "tag": "Preview"
        },
        {
          "eyebrow": "Этап 2 · Learning",
          "title": "Теперь принципы изучаются напрямую.",
          "body": "Термины и закономерности, возникшие из истории, изучаются в лоб. Карточки. Определения. Разобранные примеры. Ученик наконец получает названия для того, что только что открыл сам.",
          "tag": "Learning"
        },
        {
          "eyebrow": "Этап 3 · Practice",
          "title": "Игровые упражнения закрепляют принцип.",
          "body": "Real Life Challenge воспроизводит исходную историю с новыми данными — и ученик должен самостоятельно вывести формулу. Задача не в том, помнит ли он ответ, а в том, может ли он решить задачу, которую раньше не видел.",
          "tag": "Practice"
        },
        {
          "eyebrow": "Этап 4 · Boss Arena",
          "title": "Один итоговый момент высоких ставок.",
          "body": "Ситуация, с которой ученик ещё не встречался. Оценивается его рассуждение — не механическое воспроизведение.",
          "tag": "Boss Arena"
        }
      ],
      "homework": {
        "detail": "Ученики, не достигшие освоения с первой попытки, получают другую историю на ту же тему — до трёх раз. Трудность становится данными для учителя, а не отметкой о провале для ученика. Те, кто справляется легко, тоже дают информацию — слишком ли прост материал, опережает ли ученик класс, нужно ли повысить сложность."
      },
      "phone": {
        "header": "Домашнее задание",
        "subject": "Real Life Challenge",
        "checkpoint": "Boss Arena",
        "aiReady": "AI-тьютор включён",
        "question": "Рядом открывается новый магазин и снижает ваши цены. Что произойдёт с вашей выручкой и почему?",
        "placeholder": "Ученик излагает своё рассуждение здесь...",
        "continue": "Продолжить урок"
      },
      "tracks": {
        "eyebrow": "Сертификаты, которые остаются с учеником",
        "title": "Каждый ученик NETS движется к признанному результату.",
        "lead": "Библиотека треков NETS охватывает сертификаты и навыки, с которыми ученики должны выйти из школы, — подготовка начинается с первого дня, а не в последний год.",
        "items": [
          {
            "name": "IELTS",
            "body": "Полная подготовка по спецификациям Cambridge IELTS. Аудирование, чтение, письмо, говорение. Привязка к CEFR для выполнения выпускных требований."
          },
          {
            "name": "TOEFL",
            "body": "Подготовка по спецификациям ETS. Параллельный трек для учеников, чья целевая система — американская."
          },
          {
            "name": "SAT Math & SAT Reading and Writing",
            "body": "По спецификациям College Board. Для учеников, нацеленных на поступление в университеты США."
          },
          {
            "name": "AP-aligned subject tracks",
            "body": "Университетская глубина по основным предметам — для учеников, готовящихся к зачёту продвинутых курсов."
          },
          {
            "name": "K1–4 Puzzle Library",
            "body": "Игровое обучение основам для младших классов. Здесь начинается освоение."
          },
          {
            "name": "IT and AI Foundations",
            "body": "Соответствует новым обязательным требованиям программы 10–11-х классов. Практично, прикладно, актуально."
          }
        ],
        "closing": "Ученик NETS не ждёт одиннадцатого класса, чтобы начать готовиться к сертификату, от которого зависит его выпуск. Он движется к нему с первого дня, когда школа включает NETS."
      },
      "learner": {
        "eyebrow": "Кто выпускается из NETS",
        "title": "Мы измеряем, кем становятся ваши ученики, — а не только их баллы.",
        "lead": "NETS отслеживает шесть качеств ученика по каждому предмету и каждому треку. Родители видят картину развития своего ребёнка. Учителя видят, что работает. Школы видят, кого они выпускают.",
        "items": [
          {
            "title": "Исследователи",
            "body": "Ученики, которые задают правильные вопросы, прежде чем искать ответ."
          },
          {
            "title": "Мыслители",
            "body": "Ученики, которые рассуждают в незнакомых ситуациях, а не только в привычных."
          },
          {
            "title": "Коммуникаторы",
            "body": "Ученики, которые могут обосновать своё мышление на двух языках."
          },
          {
            "title": "Принципиальные",
            "body": "Ученики, которые отвечают за свою работу и честно признают чужой вклад."
          },
          {
            "title": "Рефлексирующие",
            "body": "Ученики, которые могут описать, как они учатся, — а не только что они узнали."
          },
          {
            "title": "Вовлечённые",
            "body": "Ученики, которые приходят, не сдаются и доводят дело до конца."
          }
        ],
        "supporting": "Вдохновлено лучшим из профиля учащегося International Baccalaureate и атрибутов учащегося Cambridge. Создано для узбекских учеников. Отслеживается в каждом классе вашей школы."
      },
      "roles": {
        "eyebrow": "Создано для всех, кто работает в вашей школе",
        "title": "NETS даёт каждой роли именно то, что ей нужно — и ничего лишнего.",
        "items": [
          {
            "title": "Для учеников",
            "body": "Все уроки, треки, задания и оценки — в одном приложении. AI-тьютор объясняет, когда что-то непонятно. Прогресс по каждому треку виден самому ученику. Доступ к любому уроку, который захотелось пересмотреть, не теряется никогда."
          },
          {
            "title": "Для учителей",
            "body": "Поурочные планы, слайды и домашние задания по вашей программе — готовы к использованию. Работы, проверенные AI, с очередью только тех, где нужен живой взгляд. Видимость развития навыков и качеств по каждому ученику — обновляется в процессе работы. Кураторство итоговых проектов со встроенными контрольными точками. Отчёты, совместимые с Kundalik."
          },
          {
            "title": "Для родителей",
            "body": "Успеваемость ребёнка, его трек, развитие качеств, итоговый проект и сообщения учителя — в телефоне, на узбекском, русском или английском. Реальная картина того, что происходит в школе, — а не раз в четверть на родительском собрании."
          },
          {
            "title": "Для администрации школы",
            "body": "Каждая оценка, каждый класс, каждый ученик — успеваемость, посещаемость, вовлечённость. Готовность когорт по трекам сертификации. Распределение нагрузки учителей. Галереи итоговых проектов. Отчёты, которые автоматически передаются в Kundalik."
          }
        ]
      },
      "uzbekistan": {
        "eyebrow": "Локальный приоритет — по умолчанию",
        "title": "Разработано в Ташкенте. Для узбекских школ. По мировым стандартам.",
        "items": [
          {
            "title": "Двуязычная подача",
            "body": "Полный узбекский и русский. Английский доступен трек за треком."
          },
          {
            "title": "Выравнивание по программе",
            "body": "Национальный учебный стандарт Узбекистана. Цели PISA 2030 — как ориентир."
          },
          {
            "title": "Интеграция с Kundalik",
            "body": "Данные передаются в Kundalik автоматически. Никакого дублирования отчётности."
          },
          {
            "title": "Соответствие ZRU-547",
            "body": "Разработано в соответствии с законом Узбекистана о защите персональных данных."
          },
          {
            "title": "Регистрация интеллектуальной собственности",
            "body": "Зарегистрировано в Adliya vazirligi под именем Class-A-Technologies MCHJ."
          },
          {
            "title": "Готовность к выпускным требованиям",
            "body": "Подготовка к IELTS и CEFR под новый обязательный стандарт для 10–11-х классов."
          }
        ]
      },
      "onboarding": {
        "eyebrow": "Запуск",
        "title": "Самое быстрое развёртывание школы на рынке.",
        "steps": [
          {
            "num": "1–3-й дни",
            "title": "Загрузка учебной программы",
            "body": "Ваши действующие учебные материалы переносятся в NETS. Учебники, поурочные планы, ресурсы для учителей. Ваш контент остаётся источником истины."
          },
          {
            "num": "4–7-й дни",
            "title": "Ориентация учителей",
            "body": "Учителя проходят краткий вводный курс. Большинство уверенно работает с платформой уже к концу первой недели."
          },
          {
            "num": "8–10-й дни",
            "title": "Ученики и родители",
            "body": "Ученики и родители подключаются через классные демонстрации."
          },
          {
            "num": "11–14-й дни",
            "title": "Первые контролируемые блоки",
            "body": "Проводятся первые контролируемые блоки домашних заданий. Сотрудники Class A наблюдают и оказывают поддержку."
          },
          {
            "num": "С 15-го дня",
            "title": "Платформа запущена",
            "body": "NETS становится операционной и учебной платформой вашей школы."
          }
        ],
        "subline": "Несколько филиалов? Каждый следующий кампус подключается быстрее — ваш контент уже в библиотеке."
      },
      "configs": {
        "eyebrow": "Конфигурации",
        "title": "NETS адаптируется к вашей школе — без превращения в заказную разработку.",
        "standard": {
          "title": "NETS Standard",
          "body": "Для школ, которые хотят развернуть NETS полностью — как операционную и учебную систему. Универсальный продукт, настроенный под структуру вашей школы. Запуск за две недели. Цена за ученика. Путь, который выбирает большинство школ."
        },
        "configurable": {
          "title": "NETS Configurable",
          "body": "Для школ с действующей системой, от которой они пока не готовы отказаться. Подключите нужные модули NETS — модуль домашних заданий, отдельный трек, приложение для родителей — к тому, что уже есть. Цена согласовывается по объёму."
        },
        "subline": "NETS арендуется, а не дорабатывается под заказ. Ваша школа настраивает продукт — сам продукт при этом остаётся продуктом. Именно так он остаётся быстрым, актуальным и выровненным по мировым стандартам, которые нужны вашим ученикам."
      },
      "trackRecord": {
        "eyebrow": "Доверие",
        "title": "Что мы измеряем — то и показываем.",
        "body": "NETS не обещает результатов, которых ещё не достиг. Мы обещаем прозрачность в том, что измеряем: развитие ученика по шести качествам, освоение программы, которую преподаёт ваша школа, и готовность по каждому треку сертификации. Школы, работающие с NETS, видят важные данные каждый день. По мере того как первые когорты завершат учебный год и сдадут первые сертификационные экзамены в NETS, мы опубликуем их результаты. До этого момента мы просим школы оценивать нас по тому, что видно в платформе, — а не по заявлениям, которые мы пока не можем подкрепить.",
        "subline": "Это та же позиция, которую занимают International Baccalaureate, Cambridge International и College Board. Результаты сначала зарабатываются — потом называются."
      },
      "faq": {
        "eyebrow": "Часто задаваемые вопросы",
        "title": "Вопросы, которые школы задают перед подписанием договора.",
        "items": [
          {
            "q": "NETS заменяет наших учителей?",
            "a": "Нет. NETS даёт вашим учителям обзор, время и инструменты, которых у них сейчас нет. Формат контролируемого блока специально предполагает присутствие учителя в классе — эта роль обязательна, а не опциональна. Что меняется: одному учителю-куратору под силу обеспечить то, для чего раньше требовалось несколько специалистов в часы домашней работы."
          },
          {
            "q": "NETS заменяет Kundalik?",
            "a": "Нет. Kundalik остаётся обязательной государственной системой отчётности. NETS работает поверх Kundalik и передаёт в него данные автоматически. Ваша школа перестаёт вводить информацию дважды. Kundalik остаётся официальным реестром."
          },
          {
            "q": "На каком языке работает NETS?",
            "a": "Полный узбекский и русский — на всей платформе. Английский доступен трек за треком — особенно для треков, ориентированных на международные сертификаты. Родители выбирают удобный язык, ученики — свой, учителя — свой."
          },
          {
            "q": "Вы используете наши учебники?",
            "a": "Да. Действующие учебники и поурочные планы вашей школы остаются источником истины. NETS дополняет их — добавляет модуль домашних заданий, треки результатов, операционный слой — но никогда не подменяет."
          },
          {
            "q": "Как вы обрабатываете данные учеников?",
            "a": "NETS разработан в соответствии с законом Узбекистана о защите персональных данных ZRU-547. Данные учеников остаются там, где должны. Администраторы школы в любой момент видят, какие данные собираются и где хранятся."
          },
          {
            "q": "А если ученики будут использовать ChatGPT для домашних заданий?",
            "a": "Домашние задания NETS выполняются во время контролируемого блока в школе. В классе присутствует учитель. Внешние AI-инструменты отключены. Для более серьёзных работ — например, итоговых проектов — учитель проводит задокументированную проверку авторства: именно так действуют Cambridge, AP Capstone и International Baccalaureate."
          }
        ]
      },
      "cta": {
        "title": "Три шага от этой страницы до работающей платформы NETS в школе.",
        "steps": [
          {
            "title": "1. Живое демо",
            "body": "Мы проводим вашего директора и педагогическое руководство через реальный аккаунт NETS с уже загруженной программой вашей школы. 90 минут."
          },
          {
            "title": "2. Пилотное соглашение",
            "body": "Один кампус или один параллель, чёткие метрики успеха, фиксированная цена на период пилота."
          },
          {
            "title": "3. Через две недели",
            "body": "NETS запущен."
          }
        ],
        "primary": "Запросить демо",
        "secondary": "Поговорить с родителем ученика NETS"
      }
    },
    en: {
      "brand": "NETS",
      "footerNote": "NETS is a product of Class A Education / Class-A-Technologies MCHJ. Tashkent, Uzbekistan. Compliant with ZRU-547. IP filed with Adliya vazirligi.",
      "footer": {
        "brand": "Class A Education",
        "links": "For schools · For parents · For teachers · FAQ · Contact",
        "languages": "O‘zbek · Русский · English"
      },
      "nav": {
        "overview": "How it works",
        "preview": "Homework",
        "tutor": "Tracks",
        "workflow": "For your school",
        "launch": "FAQ"
      },
      "tryBeta": "Book a demo",
      "bookDemo": "Book a demo",
      "seeWorkflow": "See how NETS works",
      "heroBadge": "Built in Uzbekistan, for Uzbek schools, to global standards",
      "heroTitle": "The school operating system Uzbekistan was waiting for.",
      "heroText": "NETS combines a complete learning management system, an AI-powered homework engine, and a library of internationally recognized credential tracks — in Uzbek, Russian, and English. Built in Uzbekistan, for Uzbek schools, to global standards.",
      "stats": [
        ["3 languages", "Uzbek, Russian and English across the whole platform"],
        ["One platform", "LMS, homework engine and credential tracks together"],
        ["Two weeks", "from signed contract to a live NETS school"]
      ],
      "floating": {
        "panels": "Schools",
        "tutor": "Tracks",
        "grade": "Outcomes"
      },
      "overviewEyebrow": "What's changed for schools",
      "overviewTitle": "Three things have shifted for Uzbek schools in the last two years.",
      "overviewText": "Graduation rules, the core curriculum, and parent expectations have all moved. Schools need to meet every one of them at once.",
      "features": [
        {
          "title": "Graduation requirements",
          "body": "Grades 10 and 11 now need a recognized language certificate to graduate — IELTS, CEFR, or TOEFL. Your school needs to prepare every student to clear that bar."
        },
        {
          "title": "The core curriculum",
          "body": "Major academic subjects have moved out of the grades 10–11 core. IT and languages now anchor what students take. Your school needs depth in what remains and rigor in what's been added."
        },
        {
          "title": "Parent expectations",
          "body": "Parents see what international schools deliver, and they want the same outcomes from yours. Your school needs to show what it produces — not just what it teaches."
        }
      ],
      "delivers": {
        "eyebrow": "What schools get",
        "title": "Schools choose NETS because it delivers three things at once.",
        "lead": "Mastery of the curriculum you already teach, recognized credentials students carry forward, and operational clarity for your school — in one platform.",
        "items": [
          {
            "title": "Mastery of the curriculum you already teach",
            "body": "Math, sciences, languages, social studies — all aligned to your existing textbooks, lesson plans, and scheme of work. NETS enhances what you teach; it never replaces it."
          },
          {
            "title": "Recognized credentials students carry forward",
            "body": "IELTS, TOEFL, CEFR-aligned English, SAT Math, SAT Reading & Writing, AP-aligned subject tracks, and IT & AI foundations — delivered inside the same platform students use every day. One platform. One contract. Every outcome covered."
          },
          {
            "title": "Operational clarity for your school",
            "body": "Every student, every subject, every parent conversation, every report — in one place. Feeds your Kundalik reporting automatically. Compliant with ZRU-547. Built for how Uzbek schools actually operate."
          }
        ]
      },
      "workflowEyebrow": "How it works",
      "workflowTitle": "A student's day with NETS is simpler than what came before.",
      "workflow": [
        ["Morning class", "Morning class", "The teacher uses your school's existing textbooks. NETS surfaces the day's lesson plan, slides, worked examples, and assigned homework. No new curriculum. No replacement materials."],
        ["Homework block", "Homework block at school", "Students complete that day's homework on tablet or laptop, inside NETS, during a supervised block at school. A single teacher in the room. The platform's AI tutor is on. Outside AI tools are off."],
        ["AI-graded", "AI-graded with teacher oversight", "NETS grades the work as it happens. A Review Queue surfaces only the responses that need the teacher's eye. Teachers stop spending evenings grading; they spend that time on the students who need them."],
        ["Evening at home", "Evening at home", "Students can revisit any lesson, explore their outcome track, or simply rest. Homework is already done — at school, with a teacher present."]
      ],
      "day": {
        "supporting": "The supervised-block design is not an accident. It's how NETS makes AI a teacher's tool, not a student's shortcut. Cambridge, AP Capstone, and the International Baccalaureate all rely on the same insight: process supervision, not detection software, is what makes academic integrity real. NETS implements that insight in software, and gives your teachers the time and visibility they need to do it well."
      },
      "previewEyebrow": "Inside the homework engine",
      "previewTitle": "NETS rebuilt homework from scratch.",
      "previewText": "Most platforms repackage worksheets. NETS turns every assignment into a story students choose to finish.",
      "lessonPanels": [
        {
          "eyebrow": "Stage 1 · Preview",
          "title": "A real-world story unfolds.",
          "body": "A character faces a problem. The student makes three decisions before the consequence reveals. The formula or principle driving the answer is never named yet. The student commits, sees what happens, and learns from the result.",
          "tag": "Preview"
        },
        {
          "eyebrow": "Stage 2 · Learning",
          "title": "Now the principles are studied directly.",
          "body": "The terms and patterns that emerged from the story are studied head-on. Flashcards. Definitions. Worked examples. The student finally has names for what they just discovered.",
          "tag": "Learning"
        },
        {
          "eyebrow": "Stage 3 · Practice",
          "title": "Game-formatted exercises apply the principle.",
          "body": "A Real Life Challenge replays the original story with new numbers, and the student must infer the formula themselves — the test isn't whether they remember the answer; it's whether they can solve a problem they haven't seen.",
          "tag": "Practice"
        },
        {
          "eyebrow": "Stage 4 · Boss Arena",
          "title": "A single high-stakes assessment moment.",
          "body": "A novel situation the student hasn't encountered before. Their reasoning is what's measured — not their recall.",
          "tag": "Boss Arena"
        }
      ],
      "homework": {
        "detail": "Students who don't reach mastery on the first attempt get a different story for the same concept, up to three times. Struggle becomes data for the teacher, never a failure mark on the student. The students who breeze through also surface information — whether the content is too easy, whether the student is further along than the class, whether the difficulty needs to shift."
      },
      "phone": {
        "header": "Homework",
        "subject": "Real Life Challenge",
        "checkpoint": "Boss Arena",
        "aiReady": "AI tutor on",
        "question": "A new shop opens nearby and cuts your prices. What happens to your revenue, and why?",
        "placeholder": "Student reasons through the answer here...",
        "continue": "Continue the lesson"
      },
      "tracks": {
        "eyebrow": "Credentials students can carry",
        "title": "Every NETS student is on a track to somewhere recognized.",
        "lead": "The NETS Outcome Track Library covers the credentials and skills students leave school needing — preparation that begins on day one, not in the final year.",
        "items": [
          {
            "name": "IELTS",
            "body": "Full preparation aligned to Cambridge IELTS specifications. Listening, Reading, Writing, Speaking. CEFR-mapped for graduation requirements."
          },
          {
            "name": "TOEFL",
            "body": "Aligned to ETS specifications. Parallel preparation for students whose target test is American."
          },
          {
            "name": "SAT Math & SAT Reading and Writing",
            "body": "Aligned to College Board specifications. For students targeting US university admission."
          },
          {
            "name": "AP-aligned subject tracks",
            "body": "College-level depth in core subjects, for students preparing for university advanced placement."
          },
          {
            "name": "K1–4 Puzzle Library",
            "body": "Gamified foundational learning for early years. Where mastery begins."
          },
          {
            "name": "IT and AI Foundations",
            "body": "Aligned to what the grade 10–11 curriculum now requires in core. Practical, applied, current."
          }
        ],
        "closing": "A NETS student isn't waiting until grade 11 to start preparing for the certificate their graduation depends on. They're building toward it from the day their school turns NETS on."
      },
      "learner": {
        "eyebrow": "Who graduates from NETS",
        "title": "We measure who your students become, not just what they score.",
        "lead": "NETS tracks six learner attributes across every subject and every track. Parents see their child's development picture. Teachers see what's working. Schools see what they produce.",
        "items": [
          {
            "title": "Inquirers",
            "body": "Students who ask the right questions before reaching for an answer."
          },
          {
            "title": "Thinkers",
            "body": "Students who reason through novel situations, not just familiar ones."
          },
          {
            "title": "Communicators",
            "body": "Students who can defend their reasoning in two languages."
          },
          {
            "title": "Principled",
            "body": "Students who own their work and credit others honestly."
          },
          {
            "title": "Reflective",
            "body": "Students who can describe how they learn, not only what they learned."
          },
          {
            "title": "Engaged",
            "body": "Students who show up, persist, and finish."
          }
        ],
        "supporting": "Inspired by the best of the International Baccalaureate Learner Profile and the Cambridge Learner Attributes. Built for Uzbek students. Tracked across every classroom in your school."
      },
      "roles": {
        "eyebrow": "Built for everyone who touches your school",
        "title": "NETS gives each role what they need — and only what they need.",
        "items": [
          {
            "title": "For students",
            "body": "Every lesson, track, assignment, and grade in one app. The AI tutor explains when they're stuck. Their progress on every outcome track is visible to them. They never lose access to a lesson they wanted to revisit."
          },
          {
            "title": "For teachers",
            "body": "Lesson plans, slide decks, and homework for your curriculum, ready to use. AI-graded work with a Review Queue that surfaces only what needs a human eye. Skill and attribute development visibility per student, updated as students work. Capstone supervision with built-in checkpoints. Reports compatible with Kundalik."
          },
          {
            "title": "For parents",
            "body": "Their child's progress, track, attribute development, capstone, and teacher messages — in their hand, in Uzbek, Russian, or English. Real visibility into what's happening at school, not the once-a-term parent meeting."
          },
          {
            "title": "For school administration",
            "body": "Every grade, class, and student — performance, attendance, engagement. Outcome track readiness across cohorts. Teacher workload distribution. Capstone galleries. Reports that feed Kundalik automatically."
          }
        ]
      },
      "uzbekistan": {
        "eyebrow": "Local-first by design",
        "title": "Designed in Tashkent. Built for Uzbek schools. To global standards.",
        "items": [
          {
            "title": "Bilingual delivery",
            "body": "Full Uzbek and Russian. English available track-by-track."
          },
          {
            "title": "Curriculum-aligned",
            "body": "Uzbekistan national curriculum framework. 2030 PISA targets as the north star."
          },
          {
            "title": "Kundalik-integrated",
            "body": "Feeds Kundalik automatically. No duplicate reporting."
          },
          {
            "title": "ZRU-547 compliant",
            "body": "Built in compliance with Uzbekistan's data privacy law."
          },
          {
            "title": "IP-registered",
            "body": "Filed with Adliya vazirligi under Class-A-Technologies MCHJ."
          },
          {
            "title": "Graduation-ready",
            "body": "IELTS and CEFR preparation built for the new grade 10–11 mandate."
          }
        ]
      },
      "onboarding": {
        "eyebrow": "Onboarding",
        "title": "The fastest school deployment in the market.",
        "steps": [
          {
            "num": "Days 1–3",
            "title": "Curriculum brought in",
            "body": "Your existing curriculum materials are brought into NETS. Your textbooks, lesson plans, and teacher resources. Your content stays the source of truth."
          },
          {
            "num": "Days 4–7",
            "title": "Teacher orientation",
            "body": "Teachers complete a short orientation. Most are competent in the platform within the first week."
          },
          {
            "num": "Days 8–10",
            "title": "Students and parents",
            "body": "Students and parents are onboarded with classroom walk-throughs."
          },
          {
            "num": "Days 11–14",
            "title": "First supervised blocks",
            "body": "First supervised homework blocks run. Class A staff observe and support."
          },
          {
            "num": "Day 15 onward",
            "title": "Live platform",
            "body": "NETS is your school's operational and learning platform."
          }
        ],
        "subline": "Multiple branches? The second campus and onward onboard faster — your content is already in the library."
      },
      "configs": {
        "eyebrow": "Configurations",
        "title": "NETS adapts to your school, without becoming a custom build.",
        "standard": {
          "title": "NETS Standard",
          "body": "For schools that want NETS deployed end-to-end as the operational and learning system. Universal product, configured to your school's structure. Two-week onboarding. Per-student pricing. The path most schools choose."
        },
        "configurable": {
          "title": "NETS Configurable",
          "body": "For schools with an existing system they're not ready to replace. Plug specific NETS surfaces — the homework engine, an outcome track, the parent app — into what you already have. Negotiated pricing based on scope."
        },
        "subline": "NETS is rented, not customized. Your school configures the product; the product stays the product. That's how it stays fast, current, and aligned to the global standards your students need."
      },
      "trackRecord": {
        "eyebrow": "Trust",
        "title": "What we measure, we show.",
        "body": "NETS does not promise outcomes we haven't yet delivered. We promise transparency in what we measure — student development on the six learner attributes, mastery against the curriculum your school teaches, readiness across each outcome track. Schools running NETS see the data that matters, every day. As cohorts complete their first year and their first credential exams under NETS, we will publish what those students achieved. Until then, we ask schools to evaluate us on what they can see in the platform, not on claims we can't yet back.",
        "subline": "This is the same posture the International Baccalaureate, Cambridge International, and the College Board take. Outcomes are earned, then named."
      },
      "faq": {
        "eyebrow": "Common questions",
        "title": "Questions schools ask before they sign.",
        "items": [
          {
            "q": "Does NETS replace our teachers?",
            "a": "No. NETS gives your teachers visibility, time back, and tools they don't currently have. The supervised-block design specifically requires a teacher in the room — that role is essential, not optional. What NETS lets your school do is have one supervising teacher cover what previously required multiple specialists during homework hours."
          },
          {
            "q": "Does NETS replace Kundalik?",
            "a": "No. Kundalik remains your mandatory national reporting system. NETS sits above Kundalik and feeds it automatically. Your school stops doing duplicate data entry. Kundalik stays the official record."
          },
          {
            "q": "What language is NETS in?",
            "a": "Full Uzbek and Russian for the entire platform. English is available track-by-track, especially for outcome tracks aligned to international credentials. Parents pick the language they prefer; students pick theirs; teachers pick theirs."
          },
          {
            "q": "Do you use our textbooks?",
            "a": "Yes. Your school's existing textbooks and lesson plans remain the source of truth. NETS enhances them — adds the homework engine, the outcome tracks, the operational layer — but never replaces them."
          },
          {
            "q": "How do you handle student data?",
            "a": "NETS is built in compliance with Uzbekistan's data privacy law ZRU-547. Student data stays where it should stay. School administrators have full visibility into what data is collected and where it lives."
          },
          {
            "q": "What about students using ChatGPT to do their homework?",
            "a": "NETS homework happens during a supervised block at school. A teacher is in the room. External AI tools are not. For higher-stakes work like capstone projects, your teacher completes a documented authentication that the work is the student's own — the same approach Cambridge, AP Capstone, and the International Baccalaureate all use."
          }
        ]
      },
      "cta": {
        "title": "Three steps from this page to a live NETS school.",
        "steps": [
          {
            "title": "1. A working demo",
            "body": "We walk your director and teaching leadership through a live NETS account, with your curriculum already loaded. 90 minutes."
          },
          {
            "title": "2. A pilot agreement",
            "body": "One campus or one grade range, defined success metrics, fixed-term pilot pricing."
          },
          {
            "title": "3. Two weeks later",
            "body": "NETS is live."
          }
        ],
        "primary": "Request your demo",
        "secondary": "Talk to a parent of a NETS student"
      }
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
