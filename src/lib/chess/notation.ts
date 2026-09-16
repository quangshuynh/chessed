import { Chess } from "chess.js";

const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

function applyUciMove(chess: Chess, uci: string): string | null {
  const match = UCI_MOVE.exec(uci);
  if (!match) return null;

  try {
    const move = chess.move({
      from: match[1],
      to: match[2],
      promotion: match[3],
    });
    return move.san;
  } catch {
    return null;
  }
}

/** Convert one canonical UCI move in a position to chess.js-generated SAN. */
export function uciMoveToSan(fen: string, uci: string): string | null {
  try {
    return applyUciMove(new Chess(fen), uci);
  } catch {
    return null;
  }
}

export interface FormattedPrincipalVariation {
  sanMoves: string[];
  text: string;
}

/**
 * Replay a UCI principal variation and format its SAN with FEN-aware numbering.
 * Returns null when the FEN or any move is malformed or illegal.
 */
export function formatPrincipalVariation(
  fen: string,
  principalVariationUci: readonly string[],
): FormattedPrincipalVariation | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }

  const sanMoves: string[] = [];
  const parts: string[] = [];
  for (const uci of principalVariationUci) {
    const turn = chess.turn();
    const moveNumber = chess.moveNumber();
    const san = applyUciMove(chess, uci);
    if (!san) return null;

    if (turn === "w") parts.push(`${moveNumber}. ${san}`);
    else if (sanMoves.length === 0) parts.push(`${moveNumber}... ${san}`);
    else parts.push(san);
    sanMoves.push(san);
  }

  return { sanMoves, text: parts.join(" ") };
}
