# Canonical Gamecast & Playable-Tomorrow Release Gate V1 (#1700)

## 1. Executive verdict

**Merge-ready.** The last narration-owned factual surface — the watched-game
event stream (scoring summary + live scorebug) — now derives from **one canonical
drive-level event ledger** built from the same drive engine that owns the
official final score. Every factual surface (live scorebug → final → scoring
summary → PostGameScreen → Game Book → save/reload) describes the same game. The
change is **Lane B** (canonical drive-level gamecast): the authoritative engine
owns drives and drive outcomes, not individual plays, a clock, or a chronological
timeline, so the ledger is honest at the drive level and never fabricates
play-by-play, a clock, quarter placement, or player attribution. The mid-game
possession order and running score are a labeled reconstruction; only the final
is official. No canonical quarter-score table is published (the engine owns no
quarter timing).

The canonical player/team-stat authority from #1698/#1699 is untouched.

## 1a. Post-review revisions

All four follow-up review defects are fixed.

**Defect #1 — fabricated quarter authority (FIXED).** The first build assigned
regulation quarters by evenly dividing interleaved drives into four buckets and
published a quarter-score table from them. That was deterministic but not
canonical timing. Removed: canonical events now carry `quarter: null` + an honest
`periodLabel` (`"Drive 8"` / `"OT"`), `quarterScores` is `null`, and the UI
(scorebug + feed) shows `Drive {n} of {N} · {ABBR} possession` instead of a
fabricated `Q{n}`. Overtime is flagged `isOvertime: true` / `periodLabel: "OT"`,
never `Q5`. PostGameScreen / Game Book now show an honest **"Quarter breakdown
unavailable for this game."** note for canonical-ledger games (legacy archives
with genuine stored quarter data still display it), and `deriveQuarterScores`
never reconstructs a fabricated quarter table from the narration stream for a
canonical-ledger game. See §6, §8, §10, §13.

**Defect #2 — fake play-call agency (FIXED).** The Run Heavy / Pass Heavy /
Timeout buttons claimed strategic effect but the watched game is fully simulated
before playback, so they could not change the result on any path (and App never
wired `onPlaycallOverride`). They are **removed** (not merely hidden) on every
path; canonical playback shows the honest note *"Game strategy was locked when
simulation began."* `onPlaycallOverride` is never invoked. Pause / speed / next
score / key moment / sim-to-end controls are preserved. See §14.

**Defect #3 — offensive sacks miscounted as defensive (FIXED).** A passing row's
`sacks` field means sacks *taken*; a defensive row's means sacks *made*. New
shared semantic helpers `defensiveSacks(row)` / `sacksTaken(row)` (alongside the
existing `isPassingRow`) are used by both `buildPlayerLeadersFromArchive` and
`deriveStandoutsFromBoxScore`, so a QB's sacks-taken can never make it the
defensive/sack leader, add positive Player-of-Game impact, or become the live
Sacks standout. Genuine defender sacks are unaffected. See §11.

**Defect #4 — drive progress miscount (FIXED).** The terminal `game_end` marker
is not a drive. A pure helper `countCanonicalRegulationDrives(events)` excludes it
(and the OT divider), so the scorebug reads `Drive 24 of 24`, never `of 25`, and
shows `Final` at the terminal marker. See §13.

## 1b. Post-review round 2 (honesty of the reconstruction)

1. **Reconstructed order is no longer called canonical chronology.** The engine
   simulates each side's drives separately and owns no possession chronology; the
   interleaved order — and every intermediate `scoreAfter` before the final — is a
   deterministic *reconstruction*. Module/UI comments now say so; what stays
   canonical is the final score, the scoring events, their points, and per-side
   totals (`canonicalGameEvents.js`, `liveGameEvents.js`, `LiveGameViewer.jsx`).
2. **The intermediate gamecast progression is labeled honestly.** During canonical
   playback the viewer shows a **"Reconstructed order"** chip (with a tooltip)
   clarifying the mid-game order/running score are illustrative and only the final
   is official.
3. **Final box-score Standouts are hidden until the final whistle.** They are final
   totals, so showing them mid-game was misleading; the panel now shows *"Game
   leaders unlock at the final whistle."* until `finished`.
