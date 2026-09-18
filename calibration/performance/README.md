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
curl -LO https://database.lichess.org/standard/lichess_db_standard_rated_2013-01.pgn.zst
sha256sum lichess_db_standard_rated_2013-01.pgn.zst
zstd -d lichess_db_standard_rated_2013-01.pgn.zst
node calibration/performance/select-sample.mjs <lichess-month.pgn>
npm run test:performance-calibration
node calibration/performance/fit-models.mjs validation
node calibration/performance/evaluate-holdout.mjs
```

The database is CC0. Lichess numeric clock tags use `initial+increment`
seconds; this experiment categorizes `initial + 40 * increment` as documented
in the frozen specification. `WhiteElo` and `BlackElo` are calibration labels,
not production features.

The browser calibration is resumable. It appends one canonical JSON object per
successfully analyzed game and skips valid completed IDs on rerun. The fitting
command refuses to inspect holdout labels and writes a validation lock. The
holdout command requires that lock and records its hash.

For bounded parallel collection, run disjoint shards with
`CHESSED_PERFORMANCE_SHARD=index/count` (zero-based), for example `0/4` through
`3/4`. Sharding changes only orchestration; the selected corpus and per-game
analysis semantics are identical. Concurrent shards require an already-running
production server or staggered startup so they can reuse the configured server.

Source archives and transient checkpoints belong in `calibration/data/` and
remain untracked. Small selected/analyzed/result artifacts may be committed;
raw UCI logs must not be committed.
