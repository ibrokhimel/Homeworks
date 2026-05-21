// Typed, same-origin fetch client for the v2 runtime JSON API.
// Base is "" (the SPA is served from the same FastAPI origin as the API).
// Every call throws on a non-2xx response so callers can surface error UI.

import type { CheckAnswerResult, GateState, HydratePayload } from "./types";

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

export { ApiError };
