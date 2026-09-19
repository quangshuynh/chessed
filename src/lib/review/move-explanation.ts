import { Chess } from "chess.js";

import {
  MATERIAL_VALUES,
  materialBalance,
  projectMaterial,
  type MaterialPiece,
  type MaterialProjection,
} from "@/lib/chess/material";
import { formatPrincipalVariation, uciMoveToSan } from "@/lib/chess/notation";
import type { OrdinaryMoveClassification } from "@/lib/review/classification";
import type { ReviewMove } from "@/lib/review/game-review";
import type { EngineEvaluation, TerminalReason } from "@/lib/review/interfaces";
import type {
  MateTransition,
  PlayerColor,
  PlayerRelativeEvaluation,
} from "@/lib/review/move-quality";
import type {
  SpecialClassificationEvidence,
  SpecialMoveClassification,
} from "@/lib/review/special-classification";

/**
 * Deterministic move explanations.
 *
 * This layer renders evidence the frozen `chessed-review-v3` result already
 * contains. It is not a classifier, not a scoring methodology, and not a coach:
 * it never runs the engine, never asks for more depth or candidates, and never
 * asserts a chess concept the retained evidence cannot establish. Identical
 * evidence always produces identical text.
 */

/** Display-only position bands. They never touch canonical evaluation. */
export const EXPLANATION_STATE_BOUNDS_CENTIPAWNS = {
  /** Below this mover-relative magnitude the position reads as roughly equal. */
  equal: 50,
  /** At or above this magnitude one side holds a clear advantage. */
  clear: 150,
  /** At or above this magnitude the position reads as decided. */
  decisive: 400,
} as const;

/** Material thresholds before a move is described as losing material. */
export const EXPLANATION_MATERIAL_THRESHOLDS = {
  /** Minimum mover-relative loss, in points, over the retained continuation. */
  minimumNetSwing: 3,
} as const;

/** Maximum plies of already-retained principal variation ever shown. */
export const EXPLANATION_PRINCIPAL_VARIATION_PLIES = 4;

/** Maximum explanation details ever rendered, so one move stays readable. */
export const EXPLANATION_MAXIMUM_DETAILS = 2;

export type ExplanationPositionState =
  | "roughly-equal"
  | "slight-advantage"
  | "clear-advantage"
  | "winning"
  | "slight-disadvantage"
  | "clear-disadvantage"
  | "losing"
  | "forced-mate-for"
  | "forced-mate-against";

export type ExplanationReason =
  | "terminal-checkmate-delivered"
  | "terminal-loss"
  | "terminal-draw"
  | "allowed-mate"
  | "missed-mate"
  | "found-mate"
  | "escaped-mate"
  | "retained-mate"
  | "retained-mate-against"
  | "brilliant-sacrifice"
  | "critical-best-move"
  | "missed-material-win"
  | "missed-forcing-resource"
  | "lost-material"
  | "large-eval-drop"
  | "moderate-eval-drop"
  | "slight-eval-drop"
  | "preserved-winning-position"
  | "best-move"
  | "near-best-move"
  | "sound-move"
  | "unavailable";

/**
 * Deterministic priority. The first reason whose evidence is satisfied wins.
 * Concrete, checkable events outrank generic evaluation movement, and error
 * reasons outrank their non-error counterparts so an explanation justifies the
 * classification instead of restating it.
 */
export const EXPLANATION_REASON_PRIORITY: readonly ExplanationReason[] = [
  "terminal-checkmate-delivered",
  "terminal-loss",
  "terminal-draw",
  "allowed-mate",
  "missed-mate",
  "found-mate",
  "escaped-mate",
  "retained-mate",
  "retained-mate-against",
  "brilliant-sacrifice",
  "critical-best-move",
  "missed-material-win",
  "missed-forcing-resource",
  "lost-material",
  "large-eval-drop",
  "moderate-eval-drop",
  "slight-eval-drop",
  "preserved-winning-position",
  "best-move",
  "near-best-move",
  "sound-move",
  "unavailable",
];

