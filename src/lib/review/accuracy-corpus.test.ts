import { describe, expect, it } from "vitest";

import { ACCURACY_GAME_CORPUS } from "../../../calibration/accuracy-games";
import { parsePgnToReviewGame } from "@/lib/chess/pgn";

describe("accuracy real-game calibration corpus", () => {
  it("contains legal, sourced games of varied lengths without accuracy goldens", () => {
    const lengths = ACCURACY_GAME_CORPUS.map((fixture) => {
      expect(fixture.provenance).toContain("https://");
      expect(fixture.purpose.length).toBeGreaterThan(20);
      expect(fixture).not.toHaveProperty("expectedAccuracy");
      return parsePgnToReviewGame(fixture.pgn).moves.length;
    });
    expect(Math.min(...lengths)).toBeLessThanOrEqual(4);
    expect(Math.max(...lengths)).toBeGreaterThanOrEqual(80);
  });
});
