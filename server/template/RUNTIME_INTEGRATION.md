# NETS_AI Runtime Integration Guide

When the homework is served by the NETS backend (not opened as a file), `window.NETS_AI` is available.

## Check AI availability

```js
if (window.NETS_AI && window.NETS_AI.isAvailable()) {
    // AI tutor accessible
}
```

## Adaptive Quiz integration example

Where the existing code compares against `ans[]`:

```js
// Existing fast path
if (GB_ADAPTIVE_QUIZ[i].ans.includes(userAnswer)) {
    markCorrect();
    return;
}

// Fallback: ask AI
if (window.NETS_AI?.isAvailable()) {
    const r = await window.NETS_AI.checkAnswer({
        question: GB_ADAPTIVE_QUIZ[i].q,
        studentAnswer: userAnswer,
        expectedAnswers: GB_ADAPTIVE_QUIZ[i].ans,
        tier: GB_ADAPTIVE_QUIZ[i].tier,
    });
    if (r.correct) {
        markCorrect(r.feedback);
    } else {
        markWrong(r.feedback);
    }
}
```

## Boss integration example

```js
const turn = await window.NETS_AI.bossTurn({
    bossQuestion: BOSS_QUESTIONS[i].q,
    studentAnswer: userAnswer,
    expectedAnswers: BOSS_QUESTIONS[i].ans,
    damageValue: BOSS_QUESTIONS[i].dmg,
    hpRemaining: currentHP,
    attemptNumber: attempts[i],
});
// Use turn.boss_response to display boss dialogue
// Use turn.hint to show a hint after 2nd failed attempt
// Apply turn.damage_dealt to HP
```

## Reflection integration

```js
const fb = await window.NETS_AI.reflectionFeedback({
    studentReflection: reflectionText,
    performance: {
        correct: sessionCorrectCount,
        total: sessionTotalCount,
        time_minutes: elapsedMinutes,
        weak_phase: weakestPhaseKey,
    },
});
displayReflectionCoaching(fb.feedback, fb.next_steps, fb.encouragement);
```

## General tutor (open-ended help)

```js
const r = await window.NETS_AI.tutor({
    phase: 'real_life',
    question: RL_SCENARIO.questions[i].text,
    studentInput: userAnswer,
});
showTutorMessage(r.response);
```

## Graceful offline degradation

When served as `file://`, `isAvailable()` returns false. Homework falls back to existing `ans[]` string match only. No errors thrown.

## How it gets injected

The backend's `inject()` function (`server/services/injector.py`) appends two `<script>` tags before `</body>` when `runtime_context` is passed:

1. `<script>window.NETS_CTX = { apiBase, subject, grade, homeworkTitle, homeworkSummary };</script>`
2. `<script src="/static/runtime/runtime.js"></script>`

The `preview` route injects these; the `export` route does NOT (standalone files stay offline-safe).
