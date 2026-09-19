import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import type { ParsedReviewGame } from "@/lib/chess/types";
import {
  buildEvaluationGraph,
  EVALUATION_GRAPH_BOUND_CENTIPAWNS,
  EVALUATION_GRAPH_BOUND_PAWNS,
  formatGraphPositionLabel,
  selectGraphPositionIndex,
  toEvaluationGraphGaps,
  toEvaluationGraphSegments,
  toGraphDisplayValue,
  toTerminalDisplayValue,
} from "@/lib/review/evaluation-graph";
import { buildWholeGameReview } from "@/lib/review/game-review";
import type {
  EngineEvaluation,
  GamePositionAnalysis,
  TerminalReason,
} from "@/lib/review/interfaces";

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

function analyzed(
  game: ParsedReviewGame,
  positionIndex: number,
  evaluation: EngineEvaluation,
): GamePositionAnalysis {
  return {
    status: "analyzed",
    positionIndex,
    followingMovePly: game.moves[positionIndex]?.ply ?? null,
    analysis: {
      fen: game.positions[positionIndex],
      evaluation,
      bestMoveUci: null,
      principalVariationUci: [],
      limit: { requested: { kind: "depth", value: 12 }, achievedDepth: 12 },
      engine: { name: "Deterministic", version: "1.0" },
    },
  };
}

function terminal(
  game: ParsedReviewGame,
  positionIndex: number,
  reason: TerminalReason,
  winner: "white" | "black" | null,
): GamePositionAnalysis {
  return {
    status: "terminal",
    positionIndex,
    followingMovePly: null,
    fen: game.positions[positionIndex],
    reason,
    winner,
  };
}

/** Builds a graph from a real review so index semantics are never faked. */
function graphFor(
  pgn: string,
  positions: (
    game: ParsedReviewGame,
  ) => readonly (GamePositionAnalysis | null | undefined)[],
) {
  const game = parsePgnToReviewGame(pgn);
  return buildEvaluationGraph(
    buildWholeGameReview({ game, positions: positions(game) }),
  );
}

describe("evaluation graph display transform", () => {
  it("keeps zero at zero with an exact sign-free value", () => {
    expect(toGraphDisplayValue(cp(0))).toBe(0);
    expect(Object.is(toGraphDisplayValue(cp(-0)), -0)).toBe(false);
  });

  it("converts ordinary centipawns to pawn units and preserves sign", () => {
    expect(toGraphDisplayValue(cp(142))).toBeCloseTo(1.42, 10);
    expect(toGraphDisplayValue(cp(-142))).toBeCloseTo(-1.42, 10);
  });

  it("is symmetric about zero for every ordinary magnitude", () => {
    for (const value of [1, 15, 99, 410, 999, 1000, 4500]) {
      expect(toGraphDisplayValue(cp(value))).toBe(
        -toGraphDisplayValue(cp(-value))!,
      );
    }
  });

  it("is monotonic up to the bound and saturates beyond it", () => {
    expect(toGraphDisplayValue(cp(900))!).toBeLessThan(
      toGraphDisplayValue(cp(999))!,
    );
    expect(toGraphDisplayValue(cp(EVALUATION_GRAPH_BOUND_CENTIPAWNS))).toBe(
      EVALUATION_GRAPH_BOUND_PAWNS,
    );
    expect(toGraphDisplayValue(cp(31_000))).toBe(EVALUATION_GRAPH_BOUND_PAWNS);
    expect(toGraphDisplayValue(cp(-31_000))).toBe(
      -EVALUATION_GRAPH_BOUND_PAWNS,
    );
  });

  it("sends favorable and unfavorable mate to the matching boundary", () => {
    expect(toGraphDisplayValue(mate(1))).toBe(EVALUATION_GRAPH_BOUND_PAWNS);
    expect(toGraphDisplayValue(mate(9))).toBe(EVALUATION_GRAPH_BOUND_PAWNS);
    expect(toGraphDisplayValue(mate(-2))).toBe(-EVALUATION_GRAPH_BOUND_PAWNS);
  });

  it("refuses to plot missing or malformed evidence", () => {
    expect(toGraphDisplayValue(null)).toBeNull();
    expect(toGraphDisplayValue(cp(Number.NaN))).toBeNull();
    expect(toGraphDisplayValue(cp(Number.POSITIVE_INFINITY))).toBeNull();
    expect(toGraphDisplayValue(mate(0))).toBeNull();
    expect(toGraphDisplayValue(mate(1.5))).toBeNull();
  });

  it("maps recorded terminal outcomes without consulting the engine", () => {
    expect(
      toTerminalDisplayValue({ reason: "checkmate", winner: "white" }),
    ).toBe(EVALUATION_GRAPH_BOUND_PAWNS);
    expect(
      toTerminalDisplayValue({ reason: "checkmate", winner: "black" }),
    ).toBe(-EVALUATION_GRAPH_BOUND_PAWNS);
    for (const reason of [
      "stalemate",
      "insufficient-material",
      "threefold-repetition",
      "fifty-move-rule",
      "draw",
    ] as const) {
      expect(toTerminalDisplayValue({ reason, winner: null })).toBe(0);
    }
  });
});