4. **Stale quarter wording removed** from this document and the PR title.
5. The two production-build Playwright flows were re-run (see §25).

**Additional P1 fixed while re-running the flows — watch→Game Book recovery race.**
Re-running `mobile_game_day_trust` surfaced a genuine, pre-existing race
(reproduced 3/3 on the prior commit): the Game Book resolved the just-watched
game only from the **async** worker fetch (`getBoxScore`) and never from the
**synchronous** localStorage postgame archive that `PostGameScreen` writes
(`saveGame`). When the worker fetch lost the race it landed on the honest
"recovery" state instead of the game the user just watched. Fix:
`GameDetailScreen` now also consults `getGame(gameId)` (localStorage) and
`resolveCanonicalCompletedGame` accepts a `localArchivedGame` source and uses
whichever archive carries a valid final. The flow is now stable across repeated
runs. Regression: `src/ui/utils/canonicalCompletedGame.test.js`.

## 2. Before-fix authority map

| Surface | Producer (before) | Authoritative? |
|---|---|---|
| Official final score | `buildDriveBasedSummary` (drive engine) | **Yes** |
| TD/FG/XP/2PT breakdown | `buildDriveBasedSummary` | **Yes** |
| Overtime points | `simGameStats` OT loop (global RNG) | Yes (added after regulation) |
| Player box score | `generateStatsForTeam` (#1698/#1699) | **Yes** |
| Team stats | derived from box score (#1698) | **Yes** |
| **Scoring summary** | `buildScoringSummaryFromSimulation(playLogs)` | ❌ narration-derived |
| **Quarter scores** | `buildQuarterScoresFromScoring(scoringSummary)` | ❌ narration-derived |
| **Live scorebug (watch)** | `LiveGame.jsx` synthetic `generatePlay()` ticker / narration | ❌ fabricated |
| Drive cards | `buildDriveSummaryFromSimulation(playLogs)` | ❌ narration (flavor only) |

The drive engine simulated **all home drives, then all away drives**, accumulating
only aggregate counters — it retained no ordered, quarter-assigned, `scoreAfter`
event list. The scoring summary and quarter scores were therefore reconstructed
from the independent narration `playLogs`, whose per-quarter attribution and
running score routinely disagreed with the authoritative final.

## 3. Reproduction games and seeds

Reproduced through the real drive engine + ledger across the required seeds
(`6, 39, 123, 777, 2026, 4242, 8888`) covering low/normal/high/blowout/close and
a synthetic OT case. For each: official final, canonical scoring-event count,
quarter totals, and scoring-summary totals all reconcile exactly. See
`src/core/__tests__/simulation/canonicalGameEvents.test.js` and
`canonicalEventsIntegration.test.js` (full `simGameStats` / `simulateBatch` path).

## 4. First factual event divergence

The divergence began the moment any factual surface read the narration
`playLogs`: `buildScoringSummaryFromSimulation(normalizedPlayLogs, …)` in
`simGameStats`, and the fully synthetic `generatePlay()` ticker in `LiveGame.jsx`
(fabricated `7`-pt TDs on an ~8-play cadence). Neither consulted the drive
engine's authoritative scoring breakdown.

## 5. Chosen lane — **Lane B**

The authoritative engine owns drives and drive outcomes but **not** individual
plays, yardage-by-play, a trustworthy clock, or per-play player pairing. Forcing
play-level detail would fabricate data that contradicts the box score. Lane B
presents an honest drive-by-drive gamecast:

```
Q2 · BAL drive · 8 plays, 71 yards · Touchdown · NYJ 10 — BAL 14
```

## 6. Canonical event schema

Produced by `src/core/simulation/canonicalGameEvents.js`:

```
{ eventId, gameId, driveId, sequence, driveNumber,
  quarter: null, periodLabel, isOvertime, clock: null,
  possessionTeamId, scoringTeamId, eventType, driveResult, points,
  scoreAfter: { home, away }, plays, yards, isScore,
  primaryPlayerId: null, secondaryPlayerId: null, teamAbbr, text }
```

Every score-changing event carries: stable `eventId`, deterministic `sequence`,
`scoringTeamId`, `eventType`, `points`, and `scoreAfter.{home,away}`.

**Honest period, not a fabricated quarter (post-review fix — defect #1).** The
drive engine generates separate home and away drive logs with no shared clock,
so there is *no* canonical mapping of a drive to Q1–Q4. Publishing evenly-divided
"quarters" would be invented authority. Therefore `quarter` is `null` for all
regulation *and* overtime events; the honest ordering signal is `sequence` +
`periodLabel` (`"Drive 8"`). Overtime — the one period the sim tracks distinctly
— carries `isOvertime: true` and `periodLabel: "OT"` (never a fabricated `Q5`).

## 7. Score reconciliation

Guaranteed by construction, verified across the seed matrix:
`sum(scoring-event points, per side) === final score` and
`last scoreAfter === final score`. Regulation points come from the drive engine's
per-drive log (which sums to the drive-engine score); OT points are captured from
the OT loop and appended, so the total equals the post-OT final. TDs are scored
as 6/7/8 explicitly (no "every TD is 7" assumption); FGs are 3.

## 8. Quarter-score authority (post-review fix — defect #1)

There is **no canonical quarter-score table**. The authoritative engine does not
simulate a chronological regulation timeline, so `canonicalGameEvents` sets
`quarterScores: null` — the established "unavailable" representation the Game Book
/ box-score view model already handle (they simply do not render a linescore).
This replaces the earlier build, which divided interleaved drives evenly into four
buckets and published them as quarter scores; that was deterministic but was
**invented quarter timing**, and is removed. The scoring summary and running
score remain fully canonical (§7, §9) — only the fabricated quarter placement is
gone.

PostGameScreen and the Game Book render an honest **"Quarter breakdown
unavailable for this game."** note for canonical-ledger games and drop the
`Q{n}` prefix from scoring rows in favor of the `periodLabel` (`"Drive 8"`).
`boxScorePresentation.deriveQuarterScores` refuses to reconstruct a fabricated
quarter table from the narration stream whenever a canonical ledger is present.
Legacy archives that carry genuine stored `quarterScores` still display them.

## 9. Scoring-summary reconciliation

The scoring summary is the `isScore` slice of the ledger. Each row agrees on
team, period label, scoring type, point value, and running score (`scoreAfter`).
`sum(scoring-summary points, per side) === final score`.

## 10. Clock policy

No clock is invented. `clock` is always `null`; the scorebug shows
`Drive {n} · {ABBR} possession` (or `OT · …`) and the feed shows the honest
`periodLabel` (`"Drive 8"` / `"OT"`) with the event `#{sequence}`. No fake
`15:10`-style values and no fabricated quarter labels anywhere.

## 11. Player-attribution policy

Drive-level authority cannot prove per-play passer/receiver pairing, so
`primaryPlayerId`/`secondaryPlayerId` are `null` and scoring rows use honest
team-level text. Player totals are **never** recounted from event text — the
canonical box score from #1698/#1699 remains the sole player-stat authority. The
live "Standouts" panel now derives from that canonical box score
(`liveGameStandouts.js`), never the narration stream.

**Sack semantics (review defect #3).** `sacks` is overloaded on the canonical
row: on a passing row it is sacks *taken*; on a defensive row it is sacks *made*.
Shared helpers `defensiveSacks(row)` / `sacksTaken(row)` (with `isPassingRow`) are
the single source of truth, used by both `buildPlayerLeadersFromArchive` and
`deriveStandoutsFromBoxScore`. A QB's sacks-taken never counts as defensive
production (defensive/sack leader, positive Player-of-Game impact, or the live
Sacks standout); genuine defender sacks still count.

## 12. Narration role after the fix

`simulateFullGame`/`playLogs` are demoted to a **non-factual flavor layer**
(drive-summary cards, momentum text). They no longer own score, scoring events,
quarter scoring, possession outcomes, player totals, leaders, or the final. No
new RNG is consumed to format the canonical events (pure transform).

## 13. Live scorebug behavior

`LiveGameViewer` prefers the canonical ledger: the scorebug reads the current
canonical event's `scoreAfter` — a monotonic running total over a **reconstructed
possession order** — and shows the league-recorded final at the end. It never
parses narration or shows a narrated running score. During playback a
**"Reconstructed order"** chip makes clear the mid-game order and running score
are illustrative (only the final is official — post-review point 2), the period
cell shows the honest `Drive {n} of {N} · {ABBR} possession` (never a fabricated
quarter), and the box-score **Standouts stay hidden until the final whistle**
(post-review point 3) since they are final totals. Legacy archives with no ledger
fall back to the #1692 honest placeholder (final only at the end) and keep their
numeric quarter labels.

At completion: live scorebug === GAME_EVENT final === PostGameScreen final ===
schedule result === Game Book final.

## 14. User play-call control audit

The authoritative drive engine is fully simulated **before** playback begins, so
Run Heavy / Pass Heavy / Timeout could not change the outcome on any path — and
App never wired `onPlaycallOverride` at all. Per review defect #2 these controls
are **removed** (not hidden, and not rebranded as "viewing preferences"), because
they claimed a strategic effect they did not have. Canonical playback shows the
honest note *"Game strategy was locked when simulation began."* and
`onPlaycallOverride` is never invoked. The controls that do real work — pause,
speed, next score, key moment, sim-to-end, jump filters — are preserved and
fully functional. (Wiring live play-calls into the authoritative engine remains
out of scope; a future item, not a #1700 deliverable.)

## 15. Archive and save/reload behavior

The canonical `scoringSummary`, `quarterScores`, and `canonicalEvents` are
persisted by both paths: the worker season/batch archive builder and the watch
path (`PostGameScreen.onArchiveReady`, which now archives the **canonical**
scoring summary/quarter scores/ledger, not the narration `notableMoments`).
Opening the Game Book re-reads the persisted canonical data — it does not
regenerate events, recount narration, or change the running score. Save/reload
preserves the event fingerprint (id/sequence/quarter/team/type/points/scoreAfter).

## 16. Legacy-game behavior

Archives without a canonical ledger remain readable: the viewer falls back to the
narration feed with the #1692 honest final-only scorebug, and the Game Book uses
its existing limited-detail derivation. No canonical timeline is fabricated for
old archives.

## 17. Browser release journey

Ran the real production build (`vite build` + `preview`, port 4173) through the
critical journeys with pre-installed Chromium:

- `fresh_franchise_first_week_smoke.spec.js` — fresh storage → Start New
  Franchise → onboarding → HQ → advance Week 1 → Simulate (Skip) → PostGame →
  Game Book → HQ. **PASS.**
- `mobile_game_day_trust.spec.js` — watch → canonical live scorebug → final →
  PostGame → Game Book → HQ, all using the canonical result end to end; plus the
  missing-Game-Book recovery case. **PASS (2/2).**

This journey caught a real transport gap (see §20) that unit tests could not.

## 18. Mobile viewport results

`mobile_game_day_trust.spec.js` runs at 390×844 (iPhone) with a horizontal-overflow
assertion (`scrollWidth - clientWidth <= 1`) and an in-viewport control-tray
assertion — both pass. `fresh_franchise_first_week_smoke` exercises the desktop
build path. No nested-scroll trap; sticky controls remain reachable.

## 19. Console/page-error results

The passing specs complete without an app crash (`not.toContainText('Something
went wrong')`) and without unhandled navigation errors. (A dedicated
console-error allowlist collector is recommended as a follow-up hardening item;
the current specs assert on error boundaries and recovery surfaces.)

## 20. E2E silent-catch removals

- `tests/e2e/helpers/franchise.js`: removed the swallowed
  `expect(advanceCta).toBeEnabled().catch(() => {})` (now a readiness probe) and
  the swallowed `Advance anyway` / `Simulate (Skip)` `click().catch(() => {})`.
  Both are now explicit optional-state branches: probe visibility → assert
  enabled → click without swallowing; the existing week-advance `waitForFunction`
  asserts the transition.
- `tests/e2e/fresh_franchise_first_week_smoke.spec.js`: `Simulate (Skip)` is now a
  **required** asserted interaction (visible → enabled → click), not a swallowed
  click.
- `tests/e2e/mobile_game_day_trust.spec.js`: the scorebug assertion was updated
  from "shows dashes during playback" to "shows the canonical running score,
  numeric and never exceeding the recorded final" — the #1700 behavior.

**Transport gap the browser journey caught:** `workerApi.js` did not forward the
new `PLAY_LOGS` fields, so `canonicalEvents` never reached the viewer in the real
app (unit tests passed because they injected the prop directly). Fixed — this is
exactly the class of defect swallowed Playwright failures used to hide.

## 21. Other screens audited

Existing smoke specs cover HQ, Roster, Schedule/Standings, Player Profile, Box
Score click-through, League Pulse, Free Agency, and phase hydration; they remain
green in the unit suite. No new dead doors were introduced by this PR.

## 22. Additional P0/P1 fixes

Two fixes beyond the core change, both surfaced by the real browser journey:
1. **P0** — the `workerApi.js` PLAY_LOGS transport gap (§20): required for the
   canonical live scorebug to work in the real app.
2. **P1** — the watch→Game Book recovery race (§1b): the Game Book resolved the
   just-watched game only from the async worker fetch and could land on the
   recovery state; it now also consults the synchronous localStorage postgame
   archive. Reproduced 3/3 before the fix; stable across repeated runs after.

## 23. Unit-test result

`npm run test:unit` → **456 files, 5602 tests passed**. Includes: 14
ledger-invariant tests (null quarter authority + honest `periodLabel`); 14
full-path integration tests; canonical-viewer tests (drive-progress `Drive N of
N`, `Final` at the terminal marker, the "Reconstructed order" chip, hidden
Standouts until the final whistle, and no play-call controls); sack-semantics
regressions in `gameSummary.test.js` and `liveGameStandouts.test.js` (the review's
QB-5-sacks-taken / EDGE-1-sack fixture); Game-Book quarter-unavailable +
`periodLabel` DOM tests; the `deriveQuarterScores` canonical-guard test; and the
`resolveCanonicalCompletedGame` local-archive fallback test.

## 24. Build result

`npm run build` → **success** (large-chunk advisory only, pre-existing).

## 25. Playwright result

Against the **production build**: `mobile_game_day_trust.spec.js` **2/2 pass**
(re-run repeatedly — 6 consecutive clean runs after the §22 Game Book race fix;
it had failed 3/3 before);
`fresh_franchise_first_week_smoke.spec.js` **1/1 pass**. Chromium was available
(`/opt/pw-browsers/chromium-1194`); execution was **not** blocked.

## 26. Durability result

`npm run durability:test` → **38 pass**. `npm run durability:smoke` and
`durability:5` → **stop at season-1 `afterSeasonRollover`** with
`schedule.games-reference-valid-teams` (8 scheduled games reference an unknown
team, 3 invariant failures). **Verified pre-existing** (identical `fail=3` on the
base tree at #1699 via `git stash`), unrelated to the canonical-event change,
which touches no schedule/rollover code. Reported, not bundled.

## 27. Known remaining defects

- Post-rollover schedule references invalid teams (durability, pre-existing).
- Live play-call controls are presentation-only in the watched flow (§14).
- No dedicated console-error allowlist collector yet (§19).

## 28. Exact #1701 recommendation

**#1701 — Post-Rollover Schedule & Archive Reference Integrity V1.** Fix the
season-rollover schedule generation so no scheduled game references an unknown
team id (`schedule.games-reference-valid-teams`), plus the related archived-champion
/ self-game / rosterFingerprint durability invariants. Do not weaken the
durability invariants; repair the shared references. This is orthogonal to the
canonical-event work.

## 29. Merge recommendation

**Merge #1700.** The watched game now tells one coherent, truthful story: the live
scorebug, scoring summary, PostGameScreen, Game Book, and save/reload all describe
the single game the drive engine simulated, with the mid-game progression
honestly labeled as a reconstruction and no fabricated quarter table. Unit, build,
and the critical browser journeys pass; the only durability failure is a
documented, pre-existing, out-of-scope rollover issue deferred to #1701.
