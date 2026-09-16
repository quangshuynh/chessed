import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import type { ParsedReviewGame } from "@/lib/chess/types";
import type {
  EngineEvaluation,
  GamePositionAnalysis,
} from "@/lib/review/interfaces";
import {
  buildMoveQualityObservations,
  measureEvaluationLoss,
  toPlayerRelativeEvaluation,
} from "@/lib/review/move-quality";

const engine = { name: "deterministic-test" };

function analyzed(
  game: ParsedReviewGame,
  positionIndex: number,
  evaluation: EngineEvaluation,
  bestMoveUci: string | null = null,
): GamePositionAnalysis {
  return {
    status: "analyzed",
    positionIndex,
    followingMovePly: game.moves[positionIndex]?.ply ?? null,
    analysis: {
      fen: game.positions[positionIndex],
      evaluation,
      bestMoveUci,
      principalVariationUci: bestMoveUci ? [bestMoveUci] : [],
      limit: {
        requested: { kind: "depth", value: 12 },
        achievedDepth: 12,
      },
      engine,
    },
  };
}

const cp = (value: number): EngineEvaluation => ({
  kind: "centipawns",
  perspective: "white",
  value,
});
const mate = (moves: number): EngineEvaluation => ({
  kind: "mate",
  perspective: "white",
  moves,
});

describe("player-relative evaluation", () => {
  it("keeps White scores and centrally inverts Black scores", () => {
    expect(toPlayerRelativeEvaluation(cp(80), "white")).toMatchObject({
      value: 80,
    });
    expect(toPlayerRelativeEvaluation(cp(80), "black")).toMatchObject({
      value: -80,
    });
    expect(toPlayerRelativeEvaluation(mate(-3), "black")).toEqual({
      kind: "mate",
      perspective: "player",
      outcome: "favorable",
      moves: 3,
    });
  });

  it("rejects non-finite centipawns and invalid mate distances", () => {
    expect(() => toPlayerRelativeEvaluation(cp(Number.NaN), "white")).toThrow(
      /finite/,
    );
    expect(() => toPlayerRelativeEvaluation(mate(0), "white")).toThrow(
      /non-zero integer/,
    );
  });
});

describe("centipawn loss", () => {
  it.each([
    ["White", 120, 45, 75],
    ["already-winning", 800, 650, 150],
    ["already-losing", -600, -750, 150],
    ["crossing equality", 40, -90, 130],
    ["equal", 25, 25, 0],
  ])("measures %s positions", (_label, before, after, expected) => {
    expect(
      measureEvaluationLoss(
        { kind: "centipawns", perspective: "player", value: before },
        {
          kind: "engine",
          evaluation: {
            kind: "centipawns",
            perspective: "player",
            value: after,
          },
        },
      ),
    ).toMatchObject({ kind: "centipawns", value: expected });
  });

  it("clamps apparent search improvement but preserves the raw disagreement", () => {
    expect(
      measureEvaluationLoss(
        { kind: "centipawns", perspective: "player", value: 10 },
        {
          kind: "engine",
          evaluation: {
            kind: "centipawns",
            perspective: "player",
            value: 16,
          },
        },
      ),
    ).toEqual({
      kind: "centipawns",
      rawDifference: -6,
      value: 0,
      apparentImprovement: true,
    });
  });
});

