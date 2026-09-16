import type { ReviewSessionPayload } from "@/lib/review/session-store";

export type BoardPerspective = "white" | "black";

function normalizeChessComUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Identifies the reviewed side only from authoritative Chess.com metadata. */
export function getReviewedPlayerColor(
  session: ReviewSessionPayload,
): BoardPerspective | undefined {
  if (session.source !== "chesscom" || !session.summary?.requestedUsername) {
    return undefined;
  }

  const requested = normalizeChessComUsername(
    session.summary.requestedUsername,
  );
  if (normalizeChessComUsername(session.summary.black) === requested) {
    return "black";
  }
  if (normalizeChessComUsername(session.summary.white) === requested) {
    return "white";
  }
  return undefined;
}

/** Manual, legacy, or inconsistent sessions safely retain White orientation. */
export function getInitialBoardPerspective(
  session: ReviewSessionPayload,
): BoardPerspective {
  const reviewedColor = getReviewedPlayerColor(session);
  if (reviewedColor) return reviewedColor;
  return "white";
}
