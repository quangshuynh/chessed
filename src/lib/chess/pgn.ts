import { Chess, type Move } from "chess.js";

import type { ParsedMove, ParsedReviewGame } from "@/lib/chess/types";

const DEFAULT_STARTING_FEN = new Chess().fen();

export class PgnParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PgnParseError";
  }
}

function getStartingFen(headers: Record<string, string>): string {
  if (headers.SetUp === "1" && headers.FEN) {
    return headers.FEN;
  }

  return DEFAULT_STARTING_FEN;
}

function toParsedMove(move: Move, ply: number): ParsedMove {
  return {
    ply,
    color: move.color,
    san: move.san,
    from: move.from,
    to: move.to,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
  };
}

export function parsePgnToReviewGame(rawPgn: string): ParsedReviewGame {
  const pgn = rawPgn.trim();

  if (!pgn) {
    throw new PgnParseError("PGN is empty.");
  }

  const parser = new Chess();

  try {
    parser.loadPgn(pgn, { strict: false });
  } catch {
    throw new PgnParseError("PGN could not be parsed.");
  }

  const headers = parser.getHeaders() as Record<string, string>;
  const startingFen = getStartingFen(headers);
  const verboseMoves = parser.history({ verbose: true });

  const replay =
    startingFen === DEFAULT_STARTING_FEN ? new Chess() : new Chess(startingFen);

  const positions = [startingFen];
  const moves: ParsedMove[] = [];

  verboseMoves.forEach((move, index) => {
    replay.move(move);
    positions.push(replay.fen());
    moves.push(toParsedMove(move, index + 1));
  });

  return {
    pgn,
    headers,
    startingFen,
    positions,
    moves,
  };
}
