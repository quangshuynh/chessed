import { Chess } from "chess.js";

import type {
  ParsedMove,
  ParsedReviewGame,
  PieceColor,
} from "@/lib/chess/types";
import type {
  EngineEvaluation,
  GamePositionAnalysis,
  TerminalGamePosition,
} from "@/lib/review/interfaces";

export type PlayerColor = "white" | "black";

export type PlayerRelativeEvaluation =
  | { kind: "centipawns"; perspective: "player"; value: number }
  | {
      kind: "mate";
      perspective: "player";
      outcome: "favorable" | "unfavorable";
      moves: number;
    };

export type MoveOutcome =
  | { kind: "engine"; evaluation: PlayerRelativeEvaluation }
  | {
      kind: "terminal";
      reason: TerminalGamePosition["reason"];
      result: "win" | "loss" | "draw";
    };

export type MateTransition =
  | "creates-forced-mate"
  | "newly-allows-forced-mate"
  | "throws-away-forced-mate"
  | "escapes-forced-mate"
  | "reverses-to-favorable-mate"
  | "reverses-to-unfavorable-mate"
  | "retains-favorable-mate"
  | "retains-unfavorable-mate";

export type EvaluationLoss =
  | {
      kind: "centipawns";
      /** before - after from the mover's perspective; negative means apparent improvement. */
      rawDifference: number;
      /** Non-negative loss used downstream. */
      value: number;
      apparentImprovement: boolean;
    }
  | {
      kind: "mate-transition";
      transition: MateTransition;
      centipawnLoss: null;
    }
  | {
      kind: "terminal";
      result: "win" | "loss" | "draw";
      centipawnLoss: null;
    }
  | {
      kind: "unavailable";
      reason: "missing-before-analysis" | "missing-after-analysis";
    };

export interface MoveQualityObservation {
  ply: number;
  player: PlayerColor;
  playedMoveUci: string;
  bestMoveUci: string | null;
  playedBestMove: boolean | null;
  before: PlayerRelativeEvaluation | null;
  after: MoveOutcome | null;
  loss: EvaluationLoss;
}

/** Convert the canonical White-relative score exactly once, at this boundary. */
export function toPlayerRelativeEvaluation(
  evaluation: EngineEvaluation,
  player: PlayerColor,
): PlayerRelativeEvaluation {
  const sign = player === "white" ? 1 : -1;
  if (evaluation.kind === "centipawns") {
    if (!Number.isFinite(evaluation.value)) {
      throw new Error("A centipawn evaluation must be finite.");
    }
    return {
      kind: "centipawns",
      perspective: "player",
      value: evaluation.value * sign,
    };
  }
  if (!Number.isInteger(evaluation.moves) || evaluation.moves === 0) {
    throw new Error("A mate evaluation must have a non-zero integer distance.");
  }
  const signedMate = evaluation.moves * sign;
  return {
    kind: "mate",
    perspective: "player",
    outcome: signedMate > 0 ? "favorable" : "unfavorable",
    moves: Math.abs(signedMate),
  };
}

function mateTransition(
  before: PlayerRelativeEvaluation,
  after: PlayerRelativeEvaluation,
): EvaluationLoss {
  if (before.kind === "centipawns" && after.kind === "mate") {
    return {
      kind: "mate-transition",
      transition:
        after.outcome === "favorable"
          ? "creates-forced-mate"
          : "newly-allows-forced-mate",
      centipawnLoss: null,
    };
  }
  if (before.kind === "mate" && after.kind === "centipawns") {
    return {
      kind: "mate-transition",
      transition:
        before.outcome === "favorable"
          ? "throws-away-forced-mate"
          : "escapes-forced-mate",
      centipawnLoss: null,
    };
  }
  if (before.kind !== "mate" || after.kind !== "mate") {
    throw new Error("A mate transition must contain a mate evaluation.");
  }
  const transition =
    before.outcome === after.outcome
      ? before.outcome === "favorable"
        ? "retains-favorable-mate"
        : "retains-unfavorable-mate"
      : after.outcome === "favorable"
        ? "reverses-to-favorable-mate"
        : "reverses-to-unfavorable-mate";
  return { kind: "mate-transition", transition, centipawnLoss: null };
}

