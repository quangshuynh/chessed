import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import type { ParsedReviewGame } from "@/lib/chess/types";
import {
  buildWholeGameReview,
  type ReviewMove,
} from "@/lib/review/game-review";
import type {
  EngineCandidate,
  EngineEvaluation,
  GamePositionAnalysis,
  TerminalReason,
} from "@/lib/review/interfaces";
import {
  derivePlayedMoveMaterial,
  deriveExplanationEvidence,
  explainMove,
  explainReviewMoves,
  EXPLANATION_MAXIMUM_DETAILS,
  EXPLANATION_PRINCIPAL_VARIATION_PLIES,
  EXPLANATION_REASON_PRIORITY,
  formatExplanation,
  hasSupportedMaterialLoss,
  selectPrimaryExplanation,
  toPositionState,
  type ExplanationReason,
} from "@/lib/review/move-explanation";

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
const candidate = (
  rank: number,
  moveUci: string,
  evaluation: EngineEvaluation,
  pv: string[] = [moveUci],
): EngineCandidate => ({
  rank,
  moveUci,
  evaluation,
  principalVariationUci: pv,
});

interface PositionOptions {
  bestMoveUci?: string | null;
  pv?: string[];
  candidates?: EngineCandidate[];
}

function analyzed(
  game: ParsedReviewGame,
  positionIndex: number,
  evaluation: EngineEvaluation,
  options: PositionOptions = {},
): GamePositionAnalysis {
  const candidates = options.candidates;
  const bestMoveUci =
    options.bestMoveUci !== undefined
      ? options.bestMoveUci
      : (candidates?.[0]?.moveUci ?? null);
  return {
    status: "analyzed",
    positionIndex,
    followingMovePly: game.moves[positionIndex]?.ply ?? null,
    analysis: {
      fen: game.positions[positionIndex],
      evaluation,
      bestMoveUci,
      principalVariationUci:
        options.pv ?? candidates?.[0]?.principalVariationUci ?? [],
      ...(candidates ? { candidates } : {}),
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

/** Explanations are always produced from a real review, never a hand-made move. */
function reviewFor(
  pgn: string,
  positions: (
    game: ParsedReviewGame,
  ) => readonly (GamePositionAnalysis | null | undefined)[],
) {
  const game = parsePgnToReviewGame(pgn);
  return {
    game,
    review: buildWholeGameReview({ game, positions: positions(game) }),
  };
}

function explainPly(
  pgn: string,
  ply: number,
  positions: (
    game: ParsedReviewGame,
  ) => readonly (GamePositionAnalysis | null | undefined)[],
) {
  const { review } = reviewFor(pgn, positions);
  const move = review.moves[ply - 1];
  expect(move?.ply).toBe(ply);
  return explainMove(move as ReviewMove);
}

const OPENING = `[Event "Fixture"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

const RECAPTURE = `[Event "Fixture"]
[Result "*"]

1. e4 d5 2. exd5 Qxd5 *`;

const EN_PASSANT = `[Event "Fixture"]
[Result "*"]

1. e4 e6 2. e5 d5 3. exd6 *`;

const PROMOTION = `[SetUp "1"]
[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]
[Result "*"]

1. a8=Q+ Kd7 *`;

const FOOLS_MATE = `[Event "Fixture"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

const STALEMATE = `[Event "Fixture"]
[Result "1/2-1/2"]

1. e3 a5 2. Qh5 Ra6 3. Qxa5 h5 4. Qxc7 Rah6 5. h4 f6
6. Qxd7+ Kf7 7. Qxb7 Qd3 8. Qxb8 Qh7 9. Qxc8 Kg6 10. Qe6 1/2-1/2`;

const REPETITION = `[Event "Fixture"]
[Result "1/2-1/2"]

1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2`;

const INSUFFICIENT_MATERIAL = `[SetUp "1"]
[FEN "4k3/8/8/8/8/8/5n2/4K2B w - - 0 1"]
[Result "1/2-1/2"]

1. Kxf2 1/2-1/2`;

const FIFTY_MOVE = `[SetUp "1"]
[FEN "4k3/8/8/8/8/8/8/R3K3 w Q - 99 60"]
[Result "1/2-1/2"]

60. Ra2 1/2-1/2`;

/** Black to move from a non-1 fullmove number, so numbering is never assumed. */
const BLACK_TO_MOVE = `[SetUp "1"]
[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4"]
[Result "*"]

4... Bc5 5. c3 *`;

/** Queen sacrifice fixture reused from the frozen Brilliant policy corpus. */
const SACRIFICE = `[SetUp "1"]
[FEN "4k3/8/6p1/8/8/8/8/3QK3 w - - 0 1"]
[Result "*"]

1. Qh5 gxh5 *`;

/** White hangs its queen; the retained reply captures exactly that queen. */
const HANGING_QUEEN = `[SetUp "1"]
[FEN "3qk3/8/8/8/8/8/3QPPPP/4K3 w - - 0 1"]
[Result "*"]

1. Qd5 Qxd5 *`;

/** White loses a pawn and the queen, so no single reply explains the swing. */
const COMPOUND_LOSS = `[SetUp "1"]
[FEN "3qk3/8/8/3P4/8/8/3QPPPP/4K3 w - - 0 1"]
[Result "*"]

1. Qd4 Qxd5 2. Kf1 Qxd4 *`;

describe("explanation position states", () => {
  it("bands mover-relative evaluations symmetrically and only at documented bounds", () => {
    const band = (value: number) =>
      toPositionState({ kind: "centipawns", perspective: "player", value });
    expect(band(0)).toBe("roughly-equal");
    expect(band(49)).toBe("roughly-equal");
    expect(band(-49)).toBe("roughly-equal");
    expect(band(50)).toBe("slight-advantage");
    expect(band(-50)).toBe("slight-disadvantage");
    expect(band(149)).toBe("slight-advantage");
    expect(band(150)).toBe("clear-advantage");
    expect(band(-150)).toBe("clear-disadvantage");
    expect(band(399)).toBe("clear-advantage");
    expect(band(400)).toBe("winning");
    expect(band(-400)).toBe("losing");
  });

  it("keeps mate semantic rather than giving it a band", () => {
    expect(
      toPositionState({
        kind: "mate",
        perspective: "player",
        outcome: "favorable",
        moves: 3,
      }),
    ).toBe("forced-mate-for");
    expect(
      toPositionState({
        kind: "mate",
        perspective: "player",
        outcome: "unfavorable",
        moves: 2,
      }),
    ).toBe("forced-mate-against");
  });

  it("returns no state for absent or non-finite evidence", () => {
    expect(toPositionState(null)).toBeNull();
    expect(
      toPositionState({
        kind: "centipawns",
        perspective: "player",
        value: Number.NaN,
      }),
    ).toBeNull();
  });
});

describe("ordinary explanations", () => {
  it("explains an exact engine-best move without embellishment", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(20), { bestMoveUci: "e2e4" }),
      analyzed(game, 1, cp(20)),
    ]);
    expect(explanation.reason).toBe("best-move");
    expect(explanation.summary).toBe("This was the engine's top choice.");
    expect(explanation.details ?? []).toEqual([]);
  });

  it("explains a near-equivalent alternative as nearly equivalent", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(20), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(10)),
    ]);
    expect(explanation.reason).toBe("near-best-move");
    expect(explanation.summary).toBe(
      "This move was nearly equivalent to the engine's top choice.",
    );
    expect(explanation.details).toContain("The top choice was d4.");
    expect(explanation.details).toContain("The difference is 10 centipawns.");
  });

  it("explains a small loss as a sound but non-top move", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(60), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(20)),
    ]);
    expect(explanation.reason).toBe("sound-move");
    expect(explanation.summary).toBe(
      "This move keeps the objective assessment close to the engine's top choice.",
    );
  });

  it("explains a large loss as a concrete state transition", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(300), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(-300)),
    ]);
    expect(explanation.reason).toBe("large-eval-drop");
    expect(explanation.summary).toBe(
      "This move changes the position from clearly better for the player to clearly worse for the player.",
    );
    expect(explanation.details).toContain(
      "The position moves from +3.00 to -3.00.",
    );
  });

  it("falls back to a numeric swing when the display band does not change", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(390), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(160)),
    ]);
    expect(explanation.reason).toBe("moderate-eval-drop");
    expect(explanation.summary).toBe(
      "This move gives away 2.30 pawns of objective advantage.",
    );
  });

  it("explains an inaccuracy without claiming more than the evidence", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(120), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(60)),
    ]);
    expect(explanation.reason).toBe("slight-eval-drop");
    expect(explanation.summary).toContain("gives away");
  });

  it("describes a preserved winning position when the best move is kept", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(900), { bestMoveUci: "e2e4" }),
      analyzed(game, 1, cp(900)),
    ]);
    expect(explanation.reason).toBe("preserved-winning-position");
    expect(explanation.summary).toBe("This move keeps a winning position.");
    expect(explanation.details).toContain("It was the engine's top choice.");
  });
});

