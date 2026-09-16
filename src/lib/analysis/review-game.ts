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
  return buildWholeGameReview({ game: input.game, positions });
}
