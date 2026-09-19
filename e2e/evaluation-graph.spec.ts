import { expect, test, type Page } from "@playwright/test";

import {
  MEDIUM_PGN,
  openImportedReview,
  openReview,
  SHORT_PGN,
} from "./helpers";

const graphName = /evaluation graph/i;

function graph(page: Page) {
  return page.getByRole("slider", { name: graphName });
}

async function analyze(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Analyze Game" }).click();
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    {
      timeout: 90_000,
    },
  );
  await expect(graph(page)).toBeVisible();
}

/** Clicks the horizontal centre of one canonical position on the plot. */
async function clickPosition(
  page: Page,
  positionIndex: number,
  lastIndex: number,
): Promise<void> {
  const plot = graph(page);
  const box = (await plot.boundingBox())!;
  await plot.click({
    position: {
      x: Math.min((positionIndex / lastIndex) * box.width, box.width - 1),
      y: box.height / 2,
    },
  });
}

test("appears after a real review and drives board and review selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await openReview(page, SHORT_PGN);
  await expect(graph(page)).toHaveCount(0);

  await analyze(page);
  const plot = graph(page);
  await expect(plot).toHaveAttribute("aria-valuemin", "0");
  await expect(plot).toHaveAttribute("aria-valuemax", "4");
  await expect(plot).toHaveAttribute("aria-valuenow", "0");
  await expect(plot).toHaveAttribute("aria-valuetext", /^Starting position, /);

  await clickPosition(page, 3, 4);
  await expect(plot).toHaveAttribute("aria-valuenow", "3");
  await expect(page.getByText("Ply 3 / 4")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /White move Nf3/ }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    page.getByRole("region", { name: "Analysis" }).getByRole("heading", {
      name: "2. Nf3",
    }),
  ).toBeVisible();

  // Reverse synchronization: the move list drives the graph.
  await page.getByRole("button", { name: /Black move e5/ }).click();
  await expect(plot).toHaveAttribute("aria-valuenow", "2");
  await expect(plot).toHaveAttribute("aria-valuetext", /^1\.\.\. e5, /);

  // Canonical keyboard navigation moves exactly one position.
  await plot.focus();
  await page.keyboard.press("ArrowRight");
  await expect(plot).toHaveAttribute("aria-valuenow", "3");
  await page.keyboard.press("ArrowLeft");
  await expect(plot).toHaveAttribute("aria-valuenow", "2");
  await page.keyboard.press("End");
  await expect(plot).toHaveAttribute("aria-valuenow", "4");
  await page.keyboard.press("Home");
  await expect(plot).toHaveAttribute("aria-valuenow", "0");

  // Focus is visibly treated rather than left to color alone.
  expect(
    await plot.evaluate((element) => element.matches(":focus-visible")),
  ).toBe(true);
  expect(
    await plot.evaluate(
      (element) => getComputedStyle(element).outlineStyle !== "none",
    ),
  ).toBe(true);
});

test("keeps graph values and order unchanged when the board is flipped", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await openImportedReview(page, "Bob");
  await analyze(page);
  const plot = graph(page);
  await clickPosition(page, 2, 4);

  const before = await plot.getAttribute("aria-valuetext");
  const readout = await page
    .locator("[data-graph-readout-value]")
    .textContent();
  const board = page.locator("[data-board-orientation]");
  await expect(board).toHaveAttribute("data-board-orientation", "black");

  await page.getByRole("button", { name: /Flip board/ }).click();
  await expect(board).toHaveAttribute("data-board-orientation", "white");
  await expect(plot).toHaveAttribute("aria-valuenow", "2");
  await expect(plot).toHaveAttribute("aria-valuetext", before!);
  await expect(page.locator("[data-graph-readout-value]")).toHaveText(readout!);
});

test("clears the previous game's graph immediately on a game switch", async ({
  page,
}) => {
  await openImportedReview(page, "Bob");
  await analyze(page);
  await openImportedReview(page, "Alice", {
    pgn: MEDIUM_PGN,
    white: "Alice",
    black: "Carol",
  });
  await expect(graph(page)).toHaveCount(0);
});

test.describe("touch viewport", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("stays usable on a touch viewport without horizontal overflow", async ({
    page,
  }) => {
    await openReview(page, SHORT_PGN);
    await analyze(page);
    const plot = graph(page);

    const geometry = await plot.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      right: element.getBoundingClientRect().right,
      touchAction: getComputedStyle(element).touchAction,
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }));
    expect(geometry.right).toBeLessThanOrEqual(391);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.touchAction).toBe("pan-y");
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);

    // Tap selection works without hover, and the detail readout is persistent.
    await plot.tap({
      // Kept a few pixels inside the border so hit-testing stays on the plot.
      position: { x: geometry.width - 3, y: geometry.height / 2 },
    });
    await expect(plot).toHaveAttribute("aria-valuenow", "4");
    await expect(page.locator("[data-graph-readout-move]")).toHaveText(
      /2\.\.\. Nc6/,
    );
    await expect(page.locator("[data-graph-readout-value]")).not.toBeEmpty();
  });
});