describe("material explanations", () => {
  it("reports capture identity, promotion, and en passant from legal board state", () => {
    const { review } = reviewFor(EN_PASSANT, (game) => [
      analyzed(game, 0, cp(0)),
      analyzed(game, 1, cp(0)),
      analyzed(game, 2, cp(0)),
      analyzed(game, 3, cp(0)),
      analyzed(game, 4, cp(0)),
      analyzed(game, 5, cp(0)),
    ]);
    const material = derivePlayedMoveMaterial(review.moves[4]);
    expect(material).toMatchObject({
      capturedPiece: "p",
      capturedValue: 1,
      enPassant: true,
      promotionPiece: null,
      immediateSwing: 1,
    });

    const promotion = reviewFor(PROMOTION, (game) => [
      analyzed(game, 0, cp(0)),
      analyzed(game, 1, cp(0)),
      analyzed(game, 2, cp(0)),
    ]).review;
    expect(derivePlayedMoveMaterial(promotion.moves[0])).toMatchObject({
      capturedPiece: null,
      promotionPiece: "q",
      immediateSwing: 8,
    });
  });

  it("names a lost piece only when the retained reply accounts for the whole swing", () => {
    const quiet = explainPly(HANGING_QUEEN, 1, (game) => [
      analyzed(game, 0, cp(400), { bestMoveUci: "d2d3" }),
      analyzed(game, 1, cp(-400), { pv: ["d8d7"] }),
    ]);
    // A quiet retained reply is not material evidence, whatever the swing was.
    expect(quiet.reason).toBe("large-eval-drop");

    const losing = explainPly(HANGING_QUEEN, 1, (game) => [
      analyzed(game, 0, cp(400), { bestMoveUci: "d2d3" }),
      analyzed(game, 1, cp(-400), { pv: ["d8d5"] }),
    ]);
    expect(losing.reason).toBe("lost-material");
    expect(losing.summary).toBe("This move loses a queen.");
  });

  it("reports points rather than a piece when the swing has no single source", () => {
    const explanation = explainPly(COMPOUND_LOSS, 1, (game) => [
      analyzed(game, 0, cp(400), { bestMoveUci: "d2d3" }),
      analyzed(game, 1, cp(-400), { pv: ["d8d5", "e1f1", "d5d4"] }),
    ]);
    expect(explanation.reason).toBe("lost-material");
    expect(explanation.summary).toBe("This move loses 10 points of material.");
  });

  it("never calls a recaptured capture a material gain", () => {
    const explanation = explainPly(RECAPTURE, 3, (game) => [
      analyzed(game, 0, cp(0)),
      analyzed(game, 1, cp(0)),
      analyzed(game, 2, cp(20), { bestMoveUci: "e4d5" }),
      analyzed(game, 3, cp(20), { pv: ["d8d5"] }),
    ]);
    expect(explanation.summary).toBe("This was the engine's top choice.");
    expect(explanation.details).toContain("The move captures a pawn.");
    expect(JSON.stringify(explanation)).not.toContain("wins a");
  });
});

