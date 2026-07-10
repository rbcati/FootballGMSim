# FootballGMSim — Structured Audit Report

**Reviewers:** Senior Coding Official · Senior UI/UX Design Engineer · Senior Gameplay Analyst
**Date:** 2026-06-04
**Method:** All target files read in full. Headline findings independently re-verified against source (line-quoted). Two agent-level findings were **downgraded after verification** and are marked `[VERIFIED-CORRECTION]`.

> Scope note: The audit brief named several files that turned out to be thin shims or stale duplicates. The *live* simulation lives in `src/core/simulation/index.js` (2,368 lines) and `src/worker/worker.js` (468KB), not `game-simulator.js` (a 712-byte re-export). Findings are reported against the code that actually runs.

---

## SECTION 1 — SIMULATION ENGINE AUDIT

**Verdict: Structurally broken at the core. The game simulates each match twice with two unreconciled engines and stitches the score from one onto the stat lines of the other.**

> **Game Result Integrity Audit Closure — 2026-07-09.** Re-verified every finding in this section against current `index.js`/`driveEngine.js`. Status:
> - **Return-TD precedence bug — fixed in a prior commit.** `checkReturnTD` already uses the bounded expression `Math.min(0.15, Math.max(0.01, 0.04 + (str - 70) * 0.001))` for both sides. Extracted to a tested pure helper, `calculateReturnTDChance` (`scoreKeeper.js`), with regression coverage in `src/core/__tests__/simulation/gameResultIntegrity.test.js`. No behavior change.
> - **Overtime gating on the wrong score — fixed in a prior commit.** The `if (homeScore === awayScore)` OT check already runs on `homeScore`/`awayScore` *after* they are assigned from `driveSummary` (the canonical source), not a stale engine-A value. Regression test added (playoff games never commit a tied result).
> - **Ties recorded as home wins — fixed in a prior commit.** `winnerIsHome`/`homeWin`/`awayWin`/`tie` are all derived via strict three-way comparison (`homeScore > awayScore` / `awayScore > homeScore` / `===`) everywhere in `index.js`. Consolidated into a tested pure helper, `buildGameOutcomeState` (`scoreKeeper.js`), used by `commitGameResult` and the `simulateBatch` fallback path so a tie can never surface as `homeWin: true`.
> - **Dual-engine score/stat fracture — partially fixed in a prior commit, one residual mismatch fixed in this PR.** `driveSummary` (the drive engine) is already the authoritative source for the final score *and* for TD/FG/XP counts fed into the box score (`homeTDs`/`homeFGs`/`homeXPs` all read `driveSummary?.… ?? homeRes.…`). The one remaining leak: 2-point-conversion attribution (`homeTwoPts`/`awayTwoPts`) still read `homeRes.twoPtMade`/`awayRes.twoPtMade` — engine A's independently-seeded count — instead of `driveSummary`'s. Patched to prefer `driveSummary?.homeStats?.twoPointMade` (falling back to engine A only if the drive summary is unavailable), matching the pattern already used for TDs/FGs/XPs. Regression test added: box-score point totals (`TDs·6 + 2-pt·2 + FG·3 + XP`) now sum exactly to `homeScore`/`awayScore` across 30 seeded games.
> - **Known gap, intentionally deferred (not in original scope, out of surgical-fix budget):** the play-by-play-derived scoring narrative (`scoringSummary`/`quarterScores`, built from `fullGameResult.playLogs`, i.e. engine A) is **not** reconciled with the canonical `driveSummary`-based final score — the two can diverge substantially (observed: canonical 54–34 vs. quarter-by-quarter narrative summing to 17–7 for the same seed). Fixing this requires either making engine A authoritative again (regressing the box-score fix above) or teaching the drive engine to emit play-by-play events, both of which are simulation-architecture changes beyond this audit-closure pass. Flagged for a follow-up architectural decision, not patched here.

### Are game outcome calculations mathematically sound?
**No — the architecture is the problem, not the individual formulas.** Each individual engine produces plausible NFL ranges (`buildDriveBasedSummary`, `driveEngine.js:111-144`: 20–26 drives, `driveSuccess` clamped 0.15–0.72, 67% TD / 33% FG split → ~20–26 pts/team). But two engines run per game:

- `simulateFullGame` (`index.js:562-1091`) runs a full play-by-play loop producing `homeRes.score`, touchdowns, field goals, play logs, momentum.
- `buildDriveBasedSummary` (`driveEngine.js:82`) runs a *separate*, independently-seeded engine.

