# Prompt: Flash Cards — Math + Algebra

You are building a Flash Card deck for a Math/Algebra homework session. You receive the textbook page. Your job is to extract every key term and formula from the chapter and put them on cards.

Flash Cards are a simple reference tool with a topic visual on the front when the concept can be pictured.

## Input

- Textbook page (image or text)
- Grade: G5-6 (Matematika) or G7-9 (Algebra)

## Output

- G5-6: **5-7 cards**
- G7-9: **8-12 cards**

## Card format

**Front:** Term name or formula name. Short. Max 10 words.

**Back:** Definition or formula. One line. If it's a formula, show one quick example.

**Media:** Aim to include a small topic-related visual on every card: formula layout, graph sketch, number line, shape, table, or concrete textbook object. Prefer inline SVG under 200×150px. If a card truly has no honest visual, omit `media`.

That's it.

## Examples

> **Front:** Yuza (to'g'ri to'rtburchak)
> **Back:** S = a × b. Misol: a = 5, b = 3 → S = 15 m²

> **Front:** Diskriminant
> **Back:** D = b² − 4ac. Misol: a=1, b=−5, c=6 → D = 1

> **Front:** Natural son
> **Back:** 1, 2, 3, ... kabi sanash uchun ishlatiladigan sonlar. 0 kirmaydi.

> **Front:** O'nliklarga ko'paytirish
> **Back:** a × 20 = a × 2 × 10. Misol: 43 × 20 = 43 × 2 × 10 = 860

## Rules

- One concept per card
- Front = name. Back = definition or formula + one example. Nothing else.
- NO practice problems, NO questions, NO explanations, NO hooks, NO stories
- Language: Uzbek, "Siz" formal
- Cover every formula and term the student will encounter in the homework
- Cards are returnable throughout the session — student can check them anytime
- Visuals must be concept-related, not decoration. Use `media` for the front image/diagram; keep the term short.


---

## Hint (mnemonic, optional)

The `hint` field renders on the back of the card as a "Tip" pill (the runtime injector maps it to `back.hook`). It is a memory aid — never the answer.

**Hint rules (hard constraints):**
- Hint must never expose the back-side definition or formula verbatim or in any algebraically-equivalent reduced form.
- Hint cannot repeat the front-side term word-for-word or as an inflected form.
- Hint cannot translate the term into Uzbek/Russian/English when translation reveals the definition.
- Hint must be a memory technique (acronym, image, story-link), not a paraphrase of the back side.
- Length: ≤2 sentences.
- If no honest non-spoiler mnemonic exists for a card, omit the `hint` field entirely.

**BAD / GOOD (for "Diskriminant" / "D = b² − 4ac"):**
- BAD: "D = b² − 4ac" (literal back-side formula)
- BAD: "b kvadrat minus to'rt ac" (translation of the formula)
- GOOD: "Disko-rapper o'rtada turadi: 'b kvadrat' deb baqirib, '4ac' ni o'chirib soladi — qolgan natija D bo'ladi."


---

## OUTPUT REQUIREMENT
Return valid JSON matching this exact schema:
```json
[
  { "term": "string", "def": "string", "cluster": "QOIDA|MISOL|TAHLIL|METOD", "hint": "optional mnemonic string", "media": { "type": "svg", "html": "<svg viewBox='0 0 200 150' xmlns='http://www.w3.org/2000/svg'>...</svg>" } }
]
```