describe("mate explanations", () => {
  const mateCase = (before: EngineEvaluation, after: EngineEvaluation) =>
    explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, before, { bestMoveUci: "d2d4" }),
      analyzed(game, 1, after),
    ]);

  it("explains creating a forced mate", () => {
    const explanation = mateCase(cp(400), mate(3));
    expect(explanation.reason).toBe("found-mate");
    expect(explanation.summary).toBe("This move creates a forced mate.");
    expect(explanation.details).toContain("The forced mate stands at M3.");
  });

  it("explains keeping a forced mate", () => {
    const explanation = mateCase(mate(4), mate(3));
    expect(explanation.reason).toBe("retained-mate");
    expect(explanation.summary).toBe("This move keeps the forced mate.");
  });

  it("explains throwing away a forced mate as a missed mate", () => {
    const explanation = mateCase(mate(2), cp(100));
    expect(explanation.reason).toBe("missed-mate");
    expect(explanation.summary).toBe("This move misses a forced mate.");
    expect(explanation.details).toContain("The missed mate was M2.");
    expect(explanation.details).toContain("Best was d4.");
  });

  it("explains newly allowing a forced mate", () => {
    const explanation = mateCase(cp(50), mate(-2));
    expect(explanation.reason).toBe("allowed-mate");
    expect(explanation.summary).toBe("This move allows a forced mate.");
    expect(explanation.details).toContain("The opponent now has mate in 2.");
  });

  it("explains escaping a forced mate", () => {
    const explanation = mateCase(mate(-3), cp(-200));
    expect(explanation.reason).toBe("escaped-mate");
    expect(explanation.summary).toBe("This move escapes a forced mate.");
  });

  it("explains a mate that still stands against the mover", () => {
    const explanation = mateCase(mate(-4), mate(-3));
    expect(explanation.reason).toBe("retained-mate-against");
    expect(explanation.summary).toBe(
      "The opponent still has a forced mate after this move.",
    );
  });

  it("uses player-relative mate wording for Black", () => {
    const explanation = explainPly(OPENING, 2, (game) => [
      analyzed(game, 0, cp(0)),
      analyzed(game, 1, cp(-300), { bestMoveUci: "e7e5" }),
      analyzed(game, 2, mate(-3)),
    ]);
    expect(explanation.reason).toBe("found-mate");
    expect(explanation.details).toContain("The forced mate stands at M3.");
  });
});

