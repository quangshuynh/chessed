import { test } from "@playwright/test";
import { Chess } from "chess.js";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildCalibrationReport,
  type CalibrationObservation,
} from "../calibration/special-calibration";
import {
  SPECIAL_POSITION_CORPUS,
  type SpecialPositionCase,
} from "../calibration/special-position-corpus";
import type { PositionAnalysis } from "../src/lib/review/interfaces";

test.skip(
  !process.env.CHESSED_CALIBRATION,
  "Run explicitly with npm run test:calibration",
);

interface ProbeRequest {
  key: string;
  fen: string;
  depth: number;
  multiPv: number;
}

interface ProbeScenario {
  position: SpecialPositionCase;
  depth: number;
  multiPv: number;
  beforeKey: string;
  afterKey: string | null;
}

function scenarios(): ProbeScenario[] {
  const result = SPECIAL_POSITION_CORPUS.map((position) => ({
    position,
    depth: 12,
    multiPv: 3,
  }));
  const depthIds = new Set([
    "opera-game-queen-offer",
    "legal-trap-piece-offer",
    "mate-in-one-not-played",
    "quiet-king-centralization",
    "hanging-rook-capture",
    "hanging-minor-capture",
    "hanging-queen-nonchecking",
    "critical-checking-queen-capture",
    "defensive-rook-capture",
    "quiet-back-rank-defense",
    "reti-1921-drawing-king-move",
    "yates-marshall-1929-kb2",
    "lasker-tarrasch-1914-h4",
    "hamppe-meitner-1872-perpetual",
    "leko-kramnik-2008-perpetual",
    "fischer-tal-1960-perpetual",
    "matulovic-minev-1956-stalemate",
    "rhine-2006-stalemate-study",
  ]);
  for (const position of SPECIAL_POSITION_CORPUS.filter(({ id }) =>
    depthIds.has(id),
  )) {
    for (const depth of [10, 14, 16])
      result.push({ position, depth, multiPv: 3 });
  }
  const multiPvIds = new Set([
    "opera-game-queen-offer",
    "starting-position-e4",
    "quiet-king-centralization",
    "reti-1921-drawing-king-move",
    "hamppe-meitner-1872-perpetual",
    "matulovic-minev-1956-stalemate",
    "rhine-2006-stalemate-study",
  ]);
  for (const position of SPECIAL_POSITION_CORPUS.filter(({ id }) =>
    multiPvIds.has(id),
  )) {
    for (const multiPv of [2, 4, 5])
      result.push({ position, depth: 12, multiPv });
  }
  const defensiveDepthIds = new Set([
    "reti-1921-drawing-king-move",
    "yates-marshall-1929-kb2",
    "lasker-tarrasch-1914-h4",
    "hamppe-meitner-1872-perpetual",
    "leko-kramnik-2008-perpetual",
    "fischer-tal-1960-perpetual",
    "matulovic-minev-1956-stalemate",
    "rhine-2006-stalemate-study",
  ]);
  for (const position of SPECIAL_POSITION_CORPUS.filter(({ id }) =>
    defensiveDepthIds.has(id),
  )) {
    result.push({ position, depth: 18, multiPv: 3 });
  }
  return result.map(({ position, depth, multiPv }) => {
    const chess = new Chess(position.fen);
    chess.move({
      from: position.moveUci.slice(0, 2),
      to: position.moveUci.slice(2, 4),
      promotion: position.moveUci[4],
    });
    const prefix = `${position.id}:d${depth}:m${multiPv}`;
    return {
      position,
      depth,
      multiPv,
      beforeKey: `${prefix}:before`,
      afterKey: chess.isGameOver() ? null : `${prefix}:after`,
    };
  });
}