The final score is then taken from the **second** engine while the TD/FG counts that feed the box score come from the **first** — verified at `index.js:1116-1123`:
```js
let homeScore = Math.max(0, driveSummary?.homeScore ?? homeRes.score);   // engine B
let awayScore = Math.max(0, driveSummary?.awayScore ?? awayRes.score);   // engine B
let homeTDs   = homeRes.touchdowns;   // engine A
let homeFGs   = homeRes.field_goals;  // engine A
```
There is no constraint that `7·TDs + 3·FGs + XPs == homeScore`. **A user can see a 13–9 final where the QB is credited with 3 passing TDs**, or a box score whose points don't sum to the scoreboard. This is **Critical** — every downstream artifact (box score, OT, winner, return TDs) inherits the fracture.

### Is the schedule generator correct?
**Mostly.** Game count and bye validation are sound — `validateSchedule` (`schedule.js:464-478`) enforces exactly 17 games, exactly 1 bye, byes only in weeks 5–12, 18 total weeks. The NFL-template path is correct.
**Weakness (Medium):** the *procedural fallback* (`createWeekSchedule`, `schedule.js:172-267`) is greedy pairing with no backtracking; an odd leftover team in a week simply goes unpaired. On failure it falls through to `createSimpleSchedule` (`schedule.js:525-603`), which is pure random pairing **with zero division/conference structure** — a "valid" 17-game schedule can have no divisional-rivalry logic at all.

### State mutation that could corrupt a game mid-sim?
**Yes — two real hazards (both High):**
- **In-game injuries permanently mutate shared roster objects** driven by the discarded engine (`index.js:1240-1254` → `applyInjuryToPlayer`, `injuryResolver.js:30-37` sets `player.injured = true` on the live object). The WR/TE path carefully saves/restores `ovr` (`index.js:1327-1362`) — proof the authors know mutation is dangerous — but the injury-flag mutation is permanent and unconditional.
- **The "0-0 prevention" retry loop re-runs the full sim up to 3×** (`index.js:2085-2090`), re-rolling injuries on already-mutated rosters each attempt. A rare 0-0 game can stack injuries.
- *Counter-evidence (good):* the league-level commit path **is** well-guarded — `commitGameResult` builds/deletes scratch maps per batch and has an idempotency check (`index.js:2055-2062`) preventing double-commits.

### Off-by-one season/week indexing errors?
**None found.** `getWeekGames` uses `weeks[weekNumber - 1]` with bounds checks (`schedule.js:622-631`); `commitGameResult` uses `weekIndex = (league.week||1) - 1` consistently; playoff games correctly skip W/L updates via `isPlayoff`. Clean.

### Is RNG deterministic or exploitable?
**Deterministic (Mulberry32, `utils.js:28-34`, seeded from a persisted `globalSeed`) — and the authoritative score is precomputable.** `buildDriveBasedSummary` depends only on `(season, week, homeId, awayId, globalSeed, ratings)` (`driveEngine.js:96-98`), *not* on prior PRNG call order. Because `globalSeed` is stored in the save file, a player inspecting the save could precompute every game's result, and re-simming a week yields an identical score. **Low–Medium** depending on whether save inspection is in scope.

**Additional confirmed bugs:**
- **Return-TD probability is nonsense (High).** `index.js:1079` — verified verbatim:
  ```js
  const returnTDChance = 0.04 + (team === result.home ? homeStr : awayStr - 70) * 0.001;
  ```
  Operator precedence parses this as `home ? homeStr : (awayStr-70)*0.001`, so when home, `returnTDChance ≈ 0.04 + 75 = 75.04` → **always fires**; when away, it's near-zero. The added points land on the discarded engine's score anyway.
  **[FIXED — prior commit, re-verified 2026-07-09]** Live code already reads `Math.min(0.15, Math.max(0.01, 0.04 + (str - 70) * 0.001))` for both sides.
- **Overtime gates on the wrong score (Critical).** `if (homeScore === awayScore)` (`index.js:1128`) runs *after* `homeScore`/`awayScore` were reassigned from engine B, so OT triggers on a value unrelated to the play-by-play the user watched.
  **[FIXED — prior commit, re-verified 2026-07-09]** The live OT check already runs on the post-reassignment (canonical) `homeScore`/`awayScore`.
- **Ties recorded as home wins (High).** `winnerIsHome = homeScore >= awayScore` (`index.js:1543`) contradicts `homeWin: homeScore > awayScore` (`index.js:1864`); a true tie is shown as a home win in the recap.
  **[FIXED — prior commit, re-verified 2026-07-09]** All winner/tie fields now use strict three-way comparison; see closure note above.

