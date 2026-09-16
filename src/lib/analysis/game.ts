import type { ParsedReviewGame } from "@/lib/chess/types";
import type {
  AnalysisLimit,
  EngineAnalyzer,
  GamePositionAnalysis,
} from "@/lib/review/interfaces";
import { Chess } from "chess.js";

function terminalPosition(
  fen: string,
  positionIndex: number,
  positions: readonly string[],
): GamePositionAnalysis | null {
  const chess = new Chess(fen);
  const repetitionKey = fen.split(" ").slice(0, 4).join(" ");
  const isThreefold =
    positions
      .slice(0, positionIndex + 1)
      .filter(
        (position) =>
          position.split(" ").slice(0, 4).join(" ") === repetitionKey,
      ).length >= 3;
  if (!chess.isGameOver() && !isThreefold) return null;

  if (chess.isCheckmate()) {
    return {
      status: "terminal",
      positionIndex,
      followingMovePly: null,
      fen: chess.fen(),
      reason: "checkmate",
      winner: chess.turn() === "w" ? "black" : "white",
    };
  }

  const reason = chess.isStalemate()
    ? "stalemate"
    : chess.isInsufficientMaterial()
      ? "insufficient-material"
      : isThreefold
        ? "threefold-repetition"
        : chess.isDrawByFiftyMoves()
          ? "fifty-move-rule"
          : "draw";
  return {
    status: "terminal",
    positionIndex,
    followingMovePly: null,
    fen: chess.fen(),
    reason,
    winner: null,
  };
}

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
    const terminal = terminalPosition(
      input.game.positions[positionIndex],
      positionIndex,
      input.game.positions,
    );
    if (terminal) {
      results.push(terminal);
      continue;
    }
    results.push({
      status: "analyzed",
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
