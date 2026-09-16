"use client";

import { Chessboard } from "react-chessboard";
import Link from "next/link";
import { useEffect, useState } from "react";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import {
  type ReviewSessionPayload,
  readReviewSession,
} from "@/lib/review/session-store";

import styles from "./review-page.module.css";

function formatDate(isoDate?: string): string {
  if (!isoDate) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

function formatResult(result?: string): string {
  if (!result) {
    return "Unknown";
  }

  return result.replaceAll("_", " ");
}

export function ReviewPage({ sessionId }: { sessionId: string }) {
  const [currentPly, setCurrentPly] = useState(0);

  const session: ReviewSessionPayload | undefined =
    readReviewSession(sessionId);
  const parsedGame = session
    ? (() => {
        try {
          return parsePgnToReviewGame(session.pgn);
        } catch {
          return undefined;
        }
      })()
    : undefined;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!parsedGame) {
        return;
      }

      if (event.key === "ArrowLeft") {
        setCurrentPly((previous) => Math.max(previous - 1, 0));
      }

      if (event.key === "ArrowRight") {
        setCurrentPly((previous) =>
          Math.min(previous + 1, parsedGame.positions.length - 1),
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [parsedGame]);

  if (!session) {
    return (
      <div className={styles.errorState}>
        <p>Review session not found. Return home and open a game again.</p>
        <Link href="/">Back to Chessed homepage</Link>
      </div>
    );
  }

  if (!parsedGame) {
    return (
      <div className={styles.errorState}>
        <p>Stored PGN could not be parsed.</p>
        <Link href="/">Back to Chessed homepage</Link>
      </div>
    );
  }

  const currentFen = parsedGame.positions[currentPly];
  const white = session.summary?.white ?? parsedGame.headers.White ?? "White";
  const black = session.summary?.black ?? parsedGame.headers.Black ?? "Black";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Initial review foundation</p>
          <h1>
            {white} vs {black}
          </h1>
          <p>
            {session.summary?.timeControl ??
              parsedGame.headers.TimeControl ??
              "Unknown time control"}
            {" · "}
            {formatDate(session.summary?.date)}
          </p>
        </div>
        <Link href="/" className={styles.backLink}>
          Back to game search
        </Link>
      </header>

      <main className={styles.layout}>
        <section className={styles.boardPanel}>
          <div className={styles.boardFrame}>
            <Chessboard
              options={{
                id: "chessed-review-board",
                position: currentFen,
                allowDragging: false,
                boardStyle: {
                  borderRadius: "0.75rem",
                  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
                  width: "100%",
                },
                lightSquareStyle: { backgroundColor: "#d4c3ae" },
                darkSquareStyle: { backgroundColor: "#66584d" },
                lightSquareNotationStyle: { color: "#66584d" },
                darkSquareNotationStyle: { color: "#d4c3ae" },
              }}
            />
          </div>

          <div className={styles.navigation}>
            <button
              type="button"
              onClick={() =>
                setCurrentPly((previous) => Math.max(previous - 1, 0))
              }
              disabled={currentPly === 0}
            >
              Previous
            </button>
            <p>
              Move {currentPly} / {parsedGame.moves.length}
            </p>
            <button
              type="button"
              onClick={() =>
                setCurrentPly((previous) =>
                  Math.min(previous + 1, parsedGame.positions.length - 1),
                )
              }
              disabled={currentPly >= parsedGame.positions.length - 1}
            >
              Next
            </button>
          </div>
        </section>

        <aside className={styles.sidebar}>
          <section className={styles.infoCard}>
            <h2>Game details</h2>
            <dl>
              <div>
                <dt>White</dt>
                <dd>
                  {white}
                  {typeof session.summary?.whiteRating === "number"
                    ? ` (${session.summary.whiteRating})`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Black</dt>
                <dd>
                  {black}
                  {typeof session.summary?.blackRating === "number"
                    ? ` (${session.summary.blackRating})`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>
                  {formatResult(
                    session.summary?.result ?? parsedGame.headers.Result,
                  )}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{session.source}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.infoCard}>
            <h2>Moves</h2>
            <ol className={styles.moveList}>
              {parsedGame.moves.map((move) => (
                <li key={move.ply}>
                  <button
                    type="button"
                    className={
                      currentPly === move.ply ? styles.activeMove : undefined
                    }
                    onClick={() => setCurrentPly(move.ply)}
                  >
                    {move.ply}. {move.san}
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.infoCard}>
            <h2>Analysis (coming soon)</h2>
            <ul className={styles.placeholderList}>
              <li>Engine evaluation timeline</li>
              <li>Best move lines (Stockfish)</li>
              <li>Ordinary move classifications</li>
              <li>Accuracy scores by player</li>
              <li>Estimated performance ratings</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
