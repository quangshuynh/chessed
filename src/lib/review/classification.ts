import type { TerminalReason } from "@/lib/review/interfaces";
import type {
  MateTransition,
  MoveQualityObservation,
  PlayerRelativeEvaluation,
} from "@/lib/review/move-quality";

export type OrdinaryMoveClassification =
  "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/**
 * A Chessed-specific outcome-expectation proxy. It is bounded and symmetric,
 * but it is not asserted to be a literal human win probability.
 */
export const OUTCOME_EXPECTATION_SCALE_CENTIPAWNS = 410;

export const ORDINARY_CLASSIFICATION_THRESHOLDS = {
  equivalentBestMaximumCentipawnLoss: 15,
  equivalentBestMaximumOutcomeDrop: 0.01,
  inaccuracyMinimumOutcomeDrop: 0.025,
  mistakeMinimumOutcomeDrop: 0.075,
  blunderMinimumOutcomeDrop: 0.15,
} as const;

const OUTCOME_BOUNDARY_EPSILON = 1e-12;

export type ClassificationRule =
  | "engine-best-match"
  | "equivalent-best"
  | "outcome-drop"
  | "mate-transition"
  | "mate-distance"
  | "terminal-win"
  | "terminal-loss"
  | "terminal-draw";

export interface ClassificationEvidence {
  rule: ClassificationRule;
  beforeExpectation: number | null;
  afterExpectation: number | null;
  outcomeDrop: number | null;
  centipawnLoss: number | null;
  rawCentipawnDifference: number | null;
  mateTransition: MateTransition | null;
  terminalReason: TerminalReason | null;
}

export type MoveClassification =
  | {
      status: "classified";
      classification: OrdinaryMoveClassification;
      evidence: ClassificationEvidence;
    }
  | {
      status: "unavailable";
      reason:
        | "missing-before-analysis"
        | "missing-after-analysis"
        | "inconsistent-observation";
    };

export function centipawnsToOutcomeExpectation(centipawns: number): number {
  if (!Number.isFinite(centipawns)) {
    throw new Error("A centipawn evaluation must be finite.");
  }
  return 1 / (1 + Math.exp(-centipawns / OUTCOME_EXPECTATION_SCALE_CENTIPAWNS));
}

function fromOutcomeDrop(outcomeDrop: number): OrdinaryMoveClassification {
  if (
    outcomeDrop + OUTCOME_BOUNDARY_EPSILON >=
    ORDINARY_CLASSIFICATION_THRESHOLDS.blunderMinimumOutcomeDrop
  )
    return "blunder";
  if (
    outcomeDrop + OUTCOME_BOUNDARY_EPSILON >=
    ORDINARY_CLASSIFICATION_THRESHOLDS.mistakeMinimumOutcomeDrop
  )
    return "mistake";
  if (
    outcomeDrop + OUTCOME_BOUNDARY_EPSILON >=
    ORDINARY_CLASSIFICATION_THRESHOLDS.inaccuracyMinimumOutcomeDrop
  )
    return "inaccuracy";
  return "good";
}

function evidence(
  rule: ClassificationRule,
  values: Partial<Omit<ClassificationEvidence, "rule">> = {},
): ClassificationEvidence {
  return {
    rule,
    beforeExpectation: null,
    afterExpectation: null,
    outcomeDrop: null,
    centipawnLoss: null,
    rawCentipawnDifference: null,
    mateTransition: null,
    terminalReason: null,
    ...values,
  };
}

function classified(
  classification: OrdinaryMoveClassification,
  classificationEvidence: ClassificationEvidence,
): MoveClassification {
  return {
    status: "classified",
    classification,
    evidence: classificationEvidence,
  };
}

function validEvaluation(value: PlayerRelativeEvaluation | null): boolean {
  if (!value) return false;
  return value.kind === "centipawns"
    ? Number.isFinite(value.value)
    : Number.isInteger(value.moves) && value.moves > 0;
}

function hasConsistentIdentity(observation: MoveQualityObservation): boolean {
  if (observation.playedBestMove === null)
    return observation.bestMoveUci === null;
  if (observation.bestMoveUci === null) return false;
  return (
    !observation.playedBestMove ||
    observation.playedMoveUci === observation.bestMoveUci
  );
}

function expectedMateTransition(
  before: PlayerRelativeEvaluation,
  after: PlayerRelativeEvaluation,
): MateTransition | null {
  if (before.kind === "centipawns" && after.kind === "mate") {
    return after.outcome === "favorable"
      ? "creates-forced-mate"
      : "newly-allows-forced-mate";
  }
  if (before.kind === "mate" && after.kind === "centipawns") {
    return before.outcome === "favorable"
      ? "throws-away-forced-mate"
      : "escapes-forced-mate";
  }
  if (before.kind !== "mate" || after.kind !== "mate") return null;
  if (before.outcome === after.outcome) {
    return before.outcome === "favorable"
      ? "retains-favorable-mate"
      : "retains-unfavorable-mate";
  }
  return after.outcome === "favorable"
    ? "reverses-to-favorable-mate"
    : "reverses-to-unfavorable-mate";
}

