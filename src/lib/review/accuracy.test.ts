import { describe, expect, it } from "vitest";

import {
  ACCURACY_METHODOLOGY_VERSION,
  accuracyFromOutcomeDrop,
  calculateGameAccuracy,
  scoreMoveAccuracy,
} from "@/lib/review/accuracy";
import { centipawnsToOutcomeExpectation } from "@/lib/review/classification";
import type { PlayerColor } from "@/lib/review/move-quality";

const cp = (value: number) => ({
  kind: "centipawns" as const,
  perspective: "player" as const,
  value,
});
const mate = (outcome: "favorable" | "unfavorable", moves = 3) => ({
  kind: "mate" as const,
  perspective: "player" as const,
  outcome,
  moves,
});
const move = (
  player: PlayerColor,
  before: ReturnType<typeof cp> | ReturnType<typeof mate> | null,
  after:
    | {
        kind: "engine";
        evaluation: ReturnType<typeof cp> | ReturnType<typeof mate>;
      }
    | {
        kind: "terminal";
        result: "win" | "loss" | "draw";
        reason: "checkmate" | "stalemate";
      }
    | null,
) => ({ player, playerEvaluationBefore: before, playerOutcomeAfter: after });
const engine = (
  evaluation: ReturnType<typeof cp> | ReturnType<typeof mate>,
) => ({
  kind: "engine" as const,
  evaluation,
});

describe("per-move accuracy", () => {
  it("is finite, bounded, monotonic, continuous, and preserves improvements", () => {
    const drops = [
      0, 0.005, 0.01, 0.0249, 0.025, 0.0749, 0.075, 0.1499, 0.15, 0.2, 0.3, 0.5,
      1,
    ];
    const values = drops.map(accuracyFromOutcomeDrop);
    expect(values[0]).toBe(1);
    expect(values.at(-1)).toBe(0);
    expect(
      values.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    ).toBe(true);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeLessThanOrEqual(values[index - 1]);
    }
    expect(Math.abs(values[4] - values[3])).toBeLessThan(0.001);
    expect(Math.abs(values[6] - values[5])).toBeLessThan(0.001);
    expect(Math.abs(values[8] - values[7])).toBeLessThan(0.001);
    expect(
      scoreMoveAccuracy(move("white", cp(0), engine(cp(20)))),
    ).toMatchObject({ status: "scored", value: 1, outcomeDrop: 0 });
  });

  it("compresses equal raw losses in already decided positions", () => {
    const equal = scoreMoveAccuracy(move("white", cp(100), engine(cp(-100))));
    const winning = scoreMoveAccuracy(move("white", cp(800), engine(cp(600))));
    const losing = scoreMoveAccuracy(
      move("white", cp(-800), engine(cp(-1000))),
    );
    expect(equal.status).toBe("scored");
    expect(winning.status).toBe("scored");
    expect(losing.status).toBe("scored");
    if (
      equal.status !== "scored" ||
      winning.status !== "scored" ||
      losing.status !== "scored"
    )
      return;
    expect(winning.value).toBeGreaterThan(equal.value);
    expect(losing.value).toBeGreaterThan(equal.value);
    expect(losing.value).toBeLessThan(1);
  });

  it("uses first-class mate and terminal result semantics", () => {
    const cases = [
      [mate("favorable"), engine(mate("favorable", 8)), 1],
      [cp(0), engine(mate("favorable")), 1],
      [mate("unfavorable"), engine(cp(-300)), 1],
      [mate("favorable"), engine(cp(0)), 0.0625],
      [cp(0), engine(mate("unfavorable")), 0.0625],
      [mate("favorable"), engine(mate("unfavorable")), 0],
      [
        mate("favorable"),
        {
          kind: "terminal" as const,
          result: "win" as const,
          reason: "checkmate" as const,
        },
        1,
      ],
      [
        mate("unfavorable"),
        {
          kind: "terminal" as const,
          result: "loss" as const,
          reason: "checkmate" as const,
        },
        1,
      ],
      [
        cp(800),
        {
          kind: "terminal" as const,
          result: "draw" as const,
          reason: "stalemate" as const,
        },
        accuracyFromOutcomeDrop(centipawnsToOutcomeExpectation(800) - 0.5),
      ],
      [
        cp(-800),
        {
          kind: "terminal" as const,
          result: "draw" as const,
          reason: "stalemate" as const,
        },
        1,
      ],
    ] as const;
    for (const [before, after, expected] of cases) {
      expect(scoreMoveAccuracy(move("white", before, after))).toMatchObject({
        status: "scored",
        value: expected,
      });
    }
  });

  it("is perspective invariant and independent of classifications", () => {
    const white = scoreMoveAccuracy(move("white", cp(200), engine(cp(0))));
    const black = scoreMoveAccuracy(move("black", cp(200), engine(cp(0))));
    expect(black).toEqual(white);
  });

  it("rejects invalid drops", () => {
    for (const value of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => accuracyFromOutcomeDrop(value)).toThrow();
    }
  });
});

describe("game accuracy", () => {
  it("aggregates each player independently with explicit partial coverage", () => {
    const result = calculateGameAccuracy([
      move("white", cp(0), engine(cp(0))),
      move("black", cp(0), engine(cp(-100))),
      move("white", null, null),
      move("black", cp(0), engine(cp(0))),
      move("white", cp(0), engine(cp(-200))),
    ]);
    expect(result.white.scoredMoveCount).toBe(2);
    expect(result.white.unavailableMoveCount).toBe(1);
    expect(result.black.scoredMoveCount).toBe(2);
    expect(result.white.value).not.toBeNull();
    expect(result.black.value).not.toBeNull();
    expect(result.methodology.version).toBe(ACCURACY_METHODOLOGY_VERSION);
  });

  it("returns null only when a player has no scoreable moves", () => {
    const result = calculateGameAccuracy([move("white", null, null)]);
    expect(result.white).toEqual({
      value: null,
      scoredMoveCount: 0,
      unavailableMoveCount: 1,
    });
    expect(result.black).toEqual({
      value: null,
      scoredMoveCount: 0,
      unavailableMoveCount: 0,
    });
  });

  it("handles short games and adding a perfect move cannot reduce accuracy", () => {
    const imperfect = move("white", cp(0), engine(cp(-200)));
    const one = calculateGameAccuracy([imperfect]).white;
    const two = calculateGameAccuracy([
      imperfect,
      move("white", cp(0), engine(cp(0))),
    ]).white;
    expect(one.scoredMoveCount).toBe(1);
    expect(two.scoredMoveCount).toBe(2);
    expect(two.value!).toBeGreaterThanOrEqual(one.value!);
  });

  it("distinguishes one catastrophe from many moderate losses without hidden weighting", () => {
    const perfect = move("white", cp(0), engine(cp(0)));
    const catastrophe = move(
      "white",
      mate("favorable"),
      engine(mate("unfavorable")),
    );
    const moderateDrop = 0.075;
    const beforeCp = 0;
    const afterCp = 410 * Math.log((0.5 - moderateDrop) / (0.5 + moderateDrop));
    const oneBlunder = calculateGameAccuracy([
      ...Array(19).fill(perfect),
      catastrophe,
    ]).white.value!;
    const many = calculateGameAccuracy(
      Array.from({ length: 20 }, () =>
        move("white", cp(beforeCp), engine(cp(afterCp))),
      ),
    ).white.value!;
    expect(oneBlunder).toBe(95);
    expect(many).toBeCloseTo(accuracyFromOutcomeDrop(moderateDrop) * 100, 10);
  });
});
