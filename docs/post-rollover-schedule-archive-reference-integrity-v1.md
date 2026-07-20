# Post-Rollover Schedule & Archive Reference Integrity (V1)

## 1. Executive verdict

The Season 1 → Season 2 rollover shipped a **schedule with malformed bye
"games", an archived champion stored only as a display snapshot (no canonical
id), and a save/reload roster fingerprint that reordered under a `NaN`
comparator.** All three are now fixed at their first lossy write, plus one
narrow lifecycle-continuity enabler (headless preseason cutdown) so the fixes
can be proven across multiple rollovers.

After this PR, the Long-Save Durability Harness runs **three complete seasons
with 392 reference-integrity invariants passing and zero failures**, save/reload
is stable, and the run is deterministic across two identical seeds. The
five-season target is blocked by a **pre-existing, out-of-scope AI salary-cap
management gap** (an AI team ends a later offseason over the cap and the
pre-advance legality gate blocks). That is documented as the recommended next PR
and is **not** claimed as green.

## 2. Current-main reproduction

Base main `533e25093513d2bab421be6e213bfe7e9f608c8e` (PR #1700 merged).

`npm run durability:smoke` (seed 1684, fail-fast) stops at the first rollover:

```
checkpoint afterSeasonRollover: pass=35 fail=3 skip=4
FIRST FAILURE: schedule.games-reference-valid-teams @ season 1 phase afterSeasonRollover
   entity=game:null — 8 scheduled games reference an unknown team
```

`--collect-all` reveals the full cluster (7 fails):

| Invariant | Checkpoint | Detail |
|---|---|---|
| `schedule.games-reference-valid-teams` | afterSeasonRollover | 8 games reference an unknown team |
| `schedule.no-self-games` | afterSeasonRollover | same 8 games list identical home/away |
| `history.champion-refs-valid` | afterSeasonRollover | archive champion is an object, not an id |
| `saveReload.canonical-summary-stable` | afterReload | rosterFingerprint changed on reload |

## 3. First failing checkpoint

Season 1, phase `afterSeasonRollover` (the newly-generated Season 2 preseason),
week n/a — the Season 2 schedule itself.

## 4. Exact invalid references

The 8 "invalid" games are one per week for weeks 5–12, each with keys
`{id, gameId, seasonId, week, home, away, played}` where **`home` and `away` are
`undefined`** (`typeof === 'undefined'`). Because `String(undefined) ===
'undefined'` for both, each is simultaneously an invalid-team-ref **and** a
self-game. They are **bye markers**, not real games.

The archived champion was `{ id: 6, name: 'Cleveland Browns', abbr: 'CLE',
wins: 14 }` — an object; the invariant read `String(champion)` →
`"[object Object]"` → unknown team.

The roster fingerprint diverged **ordering-only**: identical membership
(numeric `1..53` plus opaque rookie ids like `hbot8q4lum1u`), different order
after the DB round-trip.

## 5. Team-ID authority map

- **Canonical teams**: `cache.getAllTeams()` in the worker; ids are **numbers
  `0..31`**. Team id **0 is a real team** (the default user team).
- Ids are numbers in the live cache; the persistence/serialization layer may
  surface numeric-string aliases, and player ids are **mixed** (numeric
  veterans, opaque-string rookies, composite draft-pick ids).
- No rollover path renumbers teams.
- History stores a champion **display snapshot object** plus (now) a canonical
  **`championTeamId`**.
- One shared helper now defines the ID contract: `src/core/referenceIntegrity.js`
  (`canonicalIdKey`, `sameEntityId`, `stableIdCompare`, `resolveTeamRefId`).

## 6. Schedule-shape map

- **Season 1** (`src/data/defaultLeague.ts::makeSchedule`): real games only,
  each `{id, gameId, seasonId, week, home, away, played}` with canonical ids
  like `s1_w5_5_4`; **no byes** (simple 18-game rotation).
- **Season 2+** (`src/core/schedule.js::makeAccurateSchedule`): 17 games + 1
  bye per team, byes emitted as `{ bye: [teamId,...] }` entries inside
  `week.games` **and** on `week.teamsWithBye`.
- **Persisted (slim) shape** is produced by `worker.js::slimifySchedule` and
  exposed verbatim to the view as `meta.schedule` (`buildViewState` line
  `schedule: meta?.schedule`). The view schedule is the raw slim schedule, which
  is exactly what the durability invariant and the UI read.

**Canonical persisted contract (this PR):** `week.games` contains **only real
games** (canonical gameId, seasonId, numeric home/away); byes live on
`week.teamsWithBye` (array of team ids). Never a pseudo-game with undefined
references.

## 7. Template materialization path

`makeAccurateSchedule` → (NFL-32 template when applicable via
`nflScheduleTemplates.js`, else procedural) → `slimifySchedule(raw, teams,
seasonId)`. Template `homeTid/awayTid` are already materialized to team ids
before slimming; the slim step assigns canonical `gameId`s from the season id.

## 8. First lossy write

`worker.js::slimifySchedule` mapped **every** `week.games` entry — including
`{ bye: [...] }` markers — into a game record:

```js
home: (typeof g.home === 'object') ? g.home.id : g.home,   // undefined for a bye
away: (typeof g.away === 'object') ? g.away.id : g.away,    // undefined for a bye
// ...and the `bye` field was dropped entirely
```

For a bye marker this produced `{home: undefined, away: undefined}` and lost the
bye membership. `expandSchedule` filters such entries (`.filter(g => g.home &&
g.away)`) and `buildLeagueForSim` skips them, which is why simulation still
worked — but the **persisted `meta.schedule` (the view's schedule)** carried the
malformed byes straight into the invariant.

## 9. Root cause

Two schedule generators with two shapes were normalized by a slim step that
understood neither byes nor season-scoped game ids. Season 1's shape happened to
be bye-free and pre-materialized, so it passed; Season 2's bye markers became
undefined-reference self-games.

## 10. Chosen canonical ID contract

`src/core/referenceIntegrity.js`:

- `canonicalIdKey(id)` → string key or `null`. **`0`/`"0"` → `"0"`** (valid);
  `null`/`undefined`/`""`/`NaN`/objects → `null`.
- `sameEntityId(a,b)` — numeric `5` and string `"5"` are the same entity; `0`
  and `"0"` are the same; distinct ids never merge (`"007"` ≠ `7`).
- `stableIdCompare(a,b)` — deterministic total order, **never `NaN`**: numeric
  ids ascending by value, then opaque strings lexicographically, then invalid
  last. Reflexive, so identical membership ⇒ identical fingerprint.
- `resolveTeamRefId(ref)` — resolves a scalar id **or** a snapshot object
  (`championTeamId`/`champTeamId`/`teamId`/`tid`/`id`) to a canonical key, else
  `null` (honest unavailable). A team object is never mistaken for an id.

## 11. Schedule generation fix

`slimifySchedule(schedule, teams, seasonId)`:

- Bye markers (`{ bye: [...] }`) and `week.teamsWithBye` are folded into a single
  canonical `teamsWithBye` array (team ids), **never** a pseudo-game.
- Real games materialize with a canonical `gameId`/`seasonId`
  (`buildCanonicalGameId`) when absent — Season 2+ now matches Season 1's shape.
- Entries with no resolvable home/away and no bye are dropped from `games`
  (never coerced into a self-game or a team-0 placeholder).

## 12. Validation-before-assignment behavior

`validateSlimScheduleReferences(slim, teams)` runs in `handleStartNewSeason`
**before** `cache.setMeta({schedule})`. It uses the **canonical team-ID set**
(not array length), and rejects unknown refs, self-games, double-booked teams,
and invalid/conflicting byes. On failure it logs an actionable diagnostic and
falls back to `createSimpleSchedule`, **which is itself validated** before
assignment; if even that fails it posts an error rather than persisting a corrupt
schedule.

## 13. Team-0 proof

`referenceIntegrity.test.js` + `referenceIntegrityInvariants.test.js` prove team
0 is valid as a home team, away team, bye team, and champion; `canonicalIdKey(0)
=== '0'`, `isValidIdRef(0) === true`; team 0 is never filtered or replaced.

## 14. Self-game result

`schedule.no-self-games` passes on the real Season 2 schedule and is proven to
still fail on a genuine self-game via **canonical** identity (numeric `5` vs
string `"5"`), not only raw strict inequality.

## 15. Bye-reference result

New invariants `schedule.bye-refs-valid` and `schedule.no-play-and-bye` pass on
the real rollover schedule and fail on an unknown bye ref / a team that both
plays and byes. Byes are validated, not ignored.

## 16. Champion-reference authority

`buildSeasonArchiveSummary` now emits a canonical **`championTeamId`** (and
`runnerUpTeamId`) derived via `resolveTeamRefId` from the champion snapshot,
while retaining `champion` purely as a display snapshot. The history invariant
resolves the champion via `resolveTeamRefId` (object → id) so a snapshot is
never mistaken for an id.

## 17. Legacy champion behavior

The history invariant normalizes `championTeamId` / `champTeamId` /
`championId` / a `champion` object (or scalar), in that precedence. An archive
with only a `champion` object resolves; an unresolved/malformed champion returns
`null` (honest unavailable) and is never guessed from standings. Covered by
`referenceIntegrityInvariants.test.js` and `seasonArchiveChampion.test.js`.

## 18. Fingerprint comparator defect and fix

`saveReload.js::canonicalSummary` sorted roster ids with
`(a,b) => Number(a) - Number(b)` — `Number("hbot8q4lum1u")` is `NaN`, so opaque
rookie ids fell into an implementation-defined order that differed after the DB
round-trip. Replaced with `stableIdCompare` (total order, never `NaN`).
`compareCanonical` now attaches a **classification** to a roster mismatch
(`semantic` / `duplicate` / `type-only` / `ordering-only`) with per-team
missing/extra/duplicate diagnostics; duplicates are detected, not deduped.

## 19. Save/reload result

`saveReload.canonical-summary-stable` passes at `afterReload` for every
completed season. `rosterFingerprint` before === after. Real membership
differences (missing/extra/duplicate) still fail (unit-tested).

## 20. One-season durability result

`npm run durability:smoke` (seed 1684): **pass=176 fail=0 skip=34**, save/reload
OK, first failure: none.

## 21. Five-season durability result

`durability:5` (seed 1684): **seasons 1–3 complete, pass=392 fail=0** across all
reference-integrity invariants; save/reload OK. Season 4 does **not** complete —
blocked by a pre-existing **AI salary-cap** gap:

```
LIFECYCLE CRASH s4: SIM_TO_PHASE exhausted 15 calls ... phase=preseason
ADVANCE_WEEK -> ERROR "IND is over cap (325.2M / 322.6M)."
```

`runLegalityValidation({stage:'pre-advance'})` blocks the preseason advance when
**any** team is over the cap, and that gate runs before the preseason
`executeAICapManagement`. This is salary-cap accounting/management — outside this
PR's reference-integrity scope and explicitly excluded by the guardrails. **Five
green seasons are NOT claimed.**

## 22. Determinism result

`durability:1-season --determinism`: `deterministic=true — Normalized outcome
identical across two clean runs`. Season schedule fingerprints, champion
references, and roster membership are stable across identical seeds.

## 23. UI hydration result

Production `npm run build` succeeds. Browser smoke (Chromium via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`):

- `fresh_franchise_bootstrap_smoke` — pass
- `fresh_franchise_first_week_smoke` — pass
- `franchise_hq_mobile_smoke` — 3 pass, **2 fail (pre-existing on clean main;
  unrelated content assertions `Coordinator Brief`/`Game Plan Impact`)**,
  verified by re-running the same test with this PR's changes stashed.

A dedicated Season-2 browser hydration test does not exist and rolling a full
season in-browser is impractical; **Season-2 view-data hydration** (schedule
refs valid, no self-games, resolvable champion) is validated by the real-worker
integration test `postRolloverScheduleArchive.test.js`, which asserts exactly
the data the Schedule/Standings/History/Roster screens read.

## 24. Files changed

- `src/core/referenceIntegrity.js` (new) — shared ID contract.
- `src/worker/worker.js` — `slimifySchedule` (bye/gameId canonicalization),
  `validateSlimScheduleReferences` (new), rollover validation-before-assignment,
  headless preseason user-team cutdown.
- `src/core/league-memory.js` — `buildSeasonArchiveSummary` emits
  `championTeamId`/`runnerUpTeamId`.
- `src/core/ai-logic.js` — `executeAICutdowns({ includeUserTeam })`.
- `tests/durability/invariants/schedule.js` — bye-aware checks + diagnostics.
- `tests/durability/invariants/history.js` — champion normalization + diagnostics.
- `tests/durability/invariants/saveReload.js` — `stableIdCompare` + mismatch
  classification.

## 25. Tests added

- `tests/unit/referenceIntegrity.test.js`
- `tests/unit/seasonArchiveChampion.test.js`
- `tests/durability/referenceIntegrityInvariants.test.js`
- `tests/durability/postRolloverScheduleArchive.test.js`

## 26. Unit-test result

`npm run test:unit` — **458 files, 5621 tests, 0 failures**.

## 27. Build result

`npm run build` — success.

## 28. Browser-test result

Reported honestly in §23: first-session + first-week smokes green; the two mobile
HQ failures are pre-existing on clean main and unrelated to this PR; no
dedicated Season-2 browser test exists (validated via integration test instead).

## 29. Explicit untouched systems

Simulation scoring/statistics, gamecast, player progression, retirement, free
agency & contract business rules, draft selection, cap accounting/tuning,
standings rules, and NFL scheduling features are **unchanged**. Team ids are not
renumbered; team 0 remains a valid owner; `teamId == null` remains the
free-agent boundary; no rosters are auto-repaired.

> The one lifecycle-continuity change outside pure reference integrity is the
> **headless-only** preseason cutdown: in batch simulation (`skipUserGame`, set
> only by the batch orchestrator) the user team is cut down by the **existing**
> AI cutdown so a new season can start. Interactive play is unchanged — the user
> still cuts down manually. This is a continuity enabler (no rule/accounting
> change), included so reference integrity can be proven across 3 rollovers.

## 30. Remaining first failure

`ADVANCE_WEEK` error **"IND is over cap"** at the Season-4 preseason — a
pre-existing AI salary-cap management gap unmasked once the rollover reference
failures were fixed. Not a reference-integrity defect.

## 31. Recommended next PR

**Post-rollover salary-cap compliance:** ensure `executeAICapManagement` (or the
rollover dead-money/cap roll-forward) leaves every AI team cap-legal before the
first preseason advance, or scope the `pre-advance` legality cap gate so an AI
team's overage does not block advancement. This unblocks seasons 4–5+.

## 32. Merge recommendation

**Merge.** This PR fixes the entire confirmed post-rollover reference-integrity
cluster (schedule refs, self-games, bye refs, champion refs, save/reload
fingerprint) at the first lossy write, proven clean across three complete
seasons with deterministic, stable save/reload and a green production build and
unit suite. The remaining five-season blocker is a distinct, out-of-scope
salary-cap issue documented as the next PR.
