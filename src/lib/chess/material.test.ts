import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { materialBalance, projectMaterial } from "@/lib/chess/material";

describe("material evidence", () => {
  it("uses conventional non-king values and replays a legal sacrifice line", () => {
    const fen = "4k3/8/6p1/8/8/8/8/3QK3 w - - 0 1";
    expect(materialBalance(fen, "w")).toBe(8);
    expect(projectMaterial(fen, ["d1h5", "g6h5"], "w")).toMatchObject({
      initialBalance: 8,
      minimumBalance: -1,
      finalBalance: -1,
      exposure: 9,
      sustainedLoss: 9,
      firstMove: { capture: false, promotion: false },
    });
  });

  it("rejects malformed and illegal PV evidence", () => {
    expect(projectMaterial(new Chess().fen(), ["bad"], "w")).toBeNull();
    expect(projectMaterial(new Chess().fen(), ["e2e5"], "w")).toBeNull();
  });
});
