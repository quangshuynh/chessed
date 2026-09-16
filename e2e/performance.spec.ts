import { expect, test } from "@playwright/test";

import {
  LONG_PGN,
  MEDIUM_PGN,
  openReview,
  SHORT_PGN,
  stockfishWorkerCount,
} from "./helpers";

test.skip(
  !process.env.CHESSED_PERF,
  "Run explicitly with npm run test:e2e:perf",
);

for (const [name, pgn, positions] of [
  ["short", SHORT_PGN, 5],
  ["medium", MEDIUM_PGN, 17],
  ["long", LONG_PGN, 31],
] as const) {
  test(`${name} depth-12 measurement`, async ({ page }) => {
    await openReview(page, pgn);
    const start = performance.now();
    await page.getByRole("button", { name: "Analyze Game" }).click();

    const interactionStart = performance.now();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByText(new RegExp(`Ply 1 \\/ ${positions - 1}`)),
    ).toBeVisible();
    const interactionMs = performance.now() - interactionStart;

    await expect(
      page.getByRole("button", { name: "Analyze Again" }),
    ).toBeVisible({
      timeout: 120_000,
    });
    const durationMs = performance.now() - start;
    await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
    console.log(
      JSON.stringify({
        name,
        positions,
        depth: 12,
        durationMs: Math.round(durationMs),
        interactionMs: Math.round(interactionMs),
      }),
    );
  });
}

test("cancellation responsiveness measurement", async ({ page }) => {
  await openReview(page, LONG_PGN);
  await page.getByRole("button", { name: "Analyze Game" }).click();
  await expect.poll(() => stockfishWorkerCount(page)).toBe(1);
  const start = performance.now();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(page.getByText(/No partial review was kept/)).toBeVisible();
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
  console.log(
    JSON.stringify({ cancellationMs: Math.round(performance.now() - start) }),
  );
});
