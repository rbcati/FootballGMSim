# PR #1802 — Simulation-Authoritative Scheme Fit V1

**Final contract:** `selected-personnel-relative-v1`. Canonical selected seats use complete genuine observed ratings through the existing #1801 evaluator first, otherwise supported AttributesV2 specialization. Evidence branches never stack. Only pass-success probability is adjusted; Smashmouth/rushing compatibility is deferred. The sections below retain the required pre-production checkpoints and measured reasons for revision.

## Pre-implementation checkpoint

Starting main: `9106f1256a68b125234e031def4733a15167d0f3` (fetched, not assumed). No PR #1802 or requested feature branch existed at start.

### Routing matrix

| Gameplay route | Authority | Construction / persistence |
| --- | --- | --- |
| User regular season | Rich by default | ADVANCE_WEEK → buildWeekMatchupsFromLeague → simulateWithOptionalNewEngine → SimulationManager → simulateRichGame → rich-summary conversion → applyGameResultToCache / flushDirty |
| AI regular season | Same | Same batch, same formulas |
| Preseason | Same weekly gate | ADVANCE_WEEK accepts preseason, runs cutdown and transitions to regular week 1 without simulating a preseason game; no standalone preseason game engine |
| Playoffs | Same | Scheduled bracket games enter same weekly builder; existing rich overtime policy retained |
| Watch Game | Same | WATCH_GAME builds one matchup through same builder, commits result, marks watched game played, returns canonical ledger; Advance Week excludes it |
| Quick Sim | Same | PregameChoices onWatch('instant') → WATCH_GAME; presentation skips playback |
| Simulate Week | Same | onSimWeek → ADVANCE_WEEK({skipUserGame:true}) |
| Background / batch | Same for normal franchise | SIM_TO_PHASE → ADVANCE_WEEK; SimulationManager uses SimWorker or inline rich fallback. Separate audit tools may explicitly invoke legacy sim |
| Rich disabled / rich failure | Legacy | simulateBatch → simGameStats in simulation/index.js; deliberately preserved |

Default is `DEFAULT_LEAGUE_SETTINGS.useNewSimulationEngine = true`; normalized settings merge defaults. Presence of legacy code alone does not establish gameplay authority.

### Existing modifiers and contracts

Rich: canonical eligible roster → migration + canonical row selection + positional effective-rating penalties → aggregate V2 units; per-game seeded form; Game Plan preparation attribute deltas, play tendencies, fatigue adjustment; defensive explicit blitz pressure/coverage/explosive controls; weather/down/distance/fatigue/talent in resolveMatchup. Morale affects workload/attribution via effective OVR. No existing scheme compatibility multiplier reaches rich resolution. `computeStrategicEdge`, `getStrategyModifiers`, staff tactical/philosophy modifiers and legacy chemistry/fit are in the legacy engine, not secretly re-applied to rich payloads.

Legacy order: eligible roster strengths and defensive formation penalty; coaching/HC modifiers; strategy and staff tactical modifiers; cached `calculateTeamRatingWithSchemeFit` (legacy aliases, all recognized roster positions, fit-weighted rating + chemistry) → `0.9 + fit*0.002` offense/defense components combined in its existing strength slot, HC scheme scalar; morale; existing strength/matchup/play resolution. Canonical IDs do not all map through frozen legacy aliases; correcting this would change old balance and is intentionally excluded. No legacy files will change.

Display: `resolveOffensiveScheme` / `resolveDefensiveScheme`, `calculatePlayerSchemeFit`, `computeTeamSchemeFits` provide exact-key evaluative scores and display OVR projections, not modern execution authority. Stored `player.schemeFit` / team historical fit and FA/strategy scores are not game-day inputs. This V2 model is explicitly a different, relative-specialization execution model, not a conversion of legacy fit or a claim that display OVR bonuses are applied in rich games.

Personnel authority: `aggregateTeamUnitsFromRoster`, including buildEligibleGameDayRoster / isAvailableForGameDay, canonical depth row+order, fallback selection and out-of-position effective attributes. Reuse its actual selected arrays after role penalties, with no second starter picker. Average over selected unit seats; unsupported roles contribute zero rather than increasing the weight of the few supported players. Existing workload pools are probabilistic attribution pools, not measured participation shares; do not invent shares.

