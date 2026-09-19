import { expect, test, type Page } from "@playwright/test";

import {
  MEDIUM_PGN,
  openImportedReview,
  openReview,
  SHORT_PGN,
} from "./helpers";

/** A real checkmate, so the terminal explanation is never a synthetic case. */
const CHECKMATE_PGN = `[Event "Browser fixture"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

/** Black to move from a non-1 fullmove number. */
const CUSTOM_FEN_PGN = `[SetUp "1"]
[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4"]
[Result "*"]

4... Bc5 5. c3 *`;

function explanation(page: Page) {
  return page.getByRole("region", { name: "Move explanation" });
}

async function analyze(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Analyze Game" }).click();
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    {
      timeout: 90_000,
    },
  );
}

async function reason(page: Page): Promise<string | null> {
  return page
    .locator("[data-move-explanation]")
    .getAttribute("data-move-explanation");
}

test("explains the canonical selected move through every navigation control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await openReview(page, SHORT_PGN);
  // Nothing is explained before a review exists.
  await expect(explanation(page)).toHaveCount(0);

  await analyze(page);
  await expect(explanation(page)).toHaveCount(0);
  await expect(
    page.getByText("There is no move to explain at the starting position."),
  ).toBeVisible();

  // Move list selection.
  await page.getByRole("button", { name: /White move e4/ }).click();
  await expect(explanation(page)).toBeVisible();
  const firstReason = await reason(page);
  expect(firstReason).toBeTruthy();
  const firstText = await explanation(page).textContent();

  // Previous / Next.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByRole("region", { name: "Analysis" }).getByRole("heading", {
      name: "1... e5",
    }),
  ).toBeVisible();
  const secondText = await explanation(page).textContent();

  await page.getByRole("button", { name: "Previous" }).click();
  await expect(explanation(page)).toHaveText(firstText!.trim());

  // Keyboard navigation.
  await page.keyboard.press("ArrowRight");
  await expect(explanation(page)).toHaveText(secondText!.trim());

  // Evaluation graph selection reaches the same explanation.
  const plot = page.getByRole("slider", { name: /evaluation graph/i });
  await plot.focus();
  await page.keyboard.press("Home");
  await expect(explanation(page)).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(explanation(page)).toHaveText(firstText!.trim());
  await expect(plot).toHaveAttribute("aria-valuenow", "1");
});

test("keeps the explanation unchanged when the board is flipped", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await openImportedReview(page, "Bob");
  await analyze(page);
  await page.getByRole("button", { name: /Black move e5/ }).click();

  const before = await explanation(page).textContent();
  const beforeReason = await reason(page);
  const board = page.locator("[data-board-orientation]");
  await expect(board).toHaveAttribute("data-board-orientation", "black");

  await page.getByRole("button", { name: /Flip board/ }).click();
  await expect(board).toHaveAttribute("data-board-orientation", "white");
  await expect(explanation(page)).toHaveText(before!.trim());
  expect(await reason(page)).toBe(beforeReason);
});

test("clears the previous game's explanation immediately on a game switch", async ({
  page,
}) => {
  await openImportedReview(page, "Bob");
  await analyze(page);
  await page.getByRole("button", { name: /White move e4/ }).click();
  await expect(explanation(page)).toBeVisible();

  await openImportedReview(page, "Alice", {
    pgn: MEDIUM_PGN,
    white: "Alice",
    black: "Carol",
  });
  await expect(explanation(page)).toHaveCount(0);
});

test("explains a real checkmate and a custom Black-to-move start from manual PGN", async ({
  page,
}) => {
  await openReview(page, CHECKMATE_PGN);
  await analyze(page);
  await page.getByRole("button", { name: /Black move Qh4#/ }).click();
  expect(await reason(page)).toBe("terminal-checkmate-delivered");
  await expect(explanation(page)).toContainText(
    "This move delivers checkmate.",
  );

  await openReview(page, CUSTOM_FEN_PGN);
  await analyze(page);
  await page.getByRole("button", { name: /Black move Bc5/ }).click();
  await expect(explanation(page)).toBeVisible();
  // Numbering and notation stay correct from a custom fullmove number.
  await expect(
    page.getByRole("region", { name: "Analysis" }).getByRole("heading", {
      name: "4... Bc5",
    }),
  ).toBeVisible();
  const text = (await explanation(page).textContent())!;
  expect(text).not.toMatch(/[a-h][1-8][a-h][1-8]/);
});

test("stays keyboard and screen-reader reachable without a live region", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await openReview(page, SHORT_PGN);
  await analyze(page);
  await page.getByRole("button", { name: /White move e4/ }).click();

  const semantics = await explanation(page).evaluate((element) => ({
    inAnalysis: Boolean(
      element.closest('section[aria-labelledby="analysis-heading"]'),
    ),
    live: element.getAttribute("aria-live"),
    liveDescendant: Boolean(element.querySelector("[aria-live]")),
    hidden: element.getAttribute("aria-hidden"),
    text: (element.textContent ?? "").trim(),
  }));
  expect(semantics.inAnalysis).toBe(true);
  // Arrow-key navigation must not shout every move at assistive technology.
  expect(semantics.live).toBeNull();
  expect(semantics.liveDescendant).toBe(false);
  expect(semantics.hidden).toBeNull();
  expect(semantics.text.length).toBeGreaterThan(0);

  // The explanation is plain text reached by ordinary reading order, so it is
  // never gated behind an interactive control or conveyed by color alone.
  await page.keyboard.press("ArrowRight");
  await expect(explanation(page)).toBeVisible();
});

test.describe("touch viewport", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("wraps cleanly and never overflows a narrow viewport", async ({
    page,
  }) => {
    await openReview(page, SHORT_PGN);
    await analyze(page);
    await page.getByRole("button", { name: /White move Nf3/ }).click();

    const geometry = await explanation(page).evaluate((element) => ({
      right: element.getBoundingClientRect().right,
      width: element.getBoundingClientRect().width,
      selfOverflow: element.scrollWidth - element.clientWidth,
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }));
    expect(geometry.width).toBeGreaterThan(0);
    expect(geometry.right).toBeLessThanOrEqual(391);
    expect(geometry.selfOverflow).toBeLessThanOrEqual(1);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
  });
});

/** The hardened review viewport matrix, re-checked with explanations present. */
const layoutViewports = [
  { name: "large desktop", width: 1440, height: 900 },
  { name: "short desktop", width: 1280, height: 650 },
  { name: "very short desktop", width: 1200, height: 600 },
  { name: "common short desktop", width: 1366, height: 600 },
  { name: "short tablet width", width: 1024, height: 600 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile portrait", width: 390, height: 844 },
  { name: "mobile landscape", width: 844, height: 390 },
  { name: "effective 200 percent desktop zoom", width: 720, height: 450 },
] as const;

test("fits the hardened viewport matrix without regressing the board", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openImportedReview(page, "Bob");
  const baselineBoard = await page
    .locator("[data-board-orientation]")
    .boundingBox();
  await analyze(page);
  await page.getByRole("button", { name: /White move Nf3/ }).click();
  await expect(explanation(page)).toBeVisible();

  for (const viewport of layoutViewports) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const block = document.querySelector<HTMLElement>(
        "[data-move-explanation]",
      )!;
      const panel = document.querySelector<HTMLElement>("[data-review-panel]")!;
      return {
        rect: block.getBoundingClientRect(),
        panelRight: panel.getBoundingClientRect().right,
        selfOverflow: block.scrollWidth - block.clientWidth,
        horizontalOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    expect(
      geometry.rect.width,
      `${viewport.name} explanation has width`,
    ).toBeGreaterThan(0);
    expect(
      geometry.rect.right,
      `${viewport.name} explanation stays inside the review panel`,
    ).toBeLessThanOrEqual(geometry.panelRight + 1);
    expect(
      geometry.selfOverflow,
      `${viewport.name} explanation text wraps instead of scrolling`,
    ).toBeLessThanOrEqual(1);
    expect(
      geometry.horizontalOverflow,
      `${viewport.name} page does not scroll horizontally`,
    ).toBeLessThanOrEqual(1);
  }

  // The explanation lives in the review panel, so the board keeps its size.
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    (await page.locator("[data-board-orientation]").boundingBox())!.width,
  ).toBeCloseTo(baselineBoard!.width, 0);
});
