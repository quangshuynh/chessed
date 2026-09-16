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

export function classifySpecialMove(input: {
  fenBefore: string;
  playedMoveUci: string;
  player: PlayerColor;
  ordinary: MoveClassification;
  analysisBefore: PositionAnalysis | null;
  analysisAfter: PositionAnalysis | null;
  terminalResult: "win" | "loss" | "draw" | null;
}): SpecialClassificationResult | null {
  if (input.ordinary.status !== "classified" || !input.analysisBefore) {
    return null;
  }
  const candidates = rankedCandidates(input.analysisBefore);
  if (!candidates) return null;
  const [best, second] = candidates;
  const separation = candidateSeparation(best, second, input.player);
  const color = input.player === "white" ? "w" : "b";
  const bestLineMaterial = projectMaterial(
    input.fenBefore,
    best.principalVariationUci,
    color,
  );
  if (!bestLineMaterial || separation === null) return null;
  const commonEvidence = {
    candidateCount: candidates.length,
    candidateOutcomeSeparation: separation,
    bestLineMaterial,
  };
  const playedBest = input.playedMoveUci === best.moveUci;
  const chess = new Chess(input.fenBefore);
  const legalMoveCount = chess.moves().length;
  const beforeExpectation = expectation(
    input.analysisBefore.evaluation,
    input.player,
  );
  const bestExpectation = expectation(best.evaluation, input.player);

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
      classification: "brilliant",
      evidence: { ...commonEvidence, rule: "exceptional-sacrifice" },
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
      classification: "great",
      evidence: { ...commonEvidence, rule: "narrow-critical-move" },
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
        classification: "miss",
        evidence: { ...commonEvidence, rule: "missed-forced-mate" },
      };
    }
    const materialGain =
      bestLineMaterial.finalBalance - bestLineMaterial.initialBalance;
    if (
      outcomeDrop >= SPECIAL_CLASSIFICATION_POLICY.missMinimumOutcomeDrop &&
      materialGain >= SPECIAL_CLASSIFICATION_POLICY.missMinimumMaterialGain
    ) {
      return {
        classification: "miss",
        evidence: { ...commonEvidence, rule: "missed-material-win" },
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
        classification: "miss",
        evidence: { ...commonEvidence, rule: "missed-forcing-resource" },
      };
    }
  }
  return null;
}