describe("terminal explanations", () => {
  it("explains a delivered checkmate", () => {
    const explanation = explainPly(FOOLS_MATE, 4, (game) => [
      analyzed(game, 0, cp(20)),
      analyzed(game, 1, cp(-40)),
      analyzed(game, 2, cp(-50)),
      analyzed(game, 3, cp(-600), { bestMoveUci: "d8h4" }),
      terminal(game, 4, "checkmate", "black"),
    ]);
    expect(explanation.reason).toBe("terminal-checkmate-delivered");
    expect(explanation.summary).toBe("This move delivers checkmate.");
  });

  it("explains stalemate, repetition, insufficient material, and the fifty-move rule", () => {
    const stalemate = explainPly(STALEMATE, 19, (game) =>
      game.positions.map((_, index) =>
        index === game.positions.length - 1
          ? terminal(game, index, "stalemate", null)
          : analyzed(game, index, cp(900)),
      ),
    );
    expect(stalemate.reason).toBe("terminal-draw");
    expect(stalemate.summary).toBe("This move ends the game in stalemate.");
    expect(stalemate.details).toContain(
      "The position was +9.00 before the move.",
    );

    const repetition = explainPly(REPETITION, 8, (game) =>
      game.positions.map((_, index) =>
        index === game.positions.length - 1
          ? terminal(game, index, "threefold-repetition", null)
          : analyzed(game, index, cp(10)),
      ),
    );
    expect(repetition.summary).toBe(
      "This move reaches a drawn position by repetition.",
    );

    const insufficient = explainPly(INSUFFICIENT_MATERIAL, 1, (game) => [
      analyzed(game, 0, cp(0)),
      terminal(game, 1, "insufficient-material", null),
    ]);
    expect(insufficient.summary).toBe(
      "This move reaches a drawn position by insufficient material.",
    );

    const fiftyMove = explainPly(FIFTY_MOVE, 1, (game) => [
      analyzed(game, 0, cp(0)),
      terminal(game, 1, "fifty-move-rule", null),
    ]);
    expect(fiftyMove.summary).toBe(
      "This move reaches a drawn position by the fifty-move rule.",
    );
  });

  it("prefers the terminal result over any evaluation movement", () => {
    const explanation = explainPly(STALEMATE, 19, (game) =>
      game.positions.map((_, index) =>
        index === game.positions.length - 1
          ? terminal(game, index, "stalemate", null)
          : analyzed(game, index, cp(2000)),
      ),
    );
    expect(explanation.reason).toBe("terminal-draw");
  });
});