export interface PlayedMoveMaterial {
  /** The piece the played move itself captured; certain from the legal move. */
  capturedPiece: MaterialPiece | null;
  capturedValue: number;
  enPassant: boolean;
  promotionPiece: MaterialPiece | null;
  /** Mover-relative balance change across the played move alone. */
  immediateSwing: number;
  /**
   * Mover-relative balance change from before the move to the end of the
   * already-retained continuation after it. Null when no legal line was kept.
   */
  projectedSwing: number | null;
  /** The piece the opponent's first retained reply captures, if any. */
  replyCapturedPiece: MaterialPiece | null;
  replyCapturedValue: number;
}

export type ExplanationEvidence =
  | {
      kind: "classification";
      ordinary: OrdinaryMoveClassification | null;
      special: SpecialMoveClassification | null;
    }
  | { kind: "engine-best"; san: string | null; playedBestMove: boolean | null }
  | {
      kind: "evaluation";
      before: EngineEvaluation | null;
      after: EngineEvaluation | null;
      beforeState: ExplanationPositionState | null;
      afterState: ExplanationPositionState | null;
    }
  | { kind: "centipawn-loss"; value: number }
  | { kind: "outcome-drop"; value: number }
  | { kind: "mate-transition"; transition: MateTransition }
  | { kind: "mate-distance"; before: number | null; after: number | null }
  | {
      kind: "terminal";
      reason: TerminalReason;
      result: "win" | "loss" | "draw";
    }
  | { kind: "played-material"; material: PlayedMoveMaterial }
  | { kind: "best-line-material"; material: MaterialProjection }
  | {
      kind: "candidate-separation";
      value: number;
      candidateCount: number;
      confirmation: SpecialClassificationEvidence["greatConfirmation"];
    }
  | { kind: "principal-variation"; text: string; plyCount: number };

export interface ExplanationFacts {
  ply: number;
  moveNumber: number;
  player: PlayerColor;
  san: string;
  ordinary: OrdinaryMoveClassification | null;
  special: SpecialMoveClassification | null;
  specialRule: SpecialClassificationEvidence["rule"] | null;
  specialEvidence: SpecialClassificationEvidence | null;
  playedBestMove: boolean | null;
  bestMoveSan: string | null;
  equivalentBest: boolean;
  evaluationBefore: EngineEvaluation | null;
  evaluationAfter: EngineEvaluation | null;
  playerEvaluationBefore: PlayerRelativeEvaluation | null;
  playerEvaluationAfter: PlayerRelativeEvaluation | null;
  beforeState: ExplanationPositionState | null;
  afterState: ExplanationPositionState | null;
  centipawnLoss: number | null;
  outcomeDrop: number | null;
  mateTransition: MateTransition | null;
  mateMovesBefore: number | null;
  mateMovesAfter: number | null;
  terminal: { reason: TerminalReason; result: "win" | "loss" | "draw" } | null;
  playedMaterial: PlayedMoveMaterial | null;
  bestLineMaterial: MaterialProjection | null;
  candidateSeparation: number | null;
  candidateCount: number | null;
  principalVariation: { text: string; plyCount: number } | null;
}

export interface MoveExplanation {
  reason: ExplanationReason;
  summary: string;
  details?: string[];
  evidence: ExplanationEvidence[];
}

const PIECE_NAMES: Record<MaterialPiece, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
};

const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

function moverColor(player: PlayerColor): "w" | "b" {
  return player === "white" ? "w" : "b";
}

/** Display-only band for one mover-relative evaluation. */
export function toPositionState(
  evaluation: PlayerRelativeEvaluation | null,
): ExplanationPositionState | null {
  if (!evaluation) return null;
  if (evaluation.kind === "mate") {
    return evaluation.outcome === "favorable"
      ? "forced-mate-for"
      : "forced-mate-against";
  }
  if (!Number.isFinite(evaluation.value)) return null;
  const magnitude = Math.abs(evaluation.value);
  if (magnitude < EXPLANATION_STATE_BOUNDS_CENTIPAWNS.equal) {
    return "roughly-equal";
  }
  const favorable = evaluation.value > 0;
  if (magnitude >= EXPLANATION_STATE_BOUNDS_CENTIPAWNS.decisive) {
    return favorable ? "winning" : "losing";
  }
  if (magnitude >= EXPLANATION_STATE_BOUNDS_CENTIPAWNS.clear) {
    return favorable ? "clear-advantage" : "clear-disadvantage";
  }
  return favorable ? "slight-advantage" : "slight-disadvantage";
}