describe("evaluation graph point model", () => {
  it("indexes position 0 as the starting position with no invented move", () => {
    const graph = graphFor("1. e4 e5", (game) => [
      analyzed(game, 0, cp(20)),
      analyzed(game, 1, cp(35)),
      analyzed(game, 2, cp(28)),
    ]);
    expect(graph.points[0]).toMatchObject({
      positionIndex: 0,
      ply: null,
      moveNumber: null,
      player: null,
      san: null,
      label: "Starting position",
      evaluation: cp(20),
      displayValue: 0.2,
    });
  });

  it("maps position n to the evaluation after ply n", () => {
    const graph = graphFor("1. e4 e5 2. Nf3", (game) => [
      analyzed(game, 0, cp(20)),
      analyzed(game, 1, cp(35)),
      analyzed(game, 2, cp(28)),
      analyzed(game, 3, cp(41)),
    ]);
    expect(graph.points).toHaveLength(4);
    expect(graph.points.map((point) => point.positionIndex)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(graph.points.map((point) => point.ply)).toEqual([null, 1, 2, 3]);
    expect(graph.points.map((point) => point.displayValue)).toEqual([
      0.2, 0.35, 0.28, 0.41,
    ]);
    expect(graph.points.map((point) => point.label)).toEqual([
      "Starting position",
      "1. e4",
      "1... e5",
      "2. Nf3",
    ]);
  });

  it("keeps White-relative sign regardless of which side moved", () => {
    const graph = graphFor("1. e4 e5", (game) => [
      analyzed(game, 0, cp(0)),
      analyzed(game, 1, cp(250)),
      analyzed(game, 2, cp(-250)),
    ]);
    expect(graph.points[1]).toMatchObject({
      player: "white",
      displayValue: 2.5,
    });
    expect(graph.points[2]).toMatchObject({
      player: "black",
      displayValue: -2.5,
    });
  });

  it("mirrors exactly when every canonical evaluation is negated", () => {
    const values = [12, -85, 640, 0, -1500];
    const positive = graphFor("1. e4 e5 2. Nf3 Nc6", (game) =>
      values.map((value, index) => analyzed(game, index, cp(value))),
    );
    const negated = graphFor("1. e4 e5 2. Nf3 Nc6", (game) =>
      values.map((value, index) => analyzed(game, index, cp(-value))),
    );
    // `-0` is normalized away, so equality is compared on the same convention.
    expect(negated.points.map((point) => point.displayValue)).toEqual(
      positive.points.map((point) => point.displayValue! * -1 || 0),
    );
  });

  it("retains mate as mate and never as a centipawn value", () => {
    const graph = graphFor("1. e4 e5", (game) => [
      analyzed(game, 0, cp(20)),
      analyzed(game, 1, mate(3)),
      analyzed(game, 2, mate(-2)),
    ]);
    expect(graph.points[1].evaluation).toEqual(mate(3));
    expect(graph.points[1].displayValue).toBe(EVALUATION_GRAPH_BOUND_PAWNS);
    expect(graph.points[2].evaluation).toEqual(mate(-2));
    expect(graph.points[2].displayValue).toBe(-EVALUATION_GRAPH_BOUND_PAWNS);
  });

  it("represents a checkmate endpoint from the recorded outcome", () => {
    const graph = graphFor("1. f3 e5 2. g4 Qh4#", (game) => [
      analyzed(game, 0, cp(20)),
      analyzed(game, 1, cp(-60)),
      analyzed(game, 2, cp(-40)),
      analyzed(game, 3, cp(-900)),
      terminal(game, 4, "checkmate", "black"),
    ]);
    const last = graph.points[4];
    expect(last.evaluation).toBeNull();
    expect(last.terminal).toEqual({ reason: "checkmate", winner: "black" });
    expect(last.displayValue).toBe(-EVALUATION_GRAPH_BOUND_PAWNS);
    expect(graph.unavailablePointCount).toBe(0);
  });

  it("places every supported drawn terminal outcome on equality", () => {
    for (const reason of [
      "stalemate",
      "insufficient-material",
      "threefold-repetition",
      "fifty-move-rule",
      "draw",
    ] as const) {
      const graph = graphFor("1. e4 e5", (game) => [
        analyzed(game, 0, cp(20)),
        analyzed(game, 1, cp(35)),
        terminal(game, 2, reason, null),
      ]);
      expect(graph.points[2].terminal).toEqual({ reason, winner: null });
      expect(graph.points[2].displayValue).toBe(0);
      expect(graph.points[2].evaluation).toBeNull();
    }
  });

  it("represents a terminal starting position from retained evidence", () => {
    const graph = graphFor(
      `[SetUp "1"]
[FEN "7k/5Q2/6K1/8/8/8/8/8 b - - 0 40"]

*`,
      (game) => [terminal(game, 0, "checkmate", "white")],
    );
    expect(graph.points).toHaveLength(1);
    expect(graph.points[0]).toMatchObject({
      positionIndex: 0,
      label: "Starting position",
      terminal: { reason: "checkmate", winner: "white" },
      displayValue: EVALUATION_GRAPH_BOUND_PAWNS,
    });
  });

  it("leaves unavailable evidence unavailable instead of filling it in", () => {
    const graph = graphFor("1. e4 e5 2. Nf3", (game) => [
      analyzed(game, 0, cp(20)),
      null,
      undefined,
      analyzed(game, 3, cp(41)),
    ]);
    expect(graph.points.map((point) => point.displayValue)).toEqual([
      0.2,
      null,
      null,
      0.41,
    ]);
    expect(graph.points[1].evaluation).toBeNull();
    expect(graph.points[1].terminal).toBeNull();
    expect(graph.unavailablePointCount).toBe(2);
  });

  it("splits plot segments around gaps rather than bridging them", () => {
    const graph = graphFor("1. e4 e5 2. Nf3", (game) => [
      analyzed(game, 0, cp(20)),
      null,
      analyzed(game, 2, cp(28)),
      analyzed(game, 3, cp(41)),
    ]);
    const segments = toEvaluationGraphSegments(graph);
    expect(
      segments.map((segment) =>
        segment.points.map((point) => point.positionIndex),
      ),
    ).toEqual([[0], [2, 3]]);
    expect(toEvaluationGraphGaps(graph)).toEqual([
      { startIndex: 1, endIndex: 1 },
    ]);
  });

  it("collects consecutive and trailing gaps as single runs", () => {
    const graph = graphFor("1. e4 e5 2. Nf3 Nc6", (game) => [
      analyzed(game, 0, cp(20)),
      null,
      null,
      analyzed(game, 3, cp(41)),
      null,
    ]);
    expect(toEvaluationGraphGaps(graph)).toEqual([
      { startIndex: 1, endIndex: 2 },
      { startIndex: 4, endIndex: 4 },
    ]);
  });

  it("reports an entirely unanalyzed game without plottable segments", () => {
    const graph = graphFor("1. e4 e5", () => [null, null, null]);
    expect(toEvaluationGraphSegments(graph)).toEqual([]);
    expect(graph.unavailablePointCount).toBe(3);
    expect(graph.points.every((point) => point.displayValue === null)).toBe(
      true,
    );
  });
});

describe("evaluation graph custom starting positions", () => {
  it("labels a White-to-move custom FEN from its own fullmove number", () => {
    const graph = graphFor(
      `[SetUp "1"]
[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"]

4. O-O Bc5`,
      (game) => [
        analyzed(game, 0, cp(30)),
        analyzed(game, 1, cp(25)),
        analyzed(game, 2, cp(18)),
      ],
    );
    expect(graph.points.map((point) => point.label)).toEqual([
      "Starting position",
      "4. O-O",
      "4... Bc5",
    ]);
    expect(graph.points.map((point) => point.positionIndex)).toEqual([0, 1, 2]);
  });

  it("starts a Black-to-move custom FEN at position 0 with Black's ply 1", () => {
    const graph = graphFor(
      `[SetUp "1"]
[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12"]

12... Nc6 13. Nf3`,
      (game) => [
        analyzed(game, 0, cp(-15)),
        analyzed(game, 1, cp(-5)),
        analyzed(game, 2, cp(22)),
      ],
    );
    expect(graph.points.map((point) => point.label)).toEqual([
      "Starting position",
      "12... Nc6",
      "13. Nf3",
    ]);
    expect(graph.points.map((point) => point.ply)).toEqual([null, 1, 2]);
    expect(graph.points.map((point) => point.player)).toEqual([
      null,
      "black",
      "white",
    ]);
    expect(graph.points[0].displayValue).toBeCloseTo(-0.15, 10);
  });

  it("formats conventional labels for either mover", () => {
    expect(formatGraphPositionLabel(18, "black", "Nxf3")).toBe("18... Nxf3");
    expect(formatGraphPositionLabel(24, "white", "Qh7+")).toBe("24. Qh7+");
  });
});

describe("evaluation graph point selection", () => {
  const graph = graphFor("1. e4 e5 2. Nf3 Nc6", (game) =>
    game.positions.map((_, index) => analyzed(game, index, cp(index * 10))),
  );

  it("selects the nearest canonical position index", () => {
    expect(selectGraphPositionIndex(graph, 0)).toBe(0);
    expect(selectGraphPositionIndex(graph, 1)).toBe(4);
    expect(selectGraphPositionIndex(graph, 0.5)).toBe(2);
    expect(selectGraphPositionIndex(graph, 0.26)).toBe(1);
  });

  it("clamps pointer positions outside the plotted width", () => {
    expect(selectGraphPositionIndex(graph, -3)).toBe(0);
    expect(selectGraphPositionIndex(graph, 4)).toBe(4);
  });

  it("stays on the only position of a single-point graph", () => {
    const single = graphFor(
      `[SetUp "1"]
[FEN "8/8/4k3/8/8/4K3/8/8 w - - 0 60"]

*`,
      (game) => [analyzed(game, 0, cp(0))],
    );
    expect(selectGraphPositionIndex(single, 0.9)).toBe(0);
  });
});
