import type { ParsedMove } from "@/lib/chess/types";

export type MoveSound = "move" | "capture" | "check" | "checkmate";

export function getMoveSound(move: ParsedMove): MoveSound {
  if (move.isCheckmate) return "checkmate";
  if (move.isCheck) return "check";
  if (move.isCapture) return "capture";
  return "move";
}
