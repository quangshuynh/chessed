import { Chess } from "chess.js";

import { projectMaterial, type MaterialProjection } from "@/lib/chess/material";
import {
  centipawnsToOutcomeExpectation,
  type MoveClassification,
} from "@/lib/review/classification";
import type {
  EngineCandidate,
  EngineEvaluation,
  PositionAnalysis,
} from "@/lib/review/interfaces";
import type { PlayerColor } from "@/lib/review/move-quality";

export type SpecialMoveClassification = "great" | "brilliant" | "miss";

export const SPECIAL_CLASSIFICATION_POLICY = {
  requiredCandidateCount: 2,
  greatMinimumOutcomeSeparation: 0.04,
  brilliantMinimumOutcomeSeparation: 0.025,
  brilliantMinimumMaterialExposure: 3,
  brilliantMinimumSustainedMaterialLoss: 1,
  brilliantMinimumOutcomeExpectation: 0.5,
  brilliantMaximumPriorOutcomeExpectation: 0.9,
  missMinimumOutcomeDrop: 0.025,
  missMinimumMaterialGain: 5,
  missNarrowMinimumOutcomeSeparation: 0.075,
} as const;

export interface SpecialClassificationEvidence {
  candidateCount: number;
  candidateOutcomeSeparation: number | null;
  bestLineMaterial: MaterialProjection | null;
  rule:
    | "exceptional-sacrifice"
    | "narrow-critical-move"
    | "missed-forced-mate"
    | "missed-material-win"
    | "missed-forcing-resource";
}

export interface SpecialClassificationResult {
  classification: SpecialMoveClassification;
  evidence: SpecialClassificationEvidence;
}

export type SpecialClassificationReason =
  | "ordinary-classification-unavailable"
  | "before-analysis-unavailable"
  | "incomplete-candidate-evidence"
  | "illegal-best-line"
  | "played-move-is-not-rank-one"
  | "ordinary-result-is-not-best"
  | "forced-only-legal-move"
  | "terminal-move"
  | "promotion-excluded-from-brilliant"
  | "prior-expectation-unavailable"
  | "already-overwhelmingly-winning"
  | "best-expectation-unavailable"
  | "compensation-insufficient"
  | "brilliant-separation-insufficient"
  | "great-separation-insufficient"
  | "material-exposure-insufficient"
  | "material-not-sustained"
  | "played-move-retains-mate"
  | "material-opportunity-insufficient"
  | "outcome-loss-insufficient"
  | "forcing-evidence-insufficient"
  | "no-concrete-missed-opportunity";

/** Pure policy trace used by calibration and future deterministic explanations. */
export interface SpecialClassificationAudit {
  result: SpecialClassificationResult | null;
  reasons: readonly SpecialClassificationReason[];
  evidence: SpecialPolicyEvidence | null;
}

export interface SpecialPolicyEvidence {
  candidateCount: number;
  candidateOutcomeSeparation: number;
  bestLineMaterial: MaterialProjection;
  playedRank: number | null;
  legalMoveCount: number;
  beforeOutcomeExpectation: number | null;
  bestOutcomeExpectation: number | null;
  outcomeDrop: number | null;
  terminalResult: "win" | "loss" | "draw" | null;
}

function playerEvaluation(
  evaluation: EngineEvaluation,
  player: PlayerColor,
): EngineEvaluation {
  const sign = player === "white" ? 1 : -1;
  return evaluation.kind === "centipawns"
    ? { ...evaluation, value: evaluation.value * sign }
    : { ...evaluation, moves: evaluation.moves * sign };
}

function expectation(
  evaluation: EngineEvaluation,
  player: PlayerColor,
): number | null {
  const relative = playerEvaluation(evaluation, player);
  return relative.kind === "centipawns"
    ? centipawnsToOutcomeExpectation(relative.value)
    : null;
}

function favorableMate(
  evaluation: EngineEvaluation,
  player: PlayerColor,
): boolean {
  const relative = playerEvaluation(evaluation, player);
  return relative.kind === "mate" && relative.moves > 0;
}

function candidateSeparation(
  best: EngineCandidate,
  alternative: EngineCandidate,
  player: PlayerColor,
): number | null {
  const bestExpectation = expectation(best.evaluation, player);
  const alternativeExpectation = expectation(alternative.evaluation, player);
  if (bestExpectation !== null && alternativeExpectation !== null) {
    return Math.max(0, bestExpectation - alternativeExpectation);
  }
  if (favorableMate(best.evaluation, player)) {
    return favorableMate(alternative.evaluation, player) ? 0 : 1;
  }
  return 0;
}

