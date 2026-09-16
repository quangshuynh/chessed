"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";

import type { GameAnalysisProgress } from "@/lib/analysis/game";
import { reviewGame } from "@/lib/analysis/review-game";
import { StockfishAnalyzer } from "@/lib/analysis/stockfish";
import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import { formatPrincipalVariation, uciMoveToSan } from "@/lib/chess/notation";
import type { ParsedReviewGame } from "@/lib/chess/types";
import type { WholeGameReview } from "@/lib/review/game-review";
import type { EngineAnalyzer } from "@/lib/review/interfaces";
import {
  type ReviewSessionPayload,
  readReviewSession,
} from "@/lib/review/session-store";

import {
  formatClassification,
  formatEvaluation,
  formatSpecialClassification,
  formatTerminalReason,
} from "./review-format";
import styles from "./review-page.module.css";

type LoadedGame = {
  sessionId: string;
  session: ReviewSessionPayload;
  game: ParsedReviewGame;
};
type AnalysisState =
  | { status: "idle" }
  | { status: "running"; progress: GameAnalysisProgress }
  | { status: "cancelled" }
  | { status: "failed"; message: string }
  | { status: "complete"; review: WholeGameReview };

export interface ReviewPageProps {
  sessionId: string;
  sessionReader?: (sessionId: string) => ReviewSessionPayload | undefined;
  analyzerFactory?: () => EngineAnalyzer;
  reviewRunner?: typeof reviewGame;
}

