import { test } from "@playwright/test";
import { Chess } from "chess.js";
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parsePgnToReviewGame } from "../src/lib/chess/pgn";
import { buildWholeGameReview } from "../src/lib/review/game-review";
import type {
  EngineEvaluation,
  GamePositionAnalysis,
  PositionAnalysis,
} from "../src/lib/review/interfaces";
import {
  evaluateSpecialMove,
  isGreatConfirmationCandidate,
  SPECIAL_CLASSIFICATION_POLICY,
} from "../src/lib/review/special-classification";
import { scoreMoveAccuracy } from "../src/lib/review/accuracy";

interface SelectedGame {
  id: string;
  band: string;
  whiteRating: number;
  blackRating: number;
  result: string;
  timeControl: string;
  timeControlCategory: string;
  plies: number;
  gameLength: string;
  partition: "train" | "validation" | "holdout";
  pgn: string;
}

const outputPath = resolve(
  "calibration/results/performance-v2/analyzed-player-games.jsonl",
);

test.skip(
  !process.env.CHESSED_PERFORMANCE_CALIBRATION,
  "Run explicitly with npm run test:performance-calibration",
);

test("resumable Stockfish 18 lite performance corpus", async ({ page }) => {
  test.setTimeout(0);
  const selected = JSON.parse(
    await readFile(
      resolve("calibration/results/performance-v2/selected-games.json"),
      "utf8",
    ),
  ) as {
    experimentVersion: string;
    artifactSha256: string;
    games: SelectedGame[];
  };
  const shard = /^(\d+)\/(\d+)$/.exec(
    process.env.CHESSED_PERFORMANCE_SHARD ?? "0/1",
  );
  if (!shard || Number(shard[1]) >= Number(shard[2]))
    throw new Error("CHESSED_PERFORMANCE_SHARD must be index/count.");
  const shardIndex = Number(shard[1]);
  const shardCount = Number(shard[2]);
  const shardGames = selected.games.filter(
    (_, index) => index % shardCount === shardIndex,
  );
  const existing = new Set<string>();
  try {
    const lines = (await readFile(outputPath, "utf8")).trim().split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      const record = JSON.parse(line) as {
        gameId: string;
        experimentVersion: string;
        recordSha256: string;
        [key: string]: unknown;
      };
      if (record.experimentVersion !== selected.experimentVersion)
        throw new Error("Checkpoint experiment version mismatch.");
      const { recordSha256, ...body } = record;
      if (
        createHash("sha256").update(JSON.stringify(body)).digest("hex") !==
        recordSha256
      )
        throw new Error(`Checkpoint integrity failure ${record.gameId}.`);
      if (existing.has(record.gameId))
        throw new Error(`Duplicate checkpoint ${record.gameId}.`);
      existing.add(record.gameId);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await page.goto("/");
  await page.evaluate(async () => {
    const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    const listeners = new Set<(line: string) => void>();
    worker.addEventListener("message", (event) => {
      for (const listener of listeners) listener(String(event.data).trim());
    });
    const until = (predicate: (line: string) => boolean) =>
      new Promise<string>((resolvePromise, reject) => {
        const timer = window.setTimeout(() => {
          listeners.delete(listener);
          reject(new Error("Timed out waiting for Stockfish."));
        }, 30_000);
        const listener = (line: string) => {
          if (!predicate(line)) return;
          window.clearTimeout(timer);
          listeners.delete(listener);
          resolvePromise(line);
        };
        listeners.add(listener);
      });
    worker.postMessage("uci");
    await until((line) => line === "uciok");
    worker.postMessage("isready");
    await until((line) => line === "readyok");
    Object.assign(window, {
      __performanceEngine: { worker, listeners, until },
    });
  });

  const analyze = async (fen: string, depth: number, multiPv: number) =>
    page.evaluate(
      async ({ fen, depth, multiPv }) => {
        const engine = (
          window as unknown as {
            __performanceEngine: {
              worker: Worker;
              listeners: Set<(line: string) => void>;
              until: (predicate: (line: string) => boolean) => Promise<string>;
            };
          }
        ).__performanceEngine;
        const latest = new Map<
          number,
          { evaluation: EngineEvaluation; pv: string[] }
        >();
        const onInfo = (line: string) => {
          const foundDepth = /(?:^|\s)depth (\d+)(?:\s|$)/.exec(line);
          const score = /(?:^|\s)score (cp|mate) (-?\d+)(?:\s|$)/.exec(line);
          const pv = /(?:^|\s)pv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)$/.exec(
            line,
          );
          const foundMultiPv = /(?:^|\s)multipv (\d+)(?:\s|$)/.exec(line);
          if (!foundDepth || Number(foundDepth[1]) !== depth || !score || !pv)
            return;
          const sign = fen.split(" ")[1] === "w" ? 1 : -1;
          const value = Number(score[2]) * sign;
          latest.set(Number(foundMultiPv?.[1] ?? 1), {
            evaluation:
              score[1] === "cp"
                ? { kind: "centipawns", perspective: "white", value }
                : { kind: "mate", perspective: "white", moves: value },
            pv: pv[1].trim().split(/\s+/),
          });
        };
        engine.listeners.add(onInfo);
        engine.worker.postMessage(`setoption name MultiPV value ${multiPv}`);
        engine.worker.postMessage(`position fen ${fen}`);
        engine.worker.postMessage(`go depth ${depth}`);
        const best = await engine.until((line) => line.startsWith("bestmove "));
        engine.listeners.delete(onInfo);
        const primary = latest.get(1);
        if (!primary) throw new Error("No primary analysis.");
        return {
          evaluation: primary.evaluation,
          bestMoveUci: best.split(/\s+/)[1] ?? null,
          principalVariationUci: primary.pv,
          candidates: [...latest.entries()]
            .sort(([a], [b]) => a - b)
            .map(([rank, value]) => ({
              rank,
              moveUci: value.pv[0],
              evaluation: value.evaluation,
              principalVariationUci: value.pv,
            })),
        };
      },
      { fen, depth, multiPv },
    );

  for (const fixture of shardGames) {
    if (existing.has(fixture.id)) continue;
    const started = Date.now();
    const game = parsePgnToReviewGame(fixture.pgn);
    const positions: GamePositionAnalysis[] = [];
    for (const [positionIndex, fen] of game.positions.entries()) {
      const chess = new Chess(fen);
      if (chess.isGameOver()) {
        positions.push({
          status: "terminal",
          positionIndex,
          followingMovePly: null,
          fen,
          reason: chess.isCheckmate()
            ? "checkmate"
            : chess.isStalemate()
              ? "stalemate"
              : chess.isInsufficientMaterial()
                ? "insufficient-material"
                : "draw",
          winner: chess.isCheckmate()
            ? chess.turn() === "w"
              ? "black"
              : "white"
            : null,
        });
        continue;
      }
      const result = await analyze(fen, 12, 1);
      positions.push({
        status: "analyzed",
        positionIndex,
        followingMovePly: game.moves[positionIndex]?.ply ?? null,
        analysis: {
          fen,
          ...result,
          limit: { requested: { kind: "depth", value: 12 }, achievedDepth: 12 },
          engine: { name: "Stockfish", version: "18 lite" },
        },
      });
    }
    const preliminary = buildWholeGameReview({ game, positions });
    const severity = new Set(["inaccuracy", "mistake", "blunder"]);
    for (const move of preliminary.moves) {
      const position = positions[move.ply - 1];
      const favorableMate =
        move.playerEvaluationBefore?.kind === "mate" &&
        move.playerEvaluationBefore.outcome === "favorable";
      const couldEarnSpecial =
        move.playedBestMove === true ||
        favorableMate ||
        (move.classification.status === "classified" &&
          severity.has(move.classification.classification));
      if (
        position?.status !== "analyzed" ||
        position.analysis.candidates?.length !== 1 ||
        !couldEarnSpecial
      )
        continue;
      const result = await analyze(move.fenBefore, 12, 3);
      position.analysis = {
        fen: move.fenBefore,
        ...result,
        limit: { requested: { kind: "depth", value: 12 }, achievedDepth: 12 },
        engine: { name: "Stockfish", version: "18 lite" },
      };
    }
    const enriched = buildWholeGameReview({ game, positions });
    for (const move of enriched.moves) {
      const audit = evaluateSpecialMove({
        fenBefore: move.fenBefore,
        playedMoveUci: move.uci,
        player: move.player,
        ordinary: move.classification,
        analysisBefore: move.analysisBefore,
        analysisAfter: move.analysisAfter,
        terminalResult: move.terminalOutcome?.result ?? null,
      });
      if (!isGreatConfirmationCandidate(audit)) continue;
      const position = positions[move.ply - 1];
      if (position?.status !== "analyzed") continue;
      const original = position.analysis;
      const result = await analyze(
        move.fenBefore,
        SPECIAL_CLASSIFICATION_POLICY.greatConfirmationDepth,
        3,
      );
      position.analysis = {
        fen: move.fenBefore,
        ...result,
        limit: {
          requested: {
            kind: "depth",
            value: SPECIAL_CLASSIFICATION_POLICY.greatConfirmationDepth,
          },
          achievedDepth: SPECIAL_CLASSIFICATION_POLICY.greatConfirmationDepth,
        },
        engine: { name: "Stockfish", version: "18 lite" },
        greatConfirmation: {
          status: "confirmed",
          purpose: "great-boundary",
          original,
        },
      } as PositionAnalysis;
    }
    const review = buildWholeGameReview({ game, positions });
    const player = (
      color: "white" | "black",
      rating: number,
      opponentRating: number,
    ) => ({
      color,
      rating,
      opponentRating,
      moves: review.moves
        .filter((move) => move.player === color)
        .flatMap((move) => {
          const score = scoreMoveAccuracy(move);
          if (score.status !== "scored") return [];
          return [
            {
              ply: move.ply,
              accuracy: score.value,
              outcomeDrop: score.outcomeDrop,
              onlyLegalMove: new Chess(move.fenBefore).moves().length === 1,
            },
          ];
        }),
      unavailableMoveCount: review.moves.filter(
        (move) =>
          move.player === color &&
          scoreMoveAccuracy(move).status === "unavailable",
      ).length,
    });
    const body = {
      experimentVersion: selected.experimentVersion,
      selectedArtifactSha256: selected.artifactSha256,
      gameId: fixture.id,
      band: fixture.band,
      partition: fixture.partition,
      result: fixture.result,
      timeControl: fixture.timeControl,
      timeControlCategory: fixture.timeControlCategory,
      gameLength: fixture.gameLength,
      plies: fixture.plies,
      players: [
        player("white", fixture.whiteRating, fixture.blackRating),
        player("black", fixture.blackRating, fixture.whiteRating),
      ],
      engine: { name: "Stockfish", version: "18 lite", depth: 12 },
      elapsedMilliseconds: Date.now() - started,
    };
    const recordSha256 = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    await appendFile(
      outputPath,
      `${JSON.stringify({ ...body, recordSha256 })}\n`,
      "utf8",
    );
    console.log(
      `${fixture.id} shard ${shardIndex}/${shardCount} ${body.elapsedMilliseconds}ms`,
    );
    existing.add(fixture.id);
  }
  await page.evaluate(() => {
    const engine = (
      window as unknown as { __performanceEngine: { worker: Worker } }
    ).__performanceEngine;
    engine.worker.terminate();
  });
});
