import { describe, expect, it } from "vitest";

import {
  centipawnsToOutcomeExpectation,
  classifyMove,
  ORDINARY_CLASSIFICATION_THRESHOLDS,
  OUTCOME_EXPECTATION_SCALE_CENTIPAWNS,
  type OrdinaryMoveClassification,
} from "@/lib/review/classification";
import type {
  MateTransition,
  MoveQualityObservation,
  PlayerRelativeEvaluation,
} from "@/lib/review/move-quality";

const cp = (value: number): PlayerRelativeEvaluation => ({
  kind: "centipawns",
  perspective: "player",
  value,
});
const mate = (
  outcome: "favorable" | "unfavorable",
  moves: number,
): PlayerRelativeEvaluation => ({
  kind: "mate",
  perspective: "player",
  outcome,
  moves,
});

function centipawnObservation(input: {
  before: number;
  after: number;
  playedBestMove?: boolean;
  player?: "white" | "black";
}): MoveQualityObservation {
  const rawDifference = input.before - input.after;
  const playedBestMove = input.playedBestMove ?? false;
  return {
    ply: 1,
    player: input.player ?? "white",
    playedMoveUci: playedBestMove ? "e2e4" : "d2d4",
    bestMoveUci: "e2e4",
    playedBestMove,
    before: cp(input.before),
    after: { kind: "engine", evaluation: cp(input.after) },
    loss: {
      kind: "centipawns",
      rawDifference,
      value: Math.max(0, rawDifference),
      apparentImprovement: rawDifference < 0,
    },
  };
}

function mateObservation(
  before: PlayerRelativeEvaluation,
  after: PlayerRelativeEvaluation,
  transition: MateTransition,
  playedBestMove = false,
): MoveQualityObservation {
  return {
    ply: 1,
    player: "white",
    playedMoveUci: playedBestMove ? "e2e4" : "d2d4",
    bestMoveUci: "e2e4",
    playedBestMove,
    before,
    after: { kind: "engine", evaluation: after },
    loss: { kind: "mate-transition", transition, centipawnLoss: null },
  };
}

function terminalObservation(input: {
  before: PlayerRelativeEvaluation;
  result: "win" | "loss" | "draw";
  reason?:
    | "checkmate"
    | "stalemate"
    | "insufficient-material"
    | "threefold-repetition"
    | "fifty-move-rule"
    | "draw";
  playedBestMove?: boolean;
}): MoveQualityObservation {
  const playedBestMove = input.playedBestMove ?? false;
  return {
    ply: 1,
    player: "white",
    playedMoveUci: playedBestMove ? "e2e4" : "d2d4",
    bestMoveUci: "e2e4",
    playedBestMove,
    before: input.before,
    after: {
      kind: "terminal",
      reason: input.reason ?? "checkmate",
      result: input.result,
    },
    loss: { kind: "terminal", result: input.result, centipawnLoss: null },
  };
}

function classification(observation: MoveQualityObservation) {
  const result = classifyMove(observation);
  expect(result.status).toBe("classified");
  return result.status === "classified" ? result.classification : null;
}

function cpForExpectation(expectation: number): number {
  return (
    OUTCOME_EXPECTATION_SCALE_CENTIPAWNS *
    Math.log(expectation / (1 - expectation))
  );
}

describe("outcome expectation", () => {
  it("is bounded, monotonic, symmetric, and safe at finite extremes", () => {
    const values = [-100_000, -800, 0, 800, 100_000].map(
      centipawnsToOutcomeExpectation,
    );
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(values).toEqual([...values].sort((left, right) => left - right));
    for (const value of [0, 25, 400, 10_000]) {
      expect(
        centipawnsToOutcomeExpectation(value) +
          centipawnsToOutcomeExpectation(-value),
      ).toBeCloseTo(1, 12);
    }
  });

  it("rejects non-finite input", () => {
    expect(() => centipawnsToOutcomeExpectation(Number.NaN)).toThrow(/finite/);
  });
});

describe("Best policy", () => {
  it("accepts the exact engine best move despite tiny after-search disagreement", () => {
    const result = classifyMove(
      centipawnObservation({ before: 0, after: -20, playedBestMove: true }),
    );
    expect(result).toMatchObject({
      status: "classified",
      classification: "best",
      evidence: { rule: "engine-best-match" },
    });
  });

  it.each([
    ["zero-loss non-best", 0, 0, "best"],
    ["equivalent small-loss alternative", 0, -15, "best"],
    ["small-loss outside equivalence", 0, -16, "good"],
    ["large apparent improvement/noise", 0, 100, "good"],
  ] as const)("classifies %s", (_label, before, after, expected) => {
    expect(classification(centipawnObservation({ before, after }))).toBe(
      expected,
    );
  });

  it("classifies a checkmating move as Best", () => {
    expect(
      classification(
        terminalObservation({ before: mate("favorable", 1), result: "win" }),
      ),
    ).toBe("best");
  });
});

describe("ordinary outcome-drop thresholds", () => {
  const cases: Array<[string, number, OrdinaryMoveClassification]> = [];
  const epsilon = 0.000001;
  for (const [name, threshold, below, at] of [
    [
      "inaccuracy",
      ORDINARY_CLASSIFICATION_THRESHOLDS.inaccuracyMinimumOutcomeDrop,
      "good",
      "inaccuracy",
    ],
    [
      "mistake",
      ORDINARY_CLASSIFICATION_THRESHOLDS.mistakeMinimumOutcomeDrop,
      "inaccuracy",
      "mistake",
    ],
    [
      "blunder",
      ORDINARY_CLASSIFICATION_THRESHOLDS.blunderMinimumOutcomeDrop,
      "mistake",
      "blunder",
    ],
  ] as const) {
    cases.push(
      [`just below ${name}`, threshold - epsilon, below],
      [`exactly at ${name}`, threshold, at],
      [`just above ${name}`, threshold + epsilon, at],
    );
  }

  it.each(cases)("classifies a drop %s", (_label, drop, expected) => {
    const after = cpForExpectation(0.5 - drop);
    expect(classification(centipawnObservation({ before: 0, after }))).toBe(
      expected,
    );
  });
});

