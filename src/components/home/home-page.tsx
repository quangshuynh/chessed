"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import {
  type ReviewSessionSummary,
  saveReviewSession,
} from "@/lib/review/session-store";
import type { ChessComRecentGame } from "@/lib/sources/chesscom/types";

import styles from "./home-page.module.css";

interface FetchResponse {
  username: string;
  games: ChessComRecentGame[];
}

function formatDate(isoDate?: string): string {
  if (!isoDate) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

function formatResult(result?: string): string {
  if (!result) {
    return "Unknown";
  }

  return result.replace(/_/g, " ");
}

function toSummary(game: ChessComRecentGame): ReviewSessionSummary {
  return {
    id: game.id,
    white: game.white.username,
    black: game.black.username,
    whiteRating: game.white.rating,
    blackRating: game.black.rating,
    result: game.result,
    playerColor: game.playerColor,
    timeControl: game.timeControl,
    date: game.date,
    url: game.url,
  };
}

export function HomePage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [manualPgn, setManualPgn] = useState("");
  const [games, setGames] = useState<ChessComRecentGame[]>([]);
  const [searchedUsername, setSearchedUsername] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string>();
  const [manualPgnError, setManualPgnError] = useState<string>();
  const [selectionError, setSelectionError] = useState<string>();

  const hasSearchResults = useMemo(() => games.length > 0, [games.length]);

  async function handleFindGames(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const candidate = username.trim();

    setSelectionError(undefined);

    if (!candidate) {
      setFetchError("Enter a Chess.com username.");
      setGames([]);
      setSearchedUsername(undefined);
      return;
    }

    setIsLoading(true);
    setFetchError(undefined);

    try {
      const response = await fetch(
        `/api/chesscom/${encodeURIComponent(candidate)}/games`,
      );
      const payload = (await response.json()) as
        FetchResponse | { error?: string };

      if (!response.ok || !("games" in payload && "username" in payload)) {
        const errorMessage = "error" in payload ? payload.error : undefined;
        setFetchError(errorMessage ?? "Unable to retrieve Chess.com games.");
        setGames([]);
        setSearchedUsername(candidate);
        return;
      }

      setGames(payload.games);
      setSearchedUsername(payload.username);
    } catch {
      setFetchError(
        "Unable to reach the Chess.com service right now. Please try again.",
      );
      setGames([]);
      setSearchedUsername(candidate);
    } finally {
      setIsLoading(false);
    }
  }

  function openReview(
    source: "chesscom" | "manual-pgn",
    pgn: string,
    summary?: ReviewSessionSummary,
  ) {
    parsePgnToReviewGame(pgn);

    const sessionId = saveReviewSession({
      source,
      pgn,
      summary,
      createdAt: new Date().toISOString(),
    });

    router.push(`/review/${sessionId}`);
  }

  function handleOpenGame(game: ChessComRecentGame) {
    setSelectionError(undefined);

    if (!game.pgn) {
      setSelectionError(
        "This Chess.com game does not include PGN data and cannot be reviewed yet.",
      );
      return;
    }

    try {
      openReview("chesscom", game.pgn, toSummary(game));
    } catch {
      setSelectionError(
        "This game PGN is malformed and could not be opened for review.",
      );
    }
  }

  function handleOpenManualPgn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualPgnError(undefined);

    try {
      openReview("manual-pgn", manualPgn);
    } catch {
      setManualPgnError("The pasted PGN is malformed and could not be parsed.");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.badge}>Independent open-source project</p>
        <h1>Chessed</h1>
        <p>
          Enter a Chess.com username, find recent public games, and open a game
          in the review interface.
        </p>
        <ol className={styles.workflow}>
          <li>Enter a Chess.com username</li>
          <li>Find games</li>
          <li>Select game</li>
          <li>Review</li>
        </ol>
      </header>

      <main className={styles.mainLayout}>
        <section
          className={styles.panel}
          aria-labelledby="username-search-title"
        >
          <h2 id="username-search-title">Find recent Chess.com games</h2>
          <form className={styles.form} onSubmit={handleFindGames}>
            <label htmlFor="username-input">Chess.com username</label>
            <div className={styles.inlineRow}>
              <input
                id="username-input"
                name="username"
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="for example: hikaru"
              />
              <button type="submit" disabled={isLoading}>
                {isLoading ? "Finding..." : "Find Games"}
              </button>
            </div>
          </form>

          {fetchError ? (
            <p className={styles.error} role="status">
              {fetchError}
            </p>
          ) : null}

          {searchedUsername &&
          !isLoading &&
          !hasSearchResults &&
          !fetchError ? (
            <p className={styles.info} role="status">
              No recent public games found for{" "}
              <strong>{searchedUsername}</strong>.
            </p>
          ) : null}

          {selectionError ? (
            <p className={styles.error} role="status">
              {selectionError}
            </p>
          ) : null}

          {hasSearchResults ? (
            <ul className={styles.gamesList}>
              {games.map((game) => (
                <li key={game.id} className={styles.gameCard}>
                  <div>
                    <h3>
                      {game.white.username}
                      {typeof game.white.rating === "number"
                        ? ` (${game.white.rating})`
                        : ""}{" "}
                      vs {game.black.username}
                      {typeof game.black.rating === "number"
                        ? ` (${game.black.rating})`
                        : ""}
                    </h3>
                    <dl>
                      <div>
                        <dt>Your color</dt>
                        <dd>{game.playerColor ?? "Unknown"}</dd>
                      </div>
                      <div>
                        <dt>Result</dt>
                        <dd>{formatResult(game.result)}</dd>
                      </div>
                      <div>
                        <dt>Time control</dt>
                        <dd>{game.timeControl ?? "Unknown"}</dd>
                      </div>
                      <div>
                        <dt>Date</dt>
                        <dd>{formatDate(game.date)}</dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenGame(game)}
                    disabled={!game.pgn}
                  >
                    {game.pgn ? "Review game" : "PGN unavailable"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.panel} aria-labelledby="manual-pgn-title">
          <h2 id="manual-pgn-title">Or paste a PGN manually</h2>
          <form className={styles.form} onSubmit={handleOpenManualPgn}>
            <label htmlFor="manual-pgn">PGN</label>
            <textarea
              id="manual-pgn"
              value={manualPgn}
              onChange={(event) => setManualPgn(event.target.value)}
              rows={12}
              placeholder="Paste a full PGN game here"
            />
            <button type="submit">Open PGN in review</button>
          </form>

          {manualPgnError ? (
            <p className={styles.error} role="status">
              {manualPgnError}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
