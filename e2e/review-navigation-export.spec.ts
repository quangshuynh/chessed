import { expect, test, type Page } from "@playwright/test";

import { parsePgnToReviewGame } from "../src/lib/chess/pgn";
import { openReview, SHORT_PGN, stockfishWorkerCount } from "./helpers";

const positions = parsePgnToReviewGame(SHORT_PGN).positions;

function plyLabel(page: Page) {
  return page
    .getByRole("region", { name: "Game board and navigation" })
    .locator("p")
    .last();
}

async function analyze(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Analyze Game" }).click();
  await expect(page.getByRole("button", { name: "Analyze Again" })).toBeVisible(
    { timeout: 90_000 },
  );
}

test("arrow keys step through the game, stop at both ends, and yield to editable fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openReview(page, SHORT_PGN);
  const board = page.locator("[data-board-orientation]");

  await page.keyboard.press("ArrowLeft");
  await expect(plyLabel(page)).toHaveText("Starting position / 4");
  for (let ply = 1; ply <= 4; ply += 1) {
    await page.keyboard.press("ArrowRight");
    await expect(plyLabel(page)).toHaveText(`Ply ${ply} / 4`);
  }
  await page.keyboard.press("ArrowRight");
  await expect(plyLabel(page)).toHaveText("Ply 4 / 4");
  await expect(
    page.getByRole("button", { name: /Black move Nc6/ }),
  ).toHaveAttribute("aria-current", "step");

  // Orientation survives keyboard navigation.
  await page.getByRole("button", { name: /Flip board/ }).click();
  await page.keyboard.press("ArrowLeft");
  await expect(board).toHaveAttribute("data-board-orientation", "black");
  await expect(plyLabel(page)).toHaveText("Ply 3 / 4");

  // A focused editable region keeps its own arrow-key behaviour.
  await page.evaluate(() => {
    const field = document.createElement("div");
    field.contentEditable = "true";
    field.id = "editable-probe";
    field.textContent = "notes";
    document.body.append(field);
  });
  await page.locator("#editable-probe").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(plyLabel(page)).toHaveText("Ply 3 / 4");

  // Shortcut help is exposed on the controls themselves.
  const next = page.getByRole("button", { name: "Next" });
  await expect(next).toHaveAttribute("aria-keyshortcuts", "ArrowRight");
  await expect(next).toHaveAccessibleDescription(
    "Keyboard: Left Arrow previous move, Right Arrow next move.",
  );
});

test("copies the exact selected FEN with the keyboard, offline", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openReview(page, SHORT_PGN);
  // Navigation sounds are same-origin assets unrelated to copying.
  await page.getByRole("button", { name: "Mute move sounds" }).click();
  await context.setOffline(true);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const copyButton = page.getByRole("button", { name: "Copy FEN" });

  for (const ply of [0, 2, 4]) {
    // Navigation is bounded, so enough Left presses always reach the start.
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("ArrowLeft");
    }
    for (let press = 0; press < ply; press += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await copyButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Copied FEN" }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      positions[ply],
    );
  }
  expect(requests).toEqual([]);
});

test("explains a denied clipboard and keeps arrow keys inside the manual field", async ({
  page,
}) => {
  await openReview(page, SHORT_PGN);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Copy FEN" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Clipboard" }),
  ).toContainText("Clipboard access was unavailable");
  const field = page.getByRole("textbox", { name: "Selected position FEN" });
  await expect(field).toHaveValue(positions[1]);
  await field.focus();
  await page.keyboard.press("ArrowRight");
  await expect(plyLabel(page)).toHaveText("Ply 1 / 4");
});

test("exports a byte-identical Markdown report offline without new engine work", async ({
  page,
  context,
}) => {
  await openReview(page, SHORT_PGN);
  await expect(
    page.getByRole("button", { name: "Export report (Markdown)" }),
  ).toHaveCount(0);
  await analyze(page);
  const workers = await stockfishWorkerCount(page);

  await context.setOffline(true);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  const reports: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export report (Markdown)" })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("chessed-review-alice-vs-bob.md");
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    reports.push(Buffer.concat(chunks).toString("utf8"));
  }

  expect(reports[1]).toBe(reports[0]);
  const report = reports[0];
  expect(report.startsWith("# Chessed game review\n")).toBe(true);
  expect(report).toContain("| White | Alice |");
  expect(report).toContain("| Event | Bounded browser fixture |");
  expect(report).toContain("| Date | Not recorded |");
  expect(report).toContain(`| Starting FEN | \`${positions[0]}\` |`);
  expect(report).toContain(`| Final FEN | \`${positions[4]}\` |`);
  expect(report).toMatch(/\| Engine \| Stockfish/);
  expect(report).toMatch(/^\| 4 \| `2\.\.\. Nc6` \| /m);
  await expect(
    page.getByRole("status").filter({ hasText: "Report saved" }),
  ).toBeVisible();

  // No analysis restarted and no network was needed.
  await expect(
    page.getByRole("button", { name: "Analyze Again" }),
  ).toBeVisible();
  await expect(page.locator("progress")).toHaveCount(0);
  expect(await stockfishWorkerCount(page)).toBe(workers);
  expect(requests.filter((url) => !url.startsWith("blob:"))).toEqual([]);
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`fits the new review actions at ${viewport.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openReview(page, SHORT_PGN);
    await analyze(page);
    await page.keyboard.press("ArrowRight");
    for (const name of ["Copy FEN", "Export report (Markdown)"]) {
      await page.getByRole("button", { name }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    if (process.env.CHESSED_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.CHESSED_SCREENSHOT_DIR}/review-${viewport.name}.png`,
        fullPage: true,
      });
    }
  });
}
