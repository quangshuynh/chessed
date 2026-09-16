export type PieceColor = "w" | "b";

export interface ParsedMove {
  ply: number;
  color: PieceColor;
  san: string;
  from: string;
  to: string;
  uci: string;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
}

export interface ParsedReviewGame {
  pgn: string;
  headers: Record<string, string>;
  startingFen: string;
  positions: string[];
  moves: ParsedMove[];
}
