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

  it("does not ask the engine to analyze a terminal checkmate", async () => {
    const game = parsePgnToReviewGame("1. f3 e5 2. g4 Qh4#");
    const analyzePosition = vi.fn<EngineAnalyzer["analyzePosition"]>(
      async ({ fen }) => ({
        fen,
        evaluation: { kind: "centipawns", perspective: "white", value: 0 },
        bestMoveUci: "e2e4",
        principalVariationUci: ["e2e4"],
        limit: {
          requested: { kind: "depth", value: 4 },
          achievedDepth: 4,
        },
        engine: { name: "test" },
      }),
    );
    const results = await analyzeGamePositions({
      game,
      analyzer: { analyzePosition, dispose: vi.fn() },
    });
    expect(analyzePosition).toHaveBeenCalledTimes(game.positions.length - 1);
    expect(results.at(-1)).toMatchObject({
      status: "terminal",
      reason: "checkmate",
      winner: "black",
    });
  });

  it.each([
    [
      "stalemate",
      `[SetUp "1"]\n[FEN "7k/5K2/6Q1/8/8/8/8/8 b - - 0 1"]\n\n*`,
      "stalemate",
    ],
    [
      "insufficient material",
      `[SetUp "1"]\n[FEN "7k/8/8/8/8/8/5K2/8 w - - 0 1"]\n\n*`,
      "insufficient-material",
    ],
    [
      "threefold repetition",
      "1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8",
      "threefold-repetition",
    ],
  ])(
    "records %s without fabricating a final score",
    async (_label, pgn, reason) => {
      const game = parsePgnToReviewGame(pgn);
      const analyzePosition = vi.fn<EngineAnalyzer["analyzePosition"]>(
        async ({ fen }) => ({
          fen,
          evaluation: { kind: "centipawns", perspective: "white", value: 0 },
          bestMoveUci: "g1f3",
          principalVariationUci: ["g1f3"],
          limit: {
            requested: { kind: "depth", value: 4 },
            achievedDepth: 4,
          },
          engine: { name: "test" },
        }),
      );
      const results = await analyzeGamePositions({
        game,
        analyzer: { analyzePosition, dispose: vi.fn() },
      });
      expect(results.at(-1)).toMatchObject({ status: "terminal", reason });
      expect(analyzePosition).toHaveBeenCalledTimes(game.positions.length - 1);
    },
  );
});
