# Browser confirmation and lifecycle soak

This validation uses the production Stockfish 18 lite worker. Run the bounded
opt-in suite with `npm run build && npm run test:e2e:soak`. It is opt-in so the
83-position game, repeated runs, garbage collection, and CPU-throttled browser
work do not slow ordinary CI.

## Fixtures and observations

- A custom-FEN Légal position exercises one depth-16 confirmation. Visible
  progress changed from three base/enrichment steps to four total steps.
- Fischer–Spassky, Reykjavik 1972 game 6 supplies 83 reconstructed positions,
  well beyond the previous 31-position fixture. The measured run performed 54
  selective enrichments and one confirmation: totals changed 83 -> 137 -> 138.
- The same browser session completes a confirmed review, starts again, cancels,
  starts a third time, completes, navigates results, analyzes the longer game,
  changes board selection repeatedly, and finally navigates away.
- Chromium exposed exactly one Stockfish worker while each run was active and
  zero after completion, cancellation, and navigation. Unit tests separately
  force several and consecutive confirmations, including adjacent White and
  Black plies, because tuning a real position to a shallow numeric band would
  be a brittle test fixture.

On the measured Windows/headless Chromium environment under a 390x844 viewport
and 4x CPU throttling, the confirmed one-move review took 1.49 s, cancellation
51 ms, and the 83-position run 10.55 s. These are local observations, not
budgets or physical-mobile measurements. Navigation remained responsive, the
main layout and long PV stayed contained, progress advanced, and no main-thread
freeze was observed.

CDP heap usage after explicit garbage collection was approximately 5.22 MB at
baseline, 6.69 MB after repeated completion/cancellation, 7.25 MB after the
long run, and 2.64 MB after navigation/unmount. This small sample detects no
obvious retained-run growth, but it is not a proof that the application is
leak-free and does not justify production memory instrumentation.

## Physical phone/tablet checklist

No physical device was available for this interval. On a real phone or tablet:

1. Use a current Safari or Chrome release and open the Fischer–Spassky soak PGN.
2. Tap **Analyze Game** and confirm progress continues while the board's
   Previous/Next controls remain responsive.
3. Cancel once during later progress, verify that no partial review appears,
   then retry and complete.
4. Select opening, middle, and final moves; verify the board, labels, and long
   principal variation fit without horizontal page overflow.
5. Analyze again, navigate away during a run, return, and verify a new run starts
   at zero with current v3 results only.

Worker termination, stale promises, and heap retention cannot be observed
reliably from the device UI; retain the automated lifecycle suite for those
checks. Record the actual device, OS, browser, thermal state, and timings before
describing any result as physical-mobile validation.
