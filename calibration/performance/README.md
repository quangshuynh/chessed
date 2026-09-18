# Performance calibration v2

This directory contains the preregistered, opt-in experiment for testing whether
compact move-distribution evidence adds stable information beyond
`chessed-accuracy-v1`. Normal CI checks fixtures and artifact invariants only;
it does not analyze the full corpus.

The experiment specification was committed to the worktree before any v2
engine analysis or model fitting. A design change requires a new version and a
written reason; holdout failure is not a reason to revise this version.

## Source preparation

Download the January 2013 standard rated archive from the URL and verify the
SHA-256 recorded in `experiment-v2.json`. Decompress it with Zstandard without
changing the PGN bytes.

```text
node calibration/performance/select-sample.mjs <lichess-month.pgn>
npm run test:performance-calibration
node calibration/performance/fit-models.mjs validation
node calibration/performance/evaluate-holdout.mjs
```

The browser calibration is resumable. It appends one canonical JSON object per
successfully analyzed game and skips valid completed IDs on rerun. The fitting
command refuses to inspect holdout labels and writes a validation lock. The
holdout command requires that lock and records its hash.

Source archives and transient checkpoints belong in `calibration/data/` and
remain untracked. Small selected/analyzed/result artifacts may be committed;
raw UCI logs must not be committed.
