import { centipawnsToOutcomeExpectation } from "@/lib/review/classification";
import type { ReviewMove } from "@/lib/review/game-review";
import type {
  MoveOutcome,
  PlayerColor,
  PlayerRelativeEvaluation,
} from "@/lib/review/move-quality";

export const ACCURACY_METHODOLOGY_VERSION = "chessed-accuracy-v1";
export const ACCURACY_POWER = 4;

export interface MoveAccuracy {
  status: "scored";
  value: number;
  outcomeDrop: number;
}

export interface UnavailableMoveAccuracy {
  status: "unavailable";
  reason: "missing-evidence" | "inconsistent-evidence";
}

export type MoveAccuracyResult = MoveAccuracy | UnavailableMoveAccuracy;

export interface PlayerAccuracy {
  /** Full-precision percentage in [0, 100], or null when no move is scoreable. */
  value: number | null;
  scoredMoveCount: number;
  unavailableMoveCount: number;
}

export interface GameAccuracy {
  white: PlayerAccuracy;
  black: PlayerAccuracy;
  methodology: {
    version: typeof ACCURACY_METHODOLOGY_VERSION;
    outcomeExpectationScaleCentipawns: 410;
    perMoveTransform: "one-minus-drop-to-fourth-power";
    aggregation: "uniform-arithmetic-mean";
  };
}

function evaluationExpectation(evaluation: PlayerRelativeEvaluation): number {
  if (evaluation.kind === "centipawns") {
    return centipawnsToOutcomeExpectation(evaluation.value);
  }
  return evaluation.outcome === "favorable" ? 1 : 0;
}

function outcomeExpectation(outcome: MoveOutcome): number {
  if (outcome.kind === "engine") {
    return evaluationExpectation(outcome.evaluation);
  }
  if (outcome.result === "win") return 1;
  if (outcome.result === "loss") return 0;
  return 0.5;
}

/** Continuous, bounded preservation score for a normalized move. */
export function accuracyFromOutcomeDrop(outcomeDrop: number): number {
  if (!Number.isFinite(outcomeDrop) || outcomeDrop < 0 || outcomeDrop > 1) {
    throw new Error("Outcome drop must be finite and within [0, 1].");
  }
  return (1 - outcomeDrop) ** ACCURACY_POWER;
}

export function scoreMoveAccuracy(
  move: Pick<ReviewMove, "playerEvaluationBefore" | "playerOutcomeAfter">,
): MoveAccuracyResult {
  if (!move.playerEvaluationBefore || !move.playerOutcomeAfter) {
    return { status: "unavailable", reason: "missing-evidence" };
  }
  try {
    const before = evaluationExpectation(move.playerEvaluationBefore);
    const after = outcomeExpectation(move.playerOutcomeAfter);
    const outcomeDrop = Math.max(0, before - after);
    return {
      status: "scored",
      value: accuracyFromOutcomeDrop(outcomeDrop),
      outcomeDrop,
    };
  } catch {
    return { status: "unavailable", reason: "inconsistent-evidence" };
  }
}

function playerAccuracy(
  moves: readonly Pick<
    ReviewMove,
    "player" | "playerEvaluationBefore" | "playerOutcomeAfter"
  >[],
  player: PlayerColor,
): PlayerAccuracy {
  const results = moves
    .filter((move) => move.player === player)
    .map(scoreMoveAccuracy);
  const scored = results.filter(
    (result): result is MoveAccuracy => result.status === "scored",
  );
  return {
    value:
      scored.length === 0
        ? null
        : (100 * scored.reduce((sum, result) => sum + result.value, 0)) /
          scored.length,
    scoredMoveCount: scored.length,
    unavailableMoveCount: results.length - scored.length,
  };
}

export function calculateGameAccuracy(
  moves: readonly Pick<
    ReviewMove,
    "player" | "playerEvaluationBefore" | "playerOutcomeAfter"
  >[],
): GameAccuracy {
  return {
    white: playerAccuracy(moves, "white"),
    black: playerAccuracy(moves, "black"),
    methodology: {
      version: ACCURACY_METHODOLOGY_VERSION,
      outcomeExpectationScaleCentipawns: 410,
      perMoveTransform: "one-minus-drop-to-fourth-power",
      aggregation: "uniform-arithmetic-mean",
    },
  };
}