/** The hardened review viewport matrix, re-checked with the graph present. */
const layoutViewports = [
  { name: "large desktop", width: 1440, height: 900, desktop: true },
  { name: "short desktop", width: 1280, height: 650, desktop: true },
  { name: "very short desktop", width: 1200, height: 600, desktop: true },
  { name: "common short desktop", width: 1366, height: 600, desktop: true },
  { name: "short tablet width", width: 1024, height: 600, desktop: true },
  { name: "tablet", width: 1024, height: 768, desktop: true },
  { name: "mobile portrait", width: 390, height: 844, desktop: false },
  { name: "mobile landscape", width: 844, height: 390, desktop: false },
  {
    name: "effective 200 percent desktop zoom",
    width: 720,
    height: 450,
    desktop: false,
  },
] as const;

test("fits the whole hardened viewport matrix without regressing the board", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openImportedReview(page, "Bob");
  const baselineBoard = await page
    .locator("[data-board-orientation]")
    .boundingBox();
  await analyze(page);

  for (const viewport of layoutViewports) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const plot = document.querySelector<HTMLElement>('[role="slider"]')!;
      const panel = document.querySelector<HTMLElement>("[data-review-panel]")!;
      const board = document.querySelector<HTMLElement>(
        "[data-board-orientation]",
      )!;
      const stack = document.querySelector<HTMLElement>("[data-board-stack]")!;
      return {
        plot: plot.getBoundingClientRect(),
        panelRight: panel.getBoundingClientRect().right,
        boardWidth: board.getBoundingClientRect().width,
        stackBottom: stack.getBoundingClientRect().bottom,
        stackHeight: stack.getBoundingClientRect().height,
        horizontalOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        plotOverflow: plot.scrollWidth - plot.clientWidth,
      };
    });

    expect(
      geometry.plot.width,
      `${viewport.name} plot has width`,
    ).toBeGreaterThan(0);
    expect(
      geometry.plot.height,
      `${viewport.name} plot has a usable height`,
    ).toBeGreaterThanOrEqual(40);
    expect(
      geometry.plot.right,
      `${viewport.name} plot stays inside the review panel`,
    ).toBeLessThanOrEqual(geometry.panelRight + 1);
    expect(
      geometry.horizontalOverflow,
      `${viewport.name} page does not scroll horizontally`,
    ).toBeLessThanOrEqual(1);
    expect(
      geometry.plotOverflow,
      `${viewport.name} plot does not scroll horizontally`,
    ).toBeLessThanOrEqual(1);
    if (viewport.desktop) {
      expect(
        geometry.stackBottom,
        `${viewport.name} board stack stays on screen`,
      ).toBeLessThanOrEqual(viewport.height + 1);
    } else {
      expect(
        geometry.stackHeight,
        `${viewport.name} board stack fits the viewport`,
      ).toBeLessThanOrEqual(viewport.height + 1);
    }
  }

  // The board is not shrunk to make room: the graph lives in the review panel.
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    (await page.locator("[data-board-orientation]").boundingBox())!.width,
  ).toBeCloseTo(baselineBoard!.width, 0);
});

const customFenGames = [
  {
    name: "White to move from fullmove 5",
    pgn: `[SetUp "1"]
[FEN "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5"]
[Result "*"]

5. Nxe5 dxe5 *`,
    labels: ["Starting position", "5. Nxe5", "5... dxe5"],
  },
  {
    name: "Black to move from fullmove 12",
    pgn: `[SetUp "1"]
[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12"]
[Result "*"]

12... Nc6 13. Nf3 *`,
    labels: ["Starting position", "12... Nc6", "13. Nf3"],
  },
] as const;

for (const custom of customFenGames) {
  test(`indexes a custom starting position: ${custom.name}`, async ({
    page,
  }) => {
    await openReview(page, custom.pgn);
    await analyze(page);
    const plot = graph(page);
    await expect(plot).toHaveAttribute("aria-valuemax", "2");

    for (const [index, label] of custom.labels.entries()) {
      // Position 0 is already selected; later positions arrive by arrow key.
      if (index > 0) {
        await plot.focus();
        await page.keyboard.press("ArrowRight");
      }
      await expect(plot).toHaveAttribute("aria-valuenow", String(index));
      await expect(plot).toHaveAttribute(
        "aria-valuetext",
        new RegExp(`^${label.replace(/\./g, "\.")}, `),
      );
      await expect(page.locator("[data-graph-readout-move]")).toHaveText(label);
    }
  });
}