describe("whole-game move observations", () => {
  it("measures White and Black losses and matches legal UCI best moves", () => {
    const game = parsePgnToReviewGame("1. e4 e5");
    const observations = buildMoveQualityObservations({
      game,
      positions: [
        analyzed(game, 0, cp(30), "e2e4"),
        analyzed(game, 1, cp(10), "e7e5"),
        analyzed(game, 2, cp(50)),
      ],
    });
    expect(observations[0]).toMatchObject({
      playedBestMove: true,
      loss: { kind: "centipawns", value: 20 },
    });
    expect(observations[1]).toMatchObject({
      player: "black",
      playedBestMove: true,
      loss: { kind: "centipawns", value: 40 },
    });
  });

  it("records an inferior played move", () => {
    const game = parsePgnToReviewGame("1. d4");
    expect(
      buildMoveQualityObservations({
        game,
        positions: [
          analyzed(game, 0, cp(40), "e2e4"),
          analyzed(game, 1, cp(5)),
        ],
      })[0],
    ).toMatchObject({ playedMoveUci: "d2d4", playedBestMove: false });
  });

  it("matches castling and promotion from custom FEN games", () => {
    const castling = parsePgnToReviewGame(`[SetUp "1"]
[FEN "4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1"]

1. O-O`);
    const promotion = parsePgnToReviewGame(`[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]

1. a8=Q+`);
    expect(
      buildMoveQualityObservations({
        game: castling,
        positions: [
          analyzed(castling, 0, cp(0), "e1g1"),
          analyzed(castling, 1, cp(0)),
        ],
      })[0].playedBestMove,
    ).toBe(true);
    expect(
      buildMoveQualityObservations({
        game: promotion,
        positions: [
          analyzed(promotion, 0, cp(500), "a7a8q"),
          analyzed(promotion, 1, cp(800)),
        ],
      })[0],
    ).toMatchObject({ playedMoveUci: "a7a8q", playedBestMove: true });
  });

  it.each([
    [cp(10), mate(2), "creates-forced-mate"],
    [cp(10), mate(-2), "newly-allows-forced-mate"],
    [mate(3), cp(200), "throws-away-forced-mate"],
    [mate(-3), cp(-200), "escapes-forced-mate"],
    [mate(4), mate(-2), "reverses-to-unfavorable-mate"],
    [mate(5), mate(2), "retains-favorable-mate"],
  ] as const)(
    "preserves semantic mate transition %#",
    (before, after, transition) => {
      const game = parsePgnToReviewGame("1. e4");
      expect(
        buildMoveQualityObservations({
          game,
          positions: [analyzed(game, 0, before), analyzed(game, 1, after)],
        })[0].loss,
      ).toEqual({ kind: "mate-transition", transition, centipawnLoss: null });
    },
  );

  it("represents a checkmating final move without requiring engine output after it", () => {
    const game = parsePgnToReviewGame("1. f3 e5 2. g4 Qh4#");
    const lastIndex = game.positions.length - 1;
    const observation = buildMoveQualityObservations({
      game,
      positions: [
        analyzed(game, lastIndex - 1, mate(-1), "d8h4"),
        {
          status: "terminal",
          positionIndex: lastIndex,
          followingMovePly: null,
          fen: game.positions[lastIndex],
          reason: "checkmate",
          winner: "black",
        },
      ],
    }).at(-1);
    expect(observation).toMatchObject({
      player: "black",
      playedBestMove: true,
      after: { kind: "terminal", result: "win", reason: "checkmate" },
      loss: { kind: "terminal", result: "win", centipawnLoss: null },
    });
  });

  it("represents terminal draws and missing or cancelled analysis explicitly", () => {
    const game = parsePgnToReviewGame(`[SetUp "1"]
[FEN "6k1/7R/8/8/8/8/5K2/8 w - - 0 1"]

1. Rh8+ Kxh8`);
    const last = game.positions.length - 1;
    const terminal = {
      status: "terminal" as const,
      positionIndex: last,
      followingMovePly: null,
      fen: game.positions[last],
      reason: "insufficient-material" as const,
      winner: null,
    };
    const observations = buildMoveQualityObservations({
      game,
      positions: [analyzed(game, 0, cp(20)), null, terminal],
    });
    expect(observations[0].loss).toEqual({
      kind: "unavailable",
      reason: "missing-after-analysis",
    });
    expect(observations[1].loss).toEqual({
      kind: "unavailable",
      reason: "missing-before-analysis",
    });
    expect(observations[1].after).toMatchObject({ result: "draw" });
  });

  it("rejects duplicate indexes, illegal engine moves, and inconsistent games", () => {
    const game = parsePgnToReviewGame("1. e4");
    expect(() =>
      buildMoveQualityObservations({
        game,
        positions: [analyzed(game, 0, cp(0)), analyzed(game, 0, cp(0))],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      buildMoveQualityObservations({
        game,
        positions: [analyzed(game, 0, cp(0), "e2e5")],
      }),
    ).toThrow(/illegal or malformed/);
    expect(() =>
      buildMoveQualityObservations({
        game: { ...game, positions: [] },
        positions: [],
      }),
    ).toThrow(/one more position/);
    const mismatched = analyzed(game, 0, cp(0));
    if (mismatched.status === "analyzed") {
      mismatched.analysis.fen = game.positions[1];
    }
    expect(() =>
      buildMoveQualityObservations({ game, positions: [mismatched] }),
    ).toThrow(/does not match/);
  });
});
