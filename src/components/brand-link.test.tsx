// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrandLink } from "./brand-link";

vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next/image", () => ({
  default: (props: ComponentProps<"img"> & { priority?: boolean }) => {
    const { priority, ...imageProps } = props;
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={imageProps.alt ?? ""} {...imageProps} />;
  },
}));

afterEach(cleanup);

describe("BrandLink", () => {
  it("renders the supplied logo and Chessed as one home link", () => {
    render(<BrandLink />);
    const link = screen.getByRole("link", { name: "Chessed home" });
    expect(link.getAttribute("href")).toBe("/");
    expect(link.textContent).toContain("Chessed");
    expect(link.querySelector("img")?.getAttribute("src")).toBe(
      "/brand/chessed-logo.png",
    );
    expect(link.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});
