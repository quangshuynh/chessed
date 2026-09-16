import type { Page } from "@playwright/test";

import type { ReviewSessionPayload } from "../src/lib/review/session-store";

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

/** Fischer–Spassky, Reykjavik 1972, game 6: 83 reconstructed positions. */
export const SOAK_PGN = `
[Event "World Championship Game 6"]
[Site "Reykjavik"]
[Date "1972.07.23"]
[White "Robert James Fischer"]
[Black "Boris Spassky"]
[Result "1-0"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6
7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6
12. Qa4 c5 13. Qa3 Rc8 14. Bb5 a6 15. dxc5 bxc5 16. O-O Ra7
17. Be2 Nd7 18. Nd4 Qf8 19. Nxe6 fxe6 20. e4 d4 21. f4 Qe7
22. e5 Rb8 23. Bc4 Kh8 24. Qh3 Nf8 25. b3 a5 26. f5 exf5
27. Rxf5 Nh7 28. Rcf1 Qd8 29. Qg3 Re7 30. h4 Rbb7 31. e6 Rbc7
32. Qe5 Qe8 33. a4 Qd8 34. R1f2 Qe8 35. R2f3 Qd8 36. Bd3 Qe8
37. Qe4 Nf6 38. Rxf6 gxf6 39. Rxf6 Kg8 40. Bc4 Kh8 41. Qf4 1-0`;

export const CONFIRMATION_PGN = `
[SetUp "1"]
[FEN "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5"]
[Result "*"]

5. Nxe5 *`;

export async function openReview(page: Page, pgn: string): Promise<void> {
  page.on("pageerror", (error) => console.error("Browser page error:", error));
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.getByRole("textbox", { name: "PGN" }).fill(pgn);
  await page.getByRole("button", { name: "Open PGN in review" }).click();
  await page.waitForURL(/\/review\//, { timeout: 10_000 });
  await page.getByRole("button", { name: "Analyze Game" }).waitFor();
}

export async function openImportedReview(
  page: Page,
  requestedUsername: string,
  options: {
    pgn?: string;
    white?: string;
    black?: string;
  } = {},
): Promise<void> {
  await page.route("**/api/chesscom/*/profile", async (route) => {
    const username = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2) ?? "Player",
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ username, avatarUrl: null, profileUrl: null }),
    });
  });
  const sessionId = `imported-${requestedUsername.toLowerCase()}`;
  const white = options.white ?? "Alice";
  const black = options.black ?? "Bob";
  const payload: ReviewSessionPayload = {
    source: "chesscom",
    pgn: options.pgn ?? SHORT_PGN,
    createdAt: "2026-09-16T00:00:00.000Z",
    summary: {
      id: sessionId,
      requestedUsername,
      white,
      black,
      whiteRating: 1800,
      blackRating: 1750,
    },
  };
  await page.goto("/");
  await page.evaluate(
    ({ id, session }) => {
      window.sessionStorage.setItem(
        "chessed.review.sessions.v1",
        JSON.stringify({ [id]: session }),
      );
    },
    { id: sessionId, session: payload },
  );
  await page.goto(`/review/${sessionId}`);
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
