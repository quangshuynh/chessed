import type { ParsedReviewGame } from "@/lib/chess/types";
import type {
  AnalysisLimit,
  EngineAnalyzer,
  GamePositionAnalysis,
} from "@/lib/review/interfaces";

/** Serial by design: one engine instance analyzes every reconstructed position. */
export async function analyzeGamePositions(input: {
  game: ParsedReviewGame;
  analyzer: EngineAnalyzer;
  limit?: AnalysisLimit;
  signal?: AbortSignal;
}): Promise<GamePositionAnalysis[]> {
  const results: GamePositionAnalysis[] = [];
  for (
    let positionIndex = 0;
    positionIndex < input.game.positions.length;
    positionIndex += 1
  ) {
    input.signal?.throwIfAborted();
    results.push({
      positionIndex,
      followingMovePly: input.game.moves[positionIndex]?.ply ?? null,
      analysis: await input.analyzer.analyzePosition({
        fen: input.game.positions[positionIndex],
        limit: input.limit,
        signal: input.signal,
      }),
    });
  }
  return results;
}
