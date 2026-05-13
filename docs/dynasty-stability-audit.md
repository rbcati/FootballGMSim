# Long-Dynasty / Multi-Seed Stability Audit V1

FootballGMSim is a client-side dynasty simulator: the core franchise loop, completed-season archives, transaction memory, draft history, record book, Hall of Fame, and saves all have to survive long browser-only careers. This audit upgrades the existing dynasty soak harness into a named V1 release check aimed at ZenGM-style long-run trust.

## What V1 checks

`stability-v1` runs deterministic multi-seed, completed-season dynasty audits without replacing the existing fast CI smoke profiles. For each configured seed it exercises:

- Worker boot and safe starter league creation.
- Full-season simulation through regular season, playoffs, offseason, free agency, draft, and next preseason.
- Current league shape: year, phase, user team, team count, rosters, standings, cap fields, player ratings/contracts, and current schedule state.
- Roster integrity: roster containers exist, no empty active rosters, QB scarcity collapse is detected, and duplicate player IDs across team/free-agent/draft containers fail the run.
- History integrity: completed season archives, plausible standings, season history handler shape, record book rebuild, Hall of Fame handler shape, transaction timeline, player-season stats archive, and draft class history.
- Economy/balance warnings: teams over cap, pending-offer overcommitment, duplicate expensive CPU offer groups, rebuilding teams overpaying old veterans, missing contender win-now activity, cheap premium-player trade flags, veteran cap-dump-like swaps, QB scarcity, and draft/history quality signals.
- Persistence proof: force `SAVE_NOW`, reload through the worker `LOAD_SAVE` path, re-run history/transaction/draft/records/HOF handlers, and compare year, phase, team count, current season ID, completed season count, transaction sample size, and user team ID before/after reload.

Hard corruption is a failure. Balance concerns are warnings by default and only fail the process when `--fail-on-warnings` is passed.

## Commands

### Safe CI / fast checks

```bash
npm run test:soak
npm run audit:dynasty:multi
```

`test:soak` is fast Vitest coverage for the audit parser, reporter, aggregation, persistence assertion formatting, and pure invariant checks. `audit:dynasty:multi` is still the short multi-seed real-worker smoke path and does **not** complete seasons.

### Manual release stability audit

```bash
npm run audit:dynasty:stability
```

Default V1 depth is intentionally manual and bounded: **5 completed seasons x 3 deterministic seeds**. It should be run before releases when validating dynasty trust, but it is not wired into normal push CI.

### Deeper manual audit

```bash
npm run audit:dynasty:stability:deep
```

This runs more seasons/seeds and enables deep final-season probes. You can tune depth directly:

```bash
npm run audit:dynasty -- --audit-profile=stability-v1 --seasons=20 --seeds=1383,1408,1426,1451,1499 --deep --fail-on-warnings
```

## Reports

Every CLI run writes JSON and Markdown artifacts under `artifacts/dynasty-soak/`:

- `latest.json` / `latest.md`
- `latest-multi-seed.json` / `latest-multi-seed.md` for multi-seed profiles

The Markdown report includes profile name, seeds, seasons per seed, runtime per seed, pass/fail/warn summary, first failure per failed seed, warning categories by seed, final year/phase, completed archive counts, economy/cap warnings, persistence/reload summary, slow checkpoints, what the run proves, what it does not prove yet, and a suggested next-depth command.

The JSON report keeps structured per-seed results and summaries so future agents can compare regressions.

## Interpreting failures vs warnings

- **Failures** mean dynasty corruption or broken handler behavior: crashes, invalid league year/phase, missing teams/rosters, duplicate player IDs, impossible cap/standings/player values, broken archives, failed save/load, or malformed required history data.
- **Warnings** mean sports-sim balance or early-dynasty quality concerns: cap stress, roster depth warnings, sparse transactions, empty early HOF, suspicious AI economy behavior, outlier stat leaders, or missing optional archive enrichments.
- Use `--fail-on-warnings` for strict release-candidate audits when you want balance warnings to block the run.

## Known limitations

- V1 is not an always-on 20-50 season CI soak.
- The harness runs in Node with fake IndexedDB, not on mobile Safari/Chrome live storage.
- It checks shaped data and suspicious balance indicators, but does not yet produce full AI team-building grades.
- It is deterministic by seed but does not snapshot full statistical distributions across versions.
- Smaller league sizes remain deferred because playoff/schedule/conference assumptions are 32-team-oriented.

## Future V2 ideas

- 20 to 50 season scheduled soak with regression baselines.
- Saved-game migration audit across archived old saves.
- Mobile live-site E2E dynasty smoke against IndexedDB.
- AI team-building scorecards for contenders, rebuilders, cap-strapped teams, and QB-needy teams.
- Statistical distribution snapshots across versions for talent, caps, standings, awards, injuries, draft quality, and career records.
