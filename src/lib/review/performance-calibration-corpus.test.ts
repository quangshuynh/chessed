import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";

interface SampleGame {
  id: string;
  band: string;
  whiteRating: number;
  blackRating: number;
  result: string;
  partition: "calibration" | "holdout";
  pgn: string;
}

describe("estimated-performance calibration probe", () => {
  it("is legal, rating-stratified, deterministic, and disjoint", () => {
    const artifact = JSON.parse(
      readFileSync(
        resolve("calibration/results/performance-sample.json"),
        "utf8",
      ),
    ) as { games: SampleGame[]; sourceSha256: string };

    expect(artifact.sourceSha256).toBe(
      "aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635",
    );
    expect(artifact.games).toHaveLength(12);
    expect(new Set(artifact.games.map((game) => game.id)).size).toBe(12);
    expect(new Set(artifact.games.map((game) => game.band))).toEqual(
      new Set(["lower", "intermediate", "advanced", "expert"]),
    );
    expect(
      artifact.games.filter((game) => game.partition === "holdout"),
    ).toHaveLength(2);

    for (const game of artifact.games) {
      expect(game.whiteRating).toBeGreaterThan(0);
      expect(game.blackRating).toBeGreaterThan(0);
      expect(["1-0", "0-1", "1/2-1/2"]).toContain(game.result);
      expect(parsePgnToReviewGame(game.pgn).moves.length).toBeGreaterThan(0);
      const expected =
        createHash("sha256").update(game.id).digest()[0] % 3 === 0
          ? "holdout"
          : "calibration";
      expect(game.partition).toBe(expected);
    }
  });
});