---

## SECTION 2 — PLAYER & PROGRESSION AUDIT

### Do rating bounds clamp correctly everywhere?
**Mostly, but with two conflicting rating systems and inconsistent floors.** There are two non-communicating models: legacy `ratings` (clamped `[40,99]`, `progression-logic.js:88,111-113`) and `attributesV2` (clamped `[25,99]`, `evolutionEngine.ts:411,498`). The skill-tree path in `player.js:175` clamps only the upper bound (`Math.min(99,…)`, no lower bound). `attributesV2` deltas are never projected back onto `ratings`/`ovr`, so a player can decline in one system while displayed OVR (computed from `ratings`, `player.js:250-267`) doesn't move. **High** — confusing, inconsistent progression.

### Do aging curves produce realistic career arcs?
**No — peak ages are internally contradictory across four files (High).** `constants.js:99` `PEAK_AGES` says RB 25 / CB 26 / QB 28 / OL 29, but the actual rating engine (`progression-logic.js:241-264`) gives **every** position the same growth window (21–25) and prime (26–29). `playerDevelopmentModel.js:73-91` hardcodes 26–29 "for most positions." `evolutionEngine.ts:123-135` uses yet another curve. Linemen do **not** actually age later than skill players despite the constant. The data and the engines disagree.

### Can a player stay unrealistically elite forever?
**Yes (High).** All `ratings` clamps floor at **40**, and `MIN_OVR = 40` (`constants.js:98`, applied `player.js:266`). A 39-year-old WR's speed cannot fall below 40, and dev-trait decline multipliers (e.g. X-Factor 0.60, `progression-logic.js:63`) blunt decline further. The only true backstop is forced retirement at 38 (`constants.js`/`player.js:460`). 37-year-old superstars stay ~90 OVR until the age cliff.

### Is injury duration realistic, and does it gate lineups?
**Duration is plausible per template** (`injury-core.js:6-14`: Sprained Ankle 1–3 wks … ACL 20–40 wks, season-ending). **But there are two availability predicates that disagree (Critical):**
- `statAccumulator.js:119` gates lineups via `canPlayerPlay()` (`injury-core.js:94-108`), which returns `true` unless an injury has `weeksRemaining > 1` — so a player **in his final injury week plays while still flagged injured**.
- `playExecution.js` gates purely on `!p.injured`.
The two sim paths field different lineups for the same roster. Compounding it, recovery decrements the aggregate `injuryWeeksRemaining` while `canPlayerPlay` reads the per-entry `injuries[].weeksRemaining`, which is set once and never decremented — the counters desync.

### Does retirement trigger correctly?
**Age yes, rating no (Medium).** `retirement-system.js:80-103` (verified): RB retire chance ramps at 30+, all others at 34+, with a `progressionDelta <= -5` bump. **There is no low-OVR term** — a washed 32-year-old 50-OVR non-RB has a 0% retirement chance, so rosters clog with old scrubs. Also `retirement-system.js:41` reads `player.injuryWeeks`, a field the runtime never writes (it writes `injuryWeeksRemaining`), so the injury-driven retirement branch is dead.

### NaN / undefined / negative stats reaching the UI?
- `calculateOvr` guards NaN ratings to 50 (`player.js:259-260`) — good.
- `calculateExtensionDemand` (`player.js:664`) divides by `baseline.signingBonus` which `generateContract` never returns → `NaN`, rescued only by `|| 0.15`. Works by accident. **Low.**
- `calculateMorale` parses `player.id` as base-36 (`player.js:623`); non-numeric ids silently yield 0 jitter. **Low.**

**`[VERIFIED-CORRECTION]`** — A sub-agent flagged `progressPlayer()` (`player.js:457-469`) as a *Critical* "progression that never regresses." **Verified false on the live path:** `progressPlayer` is imported **only** by `scripts/daily_regression.mjs` (a test harness). The live worker uses `processPlayerProgression` (`progression-logic.js`, imported `worker.js:114`, called `worker.js:9235`), which does perform regression. Reclassified to **Low / dead-code** — it's an exported stub with a misleading name that should be deleted, not a live gameplay bug.

---

## SECTION 3 — STATISTICS & DATA MODEL AUDIT