describe("perspective and position state", () => {
  it("uses already player-relative values identically for White and Black", () => {
    const white = classification(
      centipawnObservation({ before: 80, after: -80, player: "white" }),
    );
    const black = classification(
      centipawnObservation({ before: 80, after: -80, player: "black" }),
    );
    expect(black).toBe(white);
  });

  it.each([
    ["equal position", 0, -100, "inaccuracy"],
    ["crossing equality", 50, -50, "inaccuracy"],
    ["moderate advantage", 300, 200, "inaccuracy"],
    ["huge winning advantage", 1600, 1500, "good"],
    ["huge losing position", -800, -900, "good"],
    ["catastrophic swing", 300, -500, "blunder"],
  ] as const)("handles %s", (_label, before, after, expected) => {
    expect(classification(centipawnObservation({ before, after }))).toBe(
      expected,
    );
  });

  it("distinguishes the same raw 100cp loss by position state", () => {
    const equal = classification(
      centipawnObservation({ before: 20, after: -80 }),
    );
    const winning = classification(
      centipawnObservation({ before: 1600, after: 1500 }),
    );
    expect(equal).toBe("inaccuracy");
    expect(winning).toBe("good");
  });
});

describe("mate policy", () => {
  it.each([
    [cp(50), mate("favorable", 4), "creates-forced-mate", "best"],
    [cp(500), mate("unfavorable", 3), "newly-allows-forced-mate", "blunder"],
    [mate("favorable", 3), cp(900), "throws-away-forced-mate", "blunder"],
    [mate("unfavorable", 3), cp(-500), "escapes-forced-mate", "best"],
    [
      mate("unfavorable", 4),
      mate("favorable", 3),
      "reverses-to-favorable-mate",
      "best",
    ],
    [
      mate("favorable", 4),
      mate("unfavorable", 3),
      "reverses-to-unfavorable-mate",
      "blunder",
    ],
    [
      mate("favorable", 5),
      mate("favorable", 3),
      "retains-favorable-mate",
      "best",
    ],
    [
      mate("favorable", 3),
      mate("favorable", 5),
      "retains-favorable-mate",
      "good",
    ],
    [
      mate("unfavorable", 3),
      mate("unfavorable", 5),
      "retains-unfavorable-mate",
      "best",
    ],
    [
      mate("unfavorable", 5),
      mate("unfavorable", 3),
      "retains-unfavorable-mate",
      "good",
    ],
  ] as const)(
    "classifies %s to %s (%s)",
    (before, after, transition, expected) => {
      expect(classification(mateObservation(before, after, transition))).toBe(
        expected,
      );
    },
  );
});

describe("terminal policy", () => {
  it.each([
    ["stalemate", 900, "blunder"],
    ["threefold-repetition", 0, "good"],
    ["fifty-move-rule", -500, "good"],
    ["insufficient-material", 0, "good"],
    ["draw", 200, "mistake"],
  ] as const)("classifies a %s draw", (reason, before, expected) => {
    expect(
      classification(
        terminalObservation({ before: cp(before), result: "draw", reason }),
      ),
    ).toBe(expected);
  });

  it("treats drawing from favorable and unfavorable forced mate distinctly", () => {
    expect(
      classification(
        terminalObservation({
          before: mate("favorable", 2),
          result: "draw",
          reason: "stalemate",
        }),
      ),
    ).toBe("blunder");
    expect(
      classification(
        terminalObservation({
          before: mate("unfavorable", 2),
          result: "draw",
          reason: "draw",
        }),
      ),
    ).toBe("best");
  });

  it("classifies getting checkmated as a Blunder", () => {
    expect(
      classification(terminalObservation({ before: cp(-900), result: "loss" })),
    ).toBe("blunder");
  });
});

describe("unavailable and inconsistent evidence", () => {
  it.each(["missing-before-analysis", "missing-after-analysis"] as const)(
    "preserves %s",
    (reason) => {
      const observation = centipawnObservation({ before: 0, after: 0 });
      observation.loss = { kind: "unavailable", reason };
      expect(classifyMove(observation)).toEqual({
        status: "unavailable",
        reason,
      });
    },
  );

  it("rejects a malformed loss instead of silently calling it Good", () => {
    const observation = centipawnObservation({ before: 0, after: -100 });
    if (observation.loss.kind === "centipawns") observation.loss.value = 0;
    expect(classifyMove(observation)).toEqual({
      status: "unavailable",
      reason: "inconsistent-observation",
    });
  });

  it("rejects inconsistent best-move identity", () => {
    const observation = centipawnObservation({
      before: 0,
      after: 0,
      playedBestMove: true,
    });
    observation.playedMoveUci = "d2d4";
    expect(classifyMove(observation)).toMatchObject({
      status: "unavailable",
      reason: "inconsistent-observation",
    });
  });

  it("rejects a mate-transition tag that disagrees with its evaluations", () => {
    const observation = mateObservation(
      cp(0),
      mate("favorable", 2),
      "newly-allows-forced-mate",
    );
    expect(classifyMove(observation)).toEqual({
      status: "unavailable",
      reason: "inconsistent-observation",
    });
  });
});
