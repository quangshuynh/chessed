import { describe, expect, it } from "vitest";

import type { ReviewSessionPayload } from "@/lib/review/session-store";

import { getInitialBoardPerspective } from "./board-perspective";

function imported(requestedUsername: string): ReviewSessionPayload {
  return {
    source: "chesscom",
    pgn: "1. e4 e5",
    createdAt: "2026-09-16T00:00:00.000Z",
    summary: {
      id: "game",
      requestedUsername,
      white: "WhiteUser",
      black: "BlackUser",
    },
  };
}

describe("getInitialBoardPerspective", () => {
  it("orients imported games to the requested White player", () => {
    expect(getInitialBoardPerspective(imported("WhiteUser"))).toBe("white");
  });

  it("orients imported games to the requested Black player case-insensitively", () => {
    expect(getInitialBoardPerspective(imported("bLaCkUsEr"))).toBe("black");
  });

  it("defaults manual PGNs to White without inferring identity from names", () => {
    expect(
      getInitialBoardPerspective({
        ...imported("BlackUser"),
        source: "manual-pgn",
      }),
    ).toBe("white");
  });

  it("defaults safely when legacy or inconsistent metadata has no match", () => {
    expect(getInitialBoardPerspective(imported("SomeoneElse"))).toBe("white");
  });
});