### Are seasonal stat accumulations additive-safe?
**The advanced-stats archive is idempotent** — `archiveGameStats` dedupes by `gameId` (`playerSeasonStatsArchive.js:317-337`). **The live season accumulator is not** — `accumulateStats` (`statAccumulator.js:609`) is blind `+=` with no game-id guard, and its caller (`index.js:1795`) increments `gamesPlayed` unconditionally.
**`[VERIFIED-CORRECTION]` severity:** a sub-agent rated this **High** (replay double-counts). The commit layer mitigates it: `commitGameResult` has an idempotency guard preventing the same game from being committed twice (`index.js:2055-2062`, cross-confirmed in Section 1). The accumulator itself is still not self-protecting, so a code path that bypasses the commit guard (manual resim, retry) **would** double-count. Reclassified to **Medium**: real fragility, but not currently triggered on the normal flow.

### Do career totals aggregate correctly from season archives?
**The V1 path is correct** (`recordBookV1.js:196-237` merges player `careerStats` with archive-only lines, deduping by season key). **But there are two career engines that disagree (Medium):** legacy `records.js:112-137` uses its own field map and **skips any player with no `careerStats`**, making archive-only players invisible to it. The "all-time leader" can differ depending on which engine the screen calls.

### Are records preserved when a player changes teams mid-season?
**Totals survive, but attribution is lossy (Medium).** A season is stored as a single career line with one `team` stamp (`playerSeasonStatsArchive.js:230`); the live accumulator keeps one `p.stats.season` bag regardless of team. A player traded mid-season has his **entire** season credited to one franchise in franchise records. No per-team split exists.

### Are award calculations using the correct season snapshot?
**Live award races: yes (good)** — `calculateAwardRaces` (`awards-logic.js:282-297`) reads the in-season accumulator and gates on `gamesPlayed >= MIN_GAMES_AWARD`. **Historical timeline: can double-count (Medium)** — `buildMergedPlayerAwardTimeline` dedupes on `${canonical}_${year}` (`playerAwardTimeline.js:51-53`) but **skips entries with no valid year** (`:97-99`); `legacyScore.js:126-140` then adds those year-less "loose" accolades on top, inflating MVP/DPOY counts and potentially pushing a player over the HOF threshold (70).

### Can the record book show a record by a player who no longer exists?
**Yes — by design (correct) but with an identity bug (High).** Records are snapshots (`recordBookV1.js:119-138` copies `playerId`, `playerName`, value, year), so a retired player keeps his record — correct. **The bug:** records store a bare, *recyclable* numeric `playerId` and match on `String(holder.playerId) === pid` (`recordBookV1.js:664,675`; `legacyScore.js:228,236`). If a player is deleted and the freed id is reused by a newly generated player, **the new player silently inherits the old player's records and HOF points** (+5 each, `legacyScore.js:228-246`). The displayed holder name also goes stale.

---

## SECTION 4 — AI & ROSTER MANAGEMENT AUDIT

### Do AI teams make rational roster decisions?
**Mostly, with two holes (Medium).** FA offers run a real affordability gauntlet (`ai-logic.js:768-787`, final `if ((team.capRoom ?? 0) > (capHit + 1))`) and positional-need gating. **But:**
- **Offer cap "reservation" is fake** — the code admits "We don't deduct cap yet… only on signing" (`ai-logic.js:820-822`). Several offers landing the same day can collectively blow the cap; only a sequential per-signing race check (`ai-logic.js:873`) prevents going negative, so the AI silently loses targets it "budgeted" for.
- **Cutdowns ignore position entirely** — `executeAICutdowns` (`ai-logic.js:103-113`) scores by `ovr*2 + potential + youthBonus` and cuts the lowest, with **no protection for kickers/punters/QB depth**. A team can cut its only kicker.

### Is the salary cap hard or soft?
**Nominally hard (`HARD_CAP = 301.2`, `constants.js:27`), effectively soft (High).** Choke-point checks are blocking (user offer `worker.js:5781-5784`, AI signing `ai-logic.js:873`). But `updateTeamCap` (`ai-logic.js:79-82`) lets `capRoom` go **negative with no floor or rejection** — dead-cap from cuts routinely drives it below zero, checked only at the *next* transaction. AI "cap management" targets the hard cap as an annual snapshot and restructures by converting 50% of base to bonus (`ai-logic.js:198`), inflating future dead money. The cap source is also inconsistent — `ai-logic.js:77` falls back to `?? 255` while the economy module uses 301.2.

### Does the depth chart auto-sort when starters are injured or cut?
**Injury: yes. Cut: NO (High).** `repairDepthChart` (`depthChartManager.ts:499-541`) correctly promotes healthy backups and excludes unavailable players. **But the release path never repairs the depth chart** — verified at `worker.js:6142-6180`: `releasePlayerWithValidation` updates teamId/status, dead cap, and scheme fit, then `handleReleasePlayer`/`handleBulkReleasePlayers` (`:6203-6230`) recalc scheme fit only. **Neither calls `ensureTeamDepthChart` or `repairDepthChart`.** The cut player's ID stays in `team.depthChart` as a dangling starter reference until some unrelated path happens to rebuild it.

