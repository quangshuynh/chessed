import type { Page } from "@playwright/test";

export const SHORT_PGN = `
[Event "Bounded browser fixture"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

export const MEDIUM_PGN = `
[Event "Medium browser fixture"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
6. Re1 b5 7. Bb3 d6 8. c3 O-O *`;

export const LONG_PGN = `
[Event "Long browser fixture"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7
11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6 *`;

export async function openReview(page: Page, pgn: string): Promise<void> {
  page.on("pageerror", (error) => console.error("Browser page error:", error));
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.getByRole("textbox", { name: "PGN" }).fill(pgn);
  await page.getByRole("button", { name: "Open PGN in review" }).click();
  await page.waitForURL(/\/review\//, { timeout: 10_000 });
  await page.getByRole("button", { name: "Analyze Game" }).waitFor();
}

export async function stockfishWorkerCount(page: Page): Promise<number> {
  const session = await page.context().newCDPSession(page);
  const { targetInfos } = await session.send("Target.getTargets");
  await session.detach();
  return targetInfos.filter(
    (target) =>
      target.type === "worker" &&
      target.url.includes("stockfish-18-lite-single"),
  ).length;
}
