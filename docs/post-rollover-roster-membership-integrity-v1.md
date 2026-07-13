# Post-Rollover Roster Membership Integrity V1 (PR #1689)

## 1. Executive summary

After PR #1688 removed the automated-draft user-pick stall, the production
lifecycle could reach the next preseason, exposing the first full-rollover
invariant failure:

```
roster.size-within-legal-range  teamId: 0  roster size: 11  (expected [53, 120])
```

**Root cause (proven):** the user team has id **`0`**, and `teamId === 0` is
**falsy** in JavaScript. The offseason free-agency code classified free agents
with the shortcut `!player.teamId`, which is `true` for every team-0 player. As a
result the entire user roster was treated as a pool of free agents, and AI teams
signed all 53 user players away during the free-agency phase. By the next
preseason team 0 held only its ~11 drafted rookies. Only team 0 was affected —
AI team ids 1–31 are truthy.

**Fix (Lane 1 — canonical membership boundary):** introduced one canonical
predicate `isFreeAgent(player)` (tests `teamId == null`, never falsiness) and
routed all 12 free-agency classification sites through it. No roster "repair"
pass, no invariant weakening, no team-0 special-casing.

A second, separate issue — a non-fatal-looking `passYd` warning — was actually a
hard `TypeError` that aborted `archiveSeason()` on the first rollover. It is a
tiny record-book schema-compat defect and is fixed here too (with focused tests).

After both fixes the first durability season **completes** (`seasonsCompleted: 1`)
and the roster/reference/cap/draft invariants pass. The next remaining first
failure is an unrelated schedule/standings/history reconciliation defect, which
is recommended as **#1690** (evidence below).

## 2. Reproduction

```
npm run durability:smoke          # seed 1684, real worker lifecycle
```

Pre-fix (baseline, collect-all to rollover):

| Checkpoint | pass | fail | notable failures |
|---|---|---|---|
| afterSeasonRollover | 31 | 4 | **roster.size team 0 = 11**, schedule.games-reference, schedule.no-self-games, history.season-archive-exists |
| afterReload | 31 | 4 | roster.size team 0 = 11, schedule.*, saveReload.canonical-summary-stable |

A worker log line accompanied every rollover:

```
[Worker] Failed to archive season s1: TypeError: Cannot read properties of undefined (reading 'passYd')
    at processSeasonRecords (src/core/records.js:96)
    at archiveSeason (src/worker/worker.js:12848)
    at handleStartNewSeason (src/worker/worker.js:13113)
```

## 3. Roster-authority map

| Question | Answer |
|---|---|
| Canonical membership | `player.teamId` (the single source of truth) |
| Does `status` gate inclusion | Only for exclusion (`retired` / `free_agent` / `draft_eligible`); a rostered player is `teamId != null` |
| What is `team.roster` | **View-only.** `buildViewState()` derives it live from `cache.getPlayersByTeam(t.id)` |
| `cache.getPlayersByTeam(teamId)` | Live `filter` over the player Map; **no index**, so no stale-index class of bug |
| Can an index go stale | N/A — there is no membership index |
| Multiple player stores | No — one `_players` Map in `cache.js`; DB is the durable mirror |
| Worker rebuild vs mutate | Worker mutates `player.teamId`; rosters are always derived, never stored |
| Persistence scope | All players (including free agents with `teamId: null`) are serialized |
| FULL_STATE filtering | View exposes rostered players per team; free agents come only from the DB pool |
| Harness vs gameplay representation | The durability harness reads the same `buildViewState()` the UI reads |

Because `getPlayersByTeam` correctly guards `p?.teamId != null` before comparing,
the **read path was never wrong**. The defect was purely in the free-agency
**classification** predicate, which used falsiness instead of null-ness.

## 4. Lifecycle call graph (offseason rollover)