test("bounded Stockfish depth, MultiPV, and special-policy calibration", async ({
  page,
}, testInfo) => {
  const selected = scenarios();
  const requests: ProbeRequest[] = selected.flatMap((scenario) => {
    const chess = new Chess(scenario.position.fen);
    chess.move({
      from: scenario.position.moveUci.slice(0, 2),
      to: scenario.position.moveUci.slice(2, 4),
      promotion: scenario.position.moveUci[4],
    });
    return [
      {
        key: scenario.beforeKey,
        fen: scenario.position.fen,
        depth: scenario.depth,
        multiPv: scenario.multiPv,
      },
      ...(scenario.afterKey
        ? [
            {
              key: scenario.afterKey,
              fen: chess.fen(),
              depth: scenario.depth,
              multiPv: scenario.multiPv,
            },
          ]
        : []),
    ];
  });

  await page.goto("/");
  const analyses = await page.evaluate(async (probeRequests) => {
    const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    const listeners = new Set<(line: string) => void>();
    worker.addEventListener("message", (event) => {
      for (const listener of listeners) listener(String(event.data).trim());
    });
    const until = (predicate: (line: string) => boolean) =>
      new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          listeners.delete(listener);
          reject(new Error("Timed out waiting for Stockfish."));
        }, 30_000);
        const listener = (line: string) => {
          if (!predicate(line)) return;
          window.clearTimeout(timer);
          listeners.delete(listener);
          resolve(line);
        };
        listeners.add(listener);
      });
    worker.postMessage("uci");
    await until((line) => line === "uciok");
    worker.postMessage("isready");
    await until((line) => line === "readyok");

    const output: Record<string, PositionAnalysis> = {};
    for (const request of probeRequests) {
      const latest = new Map<
        number,
        {
          depth: number;
          rank: number;
          evaluation: PositionAnalysis["evaluation"];
          principalVariationUci: string[];
        }
      >();
      const onInfo = (line: string) => {
        const depth = /(?:^|\s)depth (\d+)(?:\s|$)/.exec(line);
        const score = /(?:^|\s)score (cp|mate) (-?\d+)(?:\s|$)/.exec(line);
        const rank = /(?:^|\s)multipv (\d+)(?:\s|$)/.exec(line);
        const pv = /(?:^|\s)pv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)$/.exec(
          line,
        );
        if (!depth || !score || !pv) return;
        const side = request.fen.split(" ")[1];
        const value = Number(score[2]) * (side === "w" ? 1 : -1);
        latest.set(Number(rank?.[1] ?? 1), {
          depth: Number(depth[1]),
          rank: Number(rank?.[1] ?? 1),
          evaluation:
            score[1] === "cp"
              ? { kind: "centipawns", perspective: "white", value }
              : { kind: "mate", perspective: "white", moves: value },
          principalVariationUci: pv[1].trim().split(/\s+/),
        });
      };
      listeners.add(onInfo);
      worker.postMessage(`setoption name MultiPV value ${request.multiPv}`);
      worker.postMessage(`position fen ${request.fen}`);
      worker.postMessage(`go depth ${request.depth}`);
      const bestLine = await until((line) => line.startsWith("bestmove "));
      listeners.delete(onInfo);
      const candidates = [...latest.values()]
        .filter((candidate) => candidate.depth === request.depth)
        .sort((left, right) => left.rank - right.rank)
        .map((candidate) => ({
          rank: candidate.rank,
          moveUci: candidate.principalVariationUci[0],
          evaluation: candidate.evaluation,
          principalVariationUci: candidate.principalVariationUci,
        }));
      const first = candidates[0];
      if (!first) throw new Error(`No analysis for ${request.key}`);
      output[request.key] = {
        fen: request.fen,
        evaluation: first.evaluation,
        bestMoveUci: bestLine.split(/\s+/)[1],
        principalVariationUci: first.principalVariationUci,
        candidates,
        limit: {
          requested: { kind: "depth", value: request.depth },
          achievedDepth: request.depth,
        },
        engine: { name: "Stockfish 18 lite calibration probe" },
      };
    }
    worker.terminate();
    return output;
  }, requests);

  const observations: CalibrationObservation[] = selected.map((scenario) => ({
    position: scenario.position,
    depth: scenario.depth,
    multiPv: scenario.multiPv,
    analysisBefore: analyses[scenario.beforeKey],
    analysisAfter: scenario.afterKey ? analyses[scenario.afterKey] : null,
  }));
  const report = buildCalibrationReport(observations);
  const json = JSON.stringify(report, null, 2);
  await testInfo.attach("special-calibration.json", {
    body: json,
    contentType: "application/json",
  });
  await writeFile(
    resolve("calibration/results/stockfish-18-lite.json"),
    `${json}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      report.map(
        ({
          id,
          depth,
          multiPv,
          ordinaryClassification,
          specialClassification,
          specialRule,
          rejectionReasons,
        }) => ({
          id,
          depth,
          multiPv,
          ordinaryClassification,
          specialClassification,
          specialRule,
          rejectionReasons,
        }),
      ),
      null,
      2,
    ),
  );
});
