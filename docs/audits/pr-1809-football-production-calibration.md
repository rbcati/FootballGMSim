# Football Economy & Usage Calibration V1 — narrow production prerequisite

GitHub allocated [PR #1805](https://github.com/rbcati/FootballGMSim/pull/1805); #1809 remains the requested workstream name in these evidence filenames. GitHub does not allow choosing a future PR number.

Scope: calibrate actual offensive volume for #1804; contract economy and free-agent market work are excluded. This is a proposed calibration, not a new statistical authority. No automatic merge.

Base A: `0185cd0b1182fda4d6f76fb4517298b83e13c93d`. Integrity baseline: #1804 at `bebba8285ccbed8c995e7b4df551905dcf309905`. The isolated gameplay commit is `c313bcc0`; the combined branch carries the identical change as `ed64210d`. Both branches retain their original ledger and lifecycle behavior. Main's older ledger is compatibility evidence only.

## Diagnosis before parameter selection

The corrected baseline was reproduced before changing gameplay: **213.982077 passing, 97.908088 rushing, 24.75 points, 75% top-quartile wins, zero rich errors**. Existing yardage gates failed. All means below are per team-game unless stated otherwise.

| Actual outcome | Corrected before | C |
|---|---:|---:|
| Pass attempts/team-game | 31.755974 | 33.641544 |
| Completion fraction | 0.606807 | 0.606128 |
| Yards/completion | 11.104553 | 11.109148 |
| Yards/attempt | 6.738325 | 6.733566 |
| Carries/team-game | 25.569393 | 27.255974 |
| Yards/carry | 3.829113 | 3.832049 |
| Offensive plays/team-game | 58.193015 | 61.832721 |
| Sacks/team-game | 0.867647 | 0.935202 |
| Sack loss/team-game | 0.867647 | 0.935202 |
| TDs/team-game | 3.352022 | 3.553768 |
| TDs/play | 0.057602 | 0.057474 |
| Turnovers/team-game | 1.214154 | 1.275276 |
| QB carry share | 0.321339 | 0.320626 |

The joint deficit is principally volume: 58.19 offensive plays, 31.76 attempts and 25.57 carries. Completions already gain 11.10 credited yards. The pass mix is about 55.4% of attempts plus carries and the carry mean is 3.83 yards. A pass-only completion or gain increase cannot directly repair both deficits. Increasing carry gains or completion probability also changes conversion/TD efficiency when scoring is already 24.75. The controlled clock replay and nearly unchanged efficiency after calibration support a shared snap-volume adjustment.

Canonical sources inspected:

- [`matchupEngine.ts`](../../src/core/sim/matchupEngine.ts): `estimateYards` uses successful-pass base 12, successful-run base 6.8, talent slopes and bounded volatility. These are conditional successful-play gains, not league yards/play. Failed carries can lose yards. `resolveMatchup` applies a sigmoid to 0.62/0.54 base inputs, talent normalization 0.74, pressure, form, fatigue, distance and weather; 0.62 is **not** a literal completion probability. Sacks require a failed pass. Turnovers are sampled independently. None of those probabilities or gain constants change.
- [`richGameSimulator.ts`](../../src/core/sim/richGameSimulator.ts): `getPlayType` starts at 0.49 then reacts to down, distance and score; preparation biases it within existing caps. No-huddle multiplies elapsed time by 0.45, kneels consume 40 seconds, and regulation uses four 900-second periods. Form varies by game and is clamped to ±0.5; it remains unchanged. Pace here is elapsed seconds per snap, distinct from the existing `gamePace` form draw, which is a success-input adjustment despite its name.
- [`gamePlanMultipliers.ts`](../../src/core/sim/gamePlanMultipliers.ts): existing scouting/readiness deltas, defensive blitz pressure/coverage/explosive tradeoff and clamps remain authoritative. [`schemeExecution.ts`](../../src/core/sim/schemeExecution.ts) caps relative pass execution at ±0.025. Neutral soak inputs supply neither plan nor scheme advantages, so these cannot explain the common baseline deficit.
- [`engineSoak.js`](../../scripts/engineSoak.js): original unchanged acceptance bands; main shares legacy-mutated inputs, while #1804 uses independent league copies, actual availability references and canonical weekly/offseason recovery. A and B intentionally retain main's harness so compatibility is measured honestly. Corrected comparisons use #1804's repaired harness and identical before/after inputs.
- [#1804 final review](https://github.com/rbcati/FootballGMSim/blob/bebba8285ccbed8c995e7b4df551905dcf309905/docs/audits/pr-1804-final-statistical-review.md) and [controlled calibration audit](https://github.com/rbcati/FootballGMSim/blob/bebba8285ccbed8c995e7b4df551905dcf309905/tests/unit/gameStatCalibrationComparison.test.js): incomplete-pass/interception gains and over-goal-line sampled gains are not legitimate gross passing yards. The live `offensiveLedger` owns completed passing/receiving and carries. Team net passing subtracts explicit sack loss once. Those corrections remain intact; calibration does not recover their removed yardage through presentation.

## Exact gameplay change

In `resolveMatchup`, elapsed-time base **22 → 20 seconds**, retaining `rng() * (run ? 20 : 16) + (success ? 2 : 0)`, rounding, and the existing 18–45-second bounds. Exactly the same RNG draw is consumed. No new draws, sliders, competing tuners, field-position adjustments or postgame allocation are introduced. No other production file changes.

This moves offensive volume to ~61.8 plays/team-game while completion fraction, gain efficiency and TDs/play stay almost flat. Extra points and turnovers arise from additional real snaps and changed game situations. Scoring, fourth-down, overtime, fatigue and kneel mechanics stay in place. Fixed payloads remain deterministic, but old and new final scores are expected to differ.

## Three-state required-gate comparison, seed 20260605, four seasons

| Metric | A: main | B: main + calibration | Corrected before | C: corrected + calibration | Existing gate |
|---|---:|---:|---:|---:|---|
| Passing yards/team-game | 228.428768 | 241.930147 | 213.982077 | 226.527574 | 220–280 |
| Rushing yards/team-game | 101.069853 | 107.660386 | 97.908088 | 104.446232 | 100–130 |
| Points/team-game | 24.390625 | 25.908548 | 24.750000 | 26.181985 | 20–27 |
| Top-quartile win fraction | 0.751838 | 0.755515 | 0.750000 | 0.759191 | 0.68–0.76 |
| Score SD | 12.011139 | 12.524329 | 12.066757 | 12.674697 | >= own legacy SD |
| Milliseconds/game | 13.507309 | 34.151589 | 18.315327 | 37.256447 | <=50 |
| Rich errors | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0 |
| Final tie rate | 0.000000 | 0.000000 | 0.000000 | 0.000000 | <=0.01 |
| Minimum score | 3.000000 | 3.000000 | 3.000000 | 3.000000 | >=3 (existing floor) |

Both engines complete 1,088 games in each state. Legacy score SD is 10.974039 in A/B and 10.911161 in corrected before/C; rich SD exceeds its own comparator. The performance row uses final serial, unobserved gate runs (except the original corrected-before timing); these are gate measurements, not a controlled CPU benchmark. All three final unobserved runs pass every check. Diagnostic observer timing is retained separately in the JSON and includes detached snapshots/concurrent load. No thresholds, timeouts or tests were changed.

## Multiple deterministic seed populations

| Seed | Corrected before pass/rush/points | C pass/rush/points | C top-quartile win rate | C gate |
|---|---|---|---:|---|
| 20260605 | 213.98 / 97.91 / 24.75 | 226.53 / 104.45 / 26.18 | 75.92% | PASS |
| 4242 | 213.82 / 98.01 / 24.53 | 226.56 / 104.97 / 26.15 | 73.71% | PASS |
| 8675309 | 214.06 / 98.28 / 24.50 | 227.25 / 104.51 / 26.06 | 75.37% | PASS |
| 314159 | 213.14 / 98.74 / 24.64 | 226.57 / 104.94 / 26.23 | 72.79% | PASS |

Each seed runs four seasons and 1,088 games per engine. C therefore checks **4,352 games / 8,704 team-games**, with all player/team ledger checks passing. Each seed controls a separately generated roster population; the established soak's game seeds are schedule-coordinate hashes. The adversarial sweep additionally varies actual per-game RNG seeds. These are deterministic model experiments, not independent samples from real NFL seasons; they establish robustness on these populations, not a guarantee across all seeds. The 75.92% required-seed win fraction remains close to the upper bound and is explicitly a monitoring risk.

The reproducible evidence is [pr-1809-statistics.json](pr-1809-statistics.json). A/B main-only yardage is never used to establish corrected acceptance.

## Distributions and football identity

For required-seed C, team-game passing p10/median/p90 is **168 / 225 / 286** yards (range 60–438); rushing is **57 / 101 / 158** (range 7–241). Points p10/median/p90 is **7 / 27 / 42**, range 3–77, SD **12.67** vs 12.07 before. Team means across four seasons still span **210.18–244.38 passing**, **81.37–123.03 rushing** and **17.12–34.84 points**. Individual teams need not satisfy league-average bands.

RB/WR/TE target shares are **28.49% / 49.63% / 21.88%**, compared with **28.51% / 49.81% / 21.67%** before. Receiving-yard shares are **28.33% / 49.90% / 21.77%**. The median top-receiver target share remains 16.7%; p90 falls slightly from 22.2% to 21.4%. This is no concentration spike, but the unusually diffuse workloads themselves require future role modeling.

QB/RB/WR carry shares are **32.06% / 53.06% / 14.88%**, almost unchanged from **32.13% / 52.94% / 14.93%**. QB carries/team increase **8.22 → 8.74**, not a special QB bonus; p90 goes 12 → 13 and max stays 21. The unchanged workload formula gives a primary QB 9% **plus** the weighted remainder, with other QBs also eligible. This is excessive league-wide QB/WR rushing, and the volume increase modestly increases its absolute count. It must not be presented as realistic positional usage.

Participating RB player-games retain a broad signed range: carries p10/median/p90 **1/3/6** (max 14), yards p10/median/p90 **0/13/29** (range −5–74). The median highest-player carry share is 23.3%, compared with 23.8% before. These rosters rotate across many RBs and distribute too much work away from lead backs; calibration neither collapses the variance nor solves the underlying usage model. No receiver is given yards without catches and no runner without carries in C.

Completed drives/game-team rise **6.75 → 7.15**; mean completed-drive length is **8.315 → 8.350 plays**. The JSON includes drive yards, elapsed seconds and result counts. Completed-drive seconds omit unfinished drives and can include clock overrun at period boundaries; they are not advertised as canonical possession time. Turnovers/team rise 1.214 → 1.275 while turnover opportunities remain legitimate.

Paired corrected seed-20260605 final scores change in **662 / 1,088 games**, with mean signed team delta **+1.432**, maximum absolute delta 21. Other populations change 672–685 finals with maxima 34–35; the clock changes late-game decisions and RNG-path consumption, so an individual score can move in either direction. Inspectable examples are in the evidence JSON. No score-identity assertion was used across calibration versions.

## Adversarial evidence

[`footballProductionCalibration.test.ts`](../../src/core/__tests__/footballProductionCalibration.test.ts) runs 192 actual games, exact seeded replays, and paired old-clock games: offensive talent 65/75/90, opposing defense 65/90, neutral/pass/run/preparation and scheme variations, plus injured QB/WR and IR RB starters with available replacements. The shared fixture uses canonical eligible game-day rosters, as the production bridge does. #1804’s unchanged raw-roster tests additionally enforce inactive/foreign-player rejection. It checks score reconciliation, low/high tails, rush/pass-heavy outcomes, actual negative runs, sacks and kneels, and #1804 player/team invariants when explicit sack accounting is present. The unchanged #1804 suites separately enforce full event ownership, signed longest gains, missing-QB rejection, zero-catch/carry invariants, serialization, end-zone bounds and negative receiving support.

The corrected adversarial sweep produces score range **3–69**, up to 43 team carries and 57 attempts, **470 actual negative runs, 324 sacks and 46 kneels**. The paired old-clock corpus has 439 negative runs and 290 sacks; carry success is 6,545/10,349 (63.24%) versus 6,183/9,760 (63.35%) before, consistent with extra volume rather than a success-rate boost. It changes 117 paired final scores; average team-score delta is +1.490 and largest absolute team delta is 18. [Machine-readable adversarial evidence](pr-1809-adversarial.json).

## Structural findings deliberately outside this calibration

1. **Red-zone counters are invalid.** The simulator increments `redZoneTrips` for `wasRedZone && nextYardLine < 80`, counting exits backwards rather than distinct entries. Required-seed baseline reports only 0.015625 trips/team-game and a nonsensical score/trip ratio >200. We emit null efficiency from that counter. The adversarial field-state trace instead counts 1,791 completed drives with a red-zone snap/entry, 1,597 ending in TD (**89.17%**). That is high and points to existing scoring/short-yardage structure; it is not a claimed NFL-realistic red-zone model. Open red-zone drives at game end are excluded. This diagnosis does not alter counters to pass a gate.
2. **Negative completions are supported by #1804's ledger but not naturally generated in this sweep.** Successful-pass gains remain positive under the existing sampling model. The zero observed negative completions are disclosed; controlled signed-yard ledger tests cover negative receiving. Gain-shape/route-depth work is separate.
3. **Rushing/receiving roles remain too diffuse**, with excessive aggregate QB and WR rushing as quantified above. Role-specific usage, mobile-QB tendencies and lead-back concentration need structural work rather than changing identity to meet a team mean.
4. **Existing scoring and drive abstractions remain.** Fourth-down scrimmage attempts precede punt/FG decisions on failed plays; missed FGs/partial OT drives share `Downs`. The existing shutout floor and capped-OT resolution still exist; this PR adds no synthetic TDs or scoring shortcuts. Low sack frequency and one-yard sack losses in the soak are existing mechanics, not evidence of NFL-like pass protection.
5. **Normal-franchise QB depletion remains possible.** Existing #1804 errors and legitimate signing/activation remedies apply. This calibration adds no roster policy, generated replacements or early healing.

These limitations limit the claim to the existing statistical gate and narrow production calibration. They are not hidden behind a plausible league mean and should be addressed in separately reviewed structural changes.

## Separate browser-test correction

The existing main browser test demanded a quarter table for a canonical-ledger Game Book, contrary to the unchanged `boxScoreViewModel.js` rule and [#1700 timing contract](../canonical-gamecast-playable-tomorrow-v1.md). Untouched A and calibrated B both fail that same assertion. C initially passed #1804's revised tests, not the stale assertion; this is a test-version distinction, not evidence that calibration fixed quarter presentation.

A separate test-only commit copies #1804's already reviewed correction: inspect recorded player-table links, then require the same franchise identity, final score and player-table text before/after reload. It does not skip a case, relax any statistical gate, restore invented chronology or modify display/persistence code. The existing unit regression forbidding fabricated canonical quarter tables remains intact. These stronger browser cases are independently checked against unchanged main production and calibrated main.

## Reproduction

Use Node 22 (executed with 22.23.0), `npm ci`, and separately installed TypeScript 5.9.3 for the existing `tsconfig.sim.json` check; no dependencies or lockfile changes.

```sh
node --import tsx scripts/football-calibration-audit.mjs /path/to/main /tmp/main-report.json 20260605
CORRECTED_LEDGER=1 node --import tsx scripts/football-calibration-audit.mjs /path/to/integrity-worktree /tmp/combined-report.json 20260605,4242,8675309,314159
FOOTBALL_CALIBRATION_AUDIT=/tmp/adversarial.json npm run test:unit -- src/core/__tests__/footballProductionCalibration.test.ts --maxWorkers=1
npm run test:unit -- tests/unit/engineSoak.test.js --maxWorkers=1
```

The observer receives a detached structured clone, so inspecting a game cannot change its gate counters. Baseline comparison used the same observer-only harness diff without calibration. The observer itself adds no RNG calls. #1804's older score-identity audit should not compare across this gameplay change; its own same-game integrity assertions remain applicable.

## Verification and safe merge sequence

See [separate combined-branch validation](pr-1809-combined-validation.md) for exact commands, outcomes and head-specific Actions links. Required checks must be green before considering this mergeable. Local timeout attempts under competing CPU load are reported there rather than concealed.

Preferred sequence: green #1805 (the requested #1809 workstream) targeting main → rebase #1804 onto that main → rerun all #1804 required checks → merge #1804 only while green. The temporary integration branch is validation only; do not merge it or #1804's red head to obtain the comparison. Gameplay, audit tooling and evidence are separate commits. If the final main-only workflow fails, keep this draft/blocked and use a stacked PR only after the dependency is explicitly resolved; never force a red prerequisite merge.