```
SIM_TO_PHASE('preseason')
└─ handleSimToPhase (worker.js:5183)
   ├─ offseason_resign → handleAdvanceOffseason (worker.js:11445)
   │    AI extensions (skips user) · progression · aging · retirements(+evict) · AI cuts (skip user)
   │    → phase = free_agency
   ├─ free_agency → handleAdvanceFreeAgencyDay ×maxDays (worker.js:12138)
   │    injectAIFaBids → AiLogic.makeFreeAgencyOffers → AiLogic.processFreeAgencyDay  ◀── DEFECT
   │    → phase = draft_combine → draft
   ├─ draft → handleStartDraft / handleSimDraftPick → _executeDraftPick (assigns rookies)
   └─ → handleStartNewSeason (worker.js:13100)
        archiveSeason → processSeasonRecords  ◀── passYd TypeError (records.js)
        reset records · roll dead money · makeAccurateSchedule · → phase = preseason
```

## 5. Phase-by-phase roster ledger (team 0 vs AI sample, seed 1684)

Captured by stepping the real worker (strict membership: `teamId != null && ==0`).

| Boundary | team 0 | team 1 | team 2 | team 3 | free agents | retired(evicted) |
|---|---|---|---|---|---|---|
| afterInit / regular | 53 | 53 | 53 | 53 | 0 | 0 |
| afterRegularSeason | 53 | 53 | 53 | 53 | 0 | 0 |
| afterPlayoffs (offseason_resign) | 53 | 53 | 53 | 53 | 0 | 0 |
| afterAdvanceOffseason (retire+resign) | **53** | 52 | 52 | 51 | 0 | 38 |
| **during free_agency** | **53 → 0** | (healthy) | (healthy) | (healthy) | — | — |
| afterSeasonRollover (preseason) — **pre-fix** | **11** | 53+ | 53+ | 53+ | — | — |
| afterSeasonRollover (preseason) — **post-fix** | **60** | 53+ | 53+ | 53+ | — | — |

The user roster is intact through retirement/re-signing (team 0 loses 0 to
retirement for this seed). The collapse happens **only** in `free_agency`.

## 6. Team-0 player-transition ledger

A per-mutation tracer (wrapping `cache.updatePlayer` / `removePlayer`, strict
`teamId === 0`) recorded, for the pre-fix run:

```
total team-0 departures: 53
by phase:  { free_agency: 53 }
site:      AiLogic.processFreeAgencyDay (ai-logic.js:970)  ← cache.updatePlayer({ teamId, status:'active', contract })
sample:    id 1 Jordan Sanders QB → team 26
           id 2 Sean Allen    QB → team 26
           id 3 Dillon Knight  QB → team 26
```

Every departure was a **legitimate-looking AI signing** of a player the FA
classifier wrongly believed was available. No retirements, releases, trades, or
deletions removed team-0 players. Post-fix the same tracer records **0**
team-0 departures.

## 7. User vs AI comparison

* **AI teams (id 1–31):** never misclassified (truthy id). They re-sign their own
  expiring players (`handleAdvanceOffseason` skips only `userTeamId`), bid in free
  agency, and run cutdowns — normal offseason behavior.
* **User team (id 0):** the game intentionally leaves the user's re-signing/FA
  *decisions* to the interactive UI (batch sim does not auto-GM the user, by
  design). That is correct and unchanged. The bug was **not** a missing
  auto-management policy — it was that the user's already-rostered players were
  being **treated as free agents and taken by AI teams**. The distinction matters:
  the user losing players it never released is corruption, not a decision window.

## 8. Exact first point of roster decline

`src/core/ai-logic.js` free-agency pool construction and signing
(`processFreeAgencyDay`, lines 930–950 pre-fix) via the predicate
`(!p.teamId || p.status === 'free_agent')`. `!p.teamId` is `true` for
`teamId === 0`, so team-0 players entered `freeAgentsMap`, received AI offers, and
were signed away.

## 9. Root cause