describe("special classification explanations", () => {
  it("explains Brilliant from its own sacrifice evidence only", () => {
    const explanation = explainPly(SACRIFICE, 1, (game) => [
      analyzed(game, 0, cp(50), {
        candidates: [
          candidate(1, "d1h5", cp(55), ["d1h5", "g6h5"]),
          candidate(2, "d1d2", cp(-80)),
        ],
      }),
      analyzed(game, 1, cp(55)),
    ]);
    expect(explanation.reason).toBe("brilliant-sacrifice");
    expect(explanation.summary).toBe(
      "This move was the engine's top choice and gives up material the analyzed line does not regain.",
    );
    expect(explanation.details?.[0]).toBe(
      "The analyzed line gives up 9 points of material and does not regain 9 of them.",
    );
    const text = JSON.stringify(explanation).toLowerCase();
    for (const praise of ["amazing", "creative", "stunning", "spectacular"]) {
      expect(text).not.toContain(praise);
    }
  });

  it("explains Great as candidate separation, never as human difficulty", () => {
    const fen = "4k3/8/8/8/8/8/4PPPP/4K2R w K - 0 1";
    const pgn = `[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n\n1. Kf1 Kd7 *`;
    const explanation = explainPly(pgn, 1, (game) => [
      analyzed(game, 0, cp(120), {
        candidates: [
          candidate(1, "e1f1", cp(120)),
          candidate(2, "h1g1", cp(30)),
        ],
      }),
      analyzed(game, 1, cp(120)),
    ]);
    expect(explanation.reason).toBe("critical-best-move");
    expect(explanation.summary).toBe(
      "This move was the engine's top choice, and the analyzed alternatives were clearly worse.",
    );
    expect(explanation.details?.[0]).toMatch(
      /^Among the 2 analyzed candidates, the next best was 0\.\d{3} lower on Chessed's outcome scale\.$/,
    );
  });

  it("explains a missed forced mate with the retained line", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, mate(2), {
        candidates: [
          candidate(1, "d2d4", mate(2), ["d2d4", "e7e5", "d4e5"]),
          candidate(2, "e2e4", cp(30)),
        ],
      }),
      analyzed(game, 1, cp(30)),
    ]);
    expect(explanation.reason).toBe("missed-mate");
    expect(explanation.summary).toBe("This move misses a forced mate.");
    expect(explanation.details).toEqual([
      "The missed mate was M2.",
      "Best line: 1. d4 e5 2. dxe5",
    ]);
  });

  it("explains a missed material win with the material the line wins", () => {
    const fen = "4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1";
    const pgn = `[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n\n1. Ke2 Qd4 *`;
    const explanation = explainPly(pgn, 1, (game) => [
      analyzed(game, 0, cp(400), {
        candidates: [
          candidate(1, "d1d5", cp(400), ["d1d5"]),
          candidate(2, "e1e2", cp(-10)),
        ],
      }),
      analyzed(game, 1, cp(-10)),
    ]);
    expect(explanation.reason).toBe("missed-material-win");
    expect(explanation.summary).toBe(
      "This move misses a continuation that wins material.",
    );
    expect(explanation.details?.[0]).toBe(
      "Best was Qxd5, winning 9 points of material.",
    );
  });
});

describe("custom positions and perspective", () => {
  it("keeps SAN and numbering correct for a Black move from a custom FEN", () => {
    const { review } = reviewFor(BLACK_TO_MOVE, (game) => [
      analyzed(game, 0, cp(20), { bestMoveUci: "g8f6" }),
      analyzed(game, 1, cp(30)),
      analyzed(game, 2, cp(30)),
    ]);
    const move = review.moves[0];
    expect(move.moveNumber).toBe(4);
    expect(move.player).toBe("black");
    const facts = deriveExplanationEvidence(move);
    expect(facts.bestMoveSan).toBe("Nf6");
    expect(facts.san).toBe("Bc5");
    const explanation = explainMove(move);
    expect(explanation.reason).toBe("near-best-move");
    expect(explanation.details).toContain("The top choice was Nf6.");
  });

  it("produces identical explanations for mirrored White and Black evidence", () => {
    const white = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(300), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(-100)),
    ]);
    const black = explainPly(OPENING, 2, (game) => [
      analyzed(game, 0, cp(0)),
      analyzed(game, 1, cp(-300), { bestMoveUci: "c7c5" }),
      analyzed(game, 2, cp(100)),
    ]);
    expect(black.reason).toBe(white.reason);
    expect(black.summary).toBe(white.summary);
  });

  it("is a pure function of the review move, so board flips cannot change it", () => {
    const build = () =>
      explainPly(OPENING, 2, (game) => [
        analyzed(game, 0, cp(0)),
        analyzed(game, 1, cp(-300), { bestMoveUci: "c7c5" }),
        analyzed(game, 2, cp(100)),
      ]);
    expect(build()).toEqual(build());
  });
});

