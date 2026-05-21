// Typed, same-origin fetch client for the v2 runtime JSON API.
// Base is "" (the SPA is served from the same FastAPI origin as the API).
// Every call throws on a non-2xx response so callers can surface error UI.

import type {
  BossTurnResult,
  CheckAnswerResult,
  GateState,
  HydratePayload,
  TileMatchResult,
} from "./types";

const BASE = "";

class ApiError extends Error {
  constructor(message: string, public status: number, public url: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (networkErr) {
    throw new ApiError(
      `Network error reaching ${path}: ${(networkErr as Error).message}`,
      0,
      url
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* non-JSON error body — keep statusText */
    }
    throw new ApiError(`${res.status} ${detail}`, res.status, url);
  }

  return (await res.json()) as T;
}

/** GET the redacted, student-safe content_json + metadata for a homework. */
export function hydrate(hwId: string): Promise<HydratePayload> {
  return request<HydratePayload>(
    `/api/runtime/homeworks/${encodeURIComponent(hwId)}`
  );
}

/** GET server-authoritative gate state for the current session. */
export function getGateState(hwId: string, sessionId: string): Promise<GateState> {
  const qs = new URLSearchParams({ session_id: sessionId });
  return request<GateState>(
    `/api/runtime/homeworks/${encodeURIComponent(hwId)}/gate-state?${qs}`
  );
}

/**
 * Submit a Case-Based Preview checkpoint answer.
 * Backend resolves the checkpoint by `item_index` (0-based) from content_json,
 * grades server-side, and returns {correct, feedback, learning_block?}.
 * Correctness is ALWAYS read from the server response, never derived here.
 */
export function submitCheckpoint(
  hwId: string,
  sessionId: string,
  checkpointIndex: number,
  answer: string
): Promise<CheckAnswerResult> {
  return request<CheckAnswerResult>("/api/ai/check-answer", {
    method: "POST",
    body: JSON.stringify({
      phase: "case_based_preview",
      homework_id: hwId,
      session_id: sessionId,
      question_id: `cbp_ck${checkpointIndex}`,
      item_index: checkpointIndex,
      student_answer: answer,
    }),
  });
}

/**
 * Submit a Memory Check item answer.
 * Mirrors {@link submitCheckpoint} exactly but with `phase:"memory_check"`.
 * Backend resolves the item by `item_index` (0-based) from content_json,
 * grades server-side, and returns {correct, feedback, learning_block?}.
 *
 * The caller is responsible for shaping `answer` per item type:
 *   - option types (mcq/true_false/choose_explanation): the tapped option
 *     INDEX as a string (server holds the expected option_index).
 *   - fill_blank: the typed text.
 * Correctness is ALWAYS read from the server response, never derived here.
 */
export function submitMemoryCheckItem(
  hwId: string,
  sessionId: string,
  itemIndex: number,
  answer: string
): Promise<CheckAnswerResult> {
  return request<CheckAnswerResult>("/api/ai/check-answer", {
    method: "POST",
    body: JSON.stringify({
      phase: "memory_check",
      homework_id: hwId,
      session_id: sessionId,
      question_id: `mc_item${itemIndex}`,
      item_index: itemIndex,
      student_answer: answer,
    }),
  });
}

// ---- F4: Practice Arc game submissions ----

/**
 * Submit one Practice Arc game interaction. Generic seam for the GameHost
 * registry: each game maps its own `phase` + payload onto /check-answer, the
 * single grading endpoint. v1 wires `tile-match`; the other 8 games slot in by
 * passing their phase + per-game payload. Correctness is ALWAYS the server's.
 *
 * `payload` is merged verbatim into the POST body alongside the resolved
 * homework_id / session_id, so a game contributes exactly the fields its
 * backend handler reads (e.g. tile-match → {left_id, right_id}).
 */
export function submitGameAnswer<T = unknown>(
  hwId: string,
  sessionId: string,
  phase: string,
  payload: Record<string, unknown>
): Promise<T> {
  return request<T>("/api/ai/check-answer", {
    method: "POST",
    body: JSON.stringify({
      phase,
      homework_id: hwId,
      session_id: sessionId,
      ...payload,
    }),
  });
}

/**
 * Submit a single Tile Match pairing. The client sends only the two tapped
 * tile ids — the server holds the answer key (a match is correct iff
 * left_id === right_id, since each pair shares one id) and returns
 * {correct, hint?, matched_count, total_pairs, complete, outcome?, …}.
 * The wrong-match `hint` is the LEFT-side text of the picked right tile's TRUE
 * partner — already visible in the DOM, so not a new leak surface.
 */
export function submitTileMatch(
  hwId: string,
  sessionId: string,
  leftId: string,
  rightId: string
): Promise<TileMatchResult> {
  return submitGameAnswer<TileMatchResult>(hwId, sessionId, "tile-match", {
    left_id: leftId,
    right_id: rightId,
  });
}

/**
 * Submit one Boss combat turn. Routed through /check-answer phase="final-boss"
 * (NOT the legacy /api/ai/boss-turn): that endpoint resolves the expected
 * answers SERVER-SIDE from content_json.boss_questions by `question_id`, so the
 * redacted client never holds or sends the answer. The response carries
 * server-computed {correct, damage_dealt, boss_response, hint?, ...}. Win/lose
 * is driven by the client's HP cursor (HP is frontend authoritative per the
 * backend adapter), not by a client verdict. The boss NEVER self-grades
 * correctness.
 */
export function bossTurn(
  hwId: string,
  sessionId: string,
  questionId: string,
  studentAnswer: string,
  opts: {
    hpRemaining: number;
    attemptNumber: number;
    bossType?: string;
  }
): Promise<BossTurnResult> {
  return request<BossTurnResult>("/api/ai/check-answer", {
    method: "POST",
    body: JSON.stringify({
      phase: "final-boss",
      homework_id: hwId,
      session_id: sessionId,
      question_id: questionId,
      student_answer: studentAnswer,
      hp_remaining: opts.hpRemaining,
      attempt_number: opts.attemptNumber,
      ...(opts.bossType ? { boss_type: opts.bossType } : {}),
    }),
  });
}

export { ApiError };
