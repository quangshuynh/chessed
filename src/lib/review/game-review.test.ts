import { describe, expect, it, vi } from "vitest";

import { reviewGame } from "@/lib/analysis/review-game";
import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import type { ParsedReviewGame } from "@/lib/chess/types";
import { classifyMove } from "@/lib/review/classification";
import {
  buildWholeGameReview,
  REVIEW_METHODOLOGY_VERSION,
} from "@/lib/review/game-review";
import type {
  AnalysisLimit,
  EngineAnalyzer,
  EngineEvaluation,
  PositionAnalysis,
  PositionAnalysisRequest,
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

function positionAnalysis(input: {
  request: PositionAnalysisRequest;
  evaluation: EngineEvaluation;
  bestMoveUci?: string | null;
  depth?: number;
  candidates?: PositionAnalysis["candidates"];
}): PositionAnalysis {
  const requested =
    input.request.limit ?? ({ kind: "depth", value: 12 } as const);
  const bestMoveUci = input.bestMoveUci ?? null;
  return {
    fen: input.request.fen,
    evaluation: input.evaluation,
    bestMoveUci,
    principalVariationUci: bestMoveUci ? [bestMoveUci] : [],
    candidates: input.candidates,
    limit: { requested, achievedDepth: input.depth ?? requested.value },
    engine: { name: "Deterministic", version: "1.0" },
  };
}

function sequenceAnalyzer(input: {
  evaluations: readonly EngineEvaluation[];
  bestMoves?: readonly (string | null)[];
  depths?: readonly number[];
}): EngineAnalyzer & { analyzePosition: ReturnType<typeof vi.fn> } {
  let call = 0;
  const analyzePosition = vi.fn(async (request: PositionAnalysisRequest) => {
    const index = call++;
    const evaluation = input.evaluations[index];
    if (!evaluation) throw new Error(`Unexpected analysis call ${index}.`);
    return positionAnalysis({
      request,
      evaluation,
      bestMoveUci: input.bestMoves?.[index],
      depth: input.depths?.[index],
    });
  });
  return { analyzePosition, dispose: vi.fn() };
}

function analyzedPosition(
  game: ParsedReviewGame,
  positionIndex: number,
  evaluation: EngineEvaluation,
  bestMoveUci: string | null = null,
) {
  return {
    status: "analyzed" as const,
    positionIndex,
    followingMovePly: game.moves[positionIndex]?.ply ?? null,
    analysis: positionAnalysis({
      request: { fen: game.positions[positionIndex] },
      evaluation,
      bestMoveUci,
    }),
  };
}

describe("whole-game review orchestration", () => {
  it("selectively enriches only a first-pass special candidate", async () => {
    const game = parsePgnToReviewGame("1. e4");
    const analyzePosition = vi.fn(async (request: PositionAnalysisRequest) => {
      const root = request.fen === game.positions[0];
      const candidates = root
        ? request.candidateCount === 3
          ? [
              {
                rank: 1,
                moveUci: "e2e4",
                evaluation: cp(100),
                principalVariationUci: ["e2e4"],
              },
              {
                rank: 2,
                moveUci: "d2d4",
                evaluation: cp(0),
                principalVariationUci: ["d2d4"],
              },
            ]
          : [
              {
                rank: 1,
                moveUci: "e2e4",
                evaluation: cp(100),
                principalVariationUci: ["e2e4"],
              },
            ]
        : [];
      return {
        ...positionAnalysis({
          request,
          evaluation: cp(100),
          bestMoveUci: root ? "e2e4" : null,
        }),
        candidates,
      };
    });
    const review = await reviewGame({
      game,
      analyzer: { analyzePosition, dispose: vi.fn() },
    });
    expect(
      analyzePosition.mock.calls.map(([request]) => request.candidateCount),
    ).toEqual([undefined, undefined, 3]);
    expect(review.moves[0].specialClassification?.classification).toBe("great");
  });

  it("composes Brilliant over a preserved ordinary Best result", () => {
    const game = parsePgnToReviewGame(`[SetUp "1"]
[FEN "4k3/8/6p1/8/8/8/8/3QK3 w - - 0 1"]

1. Qh5`);
    const before = analyzedPosition(game, 0, cp(50), "d1h5");
    before.analysis.candidates = [
      {
        rank: 1,
        moveUci: "d1h5",
        evaluation: cp(55),
        principalVariationUci: ["d1h5", "g6h5"],
      },
      {
        rank: 2,
        moveUci: "d1d2",
        evaluation: cp(-80),
        principalVariationUci: ["d1d2"],
      },
    ];
    const review = buildWholeGameReview({
      game,
      positions: [before, analyzedPosition(game, 1, cp(55))],
    });
    expect(review.moves[0]).toMatchObject({
      classification: { status: "classified", classification: "best" },
      specialClassification: { classification: "brilliant" },
    });
    expect(review.counts.best).toBe(1);
    expect(review.specialCounts).toEqual({ great: 0, brilliant: 1, miss: 0 });
  });

  it("produces an ordered complete review with metadata, counts, and provenance", async () => {
    const game = parsePgnToReviewGame(`[Event "Orchestration"]
[Date "2026.09.15"]
[White "Alice"]
[Black "Bob"]
[WhiteElo "1800"]
[BlackElo "1750"]
[Result "1/2-1/2"]
[TimeControl "600+5"]

1. e4 e5`);
    const limit: AnalysisLimit = { kind: "depth", value: 14 };
    const analyzer = sequenceAnalyzer({
      evaluations: [cp(20), cp(10), cp(80)],
      bestMoves: ["e2e4", "g8f6", null],
      depths: [14, 13, 12],
    });

    const review = await reviewGame({ game, analyzer, limit });

    expect(review.metadata).toEqual({
      players: {
        white: { color: "white", name: "Alice", rating: 1800 },
        black: { color: "black", name: "Bob", rating: 1750 },
      },
      result: "1/2-1/2",
      timeControl: "600+5",
      date: "2026.09.15",
      startingFen: game.startingFen,
      customStartingPosition: false,
      moveCount: 2,
    });
    expect(
      review.moves.map(({ ply, player, san, uci }) => ({
        ply,
        player,
        san,
        uci,
      })),
    ).toEqual([
      { ply: 1, player: "white", san: "e4", uci: "e2e4" },
      { ply: 2, player: "black", san: "e5", uci: "e7e5" },
    ]);
    expect(review.moves[0]).toMatchObject({
      fenBefore: game.positions[0],
      fenAfter: game.positions[1],
      bestMoveUci: "e2e4",
      principalVariationUci: ["e2e4"],
      evaluationBefore: cp(20),
      evaluationAfter: cp(10),
      playedBestMove: true,
      classification: { status: "classified", classification: "best" },
    });
    expect(review.moves[1]).toMatchObject({
      player: "black",
      playedBestMove: false,
      playerEvaluationBefore: { kind: "centipawns", value: -10 },
      playerOutcomeAfter: {
        kind: "engine",
        evaluation: { kind: "centipawns", value: -80 },
      },
      centipawnLoss: 70,
      classification: { status: "classified", classification: "inaccuracy" },
    });
    expect(review.moves.map((move) => move.classification)).toEqual(
      review.moves.map((move) => classifyMove(move.observation)),
    );
    expect(review.counts).toEqual({
      best: 1,
      good: 0,
      inaccuracy: 1,
      mistake: 0,
      blunder: 0,
      unavailable: 0,
    });
    expect(review.provenance).toEqual({
      methodologyVersion: REVIEW_METHODOLOGY_VERSION,
      engines: [{ name: "Deterministic", version: "1.0" }],
      requestedLimits: [limit],
      achievedDepthRange: { minimum: 12, maximum: 14 },
      analyzedPositionCount: 3,
      terminalPositionCount: 0,
      unavailablePositionCount: 0,
    });
  });

  it("preserves custom-FEN move numbers and missing metadata", async () => {
    const game = parsePgnToReviewGame(`[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 23"]

23... Kf7`);
    const analyzer = sequenceAnalyzer({
      evaluations: [cp(-10), cp(-10)],
      bestMoves: ["e8f7"],
    });
    const review = await reviewGame({ game, analyzer });
    expect(review.metadata).toMatchObject({
      customStartingPosition: true,
      moveCount: 1,
      players: {
        white: { color: "white" },
        black: { color: "black" },
      },
    });
    expect(review.metadata.result).toBe("*");
    expect(review.moves[0]).toMatchObject({
      ply: 1,
      moveNumber: 23,
      player: "black",
      san: "Kf7",
    });
  });

  it("keeps a final checkmating move without analyzing the terminal position", async () => {
    const game = parsePgnToReviewGame("1. f3 e5 2. g4 Qh4#");
    const analyzer = sequenceAnalyzer({
      evaluations: [cp(0), cp(-20), cp(-30), mate(-1)],
      bestMoves: [null, null, null, "d8h4"],
    });
    const review = await reviewGame({ game, analyzer });
    expect(analyzer.analyzePosition).toHaveBeenCalledTimes(4);
    expect(review.moves).toHaveLength(4);
    expect(review.moves.at(-1)).toMatchObject({
      ply: 4,
      terminalOutcome: { reason: "checkmate", result: "win" },
      evaluationAfter: null,
      classification: { status: "classified", classification: "best" },
    });
    expect(review.provenance.terminalPositionCount).toBe(1);
  });

  it("classifies a terminal draw from its pre-move evidence", async () => {
    const game = parsePgnToReviewGame(`[SetUp "1"]
[FEN "6k1/7R/8/8/8/8/5K2/8 w - - 0 1"]

1. Rh8+ Kxh8`);
    const analyzer = sequenceAnalyzer({
      evaluations: [cp(900), cp(500)],
      bestMoves: [null, "g8h8"],
    });
    const review = await reviewGame({ game, analyzer });
    expect(review.moves.at(-1)).toMatchObject({
      terminalOutcome: { reason: "insufficient-material", result: "draw" },
      classification: { status: "classified", classification: "best" },
    });
  });

  it("preserves unavailable evidence instead of inventing defaults", () => {
    const game = parsePgnToReviewGame("1. e4 e5");
    const review = buildWholeGameReview({
      game,
      positions: [analyzedPosition(game, 0, cp(0), "e2e4"), null],
    });
    expect(review.moves).toHaveLength(2);
    expect(review.moves[0]).toMatchObject({
      evaluationAfter: null,
      classification: {
        status: "unavailable",
        reason: "missing-after-analysis",
      },
    });
    expect(review.moves[1]).toMatchObject({
      evaluationBefore: null,
      evaluationAfter: null,
      classification: {
        status: "unavailable",
        reason: "missing-before-analysis",
      },
    });
    expect(review.counts.unavailable).toBe(2);
    expect(review.provenance.unavailablePositionCount).toBe(2);
  });

  it("preserves mate transitions and equivalent non-best classifications", () => {
    const mateGame = parsePgnToReviewGame("1. e4");
    const mateReview = buildWholeGameReview({
      game: mateGame,
      positions: [
        analyzedPosition(mateGame, 0, cp(20), "d2d4"),
        analyzedPosition(mateGame, 1, mate(3)),
      ],
    });
    expect(mateReview.moves[0]).toMatchObject({
      mateTransition: "creates-forced-mate",
      classification: { status: "classified", classification: "best" },
    });

    const equivalentReview = buildWholeGameReview({
      game: mateGame,
      positions: [
        analyzedPosition(mateGame, 0, cp(0), "d2d4"),
        analyzedPosition(mateGame, 1, cp(-10)),
      ],
    });
    expect(equivalentReview.moves[0]).toMatchObject({
      playedBestMove: false,
      classification: {
        status: "classified",
        classification: "best",
        evidence: { rule: "equivalent-best" },
      },
    });
  });

  it("reports deterministic position progress including terminal positions", async () => {
    const game = parsePgnToReviewGame("1. f3 e5 2. g4 Qh4#");
    const analyzer = sequenceAnalyzer({
      evaluations: [cp(0), cp(0), cp(0), mate(-1)],
    });
    const progress = vi.fn();
    await reviewGame({ game, analyzer, onProgress: progress });
    expect(progress.mock.calls.map(([value]) => value)).toEqual(
      [0, 1, 2, 3, 4, 5].map((completedPositions) => ({
        phase: "analysis",
        completedPositions,
        totalPositions: 5,
      })),
    );
  });

  it("propagates cancellation, stops later positions, and returns no partial review", async () => {
    const game = parsePgnToReviewGame("1. e4 e5 2. Nf3");
    const controller = new AbortController();
    const analyzePosition = vi.fn(
      (request: PositionAnalysisRequest): Promise<PositionAnalysis> =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => reject(request.signal?.reason),
            { once: true },
          );
        }),
    );
    const analyzer: EngineAnalyzer = { analyzePosition, dispose: vi.fn() };
    const review = reviewGame({ game, analyzer, signal: controller.signal });
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(review).rejects.toMatchObject({ name: "AbortError" });
    expect(analyzePosition).toHaveBeenCalledTimes(1);
    expect(analyzePosition.mock.calls[0][0].signal).toBe(controller.signal);
  });

  it("does not retroactively cancel a completed review", async () => {
    const game = parsePgnToReviewGame("1. e4");
    const controller = new AbortController();
    const result = await reviewGame({
      game,
      analyzer: sequenceAnalyzer({ evaluations: [cp(0), cp(0)] }),
      signal: controller.signal,
    });
    controller.abort();
    expect(result.moves).toHaveLength(1);
  });

  it("fails the whole review on analyzer errors", async () => {
    const game = parsePgnToReviewGame("1. e4 e5");
    const analyzePosition = vi
      .fn()
      .mockResolvedValueOnce(
        positionAnalysis({
          request: { fen: game.positions[0] },
          evaluation: cp(0),
        }),
      )
      .mockRejectedValueOnce(new Error("engine failed"));
    await expect(
      reviewGame({ game, analyzer: { analyzePosition, dispose: vi.fn() } }),
    ).rejects.toThrow("engine failed");
    expect(analyzePosition).toHaveBeenCalledTimes(2);
  });

  it("preserves PGN ply order without duplicates or omissions", async () => {
    const game = parsePgnToReviewGame("1. e4 e5 2. Nf3 Nc6 3. Bb5");
    const analyzer = sequenceAnalyzer({
      evaluations: game.positions.map(() => cp(0)),
    });
    const review = await reviewGame({ game, analyzer });
    expect(review.moves.map((move) => move.ply)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(review.moves.map((move) => move.ply)).size).toBe(5);
    expect(analyzer.analyzePosition).toHaveBeenCalledTimes(
      game.positions.length,
    );
  });

  it("keeps repetition detection history-aware rather than reusing board-only analysis", async () => {
    const game = parsePgnToReviewGame(
      "1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8",
    );
    const analyzer = sequenceAnalyzer({
      evaluations: game.positions.slice(0, -1).map(() => cp(0)),
    });
    const review = await reviewGame({ game, analyzer });
    expect(review.moves.at(-1)?.terminalOutcome).toMatchObject({
      reason: "threefold-repetition",
      result: "draw",
    });
    expect(analyzer.analyzePosition).toHaveBeenCalledTimes(
      game.positions.length - 1,
    );
    const requestedFens = analyzer.analyzePosition.mock.calls.map(
      ([request]) => request.fen,
    );
    expect(new Set(requestedFens).size).toBe(requestedFens.length);
  });
});