function pieceOf(value: string | undefined): MaterialPiece | null {
  return value && value in MATERIAL_VALUES ? (value as MaterialPiece) : null;
}

/**
 * Immediate and retained-continuation material for the played move. Every value
 * comes from legal board state or an already-retained line, so this performs no
 * tactical search and consults no engine.
 */
export function derivePlayedMoveMaterial(
  move: Pick<
    ReviewMove,
    "fenBefore" | "fenAfter" | "uci" | "player" | "analysisAfter"
  >,
): PlayedMoveMaterial | null {
  const match = UCI_MOVE.exec(move.uci);
  if (!match) return null;
  const color = moverColor(move.player);
  let played;
  let balanceBefore: number;
  let balanceAfter: number;
  try {
    const chess = new Chess(move.fenBefore);
    played = chess.move({ from: match[1], to: match[2], promotion: match[3] });
    balanceBefore = materialBalance(move.fenBefore, color);
    balanceAfter = materialBalance(move.fenAfter, color);
  } catch {
    return null;
  }
  if (!played) return null;

  const retainedLine = move.analysisAfter?.principalVariationUci ?? [];
  const projection =
    retainedLine.length > 0
      ? projectMaterial(move.fenAfter, retainedLine, color)
      : null;
  const replyCaptured = projection?.firstMove.capturedPiece ?? null;
  const capturedPiece = pieceOf(played.captured);

  return {
    capturedPiece,
    capturedValue: capturedPiece ? MATERIAL_VALUES[capturedPiece] : 0,
    enPassant: played.isEnPassant(),
    promotionPiece: pieceOf(played.promotion),
    immediateSwing: balanceAfter - balanceBefore,
    projectedSwing: projection ? projection.finalBalance - balanceBefore : null,
    replyCapturedPiece: replyCaptured,
    replyCapturedValue: replyCaptured ? MATERIAL_VALUES[replyCaptured] : 0,
  };
}

function boundedPrincipalVariation(
  move: Pick<ReviewMove, "fenBefore" | "principalVariationUci">,
): { text: string; plyCount: number } | null {
  const bounded = move.principalVariationUci.slice(
    0,
    EXPLANATION_PRINCIPAL_VARIATION_PLIES,
  );
  if (bounded.length === 0) return null;
  const formatted = formatPrincipalVariation(move.fenBefore, bounded);
  if (!formatted || formatted.sanMoves.length === 0) return null;
  return { text: formatted.text, plyCount: formatted.sanMoves.length };
}

/** Collect every authoritative fact an explanation may use. Invents nothing. */
export function deriveExplanationEvidence(move: ReviewMove): ExplanationFacts {
  const ordinary =
    move.classification.status === "classified"
      ? move.classification.classification
      : null;
  const classificationEvidence =
    move.classification.status === "classified"
      ? move.classification.evidence
      : null;
  const playerEvaluationAfter =
    move.playerOutcomeAfter?.kind === "engine"
      ? move.playerOutcomeAfter.evaluation
      : null;

  return {
    ply: move.ply,
    moveNumber: move.moveNumber,
    player: move.player,
    san: move.san,
    ordinary,
    special: move.specialClassification?.classification ?? null,
    specialRule: move.specialClassification?.evidence.rule ?? null,
    specialEvidence: move.specialClassification?.evidence ?? null,
    playedBestMove: move.playedBestMove,
    bestMoveSan: move.bestMoveUci
      ? uciMoveToSan(move.fenBefore, move.bestMoveUci)
      : null,
    equivalentBest: classificationEvidence?.rule === "equivalent-best",
    evaluationBefore: move.evaluationBefore,
    evaluationAfter: move.evaluationAfter,
    playerEvaluationBefore: move.playerEvaluationBefore,
    playerEvaluationAfter,
    beforeState: toPositionState(move.playerEvaluationBefore),
    afterState: toPositionState(playerEvaluationAfter),
    centipawnLoss: move.centipawnLoss,
    outcomeDrop: classificationEvidence?.outcomeDrop ?? null,
    mateTransition: move.mateTransition,
    mateMovesBefore:
      move.playerEvaluationBefore?.kind === "mate"
        ? move.playerEvaluationBefore.moves
        : null,
    mateMovesAfter:
      playerEvaluationAfter?.kind === "mate"
        ? playerEvaluationAfter.moves
        : null,
    terminal: move.terminalOutcome
      ? {
          reason: move.terminalOutcome.reason,
          result: move.terminalOutcome.result,
        }
      : null,
    playedMaterial: derivePlayedMoveMaterial(move),
    bestLineMaterial:
      move.specialClassification?.evidence.bestLineMaterial ?? null,
    candidateSeparation:
      move.specialClassification?.evidence.candidateOutcomeSeparation ?? null,
    candidateCount: move.specialClassification?.evidence.candidateCount ?? null,
    principalVariation: boundedPrincipalVariation(move),
  };
}

