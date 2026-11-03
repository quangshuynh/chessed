import { describe, expect, it } from "vitest";

import type { EvaluationGraphPoint } from "@/lib/review/evaluation-graph";

import {
  formatAccuracy,
  formatAccuracyCoverage,
  formatClassification,
  formatEvaluation,
  formatGraphPointValue,
  formatSpecialClassification,
} from "./review-format";

function graphPoint(
  overrides: Partial<EvaluationGraphPoint>,
): EvaluationGraphPoint {
  return {
    positionIndex: 1,
    ply: 1,
    moveNumber: 1,
    player: "white",
    san: "e4",
    label: "1. e4",
    evaluation: null,
    terminal: null,
    displayValue: null,
    ...overrides,
  };
}

describe("review presentation formatting", () => {
  it.each([
    [96.94, "96.9%"],
    [100, "100.0%"],
    [0, "0.0%"],
    [null, null],
  ])("formats accuracy %s with consistent precision", (value, expected) => {
    expect(formatAccuracy(value)).toBe(expected);
  });

  it("formats complete and partial coverage without inventing confidence", () => {
    expect(
      formatAccuracyCoverage({
        value: 96.9,
        scoredMoveCount: 40,
        unavailableMoveCount: 0,
      }),
    ).toBe("40 scored");
    expect(
      formatAccuracyCoverage({
        value: 96.9,
        scoredMoveCount: 40,
        unavailableMoveCount: 1,
      }),
    ).toBe("40 scored · 1 unavailable");
  });

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

  it("reports a graph point's semantic value, never its bounded plot value", () => {
    expect(
      formatGraphPointValue(
        graphPoint({
          evaluation: { kind: "mate", perspective: "white", moves: 3 },
          displayValue: 10,
        }),
      ),
    ).toBe("M3");
    expect(
      formatGraphPointValue(
        graphPoint({
          evaluation: { kind: "mate", perspective: "white", moves: -2 },
          displayValue: -10,
        }),
      ),
    ).toBe("-M2");
    expect(
      formatGraphPointValue(
        graphPoint({
          evaluation: { kind: "centipawns", perspective: "white", value: 4200 },
          displayValue: 10,
        }),
      ),
    ).toBe("+42.00");
  });

  it("names a terminal graph point by its outcome and a missing one as unavailable", () => {
    expect(
      formatGraphPointValue(
        graphPoint({
          terminal: { reason: "checkmate", winner: "black" },
          displayValue: -10,
        }),
      ),
    ).toBe("Checkmate");
    expect(
      formatGraphPointValue(
        graphPoint({
          terminal: { reason: "threefold-repetition", winner: null },
          displayValue: 0,
        }),
      ),
    ).toBe("Draw by threefold repetition");
    expect(formatGraphPointValue(graphPoint({}))).toBe("Unavailable");
  });
});

describe("report wording parity", () => {
  it("exports evaluations with exactly the wording the review UI shows", async () => {
    const { formatReportEvaluation } =
      await import("@/lib/review/markdown-report");
    for (const evaluation of [
      { kind: "centipawns", perspective: "white", value: 0 },
      { kind: "centipawns", perspective: "white", value: 5 },
      { kind: "centipawns", perspective: "white", value: -142 },
      { kind: "centipawns", perspective: "white", value: 1234 },
      { kind: "mate", perspective: "white", moves: 3 },
      { kind: "mate", perspective: "white", moves: -1 },
    ] as const) {
      expect(formatReportEvaluation(evaluation)).toBe(
        formatEvaluation(evaluation),
      );
    }
  });
});
