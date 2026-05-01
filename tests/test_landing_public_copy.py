"""
Regression tests for landing page public-facing copy.

The landing page used to ship internal/dev-facing strings ("Template asosidagi
builder", "fixture", "/h", "3 o'quv bosqichi", "Live Tutor", "checkpoint",
"lesson card", "swipe", "concept", "wording", "homework", "teacher flow",
"guided learning", "Har bir homeworkga ozgina miya bering.") that confused
teachers and students. These tests pin the natural public-facing replacements
in place across all three languages (uz/ru/en) so a future PR cannot silently
revert the copy back to internal jargon.

Locked surfaces:
  - hero stats (3 cards) — value + label per language
  - feature cards (4 cards) — title + body per language
  - hero text — public-facing pitch per language
  - launch / CTA copy — must read like an education product, not a dev demo
  - lessonPanels, workflow, phone — must not leak panel/checkpoint/flow/
    template/fixture/student-as-English-word into Uzbek visible copy
"""
from pathlib import Path

import pytest


LANDING_JS = Path(__file__).parent.parent / "frontend" / "js" / "landing.js"


@pytest.fixture(scope="module")
def landing_source() -> str:
    return LANDING_JS.read_text(encoding="utf-8")


def _uz_block(src: str) -> str:
    """Return only the uz: { ... } slice of the i18n object so we can grep
    Uzbek-only without false-flagging on RU/EN where English loanwords are
    sometimes acceptable (e.g. "Тьютор", "AI tutor")."""
    start = src.index("uz: {")
    # The next top-level key in the i18n object is "ru:". Find it from start.
    end = src.index("\n    ru: {", start)
    return src[start:end]


def _ru_block(src: str) -> str:
    start = src.index("\n    ru: {")
    end = src.index("\n    en: {", start)
    return src[start:end]


# ---------------------------------------------------------------------------
# Forbidden in the UZ block: dev/English jargon that has no place on a
# teacher/student-facing Uzbek page. These were either explicitly called out
# by the user or are clear English residue from earlier internal copy.
# ---------------------------------------------------------------------------

UZ_FORBIDDEN_SUBSTRINGS = [
    # User explicitly called these out
    "Template asosidagi builder",
    "Tayyor fixturelarni yuklang",
    "Har bir homeworkga ozgina miya bering",
    '"3", "o‘quv bosqichi"',
    '"AI", "tutor + baholash"',
    '"/h", "ulashiladigan',
    # Forbidden English loanwords that should be Uzbek
    "homeworkni",      # → "uy vazifasi"
    "Templatedan",     # → "namuna"
    "Reading Panel",   # → "tushuntirish bosqichi"
    "Reading cardlar", # → "tushuntirish kartalari"
    "Live Tutor",      # → "AI tutor"
    "Live tutor",
    "lesson card",
    "lesson flow",
    "lesson cardlar",
    "swipe qiladi",
    "concept",
    "Concept",
    "Hybrid grading",
    "Swipe learning",
    "Adaptiv Quiz",
    "wording xato",
    "wording-xato",
    "fixturelarini",
    "checkpoint promptlar",
    "explanationsni",
    "stable homework URL",
    "Student uchun",
    "Studentlar",
    "Student hint",
    "Student javobni",
    "casual gaplar",
    "Tutor casual",
    "guided learning",
    "teacher flow",
    "Teacher uchun",
    "Teacher g‘oya",
    "Teacher g'oya",
    "homework slug",
    "rate limit",
    "privacy-aware student",
    "beta wave",
    "publish qiling",
    "AI-assisted checking",
    "student performance",
    "student linkgacha",
    "Builderni ochish",  # nav button — replaced with Uzbek phrase
    "mini learning experience",
    "line-button interaksiyasi",
    "Header"  # phone header should be "Uy vazifasi" in UZ block, not "Homework"/"Header"
    " 01",  # any "Reading Panel 01" / "01 · ..." legacy formatting w/ leading space
]


@pytest.mark.parametrize("forbidden", UZ_FORBIDDEN_SUBSTRINGS)
def test_uz_block_does_not_ship_dev_or_english_jargon(landing_source: str, forbidden: str):
    uz = _uz_block(landing_source)
    assert forbidden not in uz, (
        f"landing.js uz block still contains dev/English jargon: {forbidden!r}. "
        "Uzbek copy must be natural, public-facing — keep template/fixture/"
        "checkpoint/flow/lesson card/Student/Teacher/homework etc. out."
    )


# Also forbid clear dev-token leaks in RU/EN. These are tokens the user
# called out as dev-facing — natural English ("messy", "wording slips",
# "rate limits", "beta wave") is allowed since this *is* a beta product
# describing itself in plain language.
RU_EN_FORBIDDEN = [
    "homework slug",
    "line-to-button",
    "Reading Panel 01",
    "lesson flow",
    "Hybrid grading",
    "Адаптивный Quiz",
    "Live Tutor",
    "Live тьютор",
    "wording-ошибк",
    # CTA that the user explicitly killed in this PR
    "немного мозга",
    "little brain",
]


