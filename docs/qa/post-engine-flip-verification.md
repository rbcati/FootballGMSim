# Post-Engine-Flip + Post-FA-V2 Verification Lock

_Audit date: 2026-06-13 · Branch: `claude/post-engine-flip-audit-h2mv1o` · HEAD: `fdc2bcc` (post #1576 / #1582)_

This is an audit-and-document pass. No gameplay code was changed. Every finding
cites `file:line`.

## Verification Gate Status — post-#1578 + post-#1582

| Check | Status | Notes |
|---|---|---|
| @testing-library/dom skip | **PASS** | vitest: 290 files / 2657 tests / **0 skipped**. No `.skip/.only/.todo` anywhere. All risk areas have active coverage. Latent risk only: `@testing-library/dom` is undeclared (peer-only). |
| Score/stat pipeline | **GAPS FOUND** | Core scores/team-yards/player-stats are consistent and consumed. 5 secondary-field gaps: `advancedAttribution` dropped before archive, dead feat-news path, dead `logGameEvent`, dead `shutoutFloorApplied`, blank `rushLong`/`recLong` columns. |
| OT soak coverage | **GAP** | OT is asserted only in the unit test `richGameSimulatorOvertime.test.ts`. `engineSoak.js` exercises OT incidentally (statistically) but never seeds a forced tie and never asserts the OT winner; it gates only `finalTieRate`. |
| FA V2 wiring | **PASS** | Reserve-on-offer / release-on-withdraw / advance→sign all wired; integration test drives the real worker handlers (no mock shortcut); `GET_FREE_AGENTS` payload fields match `PendingOffersPanel` exactly. |
| Soak gate drift | **GATE_RELAXED on: topQuartileWinPct.max (0.73 → 0.76, PR #1578)** | One numeric relaxation + one new gate (`maxFinalTieRate`, PR #1579). Floor-gate semantics also softened to a floor-regression check. |

---

## Findings

### Check 1 — @testing-library/dom skip (release blocker) → PASS

**Command run.** `package.json:11` maps `npm test` → `playwright test` (e2e). The
`@testing-library/dom` skip concern lives in the unit suite, run via
`npm run test:unit` → `vitest run` (`package.json:12`).

**Unit suite result.** `vitest run` (after `npm ci`): **290 test files passed,
2657 tests passed, 0 skipped, 0 failed** (44.8s). Config:
`vitest.config.ts:10-32` (`environment: 'node'`; `.jsx`/`.tsx` render tests opt
into jsdom per-file).

**Skip audit.** No `describe.skip` / `it.skip` / `test.skip` / `.only` / `.todo`
/ `xit` / `xdescribe` in any file under `src/` or `tests/` (grep clean). No
conditional/environment-gated skip mechanism exists in the codebase.

**Coverage of the named risk areas — all ACTIVE (none skipped):**
- simulation — `src/core/__tests__/richGameSimulator.test.ts`,
  `richGameSimulatorOvertime.test.ts`, `tests/unit/deterministicSimAudit.test.js`
- archive — `src/core/__tests__/gameArchive.test.js`,
  `src/core/archive/gameArchive.test.ts`, `tests/unit/playerSeasonStatsArchive.test.js`
- standings — `tests/unit/standingsTiebreaker.test.js`,
  `src/ui/components/StandingsCenter.test.jsx`
- NewsFeed — `src/ui/components/NewsFeed.test.jsx`, `tests/unit/newsEngineExpanded.test.ts`
- worker — `src/worker/__tests__/workerApi.test.js`, `WorkerPool.test.ts`,
  `saveIntegrity.test.js`, `src/ui/hooks/useWorker.test.js`
- save/load — `src/worker/__tests__/saveIntegrity.test.js`,
  `src/state/saveSchema.test.js`, `src/ui/components/__tests__/postGamePersistence.test.jsx`
- LiveGame (the component #1576 modified) — `src/ui/utils/liveGamePresentation.test.js`,
  `src/ui/components/__tests__/ReplayableGameFlowViewer.test.jsx`

**Playwright (`npm test`).** Lists **34 tests across 13 files, 0 skip
annotations** (`npx playwright test --list`), including the LiveGame/box-score
flows (`simulateWeek.spec.js`, `news_navigation.spec.js`) and
`offseasonFaFlow.spec.js`. Execution requires Chromium + the dev server and was
not run headless in this container; the spec inventory is skip-free.

**NOTE (latent, non-blocking).** `@testing-library/dom` is **not declared** in
`package.json` (only `@testing-library/react` is — `package.json:54`). It
resolved (v10.4.1) solely as an auto-installed peer dependency of
`@testing-library/react` (its `peerDependencies` require `^10.0.0`). Under a
stricter installer (pnpm strict, `--legacy-peer-deps`, or a lockfile that omits
the peer), it would be absent and **every jsdom render test would throw at
import** — BoxScore, LiveGame, NewsFeed, PendingOffers, dashboard. This is the
scenario the check title alludes to; it is not active today but should be closed
by pinning `@testing-library/dom` in `devDependencies`.

---

### Check 2 — Score/stat pipeline field consistency → GAPS FOUND

**Single-game trace (engine → archive → BoxScore → NewsFeed):**

1. **Engine output** — `RichGameSummary` (`src/core/sim/richGameSimulator.ts:80-136`):
   `homeScore`/`awayScore`, `homeTeamId`/`awayTeamId`, `teamStats.{home,away}`
   (`TeamStatLine` carries BOTH `passYd` and `passYards`, `rushYd` and
   `rushYards` — `richGameSimulator.ts:30-36`, `:768-771`), per-player
   `boxScore.{home,away}[pid].stats`, `scoringSummary`, `playLogs`,
   `quarterScores`, `overtime`, `regulationTied`, `advancedAttribution`,
   `shutoutFloorApplied`.
2. **Bridge** — `mapGameSummaryToLegacyResult` (`src/core/sim/weekSimulationBridge.ts:109-164`)
   emits BOTH alias sets so the legacy archive reader matches: `home`+`homeId`,
   `scoreHome`+`homeScore`, `boxScore`+`playerStats`+`stats`.
3. **Archive write** — `applyGameResultToCache` (`src/worker/worker.js:3654`)
   reads `result.home ?? result.homeTeamId` (`:3658-3661`),
   `result.scoreHome ?? result.homeScore` (`:3667-3668`), `result.boxScore`
   (`:3878-3879`), `result.scoringSummary` (`:3698`), `result.teamStats`
   (`:3710`), `result.overtime` (`:3761`) → `buildArchivedGame` (`:3897-3941`).
   Fed by `results` from the new engine in the week loop (`:2982-2983`).
4. **BoxScore read** — `BoxScore.jsx` → `buildBoxScoreViewModel`
   (`src/ui/utils/boxScoreViewModel.js`), which resolves the
   `passYards`/`passYd`/`passYds` aliases (`:103-104`) and player columns
   `passYd`/`rushYd`/`recYd`/… (`:131-133`).
5. **NewsFeed** — post-game news in the archive path is `NewsEngine.logFeat`,
   driven by `result.feats` (`src/worker/worker.js:3884-3895`).

**Core scores and stats are CONSISTENT** — scores, team yardage, and per-player
stat keys are dual-aliased and consumed end-to-end. The gaps are all in
secondary / advanced fields:

**Finding 2a — `advancedAttribution` is dropped before the per-game archive
(consumed-but-unwired).** The engine emits it
(`richGameSimulator.ts:999`) and the UI consumes it
(`src/ui/utils/boxScoreViewModel.js:583`, `src/ui/components/AdvancedGameStats.jsx:33`).
But `mapGameSummaryToLegacyResult` (`weekSimulationBridge.ts:109-164`) does
**not** carry an `advancedAttribution` key, and the `buildArchivedGame` call
(`worker.js:3897-3941`) never passes it. Net: in the new-engine week-sim path
the per-game **Advanced Game Stats panel renders empty for every non-watched
game**. (Season aggregation is unaffected — that runs through the separate
`archiveGameStats(playerStatsStore)` path, `richGameSimulator.ts:1016-1018` /
`playerSeasonStatsArchive.js:307-320`.) `BoxScoreAutoOpen.test.jsx:108-131`
proves the panel works when data is present, which confirms the only gap is the
missing wiring.

**Finding 2b — `result.feats` is never produced by the rich engine.**
`applyGameResultToCache` generates "Feat" news from `result.feats`
(`worker.js:3884-3895`), but the rich-engine bridge emits no `feats` field. Only
the legacy `commitGameResult` path sets it (`src/core/simulation/index.js:2358`,
`resultObj.feats = allFeats`). So in a rich-engine week, **feat news never
fires**.

**Finding 2c — `NewsEngine.logGameEvent` is dead code.** Defined to emit
"UPSET ALERT" post-game items (`src/core/news-engine.js:115-131`) but **called
nowhere** (grep across `src/` finds only the definition). The post-game upset
news item is never generated.

**Finding 2d — `shutoutFloorApplied` is a dead output field.** Emitted by the
engine (`richGameSimulator.ts:998`) and read only inside the engine and the
soak's `floorCount` derivation (`scripts/engineSoak.js:194`). It is not carried
by the bridge, not archived, and never rendered.

**Finding 2e — box-score `rushLong` / `recLong` columns are always blank.**
`boxScoreViewModel.js:132-133` declare "Long" columns, but `allocatePlayers`
(`richGameSimulator.ts:799-930`) never emits `rushLong`/`recLong`, so those
columns render `—` for every player.

---

### Check 3 — OT coverage gap → GAP

**Engine OT handling** is present and substantial:
`richGameSimulator.ts:428-476` (sudden-death OT, capped periods, seeded coin
toss), `:719-725` (first-lead-wins), `:741-753` (seeded deadlock-FG fallback so
a tie is never returned). Output flags: `overtime.{played,periods,decidedBy}`
and `regulationTied` (`:996-997`).

**Is OT covered by the soak? — Incidentally, not asserted.**
`scripts/engineSoak.js` runs ~100 seasons × 32 teams × 17 weeks (~27k games per
engine). It tracks:
- `regulationTies` / `regulationTieRate` — **reported, NOT gated**
  (`engineSoak.js:139-143`, `:251`).
- `finalTies` / `finalTieRate` — **gated** at `<= maxFinalTieRate` (0.01)
  (`engineSoak.js:138`, `:271`, threshold `:44`).

So OT games occur statistically and the gate confirms ties get **resolved** to
non-tied finals — but the soak **never seeds a forced tied game**, never asserts
`regulationTieRate > 0`, and never checks that the **OT winner** matches the
higher final score or that `overtime.decidedBy` is non-null. A (hypothetical)
run that produced zero OT games would still pass the gate.

**Where OT is actually asserted:** the dedicated unit test
`src/core/__tests__/richGameSimulatorOvertime.test.ts` (400-seed sweep) covers
never-tied finals (`:44-48`), that OT is genuinely exercised (`:50-53`), that
every regulation tie resolves through OT or the seeded fallback (`:55-60`),
winner-digest/quarter-score consistency (`:62-74`), and determinism for a fixed
OT seed (`:94-100`).

**Recommended fix:** add a deterministic seeded tied-game case to
`engineSoak.js` (or a `regulationTieRate > 0` gate assertion) that verifies the
OT winner equals the higher final score and `overtime.decidedBy` is non-null —
i.e., promote the `richGameSimulatorOvertime.test.ts` winner-consistency check
into the soak gate so the gate cannot go green without OT actually working.

---

### Check 4 — FA Market V2 wiring audit (#1581 / #1582) → PASS

**Reserve on offer.** `handleSubmitOffer` (`worker.js:5961`) validates the bid
against already-reserved cap via `validateOfferAgainstReservedCap`
(`worker.js:5973-5983`; `src/core/freeAgency/pendingOffers.js:238-249`) and
upserts the bid into the league ledger (`worker.js:6035`). `GET_FREE_AGENTS`
then computes `reservedPendingCap` and
`effectiveCapRoom = capRoom − reservedPendingCap` (`worker.js:6844-6850`). Only
`pending` rows reserve (`pendingOffers.js:224`, `:186`).

**Release on withdraw.** `handleWithdrawOffer` (`worker.js:6081`) marks the row
`WITHDRAWN` via `markOfferResolved` (`worker.js:6095-6101`) — a resolved row
leaves `pending` and therefore stops reserving — and strips the bid from
`player.offers` (`worker.js:6087-6092`).

**Strong offer + advance → roster join / pool removal.**
`finalizeFreeAgencySigning` (`worker.js:6108-6150`) sets `teamId`,
`status: 'active'`, clears `offers`, records the movement, and recalculates cap;
the signed player thereby leaves the free-agent pool.

**Integration test fidelity (not a mock shortcut).**
`tests/integration/offseasonFaSmoke.worker.test.js` imports the real
`src/worker/worker.js` (`:143`), boots via `INIT` + `USE_SAFE_STARTER_LEAGUE`
(`:144-151`), then drives the actual message handlers — `SUBMIT_OFFER`,
`WITHDRAW_OFFER`, `ADVANCE_FREE_AGENCY_DAY`, `GET_FREE_AGENTS` (`:182, :208,
:227, :83, :72`). The **withdraw → re-offer → accept** sequence (`:207-267`)
runs entirely through worker code; it asserts reservation drops on withdraw
(`:214`), exactly one reservation after re-offer (`:239`), and on accept the
player has `teamId === USER_TEAM_ID`, `status === 'active'`, is gone from
`freeAgents`, and `reservedPendingCap === 0` (`:255-262`). The e2e spec
`tests/e2e/offseasonFaFlow.spec.js` mirrors the same loop through
`window.gameController` (`:42-56`, `:117`).

**Payload ↔ panel parity.** `GET_FREE_AGENTS` pending rows are built by
`createPendingOffer` carrying `playerName`, `pos`, `years`, `totalValue`,
`annualCapHit`, `status`, `feedback` (`pendingOffers.js:161-177`), plus the
`capSummary` (`worker.js:6846-6852`). `PendingOffersPanel`
(`src/ui/components/FreeAgency.jsx:415-455`) renders exactly those fields
(`:440-442, :452` and `capSummary.effectiveCapRoom`/`reservedPendingCap` at
`:428`). The integration test pins the same set (`:188-204`).

**No gaps found** between the test coverage and the actual worker code path.

---

### Check 5 — soak gate threshold audit → GATE_RELAXED on `topQuartileWinPct`

`SOAK_THRESHOLDS` (`scripts/engineSoak.js:36-45`). Commit→PR mapping derived
from `git blame` + merge ancestry.

| Threshold | Current value | Changed post-#1574? | Label |
|---|---|---|---|
| `topQuartileWinPct` | `{ min: 0.68, max: 0.76 }` | **Yes — `max` 0.73 → 0.76**, commit `3ca2dde`, **PR #1578** | **GATE_RELAXED** |
| `passYdsPerGame` | `{ min: 220, max: 280 }` | No (since `b154404`, #1574) | unchanged |
| `rushYdsPerGame` | `{ min: 100, max: 130 }` | No (since #1574) | unchanged |
| `pointsPerGame` | `{ min: 20, max: 27 }` | No (since #1574) | unchanged |
| `maxMsPerGame` | `50` | No (since #1574) | unchanged |
| `maxFinalTieRate` | `0.01` | **Yes — ADDED**, commit `f75347b`, **PR #1579** | NEW GATE (tightening, not a relaxation) |

**GATE_RELAXED detail — `topQuartileWinPct.max` 0.73 → 0.76 (PR #1578).** The
diff message is explicit: _"engineSoak.js: topQuartileWinPct gate max 0.73 ->
0.76; clamping formBias lifted top-quartile win% to ~74%, and 76% still enforces
competitive balance."_ The spec/doc header still reads "win ~68–73%"
(`engineSoak.js:17-18`), so the **cap was moved up to admit the engine's ~74%
reading** rather than the engine being tuned back under 0.73. This is the spec
moving to match the engine → GATE_RELAXED.

**`maxFinalTieRate: 0.01` (PR #1579, commit `f75347b`)** is a *new* constraint
added alongside OT/tie resolution (`engineSoak.js:42-44`, `:271`). It tightens
the gate (the engine must resolve essentially all ties), so it is **not** a
relaxation.

**Also noted (gate semantics, not a `SOAK_THRESHOLDS` number).** The score-floor
gate was softened across `ed795c4` (#1575), `9f46c8a` (#1577), `3ca2dde` (#1578)
from a `pointsPerGame`-based check to a `minTeamScore >= 3` **floor-regression**
check — explicitly _"not a scoring-health gate"_ (`engineSoak.js:266-270`). The
true scoring tail is now only *reported* as `preFloorShutoutRate`
(`engineSoak.js:252`), not gated. Worth tracking even though it isn't a numeric
threshold drift.

---

## Recommendation

- **Safe to open next feature PR: YES.** The engine is stable (2657 unit tests
  green, 0 skipped; soak gate passes), and FA Market V2 is correctly wired
  end-to-end with real-worker integration + e2e coverage. No release blocker.
- **Blockers:** none.
- **Non-blocking gaps to schedule** (most user-visible first):
  1. **Wire `advancedAttribution` into the per-game archive** (Finding 2a) — the
     Advanced Game Stats panel is blank for every non-watched game.
  2. **Dead post-game news paths** — `result.feats` never produced (2b) and
     `NewsEngine.logGameEvent` never called (2c).
  3. **Soak lacks an OT-winner assertion** (Check 3) — promote
     `richGameSimulatorOvertime.test.ts`'s winner-consistency check into the
     gate.
  4. **Re-tighten or re-document the relaxed win% cap** (Check 5) — code says
     0.76, spec comment still says 73%.
  5. **Declare `@testing-library/dom` in `devDependencies`** (Check 1 note) to
     remove the peer-only install risk.
  6. Minor: `shutoutFloorApplied` dead field (2d); blank `rushLong`/`recLong`
     columns (2e).
- **Suggested first next feature:** _Wire `advancedAttribution` through
  `mapGameSummaryToLegacyResult` + `buildArchivedGame` so the Advanced Game Stats
  panel populates for all games._ It is small, self-contained, closes the most
  visible Check-2 gap, and pairs naturally with re-activating the dead
  feat/upset post-game news (2b/2c) — turning this audit's findings into one
  cohesive "post-game data fidelity" feature.
