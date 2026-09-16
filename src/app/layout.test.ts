import { describe, expect, it } from "vitest";

import { metadata } from "./layout";

describe("site metadata", () => {
  it("uses the committed App Router Chessed icon", () => {
    expect(metadata.icons).toEqual({ icon: "/icon.png" });
  });
});