@pytest.mark.parametrize("forbidden", RU_EN_FORBIDDEN)
def test_ru_en_blocks_do_not_ship_dev_jargon(landing_source: str, forbidden: str):
    # Skip the uz block — those are checked separately above.
    src = landing_source
    uz = _uz_block(src)
    rest = src.replace(uz, "")
    assert forbidden not in rest, (
        f"landing.js ru/en blocks still contain dev jargon: {forbidden!r}. "
        "All three languages should describe the product, not the codebase."
    )


# ---------------------------------------------------------------------------
# Required Uzbek public copy — must be present, must read naturally
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "snippet",
    [
        # Hero stats (uz) — natural phrasing, not literal English
        '"1 ta link", "dars, mashq va yordam bitta sahifada"',
        '"AI tutor", "javobni aytmay, tushunishga yo‘naltiradi"',
        '"Oson", "o‘qituvchi ulashadi, o‘quvchi darhol boshlaydi"',
        # Feature cards (uz) — exact spec
        "Uy vazifasini tez yaratish",
        "O‘qituvchi mavzu, sinf va tilni tanlaydi",
        "Bosqichma-bosqich tushuntirish",
        "O‘quvchi avval mavzuni tushunadi, keyin mashq qiladi",
        "AI yordam va feedback",
        "AI tutor o‘quvchining savolini tushunadi",
        "Savol berish imkoniyati",
        "Tutor javobni tayyor aytib bermaydi",
        # Launch CTA (uz) — replaces "Har bir homeworkga ozgina miya bering"
        "Uy vazifasini tushunarli darsga aylantiring",
        "o‘quvchi tushunadigan, mashq qiladigan va feedback oladigan",
        # Hero text (uz)
        "Homeworks o‘qituvchiga oddiy topshiriq o‘rniga interaktiv dars",
        # Lesson panels (uz) — bosqichma-bosqich Uzbek labels
        "1-bosqich · Tushuntirish",
        "2-bosqich · Mashq",
        "3-bosqich · Yordam",
        # Workflow (uz)
        "Mavzuni tanlash",
        "Bosqichlarni sozlash",
        "Havolani ulashish",
        "Natijani ko‘rish",
        # Phone (uz) — header should be Uzbek
        'header: "Uy vazifasi"',
        'checkpoint: "Tekshiruv"',
        # Student/tutor labels in UZ block
        'studentLabel: "O‘quvchi"',
    ],
)
def test_uz_natural_public_copy_present(landing_source: str, snippet: str):
    assert snippet in landing_source, f"missing uz public copy: {snippet!r}"


# ---------------------------------------------------------------------------
# Required Russian public copy — parallel meaning, no dev jargon
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "snippet",
    [
        '"1 ссылка", "урок, практика и помощь на одной странице"',
        '"AI-тьютор", "ведёт ученика к пониманию, не выдавая готовый ответ"',
        '"Просто", "учитель делится, ученик сразу начинает"',
        "Быстрая сборка для учителя",
        "Пошаговое объяснение",
        "AI-помощь и обратная связь",
        "Можно задавать вопросы",
        "Превратите домашку в понятный урок",
        "Шаг 1 · Объяснение",
        "Шаг 2 · Практика",
        "Шаг 3 · Помощь",
    ],
)
def test_ru_natural_public_copy_present(landing_source: str, snippet: str):
    assert snippet in landing_source, f"missing ru public copy: {snippet!r}"


# ---------------------------------------------------------------------------
# Required English public copy
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "snippet",
    [
        '"One link", "lesson, practice and help on one page"',
        '"AI tutor", "guides the student to understand, without giving away the answer"',
        '"Easy", "the teacher shares, the student starts right away"',
        "Quick to build, for teachers",
        "Step-by-step explanation",
        "AI help and feedback",
        "Students can ask questions",
        "Turn homework into a lesson students actually understand",
        "Step 1 · Explain",
        "Step 2 · Practice",
        "Step 3 · Help",
    ],
)
def test_en_natural_public_copy_present(landing_source: str, snippet: str):
    assert snippet in landing_source, f"missing en public copy: {snippet!r}"


# ---------------------------------------------------------------------------
# Sanity: the page itself still serves with the locked copy embedded in JS.
# ---------------------------------------------------------------------------

def test_landing_html_serves_200(client):
    r = client.get("/landing.html")
    assert r.status_code == 200
    assert 'data-i18n-stat-value="0"' in r.text
    assert 'data-i18n-feature-title="0"' in r.text


def test_landing_js_serves_200(client):
    r = client.get("/js/landing.js")
    assert r.status_code == 200
    assert "1 ta link" in r.text
    assert "Uy vazifasini tushunarli darsga aylantiring" in r.text
    assert "Quick to build, for teachers" in r.text
