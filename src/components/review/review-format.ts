import type { OrdinaryMoveClassification } from "@/lib/review/classification";
import type { EngineEvaluation, TerminalReason } from "@/lib/review/interfaces";

const CLASSIFICATION_LABELS: Record<OrdinaryMoveClassification, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export function formatEvaluation(evaluation: EngineEvaluation): string {
  if (evaluation.kind === "mate") {
    return evaluation.moves < 0
      ? `-M${Math.abs(evaluation.moves)}`
      : `M${evaluation.moves}`;
  }
  if (evaluation.value === 0) return "0.00";
  const pawns = evaluation.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function formatClassification(
  classification: OrdinaryMoveClassification,
): string {
  return CLASSIFICATION_LABELS[classification];
}

export function formatTerminalReason(reason: TerminalReason): string {
  const labels: Record<TerminalReason, string> = {
    checkmate: "Checkmate",
    stalemate: "Stalemate",
    "insufficient-material": "Draw by insufficient material",
    "threefold-repetition": "Draw by threefold repetition",
    "fifty-move-rule": "Draw by fifty-move rule",
    draw: "Draw",
  };
  return labels[reason];
}
