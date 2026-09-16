import { Chess } from "chess.js";

import {
  classifyMove,
  type MoveClassification,
} from "@/lib/review/classification";
import type {
  EngineEvaluation,
  PositionAnalysis,
} from "@/lib/review/interfaces";
import {
  measureEvaluationLoss,
  toPlayerRelativeEvaluation,
  type MoveOutcome,
  type MoveQualityObservation,
  type PlayerColor,
} from "@/lib/review/move-quality";
import { evaluateSpecialMove } from "@/lib/review/special-classification";

import type { SpecialPositionCase } from "./special-position-corpus";

export interface CalibrationObservation {
  position: SpecialPositionCase;
  depth: number;
  multiPv: number;
  analysisBefore: PositionAnalysis;
  analysisAfter: PositionAnalysis | null;
}

export interface CalibrationReportRow {
  id: string;
  provenance: string;
  objectiveProperty: string | null;
  falsificationValue: string | null;
  expectedProperties: readonly string[];
  depth: number;
  multiPv: number;
  ordinaryClassification: string;
  specialClassification: string | null;
  specialRule: string | null;
  confirmationTrigger: boolean;
  confirmationResult: "not-required" | "required" | "confirmed" | "unavailable";
  rejectionReasons: readonly string[];
  beforeEvaluation: EngineEvaluation;
  playedMoveEvaluation: EngineEvaluation | "terminal" | null;
  outcomeLoss: number | null;
  candidates: PositionAnalysis["candidates"];
  policyEvidence: ReturnType<typeof evaluateSpecialMove>["evidence"];
}

function terminalOutcome(
  chess: Chess,
  player: PlayerColor,
): MoveOutcome | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "black" : "white";
    return {
      kind: "terminal",
      reason: "checkmate",
      result: winner === player ? "win" : "loss",
    };
  }
  return { kind: "terminal", reason: "draw", result: "draw" };
}

function ordinaryClassification(observation: CalibrationObservation): {
  classification: MoveClassification;
  terminal: MoveOutcome | null;
} {
  const chess = new Chess(observation.position.fen);
  const player: PlayerColor = chess.turn() === "w" ? "white" : "black";
  const move = chess.move({
    from: observation.position.moveUci.slice(0, 2),
    to: observation.position.moveUci.slice(2, 4),
    promotion: observation.position.moveUci[4],
  });
  if (!move) throw new Error(`Illegal corpus move: ${observation.position.id}`);
  const terminal = terminalOutcome(chess, player);
  const after: MoveOutcome | null =
    terminal ??
    (observation.analysisAfter
      ? {
          kind: "engine",
          evaluation: toPlayerRelativeEvaluation(
            observation.analysisAfter.evaluation,
            player,
          ),
        }
      : null);
  const before = toPlayerRelativeEvaluation(
    observation.analysisBefore.evaluation,
    player,
  );
  const normalized: MoveQualityObservation = {
    ply: 1,
    player,
    playedMoveUci: observation.position.moveUci,
    bestMoveUci: observation.analysisBefore.bestMoveUci,
    playedBestMove:
      observation.analysisBefore.bestMoveUci === observation.position.moveUci,
    before,
    after,
    loss: after
      ? measureEvaluationLoss(before, after)
      : { kind: "unavailable", reason: "missing-after-analysis" },
  };
  return { classification: classifyMove(normalized), terminal };
}

export function buildCalibrationReport(
  observations: readonly CalibrationObservation[],
): CalibrationReportRow[] {
  return observations.map((observation) => {
    const chess = new Chess(observation.position.fen);
    const player: PlayerColor = chess.turn() === "w" ? "white" : "black";
    const { classification, terminal } = ordinaryClassification(observation);
    const audit = evaluateSpecialMove({
      fenBefore: observation.position.fen,
      playedMoveUci: observation.position.moveUci,
      player,
      ordinary: classification,
      analysisBefore: observation.analysisBefore,
      analysisAfter: observation.analysisAfter,
      terminalResult: terminal?.kind === "terminal" ? terminal.result : null,
    });
    return {
      id: observation.position.id,
      provenance: observation.position.provenance,
      objectiveProperty: observation.position.objectiveProperty ?? null,
      falsificationValue: observation.position.falsificationValue ?? null,
      expectedProperties: observation.position.expectedProperties,
      depth: observation.depth,
      multiPv: observation.multiPv,
      ordinaryClassification:
        classification.status === "classified"
          ? classification.classification
          : `unavailable:${classification.reason}`,
      specialClassification: audit.result?.classification ?? null,
      specialRule: audit.result?.evidence.rule ?? null,
      confirmationTrigger: audit.reasons.includes(
        "great-confirmation-required",
      ),
      confirmationResult:
        audit.evidence?.greatConfirmation === "confirmed"
          ? "confirmed"
          : audit.evidence?.greatConfirmation === "unavailable"
            ? "unavailable"
            : audit.reasons.includes("great-confirmation-required")
              ? "required"
              : "not-required",
      rejectionReasons: audit.reasons,
      beforeEvaluation: observation.analysisBefore.evaluation,
      playedMoveEvaluation:
        terminal !== null
          ? "terminal"
          : (observation.analysisAfter?.evaluation ?? null),
      outcomeLoss:
        classification.status === "classified"
          ? classification.evidence.outcomeDrop
          : null,
      candidates: observation.analysisBefore.candidates,
      policyEvidence: audit.evidence,
    };
  });
}