### Are FA signing periods correctly gated?
**Yes (Low / correct).** FA only opens when the offseason transition sets `phase:'free_agency'` with a `freeAgencyState` (`worker.js:9389-9395`); `handleAdvanceFreeAgencyDay` refuses without it and transitions to `draft` on the final day. No mid-season leakage found.

### Is trade valuation consistent / exploitable?
**Inconsistent and exploitable (High).** There are **three** value scales that aren't reconciled:

| System | Function | ~75-OVR magnitude |
|---|---|---|
| AI-to-AI | `calculatePlayerValue` (`trade-logic.js:96-125`) | ~120–180 |
| User trades | `_tradeValue` (`worker.js:6968-7010`, `ovr^1.55`) | ~815 |
| Draft picks | `DEFAULT_PICK_VALUE_MATRIX` (`tradeValuationModifiers.js:21-30`) | R1 = 950 |

`trade-logic.js` itself exports both `calculatePlayerValue` (180-scale) and `getPickMarketValue` (950-scale) — any consumer mixing them values a Round-1 pick at ~5× an elite player. Concrete exploits: **expensive star contracts are barely penalized** — `contractPenalty = (annualSalary / 301.2) * 200` means a $30M QB loses only ~20 of ~180 points (`trade-logic.js:116-117`), so dumping bloated veterans nets value; and on Easy the AI accepts deals worth 90% of fair (`worker.js:7210`).
*Note:* the **Critical** rating a sub-agent gave is tempered by the fact that the AI-to-AI engine never trades picks at all (`executeTrade` only swaps `playerId`s, `trade-logic.js:212-250`), so the worst cross-scale mismatch isn't currently surfaced AI-to-AI. Held at **High**.

---

## SECTION 5 — UI/UX AUDIT

