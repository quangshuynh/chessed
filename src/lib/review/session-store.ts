export type ReviewSource = "chesscom" | "manual-pgn";

export interface ReviewSessionSummary {
  id: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result?: string;
  playerColor?: "white" | "black";
  timeControl?: string;
  date?: string;
  url?: string;
}

export interface ReviewSessionPayload {
  source: ReviewSource;
  pgn: string;
  summary?: ReviewSessionSummary;
  createdAt: string;
}

const STORAGE_KEY = "chessed.review.sessions.v1";
const MAX_STORED_SESSIONS = 25;

export function saveReviewSession(payload: ReviewSessionPayload): string {
  if (typeof window === "undefined") {
    throw new Error("Review sessions are only available in the browser.");
  }

  const sessionId = crypto.randomUUID();
  const currentSessions = readAllReviewSessions();

  currentSessions[sessionId] = payload;

  const sortedEntries = Object.entries(currentSessions)
    .sort(([, left], [, right]) =>
      right.createdAt.localeCompare(left.createdAt),
    )
    .slice(0, MAX_STORED_SESSIONS);

  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Object.fromEntries(sortedEntries)),
  );

  return sessionId;
}

export function readReviewSession(
  sessionId: string,
): ReviewSessionPayload | undefined {
  return readAllReviewSessions()[sessionId];
}

function readAllReviewSessions(): Record<string, ReviewSessionPayload> {
  if (typeof window === "undefined") {
    return {};
  }

  const rawValue = window.sessionStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    return JSON.parse(rawValue) as Record<string, ReviewSessionPayload>;
  } catch {
    return {};
  }
}