### V2 model proposal (version `attributes-v2-relative-v1`)

Available fields: release, routeRunning, separation, catchInTraffic, ballTracking, throwAccuracyShort, throwAccuracyDeep, throwPower, decisionMaking, pocketPresence, passBlockFootwork, passBlockStrength, passRush, pressCoverage, zoneCoverage. Rich pass weights already value these absolute strengths. Run weights currently reuse passing/blocking fields; that does not establish semantic runBlock/trucking evidence.

Use *relative specialization*, so uniformly excellent or uniformly weak players remain scheme neutral; absolute talent continues through existing weights. For each supported selected role compare two complete observed skill bundles. Missing/invalid fields make that player's evidence neutral (no reweighting sparse evidence). A 15-rating-point deadband suppresses small differences, including the current overall-based migration template's positional artifacts. Map signed excess difference / 35 to [-1,1].

- QB Vertical: mean(throwPower, throwAccuracyDeep) versus 0.4 short accuracy + 0.3 release + 0.3 decisionMaking. West Coast reverses.
- WR/TE Vertical: mean(separation, ballTracking) versus 0.6 routeRunning + 0.4 catchInTraffic. West Coast reverses.
- Cover 2 DBs: zoneCoverage versus pressCoverage; LBs: zoneCoverage versus passRush.
- Man Coverage DBs: reverse zone/press. LBs neutral: press is not generic linebacker man coverage.
- 3-4 Blitz LBs: passRush versus zoneCoverage. DL/EDGE neutral: only one relevant V2 front attribute exists, no defensible specialization comparison.
- OL/RB, Smashmouth and unsupported roles neutral: protection remains fully authoritative via base talent, no speculative run traits. No formation or blitz-rate changes.

Proposed coefficient: each unit's signed seat average × 0.025. At the existing matchup pass-success boundary, combine offensive delta minus opposing defensive delta, clamp the *combined* relative adjustment to ±0.025, then multiply the existing success probability once. Rushes get exactly zero. This caps even opposing excellent/poor configurations at 2.5% relative completion-probability influence (not 2.5 percentage points, not a win-rate promise). Uniform talent improvement cannot create a fit penalty. No RNG draws or attribute mutation.

Double counting prevention: aggregation computes context only; no attribute boosts there. Rich passes the combined context once; resolveMatchup applies once after existing sigmoid. It never uses legacy fit, stored fit or display bonuses. Game Plan and explicit blitz fields are untouched. Recompute once per fresh matchup; no durable scheme cache, player rating, worker protocol or save schema.

### Baseline before production edits

`scheme-fit-v1-baseline.json`: 11 controlled scenarios × 300 paired seeds = 3,300 games, seeds 70000–70299. Same-roster Vertical / West Coast / Man / Blitz scheme labels produce identical baseline results: home 29.6667 PPG, opponent 23.4833; 386.27 total yards, 262.3833 pass, 123.8867 rush; completion .64098; .8267 turnovers, .4567 sacks allowed; win rate .6533. This confirms scheme labels currently have no rich authority. Synthetic specialist fixtures isolate context; they are not a claim about league population distributions. Baseline talent, neutral and Game Plan rows are included in JSON.

### Expected changed files

Production: new `src/core/sim/schemeExecution.ts`; `weekSimulationBridge.ts` (context on aggregation), `richGameSimulator.ts` (typed transport), `matchupEngine.ts` (single bounded application), `src/worker/WorkerPool.ts` (typed context), `src/worker/worker.js` (current schemes into aggregation and transport), `src/ui/components/LineupCommandCenter.jsx` (existing help only). Tests: new direct scheme execution tests and worker integration regression; existing lifecycle tests reused. Artifacts: this report, baseline/calibration JSON, deterministic sweep script. No dependency manifest changes.

## Implementation findings and calibration

The live-worker integration exposed an existing lossy conversion of string season IDs (`s1` → `Number(...)` → NaN → null rich game ID). The matchup builder now preserves its existing season identity when calling buildCanonicalGameId. This changes no saved franchise identifier, score, RNG or schema; it makes rich event IDs correspond to the Game Book archive. A real safe-starter worker regression asserts a string canonical game ID and archive lookup.

