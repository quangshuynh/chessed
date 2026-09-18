import { test } from "@playwright/test";
import { Chess } from "chess.js";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ACCURACY_GAME_CORPUS } from "../calibration/accuracy-games";
import { parsePgnToReviewGame } from "../src/lib/chess/pgn";
import { buildWholeGameReview } from "../src/lib/review/game-review";
import type {
  EngineEvaluation,
  GamePositionAnalysis,
} from "../src/lib/review/interfaces";

test.skip(
  !process.env.CHESSED_ACCURACY_CALIBRATION,
  "Run explicitly with npm run test:accuracy-calibration",
);

test("real Stockfish 18 lite accuracy calibration", async ({
  page,
}, testInfo) => {
  const games = ACCURACY_GAME_CORPUS.map((fixture) => ({
    fixture,
    game: parsePgnToReviewGame(fixture.pgn),
  }));
  const requests = games.flatMap(({ fixture, game }) =>
    game.positions.flatMap((fen, positionIndex) => {
      const chess = new Chess(fen);
      return chess.isGameOver()
        ? []
        : [{ key: `${fixture.id}:${positionIndex}`, fen }];
    }),
  );

  await page.goto("/");
  const analyses = await page.evaluate(async (items) => {
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
    const output: Record<
      string,
      { evaluation: EngineEvaluation; bestMoveUci: string | null; pv: string[] }
    > = {};
    for (const item of items) {
      const latest: {
        value: { evaluation: EngineEvaluation; pv: string[] } | null;
      } = { value: null };
      const onInfo = (line: string) => {
        const depth = /(?:^|\s)depth (\d+)(?:\s|$)/.exec(line);
        const score = /(?:^|\s)score (cp|mate) (-?\d+)(?:\s|$)/.exec(line);
        const pv = /(?:^|\s)pv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)$/.exec(
          line,
        );
        if (!depth || Number(depth[1]) !== 12 || !score || !pv) return;
        const sign = item.fen.split(" ")[1] === "w" ? 1 : -1;
        const value = Number(score[2]) * sign;
        latest.value = {
          evaluation:
            score[1] === "cp"
              ? { kind: "centipawns", perspective: "white", value }
              : { kind: "mate", perspective: "white", moves: value },
          pv: pv[1].trim().split(/\s+/),
        };
      };
      listeners.add(onInfo);
      worker.postMessage("setoption name MultiPV value 1");
      worker.postMessage(`position fen ${item.fen}`);
      worker.postMessage("go depth 12");
      const best = await until((line) => line.startsWith("bestmove "));
      listeners.delete(onInfo);
      if (!latest.value) throw new Error(`No analysis for ${item.key}`);
      output[item.key] = {
        evaluation: latest.value.evaluation,
        bestMoveUci: best.split(/\s+/)[1] ?? null,
        pv: latest.value.pv,
      };
    }
    worker.terminate();
    return output;
  }, requests);

  const report = games.map(({ fixture, game }) => {
    const positions: GamePositionAnalysis[] = game.positions.map(
      (fen, positionIndex) => {
        const chess = new Chess(fen);
        if (chess.isCheckmate()) {
          return {
            status: "terminal",
            positionIndex,
            followingMovePly: null,
            fen,
            reason: "checkmate",
            winner: chess.turn() === "w" ? "black" : "white",
          };
        }
        const result = analyses[`${fixture.id}:${positionIndex}`];
        if (!result) throw new Error(`Missing ${fixture.id}:${positionIndex}`);
        return {
          status: "analyzed",
          positionIndex,
          followingMovePly: game.moves[positionIndex]?.ply ?? null,
          analysis: {
            fen,
            evaluation: result.evaluation,
            bestMoveUci: result.bestMoveUci,
            principalVariationUci: result.pv,
            limit: {
              requested: { kind: "depth", value: 12 },
              achievedDepth: 12,
            },
            engine: { name: "Stockfish", version: "18 lite" },
          },
        };
      },
    );
    const review = buildWholeGameReview({ game, positions });
    return {
      id: fixture.id,
      provenance: fixture.provenance,
      purpose: fixture.purpose,
      accuracy: review.accuracy,
      classifications: review.counts,
      majorOutcomeDrops: review.moves.flatMap((move) => {
        const drop =
          move.classification.status === "classified"
            ? move.classification.evidence.outcomeDrop
            : null;
        return drop !== null && drop >= 0.075
          ? [
              {
                ply: move.ply,
                san: move.san,
                player: move.player,
                outcomeDrop: drop,
              },
            ]
          : [];
      }),
      mateTransitions: review.moves.flatMap((move) =>
        move.mateTransition
          ? [{ ply: move.ply, transition: move.mateTransition }]
          : [],
      ),
    };
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await testInfo.attach("accuracy-calibration.json", {
    body: json,
    contentType: "application/json",
  });
  await writeFile(
    resolve("calibration/results/accuracy-stockfish-18-lite.json"),
    json,
    "utf8",
  );
  console.log(json);
});