describe("missing and malformed evidence", () => {
  it("explains nothing when the classification is unavailable", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      undefined,
      analyzed(game, 1, cp(20)),
    ]);
    expect(explanation.reason).toBe("unavailable");
    expect(explanation.summary).toBe(
      "Detailed engine explanation unavailable for this move.",
    );
    expect(explanation.details).toBeUndefined();
  });

  it("omits the best move and line when no engine best was retained", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(300), { bestMoveUci: null }),
      analyzed(game, 1, cp(-300)),
    ]);
    expect(explanation.reason).toBe("large-eval-drop");
    expect(JSON.stringify(explanation)).not.toContain("Best was");
    expect(JSON.stringify(explanation)).not.toContain("Best line:");
  });

  it("degrades safely when a retained principal variation is illegal", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, mate(2), {
        candidates: [
          candidate(1, "d2d4", mate(2), ["d2d4", "h8h1"]),
          candidate(2, "e2e4", cp(30)),
        ],
      }),
      analyzed(game, 1, cp(30)),
    ]);
    expect(explanation.reason).toBe("missed-mate");
    expect(JSON.stringify(explanation)).not.toContain("Best line:");
  });

  it("bounds a long retained line to the documented ply limit", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, mate(5), {
        candidates: [
          candidate(1, "d2d4", mate(5), [
            "d2d4",
            "e7e5",
            "d4e5",
            "b8c6",
            "g1f3",
            "d8e7",
          ]),
          candidate(2, "e2e4", cp(30)),
        ],
      }),
      analyzed(game, 1, cp(30)),
    ]);
    const line = explanation.details?.at(-1) ?? "";
    expect(line.startsWith("Best line: ")).toBe(true);
    const sanMoves = line
      .slice("Best line: ".length)
      .split(" ")
      .filter((part) => /^[A-Za-z]/.test(part));
    expect(sanMoves).toHaveLength(EXPLANATION_PRINCIPAL_VARIATION_PLIES);
  });
});

describe("falsification: the explanation layer must not overclaim", () => {
  const separated = (game: ParsedReviewGame) => [
    analyzed(game, 0, cp(120), {
      candidates: [candidate(1, "e2e4", cp(120)), candidate(2, "d2d4", cp(10))],
    }),
    analyzed(game, 1, cp(120)),
  ];

  it("never converts candidate separation into a human-difficulty claim", () => {
    const text = JSON.stringify(explainPly(OPENING, 1, separated));
    for (const claim of [
      "hard to find",
      "difficult",
      "deep",
      "GM",
      "brilliant",
      "creative",
      "amazing",
      "spectacular",
    ]) {
      expect(text.toLowerCase()).not.toContain(claim.toLowerCase());
    }
  });

  it("never calls an exact best move a sacrifice without material evidence", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(20), { bestMoveUci: "e2e4" }),
      analyzed(game, 1, cp(20)),
    ]);
    expect(explanation.reason).not.toBe("brilliant-sacrifice");
    expect(explanation.summary).not.toContain("gives up material");
  });

  it("never invents material loss from a classification alone", () => {
    const explanation = explainPly(OPENING, 1, (game) => [
      analyzed(game, 0, cp(500), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(-500)),
    ]);
    expect(explanation.reason).toBe("large-eval-drop");
    expect(explanation.summary).not.toContain("loses a");
    expect(explanation.summary).not.toContain("points of material");
  });

  it("never describes an engine-endorsed sacrifice as losing material", () => {
    const explanation = explainPly(SACRIFICE, 1, (game) => [
      analyzed(game, 0, cp(50), {
        candidates: [
          candidate(1, "d1h5", cp(55), ["d1h5", "g6h5"]),
          candidate(2, "d1d2", cp(-80)),
        ],
      }),
      analyzed(game, 1, cp(55), { pv: ["g6h5"] }),
    ]);
    expect(explanation.reason).toBe("brilliant-sacrifice");
    expect(explanation.summary).not.toContain("loses");
  });

  it("never claims an unknown evaluation is equal", () => {
    const explanation = explainPly(OPENING, 1, () => [undefined, undefined]);
    expect(explanation.reason).toBe("unavailable");
    expect(JSON.stringify(explanation)).not.toContain("equal");
    expect(JSON.stringify(explanation)).not.toContain("0.00");
  });

  it("never uses accuracy or rating language", () => {
    const { review } = reviewFor(OPENING, (game) =>
      game.positions.map((_, index) => analyzed(game, index, cp(15 * index))),
    );
    const text = JSON.stringify(explainReviewMoves(review.moves)).toLowerCase();
    for (const claim of ["accuracy", "%", "rating", "elo", "performance"]) {
      expect(text).not.toContain(claim);
    }
  });

  it("never makes unsupported strategic claims", () => {
    const { review } = reviewFor(OPENING, (game) =>
      game.positions.map((_, index) =>
        analyzed(game, index, cp(30 - index * 40)),
      ),
    );
    const text = JSON.stringify(explainReviewMoves(review.moves)).toLowerCase();
    for (const claim of [
      "dark square",
      "king safety",
      "center",
      "tempo",
      "pressure",
      "attack",
      "development",
      "initiative",
      "weak",
      "positional",
    ]) {
      expect(text).not.toContain(claim);
    }
  });

  it("never claims an only move from candidate evidence alone", () => {
    const text = JSON.stringify(explainPly(OPENING, 1, separated));
    expect(text).not.toContain("only move");
    expect(text).not.toContain("only legal");
  });
});