Originally valid V2 fields are required *before* positional normalization can clamp/coerce invalid evidence. Missing V2 at aggregation is neutral even though the existing base-strength migration still runs. Persisted migration templates are also neutral in the supported comparisons: correctness testing increased the proposed deadband from 10 to 15 and changed the full-scale denominator to 35. The maximum coefficient remains .025. No unrelated engine constants were tuned.

Population limitation: player creation primarily supplies legacy ratings; `ensureAttributesV2` supplies overall-derived shapes. This PR does not reinterpret those shapes as strong system preferences. Genuine V2 differentiation (including existing attribute evolution) is required to leave the deadband. The production regression injects a controlled specialist fixture through the actual cache/commands; it is evidence of routing and execution, not evidence that a fresh default roster already has diverse V2 archetypes. The untouched-franchise probe records that separate question. This foundation intentionally leaves Smashmouth, OL/RB-specific compatibility and unsupported defensive-front traits neutral.

Large calibration: 2,000 paired seeds per scenario, 11 scenarios (22,000 games on main, 22,000 on implementation). JSON artifacts retain all supported counters. Same-roster Vertical vs West Coast: 28.9455 vs 28.289 PPG; 263.032 vs 258.3825 passing yards; 120.1005 vs 120.0065 rushing yards; .64131 vs .62745 completion; .897 vs .9065 turnovers; .522 vs .537 sacks allowed; .6455 vs .6275 wins. Scheme changes do not directly modify runs; full-game rushing totals can move because possession, clocks and seeded branches change after different pass results.

Cover 2 versus Man (same roster/offense/plan): opponent PPG 23.6925 vs 24.3825, home wins .6455 vs .6335. Cover 2 versus 3-4 Blitz: opponent PPG 23.6925 vs 24.2755, home wins .6455 vs .632. This is personnel execution, with explicit blitz call frequency held neutral and unchanged.

High talent (90), neutral fit: 39.337–14.4165 PPG, .955 wins. High talent with worse supported fit: 39.244–14.6795, .9515 wins. Average talent (70), excellent fit: 24.095–28.081, .3975 wins; average talent neutral: 23.1695–30.529, .312 wins. These are common-opponent fixtures, not head-to-head probabilities. Uniformly high talent necessarily limits how extreme its specialization mismatch can be; the poor-fit 90-talent fixture has small negative compatibility, rather than inventing a major weakness in uniformly strong players.

Neutral Vertical and West Coast are exactly equal (27.981–26.052 PPG, 370.498 yards, .63431 completion, .5535 wins), and each equals main over the same seeds. Fixed scheme with supported pass-heavy Game Plan produces 29.7255 PPG, 282.29 passing yards, .64372 completion, .6685 wins; the scheme projection stays identical to the neutral-plan row. Preparation applies through the existing attribute/tendency boundary, scheme through one probability boundary.

Turnovers and win rates are not guaranteed monotonic per seed or across different roster talents; the changed success branches also change subsequent RNG consumption. These batches show a directional modest execution effect, not a universal win-rate promise or a precise causal attribution of every stat. Existing explosive-play counters were zero across these fixtures both before and after; they provide no useful evidence for explosive balance here. Existing unusually high win rates for large talent gaps are retained, not retuned.

## Revised checkpoint before observed-rating implementation

The untouched 18-week probe found **zero non-neutral teams in either unit at every checkpoint** for the V2-only proposal. That proposal alone does not meet the fresh-franchise product goal. Source inspection confirms `generatePlayerRatings` already generates genuine, differentiated legacy skills, including throwAccuracy, awareness, intelligence, speed, catching, blocking, coverage and both rush traits. No generator/progression redesign is necessary.

Revised contract (same application boundary and .025 cap): prefer the existing #1801 `calculatePlayerSchemeFit` evaluator on **complete genuine legacy rating evidence** for the selected canonical role. Require every weight key used by the comparison family to be present, finite and in 1–100; do not fill missing keys or use V2 substitutes. Evaluate a role-adjusted *copy* through the existing positional penalty helper. For passing offense compare West Coast versus Vertical; for defense compare the selected scheme versus the mean of the other two. Divide the signed fit-score difference by 20 and clamp to [-1,1], then use the same selected-seat average × .025. The visible evaluator's exact scheme weights and rounding are reused; the execution context is relative fit, not a second absolute talent reward. Uniform ratings are neutral. If complete genuine legacy evidence is unavailable, use the explicitly documented V2 specialization submodel. Never add the two sources together for one player.