const ERROR_CLASSIFICATIONS: readonly OrdinaryMoveClassification[] = [
  "inaccuracy",
  "mistake",
  "blunder",
];

function isError(ordinary: OrdinaryMoveClassification | null): boolean {
  return ordinary !== null && ERROR_CLASSIFICATIONS.includes(ordinary);
}

/**
 * A material-loss claim needs a material swing over the retained continuation
 * and an objective assessment that agrees the move was an error. A sacrifice
 * the engine still endorses is therefore never called a material loss.
 */
export function hasSupportedMaterialLoss(facts: ExplanationFacts): boolean {
  const swing = facts.playedMaterial?.projectedSwing ?? null;
  return (
    swing !== null &&
    swing <= -EXPLANATION_MATERIAL_THRESHOLDS.minimumNetSwing &&
    isError(facts.ordinary) &&
    facts.special === null
  );
}

/** Deterministically choose the single reason that best explains the move. */
export function selectPrimaryExplanation(
  facts: ExplanationFacts,
): ExplanationReason {
  if (facts.terminal) {
    if (facts.terminal.result === "win") {
      return facts.terminal.reason === "checkmate"
        ? "terminal-checkmate-delivered"
        : "terminal-draw";
    }
    if (facts.terminal.result === "loss") return "terminal-loss";
    return "terminal-draw";
  }

  if (facts.special === "miss" && facts.specialRule === "missed-forced-mate") {
    return "missed-mate";
  }

  switch (facts.mateTransition) {
    case "newly-allows-forced-mate":
    case "reverses-to-unfavorable-mate":
      return "allowed-mate";
    case "throws-away-forced-mate":
      return "missed-mate";
    case "creates-forced-mate":
      return "found-mate";
    case "escapes-forced-mate":
    case "reverses-to-favorable-mate":
      return "escaped-mate";
    case "retains-favorable-mate":
      return "retained-mate";
    case "retains-unfavorable-mate":
      return "retained-mate-against";
    default:
      break;
  }

  if (facts.special === "brilliant") return "brilliant-sacrifice";
  if (facts.special === "great") return "critical-best-move";
  if (facts.special === "miss") {
    return facts.specialRule === "missed-material-win"
      ? "missed-material-win"
      : "missed-forcing-resource";
  }

  if (hasSupportedMaterialLoss(facts)) return "lost-material";

  if (facts.ordinary === "blunder") return "large-eval-drop";
  if (facts.ordinary === "mistake") return "moderate-eval-drop";
  if (facts.ordinary === "inaccuracy") return "slight-eval-drop";

  if (facts.ordinary === "best") {
    if (facts.beforeState === "winning" && facts.afterState === "winning") {
      return "preserved-winning-position";
    }
    if (facts.playedBestMove === true) return "best-move";
    return facts.equivalentBest ? "near-best-move" : "best-move";
  }
  if (facts.ordinary === "good") return "sound-move";
  return "unavailable";
}

function pawns(centipawns: number): string {
  return (centipawns / 100).toFixed(2);
}

