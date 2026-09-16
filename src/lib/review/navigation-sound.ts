import type { MoveSound } from "@/lib/chess/move-sound";

const SOUND_PATHS: Record<MoveSound, string> = {
  move: "/sounds/move.wav",
  capture: "/sounds/capture.wav",
  check: "/sounds/check.wav",
  checkmate: "/sounds/checkmate.wav",
};

export function playNavigationSound(sound: MoveSound): void {
  try {
    const audio = new Audio(SOUND_PATHS[sound]);
    audio.volume = 0.35;
    void audio.play().catch(() => undefined);
  } catch {
    // Audio support and playback permission are optional; navigation is not.
  }
}