Smashmouth remains neutral at this *pass-only* boundary even when run traits exist: a dedicated rushing model is outside this smallest viable version. Existing base rushing authority is unchanged. Legacy generic coverage remains generic coverage in the existing evaluator; it is never relabeled zoneCoverage/pressCoverage or written to V2. Real legacy runBlock stays runBlock; no conversion to passBlockStrength occurs. Modern execution is the sole new authoritative consumer; the frozen legacy simulator remains untouched.

The transport version becomes `selected-personnel-relative-v1`, with two explicit evidence branches under one deterministic contract. Expected production files and modifier order stay unchanged. Add direct complete/missing/uniform legacy tests, re-run the unmodified-franchise probe and all current-head checks. Keep the failed V2-only population probe as evidence of why the checkpoint changed.


## Final observed-evidence calibration

The expanded retained sweep has 14 scenarios × 2,000 paired seeds = **28,000 baseline games and 28,000 implementation games**, plus the original pre-production 3,300-game baseline. All native V2 calibration results above remain unchanged numerically; the transport version now describes both evidence branches.

With identical 75-rated base V2 units and genuine legacy specialties, Vertical versus West Coast yields 28.4765 versus 27.6385 PPG; 257.504 versus 252.613 passing yards; 114.7685 versus 114.259 rushing yards; .64267 versus .62643 completion; .655 versus .6655 turnovers; .467 versus .48 sacks allowed; .5875 versus .557 wins. Main's two configurations are exactly equal (27.981 PPG, .63431 completion, .5535 wins). Holding offense fixed, Cover 2 versus Man allows 25.636 versus 25.9115 opponent PPG and yields .5875 versus .5765 home wins. This separates real observed fit from absolute base talent without converting any legacy skill into V2.

Old saves without explicit scheme IDs use the same canonical defaults as the visible lineup: WEST_COAST / COVER_2. A discovered missing-context gap in the initial proposal was corrected at the production matchup builder (not by assigning new saved schemes). Calls without any scheme context still get a neutral projection. Scheme aliases resolve through the #1801 canonical resolvers.

No permanent ratings, contracts, cap, trades, injuries, development formulas, roster/depth commands, franchise identities, IndexedDB schemas, standings, bracket rules, worker message types or RNG implementations were changed. No postgame scheme storyline was added; no unsupported causal claim is persisted.

Reproduction uses Node 22 and the unchanged dependency lockfile. Run `node --import tsx scripts/schemeFitSweep.ts 2000`; for main baseline, create a detached worktree at the recorded starting SHA, copy the same sweep script into its scripts directory, and run against that worktree's unchanged source. `node --import tsx scripts/schemeFitFranchiseProbe.ts` runs real safe-starter worker commands for 18 weeks without editing ratings. Unit integration runs actual Watch/Quick and Advance Week handlers; the worker-entrypoint test checks structured transport against inline rich results.

Final untouched safe-starter probe: **288 real worker games over 18 weeks**, seed 1802, no manual rating edits. Every checkpoint has nonzero observed-fit context for all 32 offenses and defenses. Maximum absolute unit context remains only .00056818 offense and .00017045 defense (about .057% / .017% relative execution), reflecting this fallback roster's deliberately uniform positional templates. This is proof of live applicability and season refresh, not evidence of a large fresh-roster balance effect. Differentiated observed/V2 fixtures demonstrate the stronger supported states. The discarded proposal's 288-game all-neutral population probe is retained separately.

Validation: full local unit suite 517 files / 6,386 tests; bounded durability 89 tests; dynasty soak subset 103 tests; final focused scheme/aggregation/matchup/rich/pool/Watch/legacy group 11 files / 183 tests. Build and independent `npm run check:sim-types` pass. The final isolated type gate caught JavaScript boundary inference in the new helper; its scheme-table shape is now explicitly typed and the existing depth-row group filter is expressed equivalently in TypeScript. No calibration coefficients or runtime selection policy changed. Production/deploy-preview parity and seven local browser flows passed; current-head hosted checks are re-fetched in the final delivery report.
