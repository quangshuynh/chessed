import type {
  ChessComGamesResponse,
  ChessComRecentGame,
} from "@/lib/sources/chesscom/types";

const CHESS_COM_BASE_URL = "https://api.chess.com/pub";
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,25}$/;

interface ChessComApiPlayer {
  username?: string;
  rating?: number;
  result?: string;
}

interface ChessComApiGame {
  uuid?: string;
  url?: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  end_time?: number;
  white?: ChessComApiPlayer;
  black?: ChessComApiPlayer;
}

interface ArchiveIndexResponse {
  archives?: string[];
}

interface ArchiveGamesResponse {
  games?: ChessComApiGame[];
}

export class ChessComServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ChessComServiceError";
  }
}

function ensureValidUsername(username: string): string {
  const normalized = username.trim();

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new ChessComServiceError(
      "Please provide a valid Chess.com username.",
      400,
    );
  }

  return normalized;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "chessed-open-source-app",
      Accept: "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new ChessComServiceError("Chess.com username not found.", 404);
    }

    throw new ChessComServiceError(
      "Chess.com API request failed.",
      response.status,
    );
  }

  return (await response.json()) as T;
}

function mapGame(
  username: string,
  game: ChessComApiGame,
  index: number,
): ChessComRecentGame {
  const white = game.white ?? {};
  const black = game.black ?? {};

  const whiteName = white.username ?? "White";
  const blackName = black.username ?? "Black";

  const normalizedUsername = username.toLowerCase();
  const playerColor =
    whiteName.toLowerCase() === normalizedUsername
      ? "white"
      : blackName.toLowerCase() === normalizedUsername
        ? "black"
        : undefined;

  const playerResult =
    playerColor === "white"
      ? white.result
      : playerColor === "black"
        ? black.result
        : undefined;

  return {
    id: game.uuid ?? game.url ?? `${game.end_time ?? "unknown"}-${index}`,
    url: game.url,
    pgn: game.pgn,
    white: {
      username: whiteName,
      rating: white.rating,
      result: white.result ?? "unknown",
    },
    black: {
      username: blackName,
      rating: black.rating,
      result: black.result ?? "unknown",
    },
    result: playerResult,
    playerColor,
    timeControl: game.time_control,
    timeClass: game.time_class,
    date: game.end_time
      ? new Date(game.end_time * 1000).toISOString()
      : undefined,
  };
}

export async function fetchRecentChessComGames(
  usernameInput: string,
  limit = 20,
): Promise<ChessComGamesResponse> {
  const username = ensureValidUsername(usernameInput);

  const archiveIndex = await fetchJson<ArchiveIndexResponse>(
    `${CHESS_COM_BASE_URL}/player/${username}/games/archives`,
  );

  const archives = archiveIndex.archives ?? [];

  if (archives.length === 0) {
    return { username, games: [] };
  }

  const archiveUrls = archives.slice(-3).reverse();

  const monthResponses = await Promise.all(
    archiveUrls.map((archiveUrl) =>
      fetchJson<ArchiveGamesResponse>(archiveUrl).catch(() => ({ games: [] })),
    ),
  );

  const games = monthResponses
    .flatMap((month) => month.games ?? [])
    .sort((left, right) => (right.end_time ?? 0) - (left.end_time ?? 0))
    .slice(0, limit)
    .map((game, index) => mapGame(username, game, index));

  return {
    username,
    games,
  };
}