function classifyMateTransition(
  observation: MoveQualityObservation,
): MoveClassification {
  if (
    observation.loss.kind !== "mate-transition" ||
    observation.before === null ||
    observation.after?.kind !== "engine" ||
    !validEvaluation(observation.before) ||
    !validEvaluation(observation.after.evaluation) ||
    expectedMateTransition(observation.before, observation.after.evaluation) !==
      observation.loss.transition
  ) {
    return { status: "unavailable", reason: "inconsistent-observation" };
  }

  const transition = observation.loss.transition;
  const decisive: Partial<Record<MateTransition, OrdinaryMoveClassification>> =
    {
      "creates-forced-mate": "best",
      "escapes-forced-mate": "best",
      "reverses-to-favorable-mate": "best",
      "newly-allows-forced-mate": "blunder",
      "throws-away-forced-mate": "blunder",
      "reverses-to-unfavorable-mate": "blunder",
    };
  const decisiveClassification = decisive[transition];
  if (decisiveClassification) {
    return classified(
      decisiveClassification,
      evidence("mate-transition", { mateTransition: transition }),
    );
  }

  if (
    observation.before.kind !== "mate" ||
    observation.after.evaluation.kind !== "mate"
  ) {
    return { status: "unavailable", reason: "inconsistent-observation" };
  }
  const beforeMoves = observation.before.moves;
  const afterMoves = observation.after.evaluation.moves;
  const preservesOrImprovesDistance =
    transition === "retains-favorable-mate"
      ? afterMoves <= beforeMoves
      : afterMoves >= beforeMoves;
  return classified(
    observation.playedBestMove === true || preservesOrImprovesDistance
      ? "best"
      : "good",
    evidence("mate-distance", { mateTransition: transition }),
  );
}

function classifyTerminal(
  observation: MoveQualityObservation,
): MoveClassification {
  if (
    observation.loss.kind !== "terminal" ||
    observation.after?.kind !== "terminal" ||
    observation.loss.result !== observation.after.result ||
    (observation.after.reason === "checkmate") !==
      (observation.after.result !== "draw") ||
    observation.before === null ||
    !validEvaluation(observation.before)
  ) {
    return { status: "unavailable", reason: "inconsistent-observation" };
  }
  const terminalReason = observation.after.reason;
  if (observation.after.result === "win") {
    return classified("best", evidence("terminal-win", { terminalReason }));
  }
  if (observation.after.result === "loss") {
    return classified("blunder", evidence("terminal-loss", { terminalReason }));
  }
  if (observation.before.kind === "mate") {
    return classified(
      observation.before.outcome === "favorable" ? "blunder" : "best",
      evidence("terminal-draw", { terminalReason }),
    );
  }
  const beforeExpectation = centipawnsToOutcomeExpectation(
    observation.before.value,
  );
  const afterExpectation = 0.5;
  const outcomeDrop = Math.max(0, beforeExpectation - afterExpectation);
  return classified(
    observation.playedBestMove === true ? "best" : fromOutcomeDrop(outcomeDrop),
    evidence("terminal-draw", {
      beforeExpectation,
      afterExpectation,
      outcomeDrop,
      terminalReason,
    }),
  );
}

/** Classify one complete, normalized move-quality observation. */
export function classifyMove(
  observation: MoveQualityObservation,
): MoveClassification {
  if (observation.loss.kind === "unavailable") {
    return { status: "unavailable", reason: observation.loss.reason };
  }
  if (!hasConsistentIdentity(observation)) {
    return { status: "unavailable", reason: "inconsistent-observation" };
  }
  if (observation.loss.kind === "terminal") {
    return classifyTerminal(observation);
  }
  if (observation.loss.kind === "mate-transition") {
    return classifyMateTransition(observation);
  }
  if (
    observation.before?.kind !== "centipawns" ||
    observation.after?.kind !== "engine" ||
    observation.after.evaluation.kind !== "centipawns" ||
    !validEvaluation(observation.before) ||
    !validEvaluation(observation.after.evaluation)
  ) {
    return { status: "unavailable", reason: "inconsistent-observation" };
  }

  const expectedRawDifference =
    observation.before.value - observation.after.evaluation.value;
  const expectedLoss = Math.max(0, expectedRawDifference);
  if (
    observation.loss.rawDifference !== expectedRawDifference ||
    observation.loss.value !== expectedLoss ||
    observation.loss.apparentImprovement !== expectedRawDifference < 0
  ) {
    return { status: "unavailable", reason: "inconsistent-observation" };
  }

  const beforeExpectation = centipawnsToOutcomeExpectation(
    observation.before.value,
  );
  const afterExpectation = centipawnsToOutcomeExpectation(
    observation.after.evaluation.value,
  );
  const outcomeDrop = Math.max(0, beforeExpectation - afterExpectation);
  const numericEvidence = {
    beforeExpectation,
    afterExpectation,
    outcomeDrop,
    centipawnLoss: observation.loss.value,
    rawCentipawnDifference: observation.loss.rawDifference,
  };

  if (observation.playedBestMove === true) {
    return classified("best", evidence("engine-best-match", numericEvidence));
  }
  if (
    observation.loss.rawDifference >= 0 &&
    observation.loss.value <=
      ORDINARY_CLASSIFICATION_THRESHOLDS.equivalentBestMaximumCentipawnLoss &&
    outcomeDrop <=
      ORDINARY_CLASSIFICATION_THRESHOLDS.equivalentBestMaximumOutcomeDrop
  ) {
    return classified("best", evidence("equivalent-best", numericEvidence));
  }
  return classified(
    fromOutcomeDrop(outcomeDrop),
    evidence("outcome-drop", numericEvidence),
  );
}
