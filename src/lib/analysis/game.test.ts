import { describe, expect, it, vi } from "vitest";

import { analyzeGamePositions } from "@/lib/analysis/game";
import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import type { EngineAnalyzer } from "@/lib/review/interfaces";

describe("analyzeGamePositions", () => {
  it("serially maps custom-start positions to their following plies", async () => {
    const game = parsePgnToReviewGame(`[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]

1. e4 Ke7`);
    let active = 0;
    const analyzePosition = vi.fn<EngineAnalyzer["analyzePosition"]>(
      async ({ fen, limit }) => {
        active += 1;
        expect(active).toBe(1);
        await Promise.resolve();
        active -= 1;
        return {
          fen,
          evaluation: { kind: "centipawns", perspective: "white", value: 0 },
          bestMoveUci: null,
          principalVariationUci: [],
          limit: {
            requested: limit ?? { kind: "depth", value: 4 },
            achievedDepth: 4,
          },
          engine: { name: "test" },
        };
      },
    );
    const analyzer: EngineAnalyzer = { analyzePosition, dispose: vi.fn() };
    const results = await analyzeGamePositions({
      game,
      analyzer,
      limit: { kind: "depth", value: 4 },
    });

    expect(
      results.map(({ positionIndex, followingMovePly }) => ({
        positionIndex,
        followingMovePly,
      })),
    ).toEqual([
      { positionIndex: 0, followingMovePly: 1 },
      { positionIndex: 1, followingMovePly: 2 },
      { positionIndex: 2, followingMovePly: null },
    ]);
    expect(analyzePosition).toHaveBeenCalledTimes(3);
  });
});
