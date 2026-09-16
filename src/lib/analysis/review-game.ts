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

/** Analyze and review a complete parsed game. Analyzer ownership stays with the caller. */
export async function reviewGame(input: {
  game: ParsedReviewGame;
  analyzer: EngineAnalyzer;
  limit?: AnalysisLimit;
  signal?: AbortSignal;
  onProgress?: (progress: GameAnalysisProgress) => void;
}): Promise<WholeGameReview> {
  const positions = await analyzeGamePositions(input);
  input.signal?.throwIfAborted();
  const preliminary = buildWholeGameReview({ game: input.game, positions });
  const severity = new Set(["inaccuracy", "mistake", "blunder"]);
  for (const move of preliminary.moves) {
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
    if (!hasSingleCandidate || !couldEarnSpecial) continue;
    input.signal?.throwIfAborted();
    position.analysis = await input.analyzer.analyzePosition({
      fen: move.fenBefore,
      limit: input.limit,
      candidateCount: 3,
      signal: input.signal,
    });
  }
  input.signal?.throwIfAborted();
  return buildWholeGameReview({ game: input.game, positions });
}
