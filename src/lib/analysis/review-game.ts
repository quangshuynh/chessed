import {
  analyzeGamePositions,
  type GameAnalysisProgress,
} from "@/lib/analysis/game";
import type { ParsedReviewGame } from "@/lib/chess/types";
import type { AnalysisLimit, EngineAnalyzer } from "@/lib/review/interfaces";
import {
  buildWholeGameReview,
  type WholeGameReview,
} from "@/lib/review/game-review";
import {
  evaluateSpecialMove,
  isGreatConfirmationCandidate,
  SPECIAL_CLASSIFICATION_POLICY,
} from "@/lib/review/special-classification";

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.name : "analysis-error";
}

/** Analyze and review a complete parsed game. Analyzer ownership stays with the caller. */
export async function reviewGame(input: {
  game: ParsedReviewGame;
  analyzer: EngineAnalyzer;
  limit?: AnalysisLimit;
  signal?: AbortSignal;
  onProgress?: (progress: GameAnalysisProgress) => void;
}): Promise<WholeGameReview> {
  let completed = 0;
  let total = input.game.positions.length + 1;
  const report = (phase: GameAnalysisProgress["phase"]) =>
    input.onProgress?.({
      phase,
      completedPositions: completed,
      totalPositions: total,
    });
  const positions = await analyzeGamePositions({
    ...input,
    onProgress(progress) {
      completed = progress.completedPositions;
      report("analysis");
    },
  });
  input.signal?.throwIfAborted();
  const preliminary = buildWholeGameReview({ game: input.game, positions });
  const severity = new Set(["inaccuracy", "mistake", "blunder"]);
  const enrichments = preliminary.moves.filter((move) => {
    const position = positions[move.ply - 1];
    const hasSingleCandidate =
      position?.status === "analyzed" &&
      position.analysis.candidates?.length === 1;
    const favorableMate =
      move.playerEvaluationBefore?.kind === "mate" &&
      move.playerEvaluationBefore.outcome === "favorable";
    const couldEarnSpecial =
      move.playedBestMove === true ||
      favorableMate ||
      (move.classification.status === "classified" &&
        severity.has(move.classification.classification));
    return hasSingleCandidate && couldEarnSpecial;
  });
  total = input.game.positions.length + enrichments.length;
  report(enrichments.length > 0 ? "enrichment" : "analysis");
  for (const move of enrichments) {
    const position = positions[move.ply - 1];
    if (!position || position.status !== "analyzed") continue;
    input.signal?.throwIfAborted();
    position.analysis = await input.analyzer.analyzePosition({
      fen: move.fenBefore,
      limit: input.limit,
      candidateCount: 3,
      signal: input.signal,
    });
    completed += 1;
    report("enrichment");
  }
  input.signal?.throwIfAborted();
  const enriched = buildWholeGameReview({ game: input.game, positions });
  const confirmations = enriched.moves.filter((move) => {
    const audit = evaluateSpecialMove({
      fenBefore: move.fenBefore,
      playedMoveUci: move.uci,
      player: move.player,
      ordinary: move.classification,
      analysisBefore: move.analysisBefore,
      analysisAfter: move.analysisAfter,
      terminalResult: move.terminalOutcome?.result ?? null,
    });
    return isGreatConfirmationCandidate(audit);
  });
  total += confirmations.length;
  if (confirmations.length > 0) report("confirmation");
  for (const move of confirmations) {
    const position = positions[move.ply - 1];
    if (!position || position.status !== "analyzed") continue;
    const original = position.analysis;
    const requested = {
      kind: "depth" as const,
      value: SPECIAL_CLASSIFICATION_POLICY.greatConfirmationDepth,
    };
    try {
      const confirmed = await input.analyzer.analyzePosition({
        fen: move.fenBefore,
        limit: requested,
        candidateCount: 3,
        signal: input.signal,
      });
      position.analysis = {
        ...confirmed,
        greatConfirmation: {
          status: "confirmed",
          purpose: "great-boundary",
          original: {
            evaluation: original.evaluation,
            bestMoveUci: original.bestMoveUci,
            principalVariationUci: original.principalVariationUci,
            candidates: original.candidates,
            limit: original.limit,
          },
        },
      };
    } catch (error) {
      if (isAbort(error, input.signal)) throw error;
      position.analysis = {
        ...original,
        greatConfirmation: {
          status: "unavailable",
          purpose: "great-boundary",
          requested,
          reason: errorReason(error),
        },
      };
    }
    completed += 1;
    report("confirmation");
  }
  input.signal?.throwIfAborted();
  return buildWholeGameReview({ game: input.game, positions });
}
