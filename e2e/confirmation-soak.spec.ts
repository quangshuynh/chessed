import { expect, test } from "@playwright/test";

import {
  CONFIRMATION_PGN,
  openReview,
  SOAK_PGN,
  stockfishWorkerCount,
} from "./helpers";

test.skip(
  !process.env.CHESSED_SOAK,
  "Run explicitly with npm run test:e2e:soak",
);
test.setTimeout(360_000);

async function installProgressRecorder(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const values: string[] = [];
    Object.assign(window, { __chessedSoakProgress: values });
    new MutationObserver(() => {
      const match = document.body.textContent?.match(
        /Analyzing \d+ \/ \d+ steps/,
      );
      if (match && values.at(-1) !== match[0]) values.push(match[0]);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

async function heapUsed(
  page: import("@playwright/test").Page,
): Promise<number | null> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.collectGarbage");
    const usage = await session.send("Runtime.getHeapUsage");
    return usage.usedSize;
  } finally {
    await session.detach();
  }
}

test("real confirmation, repeated-run, cancellation, mobile-like, and memory soak", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.detach();

  await openReview(page, CONFIRMATION_PGN);
  await installProgressRecorder(page);
  const baselineHeap = await heapUsed(page);
  const firstStarted = performance.now();
  await page.getByRole("button", { name: "Analyze Game" }).click();
  await expect.poll(() => stockfishWorkerCount(page)).toBe(1);
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    {
      timeout: 180_000,
    },
  );
  const firstDurationMs = performance.now() - firstStarted;
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
  const firstProgress = await page.evaluate(
    () =>
      (window as typeof window & { __chessedSoakProgress: string[] })
        .__chessedSoakProgress,
  );
  // The running UI is replaced by the completed review immediately after the
  // final callback, so the observer's final visible state is one step short.
  expect(firstProgress).toContain("Analyzing 3 / 4 steps");

  await page.getByRole("button", { name: "Analyze Again" }).click();
  await expect.poll(() => stockfishWorkerCount(page)).toBe(1);
  const cancelStarted = performance.now();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(page.getByText(/No partial review was kept/)).toBeVisible();
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
  const cancellationMs = performance.now() - cancelStarted;

  await page.getByRole("button", { name: "Analyze Again" }).click();
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    {
      timeout: 180_000,
    },
  );
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Ply 1 / 1")).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  const repeatedHeap = await heapUsed(page);

  await openReview(page, SOAK_PGN);
  await installProgressRecorder(page);
  const longStarted = performance.now();
  await page.getByRole("button", { name: "Analyze Game" }).click();
  for (let index = 0; index < 8; index += 1) {
    await page
      .getByRole("button", { name: index % 2 ? "Previous" : "Next" })
      .click();
  }
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    {
      timeout: 300_000,
    },
  );
  const longDurationMs = performance.now() - longStarted;
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
  const longProgress = await page.evaluate(
    () =>
      (window as typeof window & { __chessedSoakProgress: string[] })
        .__chessedSoakProgress,
  );
  const completed = longProgress
    .at(-1)
    ?.match(/Analyzing (\d+) \/ (\d+) steps/);
  expect(Number(completed?.[1])).toBe(Number(completed?.[2]) - 1);
  expect(Number(completed?.[2])).toBeGreaterThan(83);
  const longHeap = await heapUsed(page);
  const progressTotals = [
    ...new Set(
      longProgress.map((value) => Number(value.match(/\/ (\d+) steps/)?.[1])),
    ),
  ];

  await page.goto("/");
  await expect.poll(() => stockfishWorkerCount(page)).toBe(0);
  const unmountedHeap = await heapUsed(page);
  console.log(
    JSON.stringify({
      conditions:
        "desktop Chromium, 390x844 viewport, 4x CPU throttling; not a physical device",
      firstDurationMs: Math.round(firstDurationMs),
      cancellationMs: Math.round(cancellationMs),
      longDurationMs: Math.round(longDurationMs),
      confirmationFixtureProgress: firstProgress,
      longFinalProgress: longProgress.at(-1),
      longProgressTotals: progressTotals,
      heapBytes: { baselineHeap, repeatedHeap, longHeap, unmountedHeap },
    }),
  );
});