`teamId === 0` is falsy. Twelve free-agency classification sites used
`!player.teamId` as "is a free agent", misclassifying the entire user roster.
This is a membership-classification defect (Lane 1), not stale cache/index, not
save/reload, not a missing decision policy.

## 10. Chosen lifecycle contract

**Contract A/C hybrid, no new behavior:** `SIM_TO_PHASE('preseason')` legitimately
reaches preseason with the user roster intact; the user's *optional* offseason
decisions (extra signings, cuts) remain interactive and are enforced later at the
preseason cutdown gate (`handleAdvanceWeek`, `meta.phase === 'preseason'`,
worker.js:3054). No blocked-state contract was needed because a legal roster is
reachable without any user decision once the corruption is removed. The roster
invariant at preseason (min 53) is therefore correct and was **kept as-is**.

## 11. Implementation lane

**Lane 1 — membership/canonical-boundary fix.** One shared predicate
`isFreeAgent(player)` replaces the falsy shortcut at every classification site.
No final "repair rosters" pass; the canonical seam is the predicate itself.

## 12. Files changed

| File | Change |
|---|---|
| `src/core/freeAgency/membership.js` | **new** — canonical `isFreeAgent(player)` (`teamId == null || 'FA' || status==='free_agent'`) |
| `src/core/ai-logic.js` | 5 FA predicates → `isFreeAgent` (incl. the signing path) |
| `src/worker/worker.js` | 6 FA predicates → `isFreeAgent` (incl. `injectAIFaBids`, FA-day snapshot) |
| `src/worker/handlers/freeAgencyHandlers.js` | 1 FA predicate → `isFreeAgent` |
| `src/core/records.js` | `processSeasonRecords` tolerates the legacy record-book stub (passYd fix) |
| `src/core/freeAgency/__tests__/membership.test.js` | **new** — predicate unit tests incl. team-0 regression |
| `src/core/__tests__/processSeasonRecords.legacyShape.test.js` | **new** — record-book legacy-shape tests |
| `tests/durability/postRolloverRosterIntegrity.test.js` | **new** — real-lifecycle behavior regression |

## 13. Why no broader auto-GM behavior was introduced

The roster loss was corruption (players taken without being released), not an
unresolved user decision window. Removing the misclassification fully restores a
legal roster, so no auto-signing/auto-cut/auto-GM policy is warranted or added.
Interactive user control is unchanged.

## 14. Save/reload comparison

Post-fix, save/reload still reports a `saveReload.canonical-summary-stable`
divergence on `rosterFingerprint` — but this is **pre-existing** (present in the
pre-fix baseline too) and lives in the schedule/serialization domain, not roster
membership. The `rosterFingerprint` comparator sorts ids with
`Number(a)-Number(b)`, which is unstable for the string ids that rookies carry, so
before/after orderings differ for identical sets. This belongs to #1690.

## 15. Invariant results (1-season, collect-all, post-fix)

```
seasons: attempted=1 completed=1 competitive=1
invariants: pass=159 fail=7 skip=34
afterSeasonRollover: pass=35 fail=3   → schedule.games-reference-valid-teams,
                                         schedule.no-self-games, history.champion-refs-valid
afterReload:         pass=33 fail=4   → the three above + saveReload.canonical-summary-stable
```

`roster.*`, `references.*`, `cap.*`, `draft.*`, `progression.*`, `retirement.*`,
`numericSafety.*` all pass. The roster failure is gone.

### Before/after attribution (same seed, same harness)

| Failure | pre-fix | post-fix | attribution |
|---|---|---|---|
| `roster.size-within-legal-range` team 0=11 | FAIL | **PASS** | fixed by `isFreeAgent` |
| passYd crash / `history.season-archive-exists` | crash, 0 archives | **archives, passes** | fixed by records guard |
| `schedule.games-reference-valid-teams` | FAIL | FAIL | pre-existing → #1690 |
| `schedule.no-self-games` | FAIL | FAIL | pre-existing → #1690 |
| `history.champion-refs-valid` | masked by crash | FAIL | latent, exposed once archive runs → #1690 |
| `saveReload.canonical-summary-stable` | FAIL | FAIL | pre-existing → #1690 |

