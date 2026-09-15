import { describe, expect, it } from "vitest";

import {
  parseBestMove,
  parseEngineIdentity,
  parseUciInfo,
} from "@/lib/analysis/uci";

describe("UCI normalization", () => {
  it("keeps positive centipawns for White to move", () => {
    expect(
      parseUciInfo("info depth 12 score cp 134 pv e2e4 e7e5", "w"),
    ).toEqual({
      depth: 12,
      evaluation: { kind: "centipawns", perspective: "white", value: 134 },
      principalVariationUci: ["e2e4", "e7e5"],
    });
  });

  it("inverts a side-to-move score when Black is to move", () => {
    expect(
      parseUciInfo("info depth 8 score cp 82 pv e7e5", "b")?.evaluation,
    ).toEqual({
      kind: "centipawns",
      perspective: "white",
      value: -82,
    });
  });

  it("represents giving and receiving mate without fake centipawns", () => {
    expect(
      parseUciInfo("info depth 10 score mate 3 pv f7f8", "w")?.evaluation,
    ).toEqual({
      kind: "mate",
      perspective: "white",
      moves: 3,
    });
    expect(
      parseUciInfo("info depth 10 score mate 2 pv h2h1q", "b")?.evaluation,
    ).toEqual({
      kind: "mate",
      perspective: "white",
      moves: -2,
    });
  });

  it("parses best moves, terminal positions, and identity", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
    expect(parseBestMove("bestmove (none)")).toBeNull();
    expect(parseBestMove("not a bestmove")).toBeUndefined();
    expect(parseEngineIdentity("id name Stockfish 18 Lite")).toEqual({
      name: "Stockfish 18 Lite",
      version: "18",
    });
  });

  it("rejects incomplete or malformed info lines", () => {
    expect(parseUciInfo("info depth 10 score cp 20", "w")).toBeNull();
    expect(parseUciInfo("info depth x score cp 20 pv e2e4", "w")).toBeNull();
  });
});
