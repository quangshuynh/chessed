export interface ChessComPlayer {
  username: string;
  rating?: number;
  result: string;
}

export interface ChessComRecentGame {
  id: string;
  url?: string;
  pgn?: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
  date?: string;
  result?: string;
  playerColor?: "white" | "black";
  timeControl?: string;
  timeClass?: string;
}

export interface ChessComGamesResponse {
  username: string;
  games: ChessComRecentGame[];
}

/** Minimal public identity used by Chessed presentation. */
export interface ChessComPlayerProfile {
  username: string;
  avatarUrl: string | null;
  profileUrl: string | null;
}
