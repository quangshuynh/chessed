import { afterEach, describe, expect, it, vi } from "vitest";

import { playNavigationSound } from "./navigation-sound";

afterEach(() => vi.unstubAllGlobals());

describe("playNavigationSound", () => {
  it("uses one quiet asset and absorbs browser playback rejection", async () => {
    const play = vi
      .fn()
      .mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    const AudioMock = vi.fn(function (this: { volume: number }) {
      this.volume = 1;
      return { play, volume: this.volume };
    });
    vi.stubGlobal("Audio", AudioMock);

    expect(() => playNavigationSound("check")).not.toThrow();
    expect(AudioMock).toHaveBeenCalledOnce();
    expect(AudioMock).toHaveBeenCalledWith("/sounds/check.wav");
    await Promise.resolve();
    expect(play).toHaveBeenCalledOnce();
  });
});
