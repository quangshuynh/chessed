import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { formatPrincipalVariation, uciMoveToSan } from "./notation";

describe("uciMoveToSan", () => {
  it.each([
    ["pawn move", "start", "e2e4", "e4"],
    ["piece move", "start", "g1f3", "Nf3"],
    [
      "capture",
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/3P4/PPP2PPP/RNBQKBNR b KQkq - 0 2",
      "f8b4",
      "Bb4+",
    ],
    ["disambiguation", "4k3/8/8/8/8/2N1N3/8/4K3 w - - 0 1", "c3d5", "Ncd5"],
    ["kingside castling", "4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1", "e1g1", "O-O"],
    ["queenside castling", "r3k3/8/8/8/8/8/8/R3K3 b Qq - 0 1", "e8c8", "O-O-O"],
    ["promotion", "7k/P7/8/8/8/8/8/7K w - - 0 1", "a7a8q", "a8=Q+"],
    ["promotion capture", "1r5k/P7/8/8/8/8/8/7K w - - 0 1", "a7b8q", "axb8=Q+"],
    ["check", "7k/8/8/8/8/8/4R3/7K w - - 0 1", "e2e8", "Re8+"],
    ["checkmate", "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1", "f7f8", "Qf8#"],
  ])("formats a %s", (_name, fen, uci, san) => {
    const position = fen === "start" ? new Chess().fen() : fen;
    expect(uciMoveToSan(position, uci)).toBe(san);
  });

  it("fails safely for malformed FEN, malformed UCI, and illegal UCI", () => {
    expect(uciMoveToSan("not a fen", "e2e4")).toBeNull();
    expect(uciMoveToSan("start", "e2-e4")).toBeNull();
    expect(
      uciMoveToSan(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "e2e5",
      ),
    ).toBeNull();
  });
});

describe("formatPrincipalVariation", () => {
  it("replays a multi-move PV rather than interpreting every move from the initial position", () => {
    const result = formatPrincipalVariation(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      ["e2e4", "e7e5", "g1f3"],
    );
    expect(result).toEqual({
      sanMoves: ["e4", "e5", "Nf3"],
      text: "1. e4 e5 2. Nf3",
    });
  });

  it("uses a custom FEN's Black-to-move fullmove number", () => {
    const result = formatPrincipalVariation("7k/7p/8/8/8/8/6K1/8 b - - 0 18", [
      "h7h5",
      "g2f3",
      "h5h4",
    ]);
    expect(result?.text).toBe("18... h5 19. Kf3 h4");
  });

  it("preserves a legal truncated PV", () => {
    expect(
      formatPrincipalVariation(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 7",
        ["e2e4"],
      )?.text,
    ).toBe("7. e4");
  });

  it("fails the entire presentation safely for malformed or inconsistent PV data", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(formatPrincipalVariation(fen, ["bad"])).toBeNull();
    expect(formatPrincipalVariation(fen, ["e2e4", "e7e6", "e7e5"])).toBeNull();
    expect(formatPrincipalVariation("bad fen", ["e2e4"])).toBeNull();
  });
});
