import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  derivePlayerFeatures,
  sha256,
} from "../../../calibration/performance/lib.mjs";
import {
  fitModel,
  predict,
} from "../../../calibration/performance/modeling.mjs";

interface SelectedGame {
  id: string;
  band: string;
  partition: "train" | "validation" | "holdout";
}

const spec = JSON.parse(
  readFileSync("calibration/performance/experiment-v2.json", "utf8"),
) as {
  status: string;
  targetGames: number;
  ratingBands: { id: string }[];
};
const sample = JSON.parse(
  readFileSync(
    "calibration/results/performance-v2/selected-games.json",
    "utf8",
  ),
) as { artifactSha256: string; games: SelectedGame[] };

describe("performance calibration v2 preregistration and sample", () => {
  it("keeps the experiment fixed, balanced by band, and split only by game", () => {
    expect(spec.status).toBe("preregistered-before-engine-analysis");
    expect(spec.targetGames).toBe(480);
    expect(sample.games).toHaveLength(480);
    expect(new Set(sample.games.map((game) => game.id)).size).toBe(480);
    for (const band of spec.ratingBands) {
      const games = sample.games.filter((game) => game.band === band.id);
      expect(games).toHaveLength(120);
      expect(games.filter((game) => game.partition === "train")).toHaveLength(
        72,
      );
      expect(
        games.filter((game) => game.partition === "validation"),
      ).toHaveLength(24);
      expect(games.filter((game) => game.partition === "holdout")).toHaveLength(
        24,
      );
    }
    const { artifactSha256, ...body } = sample;
    expect(artifactSha256).toBe(sha256(canonicalJson(body)));
  });

  it("extracts production candidates without rating, result, color, or identity", () => {
    const moves = [
      { accuracy: 1, outcomeDrop: 0, onlyLegalMove: true },
      { accuracy: 0.8, outcomeDrop: 0.054, onlyLegalMove: false },
      { accuracy: 0.2, outcomeDrop: 0.241, onlyLegalMove: false },
    ];
    const features = derivePlayerFeatures(moves);
    expect(Object.keys(features)).not.toEqual(
      expect.arrayContaining([
        "rating",
        "opponentRating",
        "result",
        "color",
        "username",
      ]),
    );
  });

  it("fits and predicts deterministically with explicit clipping", () => {
    const rows = [
      { rating: 1000, accuracy: 50 },
      { rating: 1500, accuracy: 70 },
      { rating: 2000, accuracy: 90 },
    ];
    const first = fitModel("accuracy-only", rows);
    const second = fitModel("accuracy-only", [...rows].reverse());
    expect(first.intercept).toBeCloseTo(second.intercept, 10);
    expect(first.coefficients[0]).toBeCloseTo(second.coefficients[0], 10);
    expect(predict(first, { accuracy: -100 }, "clip-400-3000")).toBe(400);
    expect(predict(first, { accuracy: 200 }, "clip-400-3000")).toBe(3000);
  });

  it("separates only-legal evidence without changing uniform evidence", () => {
    const base = Array.from({ length: 5 }, () => ({
      accuracy: 0.8,
      outcomeDrop: 0.054,
      onlyLegalMove: false,
    }));
    const padded = [
      ...base,
      ...Array.from({ length: 20 }, () => ({
        accuracy: 1,
        outcomeDrop: 0,
        onlyLegalMove: true,
      })),
    ];
    expect(derivePlayerFeatures(padded).accuracy).toBeGreaterThan(
      derivePlayerFeatures(base).accuracy!,
    );
    expect(derivePlayerFeatures(padded).meaningfulAccuracy).toBe(
      derivePlayerFeatures(base).meaningfulAccuracy,
    );
    expect(derivePlayerFeatures(padded).meaningfulMoveCount).toBe(5);
  });

  it("makes missing and insufficient evidence explicit", () => {
    const empty = derivePlayerFeatures([]);
    expect(empty.accuracy).toBeNull();
    expect(empty.meaningfulAccuracy).toBeNull();
    expect(empty.scoredMoveCount).toBe(0);
    expect(empty.meaningfulMoveCount).toBe(0);
  });

  it("keeps the committed analyzed artifact complete and internally valid", () => {
    const records = readFileSync(
      "calibration/results/performance-v2/analyzed-player-games.jsonl",
      "utf8",
    )
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toHaveLength(480);
    expect(new Set(records.map((record) => record.gameId)).size).toBe(480);
    for (const record of records) {
      const { recordSha256, ...body } = record;
      expect(
        createHash("sha256").update(JSON.stringify(body)).digest("hex"),
      ).toBe(recordSha256);
      expect(record.engine).toEqual({
        name: "Stockfish",
        version: "18 lite",
        depth: 12,
      });
      const players = record.players as { color: string }[];
      expect(players.map((player) => player.color)).toEqual(["white", "black"]);
    }
  });

  it("locks the rejected validation candidate reproducibly", () => {
    const lock = JSON.parse(
      readFileSync(
        "calibration/results/performance-v2/validation-lock.json",
        "utf8",
      ),
    ) as Record<string, unknown>;
    const { lockSha256, ...body } = lock;
    expect(sha256(canonicalJson(body))).toBe(lockSha256);
    expect(lock.status).toBe("validation-rejected");

    const holdout = JSON.parse(
      readFileSync(
        "calibration/results/performance-v2/holdout-results.json",
        "utf8",
      ),
    ) as { lockSha256: string; decision: string };
    expect(holdout.lockSha256).toBe(lockSha256);
    expect(holdout.decision).toBe("do-not-freeze");
  });
});