### Is Draft.jsx a monolith?
**The premise is based on a dead file.** The repo-root `Draft.jsx` (72KB, 1,958 lines) **is** an old monolith — but **nothing imports it** (verified: the only `import Draft` resolves to `./Draft.jsx` *within* `src/ui/components/`, and the root file can't even resolve its own imports). The **live** `src/ui/components/Draft.jsx` is a clean **147-line orchestrator** that already delegates to `DraftControls`, `ProspectTable`, `PreDraftPanel`, `DraftCompletePanel`, `PickGradeModal`, and `PlayerProfileModalBoundary`. **The refactor the brief asks for has already been done.** The action item is to **delete the dead root file**, not split the live one.

For completeness, the sections still crammed in the dead monolith (already extracted in the live tree): `ScoutBadge`, `calculatePickGrade`/`PickGradeModal`, `DraftTicker`, `TradeUpModal`, `OvrBadge`/`SortIcon`, `PreDraftPanel`, `DraftBoard` (with inline War Room banner, trade-up panel, pick-order panel, prospects table), `DraftCompletePanel`, and the container.

### Silent failures (action → zero feedback)?
**Yes (High).** `TradeCenter.jsx:554` `handleAcceptIncomingTrade` is `async` with **no try/catch**; a rejected accept is an unhandled promise rejection and a rejected-with-no-payload offer freezes the UI silently. The sibling `handlePropose` (`:516-550`) does this correctly. Several fetches also `console.error` and die silently with no toast: `Coaches.jsx:162-166`, `Roster.jsx:890-892`, `RosterManager.jsx`, `SaveManager.jsx`. *Good pattern to copy:* `FreeAgencyPanel.jsx:349` sets `signError` rendered as `role="alert"`.

### Loading / pending states for async ops?
**Strong.** `App.jsx` has a sim progress label (`:764`), progress bar (`:1205`), `role="status"` aria-live banner (`:1213`), full-screen spinner (`:1470-1494`), and a batch-sim overlay with cancel/retry. `TradeCenter` shows "Evaluating…", `FreeAgencyPanel` has loading/signing state, `NewsFeed` shows a spinner. **Gap (Low):** no submit-lock on trade-accept, so rapid taps can double-fire.

### Buttons with no handler / console-and-return stubs?
**None found.** Greps for `onClick={()=>console.log…}`, `onClick={()=>{}}`, `onClick={noop}` returned zero matches across `src/ui/components/`. Every live button is wired.

### Tailwind breakpoints used correctly for mobile?
**Barely used at all (Low / informational).** `tailwind.config.js` defines custom screens, but `App.jsx`, `MobileNav.jsx`, `HomeDashboard.jsx`, `TeamHub.jsx` use **zero** `sm:`/`md:`/`lg:` utilities — only 7 of 156 component files use any. Mobile is driven by hand-written `mobile.css`/`app-mobile.css` and inline styles. Not a bug, but the Tailwind `screens` block is largely decorative.

### Does the news feed handle empty states?
**Yes (good).** Live `NewsFeed.jsx` renders `<EmptyState title="No news yet." …/>` (`:289`), "No active injuries" (`:312-313`), a `role="alert"` load-failure banner (`:234`), and a spinner (`:242`). Ticker mode with no stories returns null cleanly.

### React anti-patterns?
- **Index-as-key: widespread (54 sites, Medium where lists reorder)** — `App.jsx:1411`, `HomeDashboard.jsx:81/365/500/862`, `AwardRaces.jsx:145`, `OffseasonRecap.jsx:241/293`, etc. Risk of stale DOM/animation glitches on reorder.
- **Missing keys:** none confirmed (heuristic hits were false positives).
- **`exhaustive-deps` suppressions: 6** (`HomeDashboard.jsx:1332`, `SeasonSimViewer.jsx:348`, `OnboardingTour.jsx:64/72`, `LeagueLeaders.jsx:128`, `WeeklyPrepScreen.jsx:260`) — each a deliberate "run on week change" but each masks a potential stale-closure bug.
- **setState-in-render:** none found.
- **Fragile effect trigger (Low):** `NewsFeed.jsx:168-187` refetches on `newsItems.length` + first-item fingerprint; two items swapping without a length/first-id change won't refetch.

---

## SECTION 6 — CROSS-CUTTING ISSUES TABLE

| # | Issue Title | Severity | Category | What the User Experiences | Root Cause (file + function) | Fix Summary |
|---|---|---|---|---|---|---|
| 1 | Dual-engine score/stat fracture | Critical | Simulation | Box-score TDs don't match the final score; QB has 3 TDs in a 13-9 game | `index.js:1116-1123` `simulateMatchup` (score from `buildDriveBasedSummary`, TDs from `simulateFullGame`) | **[MOSTLY FIXED 2026-07-09]** TD/FG/XP already reconciled to `driveSummary` in a prior commit; the 2-pt-conversion leak fixed in this PR. Residual gap: `scoringSummary`/`quarterScores` narrative still derives from engine A playLogs — deferred, see Section 1 closure note. |
| 2 | Overtime gates on the wrong score | Critical | Simulation | OT fails to trigger on real ties / appends points to non-tied games | `index.js:1128` (uses reassigned engine-B score) | **[FIXED — prior commit, verified 2026-07-09]** OT already gates on the canonical post-reassignment score. |
| 3 | Two disagreeing injury-availability predicates | Critical | Simulation | Injured player appears in one sim path's lineup but not the other | `injury-core.js:94-108` `canPlayerPlay` vs `playExecution.js` `!p.injured` | Single availability predicate; `injured===true` ⇒ excluded |
| 4 | Return-TD probability precedence bug | High | Simulation | Special-teams return TDs at ~75% when home, ~0% away | `index.js:1079` `checkReturnTD` | **[FIXED — prior commit, verified 2026-07-09]** Bounded expression already in place; extracted to a tested helper in this PR. |
| 5 | Ties recorded as home wins | High | Simulation | A tied regular-season game shows the home team winning | `index.js:1543` vs `:1864` | **[FIXED — prior commit, verified 2026-07-09]** Strict three-way comparison already in place everywhere; consolidated into a tested helper in this PR. |
| 6 | In-game injuries mutate shared rosters during 0-0 retry | High | Data Integrity | Rare games stack/duplicate injuries on the live roster | `index.js:1240-1254`, retry `:2085-2090` | Apply injuries once at commit, or snapshot/rollback |
| 7 | Depth chart never repaired after a cut | High | AI | Released starter remains a ghost in the lineup until an unrelated rebuild | `worker.js:6142-6230` (no `ensureTeamDepthChart`) | Strip released ID + repair on release |
| 8 | Salary cap effectively soft (capRoom goes negative) | High | AI | Teams silently sit over the "hard" cap; AI loses budgeted targets | `ai-logic.js:79-82` `updateTeamCap` | Reject/clamp any transaction leaving `capRoom < 0` |
| 9 | Trade valuation inconsistent / exploitable | High | AI | Player dumps bloated contracts / wins lopsided deals on Easy | `trade-logic.js:96-125,116-117,453`; `worker.js:6968-7010` | One shared `getAssetValue()`; penalize by live cap |
| 10 | Record holder identity uses recyclable numeric id | High | Data Integrity | A new player inherits a deleted player's records + HOF points | `recordBookV1.js:664,675`; `legacyScore.js:228` | Store/match an immutable player GUID |
| 11 | Two conflicting rating systems, no projection | High | Simulation | Dev events fire but displayed OVR never moves | `progression-logic.js` `ratings` vs `evolutionEngine.ts` `attributesV2` | Collapse to one model or define explicit projection |
| 12 | Peak-age data contradicts all four engines | High | Simulation | RBs/linemen don't age as labeled; arcs feel wrong | `constants.js:99` vs `progression-logic.js:241-264` | Drive all curves from `PEAK_AGES` |
| 13 | Rating floor of 40 ⇒ elite forever | High | Simulation | 37-year-old superstars stay ~90 OVR until the age cliff | `constants.js:98`, `progression-logic.js:88` | Lower decline-phase floor for physical traits |
| 14 | TradeCenter accept has no error handling | High | UX | Accepting a trade that fails freezes the UI with no message | `TradeCenter.jsx:554` `handleAcceptIncomingTrade` | try/catch + `setTradeResult({accepted:false})` |
| 15 | Dead 72KB root `Draft.jsx` / `NewsFeed.jsx` | High | Performance | (Dev-facing) misleads audits; wasted maintenance | repo-root `Draft.jsx`, `NewsFeed.jsx` (unimported) | `git rm` both |
| 16 | Retirement has no low-OVR threshold | Medium | Simulation | Old 50-OVR scrubs never retire; rosters clog | `retirement-system.js:80-103` | Add `ovr<60 && age>=30` term |
| 17 | Mid-season trade credits whole season to one team | Medium | Stats | Traded player's full stats appear under one franchise | `playerSeasonStatsArchive.js:230` | Key season lines by `(season, teamId)` |
| 18 | Two career-stat engines disagree | Medium | Stats | "All-time leader" differs by screen | `records.js:112-137` vs `recordBookV1.js` | Route both through one aggregator |
| 19 | Year-less accolades double-count in HOF score | Medium | Stats | Inflated MVP counts / false HOF induction | `playerAwardTimeline.js:97-99`; `legacyScore.js:126-140` | Dedupe on canonical even without year |
| 20 | Live season accumulator not idempotent | Medium | Stats | Any resim path double-counts season totals | `statAccumulator.js:609`; `index.js:1795` | Per-game processed-id guard |
| 21 | Procedural schedule fallback drops divisions | Medium | Simulation | Some schedules have no divisional rivalries | `schedule.js:172-267,525-603` | Proper round-robin / require NFL template |
| 22 | AI cutdowns ignore position/redundancy | Medium | AI | AI can cut its only kicker/punter | `ai-logic.js:103-113` `executeAICutdowns` | Protect min starters per position |
| 23 | Index-as-key in 54 list sites | Medium | UI | Animation/DOM glitches when lists reorder | `App.jsx:1411`, `HomeDashboard.jsx:81+`, … | Use stable ids |
| 24 | Console-only failures in roster/coaches/save | Medium | UX | Action silently fails, UI reverts with no toast | `Coaches.jsx:162`, `Roster.jsx:890`, … | Surface `role="alert"` like FreeAgencyPanel |
| 25 | `progressPlayer` stub (dead, misnamed) | Low | Data Integrity | None (test-only path) | `player.js:457-469` | Delete or route through `processPlayerProgression` |
| 26 | Authoritative score precomputable from save seed | Low | Simulation | A save-inspector can predict all results | `driveEngine.js:96-98` | Mix live PRNG state into the drive seed |
| 27 | 6 `exhaustive-deps` suppressions | Low | UI | Potential stale-closure bugs on week change | `HomeDashboard.jsx:1332`, … | Audit each suppression |

---

## SECTION 7 — TOP 10 PRIORITY REPAIR LIST

```
1.  [Critical] Dual-engine score/stat fracture → index.js:1116-1123 simulateMatchup → derive TDs/FGs and score from ONE engine (make buildDriveBasedSummary authoritative for both). [MOSTLY FIXED 2026-07-09 — see Section 1 closure note; scoringSummary/quarterScores narrative split deferred]
2.  [Critical] Overtime gates on the wrong (engine-B) score → index.js:1128 → run OT off the single reconciled score after #1. [FIXED — prior commit, verified 2026-07-09]
3.  [Critical] Two disagreeing injury-availability predicates → injury-core.js:94-108 canPlayerPlay vs playExecution.js → make injured===true a hard exclude in both paths.
4.  [High] Return-TD ~75% precedence bug → index.js:1079 checkReturnTD → fix parenthesization and clamp. [FIXED — prior commit, verified 2026-07-09]
5.  [High] Depth chart never repaired after a cut → worker.js:6142-6230 → call ensureTeamDepthChart on release.
6.  [High] Salary cap effectively soft → ai-logic.js:79-82 updateTeamCap → reject any transaction leaving capRoom < 0.
7.  [High] TradeCenter accept has no error handling → TradeCenter.jsx:554 → wrap in try/catch + surface failure.
8.  [High] Record holder uses recyclable numeric id → recordBookV1.js:664/675; legacyScore.js:228 → match on immutable GUID.
9.  [High] Ties recorded as home wins → index.js:1543 → three-way comparison. [FIXED — prior commit, verified 2026-07-09]
10. [High] Trade valuation inconsistent/exploitable → trade-logic.js:96-125,453 + worker.js:6968-7010 → single shared getAssetValue(); penalize by live cap.
```

---

## SECTION 8 — ARCHITECTURAL FLAGS

**Files too large (>30KB) — split candidates:**
- `src/worker/worker.js` — **468KB.** This is the single most dangerous file in the repo: it owns cap math, FA, trades, release, depth-chart, news, and persistence. Everything in Section 4 lives here. Must be split by domain (cap, transactions, roster, FA, persistence).
- `src/core/simulation/index.js` — **112KB.** Houses the dual-engine fracture (Section 1). Split into matchup orchestration / stat distribution / commit.
- UI monsters: `PlayerProfile.jsx` (138KB), `Roster.jsx` (126KB), `LeagueHistory.jsx` (107KB), `FreeAgency.jsx` (92KB), `App.jsx` (83KB), `HomeDashboard.jsx` (72KB), `LeagueDashboard.jsx` (57KB), `TradeCenter.jsx` (52KB), `GameSimulation.jsx` (49KB). These are real monoliths (unlike the *live* Draft.jsx, which is already decomposed).
- Core: `dynastySoakAudit.js` (55KB), `coaching.js` (53KB), `ai-logic.js` (48KB), `league-memory.js` (37KB), `richGameSimulator.ts` (35KB), `trade-logic.js` (34KB), `state.js` (31KB).

**Missing abstraction layers:**
- **No single source of asset valuation.** Three player-value scales + a pick matrix (Section 4 #9). A shared valuation module is missing.
- **No single source of player availability.** `canPlayerPlay()` vs `!p.injured` (Section 1/2). Needs one availability service.
- **No single salary-cap authority.** `301.2` constant vs `economy.currentSalaryCap` vs `?? 255` fallback. Cap should have one accessor.
- **Two simulation engines with no reconciliation contract** — the root architectural defect.

**Data-flow patterns that will cause hard-to-trace bugs at scale:**
- **Permanent mutation of shared roster objects mid-sim** (injuries) combined with a **retry loop** (Section 1 #6). Sim should operate on copies and commit deltas once.
- **Snapshot records keyed by recyclable ids** (Section 3 #10) — will produce phantom records as leagues age.
- **Dual rating systems (`ratings` / `attributesV2`) with no projection** (Section 2 #11) — guarantees UI/sim divergence.

**Dead code / stale files still tracked (and in one case "fixed"):**
- **`/Draft.jsx` (72KB) and `/NewsFeed.jsx` at repo root** — unimported, unbuildable in place, yet git-tracked. A commit (`67075ef`) even "fixed" the dead `NewsFeed`. **`git rm` both.**
- **`progressPlayer` (`player.js:457-469`)** — exported, misnamed (doesn't progress), used only by a test script.
- `src/core/archive/gameArchive.ts` and `records.js` — overlap with `gameArchive.js` / `recordBookV1.js`; the legacy `records.js` career engine actively disagrees with the V1 one (Section 3 #18). Consolidate.

---

### Closing assessment
The simulation **core is the emergency** — the game runs two engines and glues the score of one onto the stats of the other, and everything downstream (OT, winner, return TDs, injuries) inherits that fracture. The economy/roster layer is a close second: a "hard" cap that goes negative, a depth chart that isn't repaired on cuts, and exploitable trade math. The UI is in noticeably better shape than the brief assumed — the live Draft component is already well-factored, buttons are wired, loading and empty states are thorough — its real problems are the dead 72KB decoy file and a handful of genuinely silent failure paths in trades and roster management.