function rankedCandidates(
  analysis: PositionAnalysis,
): readonly EngineCandidate[] | null {
  const candidates = [...(analysis.candidates ?? [])].sort(
    (left, right) => left.rank - right.rank,
  );
  if (
    candidates.length < SPECIAL_CLASSIFICATION_POLICY.requiredCandidateCount ||
    candidates[0]?.rank !== 1 ||
    candidates[1]?.rank !== 2 ||
    candidates.some(
      (candidate, index) =>
        candidate.rank !== index + 1 ||
        candidate.moveUci !== candidate.principalVariationUci[0],
    )
  ) {
    return null;
  }
  return candidates;
}

export function evaluateSpecialMove(input: {
  fenBefore: string;
  playedMoveUci: string;
  player: PlayerColor;
  ordinary: MoveClassification;
  analysisBefore: PositionAnalysis | null;
  analysisAfter: PositionAnalysis | null;
  terminalResult: "win" | "loss" | "draw" | null;
}): SpecialClassificationAudit {
  if (input.ordinary.status !== "classified") {
    return {
      result: null,
      reasons: ["ordinary-classification-unavailable"],
      evidence: null,
    };
  }
  if (!input.analysisBefore) {
    return {
      result: null,
      reasons: ["before-analysis-unavailable"],
      evidence: null,
    };
  }
  const chess = new Chess(input.fenBefore);
  const legalMoveCount = chess.moves().length;
  const candidates = rankedCandidates(input.analysisBefore);
  if (!candidates) {
    return {
      result: null,
      reasons: [
        "incomplete-candidate-evidence",
        ...(legalMoveCount <= 1 ? (["forced-only-legal-move"] as const) : []),
      ],
      evidence: null,
    };
  }
  const [best, second] = candidates;
  const separation = candidateSeparation(best, second, input.player);
  const color = input.player === "white" ? "w" : "b";
  const bestLineMaterial = projectMaterial(
    input.fenBefore,
    best.principalVariationUci,
    color,
  );
  if (!bestLineMaterial || separation === null) {
    return { result: null, reasons: ["illegal-best-line"], evidence: null };
  }
  const commonEvidence = {
    candidateCount: candidates.length,
    candidateOutcomeSeparation: separation,
    bestLineMaterial,
  };
  const playedBest = input.playedMoveUci === best.moveUci;
  const beforeExpectation = expectation(
    input.analysisBefore.evaluation,
    input.player,
  );
  const bestExpectation = expectation(best.evaluation, input.player);
  const policyEvidence: SpecialPolicyEvidence = {
    candidateCount: candidates.length,
    candidateOutcomeSeparation: separation,
    bestLineMaterial,
    playedRank:
      candidates.find((candidate) => candidate.moveUci === input.playedMoveUci)
        ?.rank ?? null,
    legalMoveCount,
    beforeOutcomeExpectation: beforeExpectation,
    bestOutcomeExpectation: bestExpectation,
    outcomeDrop: input.ordinary.evidence.outcomeDrop,
    terminalResult: input.terminalResult,
  };

  if (
    playedBest &&
    input.ordinary.classification === "best" &&
    legalMoveCount > 1 &&
    !bestLineMaterial.firstMove.promotion &&
    input.terminalResult === null &&
    beforeExpectation !== null &&
    beforeExpectation <=
      SPECIAL_CLASSIFICATION_POLICY.brilliantMaximumPriorOutcomeExpectation &&
    bestExpectation !== null &&
    bestExpectation >=
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumOutcomeExpectation &&
    separation >=
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumOutcomeSeparation &&
    bestLineMaterial.exposure >=
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumMaterialExposure &&
    bestLineMaterial.sustainedLoss >=
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumSustainedMaterialLoss
  ) {
    return {
      result: {
        classification: "brilliant",
        evidence: { ...commonEvidence, rule: "exceptional-sacrifice" },
      },
      reasons: [],
      evidence: policyEvidence,
    };
  }

  if (
    playedBest &&
    input.ordinary.classification === "best" &&
    legalMoveCount > 1 &&
    input.terminalResult === null &&
    (bestLineMaterial.exposure <
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumMaterialExposure ||
      favorableMate(best.evaluation, input.player) ||
      (bestExpectation !== null &&
        bestExpectation >=
          SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumOutcomeExpectation)) &&
    separation >= SPECIAL_CLASSIFICATION_POLICY.greatMinimumOutcomeSeparation
  ) {
    return {
      result: {
        classification: "great",
        evidence: { ...commonEvidence, rule: "narrow-critical-move" },
      },
      reasons: [],
      evidence: policyEvidence,
    };
  }

  if (!playedBest) {
    const outcomeDrop = input.ordinary.evidence.outcomeDrop ?? 0;
    const playedRetainsMate =
      input.analysisAfter !== null &&
      favorableMate(input.analysisAfter.evaluation, input.player);
    if (
      favorableMate(best.evaluation, input.player) &&
      !playedRetainsMate &&
      input.terminalResult !== "win"
    ) {
      return {
        result: {
          classification: "miss",
          evidence: { ...commonEvidence, rule: "missed-forced-mate" },
        },
        reasons: [],
        evidence: policyEvidence,
      };
    }
    const materialGain =
      bestLineMaterial.finalBalance - bestLineMaterial.initialBalance;
    if (
      outcomeDrop >= SPECIAL_CLASSIFICATION_POLICY.missMinimumOutcomeDrop &&
      materialGain >= SPECIAL_CLASSIFICATION_POLICY.missMinimumMaterialGain
    ) {
      return {
        result: {
          classification: "miss",
          evidence: { ...commonEvidence, rule: "missed-material-win" },
        },
        reasons: [],
        evidence: policyEvidence,
      };
    }
    if (
      outcomeDrop >=
        SPECIAL_CLASSIFICATION_POLICY.missNarrowMinimumOutcomeSeparation &&
      separation >=
        SPECIAL_CLASSIFICATION_POLICY.missNarrowMinimumOutcomeSeparation &&
      (bestLineMaterial.firstMove.capture ||
        bestLineMaterial.firstMove.check ||
        bestLineMaterial.firstMove.promotion)
    ) {
      return {
        result: {
          classification: "miss",
          evidence: { ...commonEvidence, rule: "missed-forcing-resource" },
        },
        reasons: [],
        evidence: policyEvidence,
      };
    }
  }
  const reasons = new Set<SpecialClassificationReason>();
  if (playedBest) {
    if (input.ordinary.classification !== "best")
      reasons.add("ordinary-result-is-not-best");
    if (legalMoveCount <= 1) reasons.add("forced-only-legal-move");
    if (input.terminalResult !== null) reasons.add("terminal-move");
    if (bestLineMaterial.firstMove.promotion)
      reasons.add("promotion-excluded-from-brilliant");
    if (beforeExpectation === null)
      reasons.add("prior-expectation-unavailable");
    else if (
      beforeExpectation >
      SPECIAL_CLASSIFICATION_POLICY.brilliantMaximumPriorOutcomeExpectation
    )
      reasons.add("already-overwhelmingly-winning");
    if (bestExpectation === null) reasons.add("best-expectation-unavailable");
    else if (
      bestExpectation <
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumOutcomeExpectation
    )
      reasons.add("compensation-insufficient");
    if (
      separation <
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumOutcomeSeparation
    )
      reasons.add("brilliant-separation-insufficient");
    if (
      separation < SPECIAL_CLASSIFICATION_POLICY.greatMinimumOutcomeSeparation
    )
      reasons.add("great-separation-insufficient");
    if (
      bestLineMaterial.exposure <
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumMaterialExposure
    )
      reasons.add("material-exposure-insufficient");
    if (
      bestLineMaterial.sustainedLoss <
      SPECIAL_CLASSIFICATION_POLICY.brilliantMinimumSustainedMaterialLoss
    )
      reasons.add("material-not-sustained");
  } else {
    reasons.add("played-move-is-not-rank-one");
    const outcomeDrop = input.ordinary.evidence.outcomeDrop ?? 0;
    if (
      input.analysisAfter !== null &&
      favorableMate(input.analysisAfter.evaluation, input.player)
    )
      reasons.add("played-move-retains-mate");
    if (
      bestLineMaterial.finalBalance - bestLineMaterial.initialBalance <
      SPECIAL_CLASSIFICATION_POLICY.missMinimumMaterialGain
    )
      reasons.add("material-opportunity-insufficient");
    if (outcomeDrop < SPECIAL_CLASSIFICATION_POLICY.missMinimumOutcomeDrop)
      reasons.add("outcome-loss-insufficient");
    if (
      !bestLineMaterial.firstMove.capture &&
      !bestLineMaterial.firstMove.check &&
      !bestLineMaterial.firstMove.promotion
    )
      reasons.add("forcing-evidence-insufficient");
    reasons.add("no-concrete-missed-opportunity");
  }
  return { result: null, reasons: [...reasons], evidence: policyEvidence };
}

export function classifySpecialMove(
  input: Parameters<typeof evaluateSpecialMove>[0],
): SpecialClassificationResult | null {
  return evaluateSpecialMove(input).result;
}