## 16. One-season result

`seasonsCompleted: 1`, `boundedRun: false`. The first full rollover completes; the
user team reaches preseason with a legal roster (60). Fail-fast stops at the
independent schedule defect, so the smoke does not go fully green — this is
reported honestly, not masked.

## 17. Five-season result

```
npm run durability:5   (fail-fast)
seasons: requested=5 attempted=1 completed=0
stopped: season 1 afterSeasonRollover — schedule.games-reference-valid-teams (8 games)
runtime=34.1s peakMem=388MB
```

Five seasons cannot complete **because of the independent schedule defect**, not
roster integrity. Per scope discipline, #1689 does not broaden to fix it.

## 18. passYd audit

* **Function/caller:** `processSeasonRecords` (`src/core/records.js`) called by
  `archiveSeason` → `handleStartNewSeason`.
* **Object:** the record book `existingRecords = meta.records`.
* **Cause:** a fresh league is bootstrapped (`defaultLeague.ts:258`,
  `league.js:187`) with a **legacy stub** `{ mostPassingYardsSeason, ... }` that
  lacks the V1 `singleSeason`/`allTime` buckets. `structuredClone`-ing it and then
  reading `records.singleSeason['passYd']` throws
  `Cannot read properties of undefined (reading 'passYd')`.
* **Canonical field:** the engine uses `singleSeason.passYd` internally and maps to
  `passingYards` for career totals (`CATEGORY_TO_RECORD_KEY`). The crash is a
  record-book **shape** mismatch, not a per-player stat-field alias issue.
* **New or newly reachable:** newly *reachable* — the first rollover only became
  attainable after #1688; the mismatch itself predates it.
* **Impact:** it aborted `archiveSeason` after `archiveSeasonStats()` had already
  cleared the accumulators, so the season silently failed to archive.
* **Fix:** `processSeasonRecords` now accepts `existingRecords` only when it carries
  the V1 shape, otherwise starts from `createEmptyRecords()`. Schema-compatible,
  preserves a real V1 book, tolerates legacy saves. Covered by
  `processSeasonRecords.legacyShape.test.js`.

## 19. Remaining risks

* **Schedule/standings/history reconciliation (#1690):** 8 preseason games have
  undefined home/away (self-game + invalid-team-ref); 1 archived season carries an
  invalid champion ref; save/reload `rosterFingerprint` diverges. All pre-existing
  and independent of this PR.
* **Cosmetic team-0 truthiness residue:** `news-engine.js` uses
  `player.teamId ? cache.getTeam(...) : null` in three spots — a team-0 player's
  news item would not resolve its team object. Non-roster, cosmetic; noted, not
  fixed here to keep scope tight.
* **User FA participation:** batch sim still does not have the user bid on free
  agents (by design). Not corruption; unchanged.

## 20. Recommended #1690 (evidence-based)

**#1690 — Schedule / Standings / History Reconciliation V1.** The durability
harness itself now recommends "Schedule/standings reconciliation repair PR" as the
next first failure. Scope suggested by evidence:

1. `schedule.games-reference-valid-teams` + `schedule.no-self-games`: 8 games with
   undefined `home`/`away` after `makeAccurateSchedule`/`slimifySchedule` — likely
   bye/placeholder rows leaking into `schedule.weeks[].games`.
2. `history.champion-refs-valid`: the archived season's champion reference resolves
   to an unknown team (now reachable because season archiving works again).
3. `saveReload.canonical-summary-stable`: `rosterFingerprint` divergence, at least
   partly a comparator issue (numeric sort over string rookie ids).

Let post-fix durability evidence — not this document — drive the final #1690 scope.
