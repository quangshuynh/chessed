import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchChessComPlayerProfile } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("fetchChessComPlayerProfile", () => {
  it("normalizes only the public identity fields Chessed uses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          username: "Alice",
          avatar: "https://images.chesscomfiles.com/uploads/v1/user/a.png",
          url: "https://www.chess.com/member/alice",
          followers: 999,
          country: "https://api.chess.com/pub/country/US",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchChessComPlayerProfile("Alice")).resolves.toEqual({
      username: "Alice",
      avatarUrl: "https://images.chesscomfiles.com/uploads/v1/user/a.png",
      profileUrl: "https://www.chess.com/member/alice",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.chess.com/pub/player/Alice",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("normalizes an absent avatar to null and surfaces request failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ username: "Bob" }), { status: 200 }),
        ),
    );
    await expect(fetchChessComPlayerProfile("Bob")).resolves.toMatchObject({
      avatarUrl: null,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("", { status: 404 })),
    );
    await expect(fetchChessComPlayerProfile("Missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
