## Artifact files removed
Cleaned up multiple generated output / scratch / artifact files from previous explorations and benchmarks to ensure a clean repo for the next feature. Specifically removed all instances of:
- `*.patch`
- `*-commits.txt`
- `commit_message.txt`
- `pr_description.md`
- `patch_*.py`
- `patch_*.js`
- `submit.js`
- `fix_*.py`
- `test_app.py`
- `my_patch.patch`

## Duplicate/conflict residue found or confirmed absent
- Fixed `src/core/league-memory.js` which had multiple duplicate definitions inside `buildSeasonArchiveSummary` (like `teamMap`, `userRow`, `userTeam` maps). Kept the optimal single-pass logic intact.
- Confirmed that `src/core/trades/tradeFinderAnalysis.js` properly retained safe behavior and teamMap fallback usage after previous optimizations. No leftover conflicts were found.

## League-memory cleanup summary
- Ensured `src/core/league-memory.js` uses only one cleanly structured dictionary caching iteration over the `teams` and `sorted` variables instead of duplicating maps and looping multiple times.
- Avoided redundant Map declarations and removed overlapping variables (`userRows`) where appropriate.

## Game-simulator lookup safety summary
- Added a centralized `ensureTeamsMap(league)` helper in `src/core/game-simulator.js` to ensure that `_teamsMap` is generated safely checking if `teams` exists on `league`.
- Replaced multiple duplicate loops setting up the array index with the `ensureTeamsMap` helper in the fallback and lookup scopes.
- Retained the safety behavior of retrieving correct references or handling null fallbacks robustly.

## Readiness-gate helper decision
- Modified `tests/e2e/helpers/franchise.js` so that `simulateSingleWeek` no longer clicks "Advance anyway" under-the-hood universally. This could previously mask regressions.
- Adapted `simulateSingleWeek(page, options = {})` so that explicit `advanceAnyway: true` must be passed when it is intended to bypass readiness checks.
- Addressed downstream test files (`box_score_clickthrough.spec.js`, `core_flow_reliability.spec.js`, `daily_regression.spec.js`) to provide the flag implicitly to maintain test stability and intention.

## Validation commands run
```bash
npm run test:unit
npm run build
npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js
npm run test:soak
```
