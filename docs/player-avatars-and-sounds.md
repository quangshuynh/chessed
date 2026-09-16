# Player avatars and navigation sounds

## Profile provenance

Chessed requests public profile data from Chess.com's documented
`/pub/player/{username}` endpoint only for a review session whose stored source
is `chesscom`. The normalized source contract contains only `username`, optional
avatar URL, and optional profile URL. PGN headers are never treated as Chess.com
accounts, so a manually pasted `[White "Hikaru"]` tag causes no profile request.

Profile lookup runs independently after the review loads and never gates PGN
navigation or Stockfish analysis. A missing profile, absent avatar, request
failure, or image-load failure renders a neutral initial badge while the textual
player name remains present. Remote images are restricted to HTTPS paths under
`images.chesscomfiles.com/uploads/**` in the Next.js image configuration.

## Sound behavior

Move metadata is derived while chess.js reconstructs each legal resulting
position. One sound is selected with the precedence `checkmate > check > capture

> move`; en passant uses chess.js capture semantics. SAN punctuation is not used
> to decide the event.

Sounds play only from a deliberate move-cell, Previous/Next, or ArrowLeft/
ArrowRight navigation action. Initial render, analysis progress, classification
arrival, profile loading, and React rerenders are silent. A direct jump plays at
most the destination move's one sound. Backward navigation plays the sound of
the destination move (the position now displayed), while position 0 is always
silent. This makes backward behavior deterministic without sounding the move
being undone.

Sound defaults on. The accessible `Sound: On/Off` control applies immediately
and stores `chessed.sound.enabled.v1` in local storage; unavailable storage keeps
the in-memory setting usable. Audio is constructed only inside the user action,
and browser autoplay/playback rejection is silently contained. Reduced-motion
preferences do not alter audio preference.

The four small WAV files are original Chessed procedural tones under the project
license. Their reproducible generator and detailed provenance are in
`scripts/generate-chessed-sounds.mjs` and `public/sounds/README.md`.
