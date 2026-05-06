/**
 * NETS_AI — Runtime tutor bridge.
 * Loaded by the homework HTML when served by the backend (not standalone).
 * Exposes window.NETS_AI with 4 async methods mirroring /api/ai/* endpoints.
 *
 * The homework template should call these from its answer-check paths.
 */
(function() {
    // Detect if we're running inside the NETS backend (has /api routes available)
    // vs standalone file:// — fall back to no-AI mode gracefully.
    const isBackendHosted = window.location.protocol !== 'file:'
                         && window.location.origin
                         && !window.location.origin.startsWith('null');

    // Subject/grade injected by backend into the page (via data attributes on <body> or a global).
    // Fallback to safe defaults if missing.
    const ctx = window.NETS_CTX || {};

    const API_BASE = (ctx.apiBase || '') + '/api/ai';

    async function _post(path, body) {
        if (!isBackendHosted) {
            return { _offline: true, correct: null, feedback: 'AI tutor not available offline.' };
        }
        try {
            const res = await fetch(API_BASE + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                // Wave F2: surface session-cap (429) so the widget can lock input.
                if (res.status === 429) {
                    return { _cap: true, _error: true, message: err.detail?.error || 'Session limit reached.' };
                }
                return { _error: true, message: err.detail?.error || res.statusText };
            }
            return await res.json();
        } catch (e) {
            return { _error: true, message: String(e) };
        }
    }

    async function _get(path, query) {
        if (!isBackendHosted) {
            return { _offline: true, turns: [] };
        }
        try {
            const qs = new URLSearchParams(query || {}).toString();
            const url = API_BASE + path + (qs ? ('?' + qs) : '');
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return { _error: true, message: err.detail?.error || res.statusText };
            }
            return await res.json();
        } catch (e) {
            return { _error: true, message: String(e) };
        }
    }

    /**
     * Check a typed answer semantically.
     * Use when exact string match against ans[] fails but you want to give partial credit.
     * @param {Object} opts
     * @param {string} opts.question - The question text
     * @param {string} opts.studentAnswer - What the student typed
     * @param {string[]} opts.expectedAnswers - The accepted answers from ans[]
     * @param {string} opts.tier - "EASY" | "MEDIUM" | "HARD"
     * @param {string} [opts.context] - Optional extra context (e.g., recent flashcards)
     * @returns {Promise<{correct, score, feedback, matched_expected}>}
     */
    async function checkAnswer(opts) {
        return _post('/check-answer', {
            question: opts.question,
            student_answer: opts.studentAnswer,
            expected_answers: opts.expectedAnswers || [],
            subject: ctx.subject || 'math-algebra',
            grade: ctx.grade || 8,
            tier: opts.tier || 'MEDIUM',
            context: opts.context || null,
        });
    }

    /**
     * Boss combat turn. Call on every boss answer submission.
     * @param {Object} opts
     * @param {string} opts.bossQuestion
     * @param {string} opts.studentAnswer
     * @param {string[]} opts.expectedAnswers
     * @param {number} opts.damageValue - base damage for this question
     * @param {number} opts.hpRemaining - boss HP remaining
     * @param {number} opts.attemptNumber - 1 for first try, 2 for retry, etc
     * @returns {Promise<{correct, damage_dealt, boss_response, hint, score}>}
     */
    async function bossTurn(opts) {
        const body = {
            boss_question: opts.bossQuestion,
            student_answer: opts.studentAnswer,
            expected_answers: opts.expectedAnswers || [],
            damage_value: opts.damageValue || 10,
            hp_remaining: opts.hpRemaining || 100,
            attempt_number: opts.attemptNumber || 1,
            subject: ctx.subject || 'math-algebra',
            grade: ctx.grade || 8,
        };
        // Wave F3: forward persona_traits when present (from boss_plan response).
        if (opts.persona_traits && opts.persona_traits.length) {
            body.persona_traits = opts.persona_traits;
        }
        return _post('/boss-turn', body);
    }

    /**
     * Get personalized reflection feedback.
     * @param {Object} opts
     * @param {string} opts.studentReflection
     * @param {Object} opts.performance - {correct, total, time_minutes, weak_phase}
     * @returns {Promise<{feedback, next_steps, encouragement}>}
     */
    async function reflectionFeedback(opts) {
        return _post('/reflection', {
            homework_title: ctx.homeworkTitle || '',
            homework_summary: ctx.homeworkSummary || '',
            student_reflection: opts.studentReflection,
            performance: opts.performance || {},
            subject: ctx.subject || 'math-algebra',
            grade: ctx.grade || 8,
        });
    }

    /**
     * General tutor help. Use for open-ended questions, "I'm stuck" prompts, etc.
     * @param {Object} opts
     * @param {string} opts.phase - current phase name
     * @param {string} opts.question
     * @param {string} opts.studentInput
     * @param {string} [opts.context]
     * @returns {Promise<{response, guidance_type}>}
     */
    async function tutor(opts) {
        return _post('/tutor', {
            phase: opts.phase,
            question: opts.question,
            student_input: opts.studentInput,
            subject: ctx.subject || 'math-algebra',
            grade: ctx.grade || 8,
            context: opts.context || null,
        });
    }

    // Convenience: check if AI is available right now
    function isAvailable() { return isBackendHosted; }

    // ─── Plan 3 — runtime context collector ──────────────────
    function _extractVisibleText(root) {
        const el = root || document.querySelector('main') || document.body;
        if (!el) return '';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-answer], [data-expected], .answer-key, script, style').forEach(function(n) { n.remove(); });
        return (clone.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
    }

    function _extractStudentWork(root) {
        if (!root) return '';
        const input = root.querySelector('input:focus, textarea:focus, [contenteditable]:focus');
        if (input) {
            return (input.value || input.innerText || '').trim().slice(0, 500);
        }
        const selected = root.querySelector('[data-selected="true"]');
        if (selected) {
            return (selected.innerText || selected.textContent || '').trim().slice(0, 500);
        }
        return '';
    }

    function _getRecentAssistantOpenings() {
        // Simple heuristic: return last 3 assistant turns' first 3 words.
        if (!window.NETS_TUTOR_HISTORY || !window.NETS_TUTOR_HISTORY.length) return [];
        return window.NETS_TUTOR_HISTORY
            .filter(function(t) { return t.role === 'assistant'; })
            .slice(-3)
            .map(function(t) {
                const words = (t.content || '').trim().split(/\s+/).slice(0, 3);
                return words.join(' ');
            });
    }

    function collectRuntimeContext(opts) {
        opts = opts || {};
        const active = document.querySelector('[data-nets-active="true"]')
            || document.querySelector('[data-question-active="true"]')
            || document.querySelector('.is-active-question')
            || (document.activeElement && document.activeElement.closest('[data-question-id]'))
            || null;

        return {
            session_id: opts.session_id || (window.NETS_CTX && window.NETS_CTX.sessionId) || '',
            hw_id: opts.hw_id || (window.NETS_CTX && window.NETS_CTX.homeworkId) || '',
            phase: opts.phase || (document.body && document.body.dataset.phase) || (window.NETS_STATE && window.NETS_STATE.phase) || 'preview',
            subphase: opts.subphase || (active && active.dataset.subphase) || (window.NETS_STATE && window.NETS_STATE.subphase) || null,
            question_id: opts.question_id || (active && active.dataset.questionId) || (window.NETS_STATE && window.NETS_STATE.questionId) || null,
            screen_context: opts.screen_context || _extractVisibleText(active),
            student_work_text: opts.student_work_text || _extractStudentWork(active),
            ui_state: {
                has_active_element: !!active,
                url_path: window.location.pathname,
            },
        };
    }


    // ─── Wave F2 — live tutor widget endpoints ───────────────────
    /**
     * Send one tutor chat turn.
     * @param {Object} opts
     * @param {string} opts.session_id  - client-side UUID, persisted in localStorage
     * @param {string} opts.hw_id
     * @param {string} opts.phase       - 'preview' | 'practice' | 'boss'
     * @param {string} [opts.question_id]
     * @param {string} opts.message
     * @param {string[]} [opts.recent_assistant_phrases] - first 3 words of last
     *        ~3 assistant turns; backend forwards as anti-repetition hint.
     * @returns {Promise<{response: string, message_id: number, warning_level?: number,
     *        cumulative_deduction_pct?: number, is_big_warning?: boolean,
     *        homework_failed?: boolean, deduction_pct_this?: number,
     *        defense_in_depth_triggered?: boolean}
     *        | {_error|_cap|_offline: true, message?: string}>}
     */
    async function tutorChat(opts) {
        opts = opts || {};
        const ctxPacket = collectRuntimeContext(opts);
        const body = {
            ...ctxPacket,
            message: opts.message,
            recent_assistant_phrases: opts.recent_assistant_phrases && opts.recent_assistant_phrases.length
                ? opts.recent_assistant_phrases.slice(0, 3)
                : _getRecentAssistantOpenings(),
        };
        return _post('/tutor/chat', body);
    }

    /**
     * Fetch saved chat history for a session (last 50 turns, chronological).
     * @param {Object} opts
     * @param {string} opts.session_id
     * @param {string} opts.hw_id
     * @returns {Promise<{turns: Array<{phase, question_id?, role, content, created_at}>}>}
     */
    async function tutorHistory(opts) {
        return _get('/tutor/history', {
            session_id: opts.session_id,
            hw_id: opts.hw_id,
        });
    }

    /**
     * Build a personalized boss-question plan. Used by F3 (exposed now).
     * @param {Object} opts
     * @param {string} opts.session_id
     * @param {string} opts.hw_id
     * @returns {Promise<{ordered: Array<{question_id, framing_text}>, persona_traits: string[]}>}
     */
    async function bossPlan(opts) {
        return _post('/tutor/boss-plan', {
            session_id: opts.session_id,
            hw_id: opts.hw_id,
        });
    }

    // ─── Plan 5 — Dynamic Boss AI bridge ─────────────────────────
    // Net-new endpoints. Legacy `bossTurn(...)` above stays as a fallback for
    // homework HTML emitted before Plan 5; new runtime flows should call
    // bossStart → bossGenerateQuestion → bossSubmitAnswer in a loop.

    async function bossStart(opts) {
        return _post('/ai/boss/start', {
            session_id: opts.session_id,
            homework_id: opts.homework_id,
            max_hp: opts.max_hp || 100,
            trials_left: opts.trials_left || 7,
            initial_difficulty: opts.initial_difficulty || 'medium',
        });
    }

    async function bossGenerateQuestion(opts) {
        const body = { boss_session_id: opts.boss_session_id };
        if (opts.recent_boss_phrases && opts.recent_boss_phrases.length) {
            body.recent_boss_phrases = opts.recent_boss_phrases.slice(0, 5);
        }
        return _post('/ai/boss/generate-question', body);
    }

    async function bossSubmitAnswer(opts) {
        return _post('/ai/boss/submit-answer', {
            boss_session_id: opts.boss_session_id,
            question_id: opts.question_id,
            student_answer: opts.student_answer,
        });
    }

    async function bossState(opts) {
        return _post('/ai/boss/state', { boss_session_id: opts.boss_session_id });
    }

    async function bossGiveUp(opts) {
        return _post('/ai/boss/give-up', { boss_session_id: opts.boss_session_id });
    }

    // Expose
    window.NETS_AI = {
        checkAnswer,
        bossTurn,
        reflectionFeedback,
        tutor,
        tutorChat,
        tutorHistory,
        bossPlan,
        // Plan 5 — Dynamic Boss
        bossStart,
        bossGenerateQuestion,
        bossSubmitAnswer,
        bossState,
        bossGiveUp,
        isAvailable,
        _ctx: ctx,
    };

    // ---------------------------------------------------------------
    // Generic event bridge — template code (or other editors) can dispatch
    // CustomEvents instead of calling NETS_AI directly, so hooks remain
    // declarative. Events consumed:
    //   document.dispatchEvent(new CustomEvent('nets:submit', { detail: {
    //       kind: 'boss' | 'answer' | 'reflection' | 'tutor',
    //       payload: {...},          // matches NETS_AI.<method> opts
    //       onResult: (res) => {},   // optional callback
    //   }}))
    // Fallback feedback is always delivered so the session never stalls.
    // ---------------------------------------------------------------
    const FALLBACK = {
        boss: { correct: null, damage_dealt: 0, boss_response: 'Davom eting!', hint: null, score: 0 },
        answer: { correct: null, score: 0, feedback: 'Javob qabul qilindi.', matched_expected: null },
        reflection: { feedback: 'Sessiya yakunlandi. Ajoyib ish!', next_steps: [], encouragement: 'Davom eting!' },
        tutor: { response: 'Yordam hozircha mavjud emas. Qayta urinib ko\'ring.', guidance_type: 'encouragement' },
    };

    document.addEventListener('nets:submit', async (ev) => {
        const detail = ev.detail || {};
        const kind = detail.kind;
        const payload = detail.payload || {};
        const cb = typeof detail.onResult === 'function' ? detail.onResult : null;
        let result;
        try {
            if (kind === 'boss') result = await bossTurn(payload);
            else if (kind === 'answer') result = await checkAnswer(payload);
            else if (kind === 'reflection') result = await reflectionFeedback(payload);
            else if (kind === 'tutor') result = await tutor(payload);
            else { console.warn('[NETS_AI] unknown nets:submit kind:', kind); return; }
            if (result && (result._error || result._offline)) {
                result = Object.assign({}, FALLBACK[kind] || {}, { _fallback: true, _reason: result });
            }
        } catch (err) {
            console.warn('[NETS_AI] nets:submit failed:', err);
            result = Object.assign({}, FALLBACK[kind] || {}, { _fallback: true, _reason: String(err) });
        }
        if (cb) { try { cb(result); } catch (e) { console.warn('[NETS_AI] onResult threw:', e); } }
        document.dispatchEvent(new CustomEvent('nets:result', { detail: { kind, result } }));
    });

    // Log readiness once
    console.log('[NETS_AI] ready. Available:', isAvailable(), 'Context:', ctx);
})();