function signedEvaluation(evaluation: EngineEvaluation): string {
  if (evaluation.kind === "mate") {
    return evaluation.moves < 0
      ? `-M${Math.abs(evaluation.moves)}`
      : `M${evaluation.moves}`;
  }
  if (evaluation.value === 0) return "0.00";
  const value = evaluation.value / 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

const STATE_PHRASES: Record<ExplanationPositionState, string> = {
  "roughly-equal": "roughly equal",
  "slight-advantage": "slightly better for the player",
  "clear-advantage": "clearly better for the player",
  winning: "winning for the player",
  "slight-disadvantage": "slightly worse for the player",
  "clear-disadvantage": "clearly worse for the player",
  losing: "losing for the player",
  "forced-mate-for": "a forced mate for the player",
  "forced-mate-against": "a forced mate against the player",
};

const TERMINAL_SUMMARIES: Record<TerminalReason, string> = {
  checkmate: "This move ends the game.",
  stalemate: "This move ends the game in stalemate.",
  "insufficient-material":
    "This move reaches a drawn position by insufficient material.",
  "threefold-repetition": "This move reaches a drawn position by repetition.",
  "fifty-move-rule":
    "This move reaches a drawn position by the fifty-move rule.",
  draw: "This move ends the game in a draw.",
};

function bestMoveDetail(facts: ExplanationFacts, lead: string): string | null {
  return facts.bestMoveSan ? `${lead} ${facts.bestMoveSan}.` : null;
}

function evaluationDetail(facts: ExplanationFacts): string | null {
  if (!facts.evaluationBefore || !facts.evaluationAfter) return null;
  return `The position moves from ${signedEvaluation(
    facts.evaluationBefore,
  )} to ${signedEvaluation(facts.evaluationAfter)}.`;
}

function centipawnDifferenceDetail(facts: ExplanationFacts): string | null {
  return facts.centipawnLoss === null
    ? null
    : `The difference is ${facts.centipawnLoss} centipawns.`;
}

function stateTransitionSummary(facts: ExplanationFacts): string | null {
  if (!facts.beforeState || !facts.afterState) return null;
  if (facts.beforeState === facts.afterState) return null;
  return `This move changes the position from ${
    STATE_PHRASES[facts.beforeState]
  } to ${STATE_PHRASES[facts.afterState]}.`;
}

function evaluationDropSummary(facts: ExplanationFacts): string {
  const fallback =
    facts.centipawnLoss === null
      ? "This move gives away objective advantage."
      : `This move gives away ${pawns(
          facts.centipawnLoss,
        )} pawns of objective advantage.`;
  return stateTransitionSummary(facts) ?? fallback;
}

function materialLossSummary(facts: ExplanationFacts): string {
  const material = facts.playedMaterial;
  const lost = Math.abs(material?.projectedSwing ?? 0);
  if (
    material &&
    material.replyCapturedPiece !== null &&
    material.replyCapturedValue === lost
  ) {
    return `This move loses a ${PIECE_NAMES[material.replyCapturedPiece]}.`;
  }
  return `This move loses ${lost} points of material.`;
}

function missedMaterialDetail(facts: ExplanationFacts): string | null {
  const material = facts.bestLineMaterial;
  if (!material) return null;
  const gain = material.finalBalance - material.initialBalance;
  if (gain <= 0) return null;
  const lead = facts.bestMoveSan
    ? `Best was ${facts.bestMoveSan}, winning`
    : "The analyzed line wins";
  return `${lead} ${gain} points of material.`;
}

function sacrificeDetail(facts: ExplanationFacts): string | null {
  const material = facts.bestLineMaterial;
  if (!material) return null;
  return `The analyzed line gives up ${material.exposure} points of material and does not regain ${material.sustainedLoss} of them.`;
}

function separationDetail(facts: ExplanationFacts): string | null {
  if (facts.candidateSeparation === null || facts.candidateCount === null) {
    return null;
  }
  return `Among the ${
    facts.candidateCount
  } analyzed candidates, the next best was ${facts.candidateSeparation.toFixed(
    3,
  )} lower on Chessed's outcome scale.`;
}

function capturedDetail(facts: ExplanationFacts): string | null {
  const material = facts.playedMaterial;
  if (!material?.capturedPiece) return null;
  const piece = PIECE_NAMES[material.capturedPiece];
  return material.enPassant
    ? `The move captures a ${piece} en passant.`
    : `The move captures a ${piece}.`;
}

function promotionDetail(facts: ExplanationFacts): string | null {
  const promotion = facts.playedMaterial?.promotionPiece;
  return promotion ? `The move promotes to a ${PIECE_NAMES[promotion]}.` : null;
}

function mateDistanceDetail(facts: ExplanationFacts): string | null {
  return facts.mateMovesAfter === null
    ? null
    : `The forced mate stands at M${facts.mateMovesAfter}.`;
}

/**
 * Reasons whose explanation may quote the already-retained best line. These are
 * the cases where the concrete missed sequence is the explanation; elsewhere a
 * line would repeat evidence the wording already states.
 */
const PRINCIPAL_VARIATION_REASONS: readonly ExplanationReason[] = [
  "missed-mate",
  "missed-forcing-resource",
];

function compact(values: readonly (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}

/** Render one reason into Chessed's own restrained, deterministic wording. */
export function formatExplanation(
  reason: ExplanationReason,
  facts: ExplanationFacts,
): { summary: string; details: string[] } {
  switch (reason) {
    case "terminal-checkmate-delivered":
      return {
        summary: "This move delivers checkmate.",
        details: compact([capturedDetail(facts), promotionDetail(facts)]),
      };
    case "terminal-loss":
      return { summary: "This move ends the game in a loss.", details: [] };
    case "terminal-draw":
      return {
        summary: TERMINAL_SUMMARIES[facts.terminal?.reason ?? "draw"],
        details: compact([
          facts.evaluationBefore
            ? `The position was ${signedEvaluation(
                facts.evaluationBefore,
              )} before the move.`
            : null,
        ]),
      };
    case "allowed-mate":
      return {
        summary: "This move allows a forced mate.",
        details: compact([
          facts.mateMovesAfter === null
            ? null
            : `The opponent now has mate in ${facts.mateMovesAfter}.`,
          bestMoveDetail(facts, "Best was"),
        ]),
      };
    case "missed-mate":
      return {
        summary: "This move misses a forced mate.",
        details: compact([
          bestMoveDetail(facts, "Best was"),
          facts.mateMovesBefore === null
            ? null
            : `The missed mate was M${facts.mateMovesBefore}.`,
        ]),
      };
    case "found-mate":
      return {
        summary: "This move creates a forced mate.",
        details: compact([mateDistanceDetail(facts), capturedDetail(facts)]),
      };
    case "escaped-mate":
      return {
        summary: "This move escapes a forced mate.",
        details: compact([evaluationDetail(facts)]),
      };
    case "retained-mate":
      return {
        summary: "This move keeps the forced mate.",
        details: compact([mateDistanceDetail(facts)]),
      };
    case "retained-mate-against":
      return {
        summary: "The opponent still has a forced mate after this move.",
        details: compact([mateDistanceDetail(facts)]),
      };
    case "brilliant-sacrifice":
      return {
        summary:
          "This move was the engine's top choice and gives up material the analyzed line does not regain.",
        details: compact([sacrificeDetail(facts), separationDetail(facts)]),
      };
    case "critical-best-move":
      return {
        summary:
          "This move was the engine's top choice, and the analyzed alternatives were clearly worse.",
        details: compact([separationDetail(facts)]),
      };
    case "missed-material-win":
      return {
        summary: "This move misses a continuation that wins material.",
        details: compact([
          missedMaterialDetail(facts),
          evaluationDetail(facts),
        ]),
      };
    case "missed-forcing-resource":
      return {
        summary: "This move misses a stronger forcing continuation.",
        details: compact([
          bestMoveDetail(facts, "Best was"),
          evaluationDetail(facts),
        ]),
      };
    case "lost-material":
      return {
        summary: materialLossSummary(facts),
        details: compact([
          evaluationDetail(facts),
          bestMoveDetail(facts, "Best was"),
        ]),
      };
    case "large-eval-drop":
    case "moderate-eval-drop":
      return {
        summary: evaluationDropSummary(facts),
        details: compact([
          evaluationDetail(facts),
          bestMoveDetail(facts, "Best was"),
        ]),
      };
    case "slight-eval-drop":
      return {
        summary: evaluationDropSummary(facts),
        details: compact([bestMoveDetail(facts, "Best was")]),
      };
    case "preserved-winning-position":
      return {
        summary: "This move keeps a winning position.",
        details: compact([
          facts.playedBestMove === true
            ? "It was the engine's top choice."
            : bestMoveDetail(facts, "The engine's top choice was"),
        ]),
      };
    case "best-move":
      return {
        summary: "This was the engine's top choice.",
        details: compact([capturedDetail(facts), promotionDetail(facts)]),
      };
    case "near-best-move":
      return {
        summary: "This move was nearly equivalent to the engine's top choice.",
        details: compact([
          bestMoveDetail(facts, "The top choice was"),
          centipawnDifferenceDetail(facts),
        ]),
      };
    case "sound-move":
      return {
        summary:
          "This move keeps the objective assessment close to the engine's top choice.",
        details: compact([
          bestMoveDetail(facts, "The top choice was"),
          centipawnDifferenceDetail(facts),
        ]),
      };
    case "unavailable":
      return {
        summary: "Detailed engine explanation unavailable for this move.",
        details: [],
      };
  }
}

function buildEvidence(
  reason: ExplanationReason,
  facts: ExplanationFacts,
): ExplanationEvidence[] {
  const evidence: ExplanationEvidence[] = [
    {
      kind: "classification",
      ordinary: facts.ordinary,
      special: facts.special,
    },
  ];
  if (facts.terminal) {
    evidence.push({
      kind: "terminal",
      reason: facts.terminal.reason,
      result: facts.terminal.result,
    });
  }
  if (facts.mateTransition) {
    evidence.push({
      kind: "mate-transition",
      transition: facts.mateTransition,
    });
    evidence.push({
      kind: "mate-distance",
      before: facts.mateMovesBefore,
      after: facts.mateMovesAfter,
    });
  }
  if (facts.evaluationBefore || facts.evaluationAfter) {
    evidence.push({
      kind: "evaluation",
      before: facts.evaluationBefore,
      after: facts.evaluationAfter,
      beforeState: facts.beforeState,
      afterState: facts.afterState,
    });
  }
  if (facts.centipawnLoss !== null) {
    evidence.push({ kind: "centipawn-loss", value: facts.centipawnLoss });
  }
  if (facts.outcomeDrop !== null) {
    evidence.push({ kind: "outcome-drop", value: facts.outcomeDrop });
  }
  evidence.push({
    kind: "engine-best",
    san: facts.bestMoveSan,
    playedBestMove: facts.playedBestMove,
  });
  if (facts.playedMaterial) {
    evidence.push({ kind: "played-material", material: facts.playedMaterial });
  }
  if (facts.bestLineMaterial) {
    evidence.push({
      kind: "best-line-material",
      material: facts.bestLineMaterial,
    });
  }
  if (
    facts.specialEvidence &&
    facts.candidateSeparation !== null &&
    facts.candidateCount !== null
  ) {
    evidence.push({
      kind: "candidate-separation",
      value: facts.candidateSeparation,
      candidateCount: facts.candidateCount,
      confirmation: facts.specialEvidence.greatConfirmation,
    });
  }
  if (
    facts.principalVariation &&
    PRINCIPAL_VARIATION_REASONS.includes(reason)
  ) {
    evidence.push({
      kind: "principal-variation",
      text: facts.principalVariation.text,
      plyCount: facts.principalVariation.plyCount,
    });
  }
  return evidence;
}

/**
 * Explain one reviewed move. Pure, engine-free, and stable: the same review
 * evidence always yields the same reason, summary, and details.
 */
export function explainMove(move: ReviewMove): MoveExplanation {
  const facts = deriveExplanationEvidence(move);
  const reason = selectPrimaryExplanation(facts);
  const { summary, details } = formatExplanation(reason, facts);
  const showLine =
    facts.principalVariation !== null &&
    PRINCIPAL_VARIATION_REASONS.includes(reason);
  // The line already opens with the engine's top choice, so naming it twice adds
  // nothing; the line is the more concrete of the two.
  const withoutBestMove = showLine
    ? details.filter((detail) => !detail.startsWith("Best was"))
    : details;
  const rendered = [
    ...withoutBestMove,
    ...(showLine ? [`Best line: ${facts.principalVariation?.text}`] : []),
  ].slice(0, EXPLANATION_MAXIMUM_DETAILS);
  return {
    reason,
    summary,
    ...(rendered.length > 0 ? { details: rendered } : {}),
    evidence: buildEvidence(reason, facts),
  };
}

/** Explain every move of a completed review exactly once, in ply order. */
export function explainReviewMoves(
  moves: readonly ReviewMove[],
): MoveExplanation[] {
  return moves.map(explainMove);
}
