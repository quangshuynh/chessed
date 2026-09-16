import { describe, expect, it } from "vitest";

import type { MoveClassification } from "@/lib/review/classification";
import type {
  EngineCandidate,
  EngineEvaluation,
  PositionAnalysis,
} from "@/lib/review/interfaces";
import {
  classifySpecialMove,
  SPECIAL_CLASSIFICATION_POLICY,
} from "@/lib/review/special-classification";

const cp = (value: number): EngineEvaluation => ({
  kind: "centipawns",
  perspective: "white",
  value,
});
const mate = (moves: number): EngineEvaluation => ({
  kind: "mate",
  perspective: "white",
  moves,
});
const ordinary = (
  classification: "best" | "good" | "inaccuracy" | "mistake" | "blunder",
  outcomeDrop = 0,
): MoveClassification => ({
  status: "classified",
  classification,
  evidence: { outcomeDrop } as never,
});
const candidate = (
  rank: number,
  moveUci: string,
  evaluation: EngineEvaluation,
  pv: string[] = [moveUci],
): EngineCandidate => ({
  rank,
  moveUci,
  evaluation,
  principalVariationUci: pv,
});
function analysis(
  fen: string,
  candidates: EngineCandidate[],
  evaluation = candidates[0]?.evaluation ?? cp(0),
): PositionAnalysis {
  return {
    fen,
    evaluation,
    bestMoveUci: candidates[0]?.moveUci ?? null,
    principalVariationUci: candidates[0]?.principalVariationUci ?? [],
    candidates,
    limit: {
      requested: { kind: "depth", value: 12 },
      achievedDepth: 12,
    },
    engine: { name: "Synthetic" },
  };
}
function classify(input: {
  fen: string;
  played: string;
  candidates: EngineCandidate[];
  ordinary?: MoveClassification;
  before?: EngineEvaluation;
  after?: EngineEvaluation | null;
  player?: "white" | "black";
  terminalResult?: "win" | "loss" | "draw" | null;
}) {
  return classifySpecialMove({
    fenBefore: input.fen,
    playedMoveUci: input.played,
    player: input.player ?? "white",
    ordinary: input.ordinary ?? ordinary("best"),
    analysisBefore: analysis(input.fen, input.candidates, input.before),
    analysisAfter:
      input.after === null
        ? null
        : analysis(input.fen, [], input.after ?? cp(0)),
    terminalResult: input.terminalResult ?? null,
  });
}

describe("special classification policy", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("marks a sustained, compensated, separated queen sacrifice Brilliant", () => {
    const fen = "4k3/8/6p1/8/8/8/8/3QK3 w - - 0 1";
    const result = classify({
      fen,
      played: "d1h5",
      before: cp(50),
      after: cp(55),
      candidates: [
        candidate(1, "d1h5", cp(55), ["d1h5", "g6h5"]),
        candidate(2, "d1d2", cp(-80)),
      ],
    });
    expect(result).toMatchObject({
      classification: "brilliant",
      evidence: { rule: "exceptional-sacrifice" },
    });
    expect(
      classify({
        fen,
        played: "d1h5",
        before: cp(50),
        candidates: [
          candidate(1, "d1h5", cp(-200), ["d1h5", "g6h5"]),
          candidate(2, "d1d2", cp(-300)),
        ],
      }),
    ).toBeNull();
  });

  it("marks a meaningfully separated only-like move Great, not every Best", () => {
    expect(
      classify({
        fen: start,
        played: "e2e4",
        candidates: [
          candidate(1, "e2e4", cp(100)),
          candidate(2, "d2d4", cp(0)),
        ],
      })?.classification,
    ).toBe("great");
    expect(
      classify({
        fen: start,
        played: "e2e4",
        candidates: [
          candidate(1, "e2e4", cp(20)),
          candidate(2, "d2d4", cp(19)),
        ],
      }),
    ).toBeNull();
  });

  it("identifies losing a forced mate as a Miss without mate arithmetic", () => {
    expect(
      classify({
        fen: start,
        played: "d2d4",
        before: mate(3),
        after: cp(80),
        ordinary: ordinary("good"),
        candidates: [
          candidate(1, "e2e4", mate(3)),
          candidate(2, "d2d4", cp(80)),
        ],
      }),
    ).toMatchObject({
      classification: "miss",
      evidence: { rule: "missed-forced-mate" },
    });
  });

  it("identifies a concrete missed queen win but not a harmless alternative", () => {
    const fen = "4k3/8/8/8/8/8/4q3/4R1K1 w - - 0 1";
    expect(
      classify({
        fen,
        played: "g1h1",
        ordinary: ordinary("inaccuracy", 0.04),
        candidates: [
          candidate(1, "e1e2", cp(500)),
          candidate(2, "g1h1", cp(50)),
        ],
      })?.evidence.rule,
    ).toBe("missed-material-win");
    expect(
      classify({
        fen: start,
        played: "d2d4",
        ordinary: ordinary("inaccuracy", 0.04),
        candidates: [
          candidate(1, "e2e4", cp(40)),
          candidate(2, "d2d4", cp(20)),
        ],
      }),
    ).toBeNull();
  });

  it("rejects incomplete evidence, promotions, forced moves, and already-won noise", () => {
    expect(
      classify({
        fen: start,
        played: "e2e4",
        candidates: [candidate(1, "e2e4", cp(100))],
      }),
    ).toBeNull();
    const promotionFen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
    expect(
      classify({
        fen: promotionFen,
        played: "a7a8q",
        candidates: [
          candidate(1, "a7a8q", cp(800)),
          candidate(2, "a7a8r", cp(300)),
        ],
      })?.classification,
    ).not.toBe("brilliant");
    expect(SPECIAL_CLASSIFICATION_POLICY.requiredCandidateCount).toBe(2);
  });

  it("is player-relative for Black and deterministic", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    const input = {
      fen,
      played: "e7e5",
      player: "black" as const,
      candidates: [candidate(1, "e7e5", cp(-100)), candidate(2, "d7d5", cp(0))],
    };
    expect(classify(input)).toEqual(classify(input));
    expect(classify(input)?.classification).toBe("great");
  });
});