export function measureEvaluationLoss(
  before: PlayerRelativeEvaluation,
  after: MoveOutcome,
): EvaluationLoss {
  if (after.kind === "terminal") {
    return { kind: "terminal", result: after.result, centipawnLoss: null };
  }
  if (before.kind === "centipawns" && after.evaluation.kind === "centipawns") {
    const rawDifference = before.value - after.evaluation.value;
    return {
      kind: "centipawns",
      rawDifference,
      value: Math.max(0, rawDifference),
      apparentImprovement: rawDifference < 0,
    };
  }
  return mateTransition(before, after.evaluation);
}

function colorName(color: PieceColor): PlayerColor {
  return color === "w" ? "white" : "black";
}

function normalizeLegalUci(fen: string, uci: string): string | null {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!match) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: match[1],
      to: match[2],
      promotion: match[3],
    });
    return move ? `${move.from}${move.to}${move.promotion ?? ""}` : null;
  } catch {
    return null;
  }
}

function terminalOutcome(
  terminal: TerminalGamePosition,
  player: PlayerColor,
): MoveOutcome {
  return {
    kind: "terminal",
    reason: terminal.reason,
    result:
      terminal.winner === null
        ? "draw"
        : terminal.winner === player
          ? "win"
          : "loss",
  };
}

/** Purely maps reconstructed moves plus normalized position observations. */
export function buildMoveQualityObservations(input: {
  game: ParsedReviewGame;
  positions: readonly (GamePositionAnalysis | null | undefined)[];
}): MoveQualityObservation[] {
  if (input.game.positions.length !== input.game.moves.length + 1) {
    throw new Error(
      "A reconstructed game must have one more position than move.",
    );
  }
  const byIndex = new Map<number, GamePositionAnalysis>();
  for (const position of input.positions) {
    if (!position) continue;
    if (byIndex.has(position.positionIndex)) {
      throw new Error(
        `Duplicate analysis for position ${position.positionIndex}.`,
      );
    }
    if (
      position.positionIndex < 0 ||
      position.positionIndex >= input.game.positions.length
    ) {
      throw new Error(
        `Analysis position index ${position.positionIndex} is out of range.`,
      );
    }
    const expectedFen = new Chess(
      input.game.positions[position.positionIndex],
    ).fen();
    const observedFen =
      position.status === "analyzed" ? position.analysis.fen : position.fen;
    if (new Chess(observedFen).fen() !== expectedFen) {
      throw new Error(
        `Analysis FEN does not match position ${position.positionIndex}.`,
      );
    }
    const expectedPly = input.game.moves[position.positionIndex]?.ply ?? null;
    if (
      position.status === "analyzed" &&
      position.followingMovePly !== expectedPly
    ) {
      throw new Error(
        `Analysis following move does not match position ${position.positionIndex}.`,
      );
    }
    if (
      position.status === "terminal" &&
      position.positionIndex !== input.game.positions.length - 1
    ) {
      throw new Error(
        "A terminal observation must be the game's final position.",
      );
    }
    byIndex.set(position.positionIndex, position);
  }

  return input.game.moves.map((move: ParsedMove, index) => {
    if (move.ply !== index + 1)
      throw new Error("Move plies must be contiguous.");
    const player = colorName(move.color);
    const beforePosition = byIndex.get(index);
    const afterPosition = byIndex.get(index + 1);
    const before =
      beforePosition?.status === "analyzed"
        ? toPlayerRelativeEvaluation(beforePosition.analysis.evaluation, player)
        : null;
    const after: MoveOutcome | null =
      afterPosition?.status === "analyzed"
        ? {
            kind: "engine",
            evaluation: toPlayerRelativeEvaluation(
              afterPosition.analysis.evaluation,
              player,
            ),
          }
        : afterPosition?.status === "terminal"
          ? terminalOutcome(afterPosition, player)
          : null;
    const bestMoveUci =
      beforePosition?.status === "analyzed"
        ? beforePosition.analysis.bestMoveUci
        : null;
    const normalizedBest = bestMoveUci
      ? normalizeLegalUci(input.game.positions[index], bestMoveUci)
      : null;
    if (bestMoveUci && !normalizedBest) {
      throw new Error(
        `Engine best move is illegal or malformed at ply ${move.ply}.`,
      );
    }
    const loss: EvaluationLoss = !before
      ? { kind: "unavailable", reason: "missing-before-analysis" }
      : !after
        ? { kind: "unavailable", reason: "missing-after-analysis" }
        : measureEvaluationLoss(before, after);

    return {
      ply: move.ply,
      player,
      playedMoveUci: move.uci,
      bestMoveUci,
      playedBestMove: normalizedBest ? normalizedBest === move.uci : null,
      before,
      after,
      loss,
    };
  });
}