function formatDate(isoDate?: string): string {
  if (!isoDate) return "Unknown";
  const date = new Date(isoDate);
  if (Number.isNaN(date.valueOf())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function friendlyError(error: unknown): string {
  if (error instanceof Error && error.name === "EngineInitializationError") {
    return "Stockfish could not start. Check that the engine files are available, then try again.";
  }
  if (error instanceof Error && error.name === "EngineTimeoutError") {
    return "Stockfish took too long to analyze a position. Please try again.";
  }
  return "The game could not be analyzed. Please try again.";
}

function reviewMatchesGame(
  review: WholeGameReview,
  game: ParsedReviewGame,
): boolean {
  return (
    review.metadata.moveCount === game.moves.length &&
    review.moves.length === game.moves.length &&
    review.moves.every((move, index) => move.ply === game.moves[index]?.ply)
  );
}

function MoveReview({
  currentPly,
  review,
}: {
  currentPly: number;
  review: WholeGameReview;
}) {
  if (currentPly === 0) {
    const evaluation = review.moves[0]?.evaluationBefore ?? null;
    return (
      <div className={styles.moveReview}>
        <h3>Starting position</h3>
        <p>
          Engine evaluation:{" "}
          {evaluation ? (
            <strong>{formatEvaluation(evaluation)}</strong>
          ) : (
            "Unavailable"
          )}
        </p>
        <p className={styles.perspective}>Evaluations are White-relative.</p>
      </div>
    );
  }

  const move = review.moves[currentPly - 1];
  if (!move || move.ply !== currentPly) {
    return (
      <p className={styles.inlineError} role="alert">
        Review data is unavailable for the selected move.
      </p>
    );
  }
  const classificationKey = move.specialClassification
    ? move.specialClassification.classification
    : move.classification.status === "classified"
      ? move.classification.classification
      : "unavailable";
  const classification = move.specialClassification
    ? formatSpecialClassification(move.specialClassification.classification)
    : move.classification.status === "classified"
      ? formatClassification(move.classification.classification)
      : "Unavailable";
  const bestMoveSan = move.bestMoveUci
    ? uciMoveToSan(move.fenBefore, move.bestMoveUci)
    : null;
  const principalVariation = formatPrincipalVariation(
    move.fenBefore,
    move.principalVariationUci,
  );

  return (
    <div className={styles.moveReview}>
      <div className={styles.moveReviewHeading}>
        <h3>
          {move.moveNumber}
          {move.player === "white" ? "." : "..."} {move.san}
        </h3>
        <span
          className={`${styles.classification} ${styles[`classification_${classificationKey}`]}`}
        >
          {classification}
        </span>
      </div>
      <dl className={styles.analysisDetails}>
        <div>
          <dt>Before</dt>
          <dd>
            {move.evaluationBefore
              ? formatEvaluation(move.evaluationBefore)
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>After</dt>
          <dd>
            {move.evaluationAfter
              ? formatEvaluation(move.evaluationAfter)
              : move.terminalOutcome
                ? "Terminal position"
                : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Centipawn loss</dt>
          <dd>{move.centipawnLoss ?? "Not applicable"}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{bestMoveSan ?? "Unavailable"}</dd>
        </div>
      </dl>
      {principalVariation && principalVariation.sanMoves.length > 0 && (
        <p className={styles.line}>
          <span>Principal variation</span> {principalVariation.text}
        </p>
      )}
      {move.terminalOutcome && (
        <p className={styles.terminal}>
          {formatTerminalReason(move.terminalOutcome.reason)} (
          {move.terminalOutcome.result})
        </p>
      )}
      {move.classification.status === "unavailable" && (
        <p className={styles.unavailable}>
          The engine evidence required to classify this move is unavailable.
        </p>
      )}
      <p className={styles.perspective}>
        Evaluations are White-relative: positive favors White; negative favors
        Black.
      </p>
    </div>
  );
}

export function ReviewPage({
  sessionId,
  sessionReader = readReviewSession,
  analyzerFactory = () => new StockfishAnalyzer(),
  reviewRunner = reviewGame,
}: ReviewPageProps) {
  const [loaded, setLoaded] = useState<LoadedGame | null | "invalid">();
  const [currentPly, setCurrentPly] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const mountedRef = useRef(false);
  const runNumberRef = useRef(0);
  const activeRunRef = useRef<
    | {
        number: number;
        controller: AbortController;
        analyzer: EngineAnalyzer;
      }
    | undefined
  >(undefined);

  const stopActiveRun = useCallback(() => {
    const active = activeRunRef.current;
    if (!active) return;
    activeRunRef.current = undefined;
    active.controller.abort(
      new DOMException("Analysis cancelled", "AbortError"),
    );
    active.analyzer.dispose();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopActiveRun();
    };
  }, [stopActiveRun]);

  useEffect(() => {
    stopActiveRun();
    runNumberRef.current += 1;
    const loadTimer = window.setTimeout(() => {
      setCurrentPly(0);
      setAnalysis({ status: "idle" });
      const session = sessionReader(sessionId);
      if (!session) {
        setLoaded(null);
        return;
      }
      try {
        setLoaded({
          sessionId,
          session,
          game: parsePgnToReviewGame(session.pgn),
        });
      } catch {
        setLoaded("invalid");
      }
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [sessionId, sessionReader, stopActiveRun]);

  const game =
    typeof loaded === "object" && loaded?.sessionId === sessionId
      ? loaded.game
      : undefined;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!game || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft")
        setCurrentPly((value) => Math.max(value - 1, 0));
      if (event.key === "ArrowRight")
        setCurrentPly((value) =>
          Math.min(value + 1, game.positions.length - 1),
        );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game]);

  async function startAnalysis() {
    if (!game || activeRunRef.current) return;
    const number = ++runNumberRef.current;
    const controller = new AbortController();
    let analyzer: EngineAnalyzer;
    try {
      analyzer = analyzerFactory();
    } catch (error) {
      setAnalysis({ status: "failed", message: friendlyError(error) });
      return;
    }
    activeRunRef.current = { number, controller, analyzer };
    setAnalysis({
      status: "running",
      progress: {
        phase: "analysis",
        completedPositions: 0,
        totalPositions: game.positions.length,
      },
    });
    try {
      const review = await reviewRunner({
        game,
        analyzer,
        signal: controller.signal,
        onProgress(progress) {
          if (
            mountedRef.current &&
            activeRunRef.current?.number === number &&
            !controller.signal.aborted
          ) {
            setAnalysis({ status: "running", progress });
          }
        },
      });
      if (!reviewMatchesGame(review, game)) {
        throw new Error("The completed review does not match the loaded game.");
      }
      if (
        mountedRef.current &&
        activeRunRef.current?.number === number &&
        !controller.signal.aborted
      ) {
        setAnalysis({ status: "complete", review });
      }
    } catch (error) {
      if (mountedRef.current && activeRunRef.current?.number === number) {
        setAnalysis(
          controller.signal.aborted
            ? { status: "cancelled" }
            : { status: "failed", message: friendlyError(error) },
        );
      }
    } finally {
      if (activeRunRef.current?.number === number) {
        activeRunRef.current = undefined;
        analyzer.dispose();
      }
    }
  }

  function cancelAnalysis() {
    if (!activeRunRef.current) return;
    stopActiveRun();
    setAnalysis({ status: "cancelled" });
  }

  if (loaded === undefined)
    return (
      <div className={styles.loadingState} role="status">
        <p>Loading review session...</p>
      </div>
    );
  if (loaded === null)
    return (
      <div className={styles.errorState}>
        <p role="alert">
          Review session not found. Return home and open a game again.
        </p>
        <Link href="/">Back to Chessed homepage</Link>
      </div>
    );
  if (loaded === "invalid")
    return (
      <div className={styles.errorState}>
        <p role="alert">Stored PGN could not be parsed.</p>
        <Link href="/">Back to Chessed homepage</Link>
      </div>
    );
  if (loaded.sessionId !== sessionId)
    return (
      <div className={styles.loadingState} role="status">
        <p>Loading review session...</p>
      </div>
    );

  const { session } = loaded;
  const currentFen = game!.positions[currentPly];
  const white = session.summary?.white ?? game!.headers.White ?? "White";
  const black = session.summary?.black ?? game!.headers.Black ?? "Black";
  const completedReview =
    analysis.status === "complete" ? analysis.review : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Game review</p>
          <h1>
            {white} vs {black}
          </h1>
          <p>
            {session.summary?.timeControl ??
              game!.headers.TimeControl ??
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
        <section
          className={styles.boardPanel}
          aria-label="Game board and navigation"
        >
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
              onClick={() => setCurrentPly((value) => Math.max(value - 1, 0))}
              disabled={currentPly === 0}
            >
              Previous
            </button>
            <p>
              {currentPly === 0 ? "Starting position" : `Ply ${currentPly}`} /{" "}
              {game!.moves.length}
            </p>
            <button
              type="button"
              onClick={() =>
                setCurrentPly((value) =>
                  Math.min(value + 1, game!.positions.length - 1),
                )
              }
              disabled={currentPly >= game!.positions.length - 1}
            >
              Next
            </button>
          </div>
        </section>
        <aside className={styles.sidebar}>
          <section
            className={`${styles.infoCard} ${styles.analysisCard}`}
            aria-labelledby="analysis-heading"
          >
            <h2 id="analysis-heading">Analysis</h2>
            {analysis.status === "idle" && (
              <p>
                Engine review has not been run. You can still explore every
                move.
              </p>
            )}
            {analysis.status === "cancelled" && (
              <p role="status">
                Analysis was cancelled. No partial review was kept.
              </p>
            )}
            {analysis.status === "failed" && (
              <p className={styles.inlineError} role="alert">
                {analysis.message}
              </p>
            )}
            {analysis.status === "running" && (
              <div
                className={styles.progressArea}
                role="status"
                aria-live="polite"
              >
                <p>
                  Analyzing {analysis.progress.completedPositions} /{" "}
                  {analysis.progress.totalPositions} steps
                </p>
                <progress
                  aria-label={`Analyzing ${analysis.progress.completedPositions} of ${analysis.progress.totalPositions} steps`}
                  value={analysis.progress.completedPositions}
                  max={Math.max(analysis.progress.totalPositions, 1)}
                />
              </div>
            )}
            {analysis.status === "complete" && (
              <MoveReview currentPly={currentPly} review={analysis.review} />
            )}
            <div className={styles.analysisActions}>
              {analysis.status === "running" ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={cancelAnalysis}
                >
                  Cancel analysis
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={startAnalysis}
                >
                  {analysis.status === "idle"
                    ? "Analyze Game"
                    : "Analyze Again"}
                </button>
              )}
            </div>
          </section>
          <section className={styles.infoCard}>
            <h2>Moves</h2>
            <ol className={styles.moveList}>
              {game!.moves.map((move) => {
                const reviewedMove = completedReview?.moves[move.ply - 1];
                const label = reviewedMove?.specialClassification
                  ? formatSpecialClassification(
                      reviewedMove.specialClassification.classification,
                    )
                  : reviewedMove?.classification.status === "classified"
                    ? formatClassification(
                        reviewedMove.classification.classification,
                      )
                    : reviewedMove
                      ? "Unavailable"
                      : null;
                return (
                  <li key={move.ply}>
                    <button
                      type="button"
                      className={
                        currentPly === move.ply ? styles.activeMove : undefined
                      }
                      onClick={() => setCurrentPly(move.ply)}
                      aria-current={
                        currentPly === move.ply ? "step" : undefined
                      }
                    >
                      <span>
                        {move.ply}. {move.san}
                      </span>
                      {label && (
                        <span className={styles.moveClassification}>
                          {label}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
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
                  {(
                    session.summary?.result ??
                    game!.headers.Result ??
                    "Unknown"
                  ).replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{session.source}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </main>
    </div>
  );
}