describe("determinism and bounds", () => {
  it("lists every reason exactly once in the documented priority order", () => {
    expect(new Set(EXPLANATION_REASON_PRIORITY).size).toBe(
      EXPLANATION_REASON_PRIORITY.length,
    );
  });

  it("selects the first satisfied reason and never renders more than the detail bound", () => {
    const { review } = reviewFor(OPENING, (game) => [
      analyzed(game, 0, cp(300), { bestMoveUci: "d2d4" }),
      analyzed(game, 1, cp(-300), { bestMoveUci: "e7e5" }),
      analyzed(game, 2, cp(-300), { bestMoveUci: "g1f3" }),
      analyzed(game, 3, cp(-300), { bestMoveUci: "b8c6" }),
      analyzed(game, 4, cp(-300)),
    ]);
    for (const explanation of explainReviewMoves(review.moves)) {
      expect(EXPLANATION_REASON_PRIORITY).toContain(explanation.reason);
      expect((explanation.details ?? []).length).toBeLessThanOrEqual(
        EXPLANATION_MAXIMUM_DETAILS,
      );
    }
  });

  it("produces byte-identical text for identical evidence", () => {
    const build = () =>
      reviewFor(OPENING, (game) =>
        game.positions.map((_, index) =>
          analyzed(game, index, cp(40 - index * 30)),
        ),
      ).review;
    expect(JSON.stringify(explainReviewMoves(build().moves))).toBe(
      JSON.stringify(explainReviewMoves(build().moves)),
    );
  });

  it("formats every reason without throwing, for evidence-free facts", () => {
    const { review } = reviewFor(OPENING, (game) => [
      analyzed(game, 0, cp(0)),
      analyzed(game, 1, cp(0)),
    ]);
    const facts = deriveExplanationEvidence(review.moves[0]);
    for (const reason of EXPLANATION_REASON_PRIORITY) {
      const formatted = formatExplanation(reason as ExplanationReason, facts);
      expect(formatted.summary.length).toBeGreaterThan(0);
      expect(formatted.summary.endsWith(".")).toBe(true);
    }
  });

  it("agrees between the selector and the exported material gate", () => {
    const { review } = reviewFor(HANGING_QUEEN, (game) => [
      analyzed(game, 0, cp(400), { bestMoveUci: "d2d3" }),
      analyzed(game, 1, cp(-400), { pv: ["d8d5"] }),
    ]);
    const facts = deriveExplanationEvidence(review.moves[0]);
    expect(hasSupportedMaterialLoss(facts)).toBe(true);
    expect(selectPrimaryExplanation(facts)).toBe("lost-material");
  });
});
