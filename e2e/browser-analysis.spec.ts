import { expect, test } from "@playwright/test";

import {
  MEDIUM_PGN,
  openImportedReview,
  openReview,
  SHORT_PGN,
  stockfishWorkerCount,
} from "./helpers";

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
