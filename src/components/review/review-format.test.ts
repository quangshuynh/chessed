import { describe, expect, it } from "vitest";

import {
  formatClassification,
  formatEvaluation,
  formatSpecialClassification,
} from "./review-format";

describe("review presentation formatting", () => {
  it.each([
    [{ kind: "centipawns", perspective: "white", value: 35 } as const, "+0.35"],
    [
      { kind: "centipawns", perspective: "white", value: -142 } as const,
      "-1.42",
    ],
    [{ kind: "centipawns", perspective: "white", value: 0 } as const, "0.00"],
    [{ kind: "mate", perspective: "white", moves: 3 } as const, "M3"],
    [{ kind: "mate", perspective: "white", moves: -2 } as const, "-M2"],
  ])(
    "formats a canonical White-relative evaluation",
    (evaluation, expected) => {
      expect(formatEvaluation(evaluation)).toBe(expected);
    },
  );

  it.each([
    ["best", "Best"],
    ["good", "Good"],
    ["inaccuracy", "Inaccuracy"],
    ["mistake", "Mistake"],
    ["blunder", "Blunder"],
  ] as const)("labels the %s ordinary classification", (value, expected) => {
    expect(formatClassification(value)).toBe(expected);
  });

  it.each([
    ["great", "Great"],
    ["brilliant", "Brilliant"],
    ["miss", "Miss"],
  ] as const)("labels the %s special classification", (value, expected) => {
    expect(formatSpecialClassification(value)).toBe(expected);
  });
});
