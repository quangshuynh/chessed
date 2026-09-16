import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { SPECIAL_POSITION_CORPUS } from "../../../calibration/special-position-corpus";

describe("special-classification calibration corpus", () => {
  it("contains legal, independently described positions without label goldens", () => {
    expect(SPECIAL_POSITION_CORPUS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SPECIAL_POSITION_CORPUS.map(({ id }) => id)).size).toBe(
      SPECIAL_POSITION_CORPUS.length,
    );
    for (const fixture of SPECIAL_POSITION_CORPUS) {
      const chess = new Chess(fixture.fen);
      const move = chess.move({
        from: fixture.moveUci.slice(0, 2),
        to: fixture.moveUci.slice(2, 4),
        promotion: fixture.moveUci[4],
      });
      expect(move, fixture.id).not.toBeNull();
      expect(fixture.provenance.length, fixture.id).toBeGreaterThan(20);
      expect(fixture.expectedProperties.length, fixture.id).toBeGreaterThan(0);
      expect(fixture).not.toHaveProperty("expectedClassification");
    }
  });

  it("encodes verifiable forced, promotion, and mate properties", () => {
    const forced = SPECIAL_POSITION_CORPUS.find(
      ({ id }) => id === "forced-king-move",
    );
    expect(new Chess(forced!.fen).moves()).toHaveLength(1);

    for (const fixture of SPECIAL_POSITION_CORPUS.filter(
      ({ expectedProperties }) => expectedProperties.includes("promotion"),
    )) {
      const chess = new Chess(fixture.fen);
      expect(
        chess.move({
          from: fixture.moveUci.slice(0, 2),
          to: fixture.moveUci.slice(2, 4),
          promotion: fixture.moveUci[4],
        })?.promotion,
      ).toBeTruthy();
    }

    const mate = SPECIAL_POSITION_CORPUS.find(
      ({ id }) => id === "obvious-mate-in-one",
    );
    const chess = new Chess(mate!.fen);
    chess.move({ from: "f7", to: "f8" });
    expect(chess.isCheckmate()).toBe(true);
  });

  it("records independently sourced defensive properties without label truth", () => {
    const sourced = SPECIAL_POSITION_CORPUS.filter(({ id }) =>
      [
        "reti-1921-drawing-king-move",
        "yates-marshall-1929-kb2",
        "lasker-tarrasch-1914-h4",
        "hamppe-meitner-1872-perpetual",
        "leko-kramnik-2008-perpetual",
        "fischer-tal-1960-perpetual",
        "matulovic-minev-1956-stalemate",
        "rhine-2006-stalemate-study",
      ].includes(id),
    );
    expect(sourced).toHaveLength(8);
    for (const fixture of sourced) {
      expect(fixture.provenance).toMatch(/^.+https:\/\//);
      expect(fixture.objectiveProperty?.length).toBeGreaterThan(30);
      expect(fixture.falsificationValue?.length).toBeGreaterThan(30);
      expect(fixture.expectedProperties).toContain("defensive-resource");
      expect(fixture).not.toHaveProperty("expectedClassification");
    }
  });
});
