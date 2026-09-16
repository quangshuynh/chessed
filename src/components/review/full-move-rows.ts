import type { ParsedMove } from "@/lib/chess/types";

export interface FullMoveRow {
  moveNumber: number;
  white?: ParsedMove;
  black?: ParsedMove;
}

function startingFullmove(fen: string): number {
  const value = Number.parseInt(fen.trim().split(/\s+/)[5] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

/** Groups UI cells into score-sheet rows without changing their ply identity. */
export function groupMovesIntoFullMoves(
  moves: readonly ParsedMove[],
  startingFen: string,
): FullMoveRow[] {
  const rows: FullMoveRow[] = [];
  let moveNumber = startingFullmove(startingFen);

  for (const move of moves) {
    let row = rows.at(-1);
    const needsRow =
      !row ||
      row.moveNumber !== moveNumber ||
      (move.color === "w" ? row.white !== undefined : row.black !== undefined);

    if (needsRow) {
      row = { moveNumber };
      rows.push(row);
    }

    if (!row) continue;
    if (move.color === "w") row.white = move;
    else row.black = move;

    if (move.color === "b") moveNumber += 1;
  }

  return rows;
}
