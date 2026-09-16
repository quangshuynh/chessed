import { Chess, type Color } from "chess.js";

export const MATERIAL_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
} as const;

export type MaterialPiece = keyof typeof MATERIAL_VALUES;

export interface MaterialProjection {
  initialBalance: number;
  minimumBalance: number;
  finalBalance: number;
  exposure: number;
  sustainedLoss: number;
  firstMove: {
    capture: boolean;
    check: boolean;
    promotion: boolean;
  };
}

function material(chess: Chess, color: Color): number {
  return chess
    .board()
    .flat()
    .filter(
      (piece): piece is NonNullable<typeof piece> =>
        piece !== null && piece.color === color && piece.type !== "k",
    )
    .reduce(
      (total, piece) => total + MATERIAL_VALUES[piece.type as MaterialPiece],
      0,
    );
}

export function materialBalance(fen: string, color: Color): number {
  const chess = new Chess(fen);
  const opponent = color === "w" ? "b" : "w";
  return material(chess, color) - material(chess, opponent);
}

/** Replay legal UCI moves and measure material only; this is not an evaluation. */
export function projectMaterial(
  fen: string,
  principalVariationUci: readonly string[],
  color: Color,
): MaterialProjection | null {
  const chess = new Chess(fen);
  const initialBalance = materialBalance(chess.fen(), color);
  let minimumBalance = initialBalance;
  let finalBalance = initialBalance;
  let firstMove: MaterialProjection["firstMove"] | null = null;

  for (const uci of principalVariationUci) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
    if (!match) return null;
    let move;
    try {
      move = chess.move({ from: match[1], to: match[2], promotion: match[3] });
    } catch {
      return null;
    }
    if (!move) return null;
    if (!firstMove) {
      firstMove = {
        capture: Boolean(move.captured),
        check: chess.inCheck(),
        promotion: Boolean(move.promotion),
      };
    }
    finalBalance = materialBalance(chess.fen(), color);
    minimumBalance = Math.min(minimumBalance, finalBalance);
  }

  if (!firstMove) return null;
  return {
    initialBalance,
    minimumBalance,
    finalBalance,
    exposure: initialBalance - minimumBalance,
    sustainedLoss: initialBalance - finalBalance,
    firstMove,
  };
}
