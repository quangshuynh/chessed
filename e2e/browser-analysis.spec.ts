import { expect, test } from "@playwright/test";

import {
  MEDIUM_PGN,
  LONG_PGN,
  openImportedReview,
  openReview,
  SHORT_PGN,
  stockfishWorkerCount,
} from "./helpers";

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

for (const viewport of layoutViewports) {
  test(`keeps the board stack cohesive at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openImportedReview(page, "Bob", {
      pgn: LONG_PGN,
      white: "AnOpponentWithAnExtremelyLongUsername",
      black: "Bob",
    });

    const geometry = await page.evaluate(() => {
      const top = document.querySelector('[aria-label="Top player"]')!;
      const board = document.querySelector<HTMLElement>(
        "[data-board-orientation]",
      )!;
      const bottom = document.querySelector('[aria-label="Bottom player"]')!;
      const stack = document.querySelector<HTMLElement>("[data-board-stack]")!;
      const review = document.querySelector<HTMLElement>(
        "[data-review-panel]",
      )!;
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height,
        };
      };
      return {
        top: rect(top),
        board: rect(board),
        bottom: rect(bottom),
        stack: rect(stack),
        review: rect(review),
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        reviewOverflow: getComputedStyle(review).overflowY,
        reviewScrollable: review.scrollHeight > review.clientHeight,
      };
    });

    expect(geometry.top.bottom).toBeLessThanOrEqual(geometry.board.top + 1);
    expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.bottom.top + 1);
    expect(geometry.stack.width).toBeLessThanOrEqual(
      geometry.viewport.width + 1,
    );
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);

    if (viewport.desktop) {
      expect(geometry.stack.top).toBeGreaterThanOrEqual(-1);
      expect(geometry.stack.bottom).toBeLessThanOrEqual(
        geometry.viewport.height + 1,
      );
      expect(geometry.review.bottom).toBeLessThanOrEqual(
        geometry.viewport.height + 1,
      );
      expect(geometry.reviewOverflow).toBe("auto");
      if (viewport.height <= 768) expect(geometry.reviewScrollable).toBe(true);
    } else {
      expect(geometry.stack.height).toBeLessThanOrEqual(
        geometry.viewport.height + 1,
      );
    }
  });
}

test("resizes live without changing orientation, selected ply, or sound state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await openImportedReview(page, "Bob", { pgn: LONG_PGN });
  await page.getByRole("button", { name: "Black move e5" }).click();
  await page.getByRole("button", { name: "Mute move sounds" }).click();
  const board = page.locator("[data-board-orientation]");
  await expect(board).toHaveAttribute("data-board-orientation", "black");

  for (const viewport of [
    { width: 1200, height: 600 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(board).toHaveAttribute("data-board-orientation", "black");
    await expect(page.getByText("Ply 2 / 30")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unmute move sounds" }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: /Flip board/ }).click();
  await expect(board).toHaveAttribute("data-board-orientation", "white");
  await expect(page.getByLabel("Bottom player")).toContainText("Alice");
  await expect(page.getByText("Ply 2 / 30")).toBeVisible();
});

for (const scenario of [
  { requested: "ALICE", orientation: "white", top: "Bob", bottom: "Alice" },
  { requested: "bob", orientation: "black", top: "Alice", bottom: "Bob" },
]) {
  test(`orients an imported game to reviewed player ${scenario.requested}`, async ({
    page,
  }) => {
    const { requested, orientation, top, bottom } = scenario;
    await openImportedReview(page, requested);
    const board = page.locator("[data-board-orientation]");
    await expect(board).toHaveAttribute("data-board-orientation", orientation);
    await expect(page.getByLabel("Top player")).toContainText(top);
    await expect(page.getByLabel("Bottom player")).toContainText(bottom);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Ply 1 / 4")).toBeVisible();

    if (orientation === "black") {
      await page.getByRole("button", { name: /Flip board/ }).click();
      await expect(board).toHaveAttribute("data-board-orientation", "white");
      await expect(page.getByLabel("Bottom player")).toContainText("Alice");
      await expect(page.getByText("Ply 1 / 4")).toBeVisible();
    }
  });
}

test("runs the real worker/WASM review path and cleans up", async ({
  page,
}) => {
  const engineResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/stockfish/"))
      engineResponses.push(response.url());
  });

  await openReview(page, SHORT_PGN);
  await expect(page.getByText("Engine review has not been run")).toBeVisible();
  expect(await stockfishWorkerCount(page)).toBe(0);

  await page.evaluate(() => {
    const progress: string[] = [];
    Object.assign(window, { __chessedProgress: progress });
    new MutationObserver(() => {
      const match = document.body.textContent?.match(
        /Analyzing \d+ \/ \d+ steps/,
      );
      if (match) progress.push(match[0]);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await page.getByRole("button", { name: "Analyze Game" }).click();
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    {
      timeout: 90_000,
    },
  );
  expect(engineResponses.some((url) => url.endsWith(".js"))).toBe(true);
  expect(engineResponses.some((url) => url.endsWith(".wasm"))).toBe(true);
  const progress = await page.evaluate(
    () =>
      (window as typeof window & { __chessedProgress: string[] })
        .__chessedProgress,
  );
  expect(progress.some((value) => !value.includes("Analyzing 0 /"))).toBe(true);

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Ply 1 / 4")).toBeVisible();
  const analysis = page.getByRole("region", { name: "Analysis" });
  await expect(analysis.locator("dt", { hasText: "Best" })).toBeVisible();
  await expect(analysis.getByText(/^Principal variation$/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await analysis.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
});

test("cancels a real analysis and completes a clean second run", async ({
  page,
}) => {
  await openReview(page, MEDIUM_PGN);
  await page.getByRole("button", { name: "Analyze Game" }).click();
  await expect.poll(() => stockfishWorkerCount(page)).toBe(1);
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(page.getByText(/No partial review was kept/)).toBeVisible();
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);

  await page.getByRole("button", { name: "Analyze Again" }).click();
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    {
      timeout: 120_000,
    },
  );
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
});

test("sounds only deliberate destination navigation and persists mute", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const played: string[] = [];
    class AudioProbe {
      volume = 1;
      constructor(readonly src: string) {}
      play() {
        played.push(this.src);
        return Promise.resolve();
      }
    }
    Object.assign(window, { Audio: AudioProbe, __chessedSounds: played });
  });
  await openReview(page, SHORT_PGN);
  const sounds = () =>
    page.evaluate(
      () =>
        (window as typeof window & { __chessedSounds: string[] })
          .__chessedSounds,
    );
  expect(await sounds()).toEqual([]);

  await page.getByRole("button", { name: "Black move Nc6" }).click();
  expect(await sounds()).toEqual(["/sounds/move.wav"]);
  await page.getByRole("button", { name: "Previous" }).click();
  expect(await sounds()).toHaveLength(2);

  await page.getByRole("button", { name: "Mute move sounds" }).click();
  await page.getByRole("button", { name: "Previous" }).click();
  expect(await sounds()).toHaveLength(2);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unmute move sounds" }),
  ).toBeVisible();
});
