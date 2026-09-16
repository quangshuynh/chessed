import { expect, it } from "vitest";

import type { MoveClassification } from "@/lib/review/classification";
import type {
  EngineCandidate,
  PositionAnalysis,
} from "@/lib/review/interfaces";
import { evaluateSpecialMove } from "@/lib/review/special-classification";

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ordinary: MoveClassification = {
  status: "classified",
  classification: "best",
  evidence: {
    rule: "engine-best-match",
    beforeExpectation: 0.5,
    afterExpectation: 0.5,
    outcomeDrop: 0,
    centipawnLoss: 0,
    rawCentipawnDifference: 0,
    mateTransition: null,
    terminalReason: null,
  },
};
const candidate = (
  rank: number,
  moveUci: string,
  cp: number,
): EngineCandidate => ({
  rank,
  moveUci,
  evaluation: { kind: "centipawns", perspective: "white", value: cp },
  principalVariationUci: [moveUci],
});
const analysis = (
  candidates: EngineCandidate[],
  confirmed = false,
): PositionAnalysis => ({
  fen,
  evaluation: candidates[0].evaluation,
  bestMoveUci: candidates[0].moveUci,
  principalVariationUci: candidates[0].principalVariationUci,
  candidates,
  limit: { requested: { kind: "depth", value: 12 }, achievedDepth: 12 },
  engine: { name: "Synthetic calibration" },
  ...(confirmed
    ? {
        greatConfirmation: {
          status: "confirmed" as const,
          purpose: "great-boundary" as const,
          original: {
            evaluation: candidates[0].evaluation,
            bestMoveUci: candidates[0].moveUci,
            principalVariationUci: candidates[0].principalVariationUci,
            candidates,
            limit: {
              requested: { kind: "depth" as const, value: 12 },
              achievedDepth: 12,
            },
          },
        },
      }
    : {}),
});

it("reports deterministic rejection evidence instead of collapsing it to null", () => {
  const audit = evaluateSpecialMove({
    fenBefore: fen,
    playedMoveUci: "e2e4",
    player: "white",
    ordinary,
    analysisBefore: analysis([
      candidate(1, "e2e4", 20),
      candidate(2, "d2d4", 19),
    ]),
    analysisAfter: null,
    terminalResult: null,
  });
  expect(audit.result).toBeNull();
  expect(audit.reasons).toEqual(
    expect.arrayContaining([
      "brilliant-separation-insufficient",
      "great-separation-insufficient",
      "material-exposure-insufficient",
    ]),
  );
  expect(audit.evidence).toMatchObject({
    playedRank: 1,
    legalMoveCount: 20,
    candidateCount: 2,
  });
});

it.each([
  [0.04 - 0.000001, false, null],
  [0.04, false, null],
  [0.04, true, "great"],
  [0.04 + 0.000001, true, "great"],
  [0.051, false, "great"],
] as const)(
  "applies the Great boundary at %f with confirmed=%s",
  (separation, confirmed, expected) => {
    const bestCp = 410 * Math.log((0.5 + separation) / (0.5 - separation));
    const audit = evaluateSpecialMove({
      fenBefore: fen,
      playedMoveUci: "e2e4",
      player: "white",
      ordinary,
      analysisBefore: analysis(
        [candidate(1, "e2e4", bestCp), candidate(2, "d2d4", 0)],
        confirmed,
      ),
      analysisAfter: null,
      terminalResult: null,
    });
    expect(audit.result?.classification ?? null).toBe(expected);
  },
);
