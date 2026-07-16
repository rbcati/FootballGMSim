# Canonical Game Engine Revival V1 (#1696)

## 1. Executive summary

One matchup previously produced multiple incompatible versions of the same game.
The official final score came from the **drive engine** (`buildDriveBasedSummary`),
but the postgame **Leaders** and **Grades** surfaces were computed from the
**narrated play-by-play stream** (`simulateFullGame` → `playLogs` / `liveStats`),
which selects a quarterback at random on every drop-back and counts each log
reference as a "snap". The result was the screenshot defect: three quarterbacks
rotating through tiny workloads (~183 combined passing yards) under a
`NYJ 39 – BAL 23` scoreboard, one-catch receivers stamped "Elite"/"Star", "PFF"
badges, and mixed-team rows.

This PR makes every factual postgame surface consume **one canonical player box
score** — the same authority the score is consistent with — and removes the
external-brand grade styling, the fake snap counts, and the mixed-team rows. It
also closes a genuine stat-generation gap where the QB's passing line did not
reconcile with the receivers who caught the passes.

The change is a **stat-authority repair**, not yardage tuning. No score is
altered after the fact; the drive engine remains the scoring authority.

## 2. Screenshot evidence

Two attached screenshots (mobile + desktop) show the postgame screen for
`NYJ 39 – BAL 23`, Week 6, with:

- heading "PFF-STYLE PERFORMANCE GRADES" and "PFF" stamped on every badge;
- three QBs (Parker Taylor 9/10·84, Greg Moore 5/5·51, Logan Mitchell 6/7·48)
  each with "N snaps";
- WR/TE rows with `1/1 · 12–22 yds` graded "Star";
- players from both teams intermixed with no team label.

## 3. Current multi-engine authority map

| Stage | Producer | Authoritative? | Independent RNG? | Consumers (before) |
|---|---|---|---|---|
| Narrated full-game loop | `simulateFullGame` (`simulation/index.js`) | No (presentation) | Yes | `playLogs`, `liveStats` |
| Drive-based summary | `buildDriveBasedSummary` (`driveEngine.js`) | **Yes** — score, TD/FG/XP/2-pt, team drive stats | Yes (seeded) | final score, standings, GAME_EVENT |
| Player box score | `generateStatsForTeam` → `generate*Stats` | **Yes** — player lines, keyed to drive-engine TD/FG counts | Yes | `res.boxScore`, season/career accumulation |
| Scoring summary / quarter scores | `buildScoringSummaryFromSimulation` | Derived from **narration** logs | — | Game Book timeline |

The final score (drive engine) and the player box score are the two
authoritative producers. `liveStats`/`playLogs` are a **narration layer** that
independently re-rolls players per play and does not agree with either.

## 4. Reproduction seed and mismatch

Deterministic fixture (`src/core/__tests__/simulation/canonicalGameAuthority.test.js`,
seed `6`, `NYJ` vs `BAL`, near-identical to the screenshot's high-scoring game):

```
NYJ 41 - BAL 33
narrated liveStats QBs (6): 11/13·39, 6/9·21, 2/3·6, 9/11·53, 2/2·4, 5/6·61   sum = 184 passing yards
canonical box score QBs (2): 20/28·251 (NYJ starter), 26/35·302 (BAL starter)  sum = 553 passing yards
```

The narration shows **six** quarterbacks summing to **184** passing yards
(matching the screenshot's "~183"); the canonical box score shows **one starter
per team** with realistic full workloads.

## 5. Narrated score vs official score

The drive engine owns the score; the narration's running score is a separate
accumulation and is never treated as the result (already enforced by #1692
strict final-score parsing and #1690 honest placeholders — both preserved).

## 6. Narrated stats vs canonical stats

Narrated `liveStats` is produced by `pickStarterWeighted(...)` **per play**, so a
healthy backup can take snaps on any drop-back. The canonical box score assigns
the starter a 100% workload share unless an in-game injury transfers a share to
the backup (`processPositionGroup(qbs, …, [1.0], …)`). The screenshot's three-QB
rotation is purely a narration artifact.

## 7. First divergence point

The divergence begins the moment the postgame UI reads `logs`/`liveStats`
(`AdvancedStats.computeGrades(logs)` and `PostGameScreen.useGameLeaders(logs)`)
instead of `res.boxScore`. The worker's `handleWatchGame` emitted `PLAY_LOGS`
with `playLogs` + `liveStats` but **never forwarded the canonical box score**, so
the UI had no canonical source to consume.

## 8. Chosen canonical game package

The existing committed result already carries a canonical package
(`commitGameResult` → `resultObj`): `boxScore { home, away }`, `teamStats`,
`scoringSummary`, `quarterScores`, `driveSummary`, `playLogs`, `recapText`,
`gameReasoningFlags`, `simSeed`. We **reuse** it — no competing schema was
introduced. The only transport change is that `res.boxScore` and `res.teamStats`
are now delivered to the postgame UI alongside the (presentation-only) logs.

## 9. Score reconciliation rules

`reconcileScoreBreakdown` (`gameStatReconciliation.js`) proves:

```
points = 6·(offTDs + defTDs + stTDs) + xpMade + 2·twoPtMade + 3·FGs + 2·safeties == finalScore
```

No TD is assumed to be worth 7; missed XPs, two-point tries, safeties, and
defensive/special-teams scores are counted explicitly.

## 10. Team-stat reconciliation rules

Team offensive totals are the sum of the players' canonical lines
(`deriveCanonicalTeamSideStats`). Interceptions thrown (passer rows) and
interceptions made (defender rows) are kept apart so takeaways never cancel
giveaways.

## 11. Player-stat reconciliation rules

New invariant (was **violated** on `main`): the QB passing line is re-derived
from actual receiving production after stat generation, so:

```
sum(all receptions) == sum(QB passComp)
sum(all recYd)      == sum(QB passYd)
sum(recTD)          == sum(QB passTD)   (already reconciled via TD distribution)
```

This closed a ~100-yard hidden gap (e.g. seed 6 NYJ: QB 148 vs receivers 251 →
now 251 == 251). The re-derivation is deterministic (no new RNG draws) and does
not change the score. `completionPct`/`passerRating` are recomputed from the
reconciled line. Gross vs net passing yards: player passing yards are **gross**
(sacks are tracked separately as `sacked`/`sacksAllowed`); documented, not forced
to equal net.

## 12. QB participation policy

- The designated starter (`groups.QB[0]`) receives the normal workload share
  (`[1.0]`).
- A backup receives meaningful attempts only on an in-game injury
  (`rollInGameInjury` → `resolveInjurySubstitutionShare`).
- QB selection does not change per play in the canonical box score.
- Depth-chart authority is unchanged.

## 13. Grade methodology and sample protection

`gamePerformanceGrades.js` (pure, deterministic, position-aware, bounded
`[0,100]`):

- raw grade from canonical rate stats per position;
- **confidence-weighted shrinkage** toward a neutral baseline (60):
  `overall = baseline + (raw − baseline) · min(1, volume/fullSample)`;
- `Limited` tier below a per-position minimum sample; `Star`/`Elite` gated behind
  near-full participation, so one target/carry can never present as Elite;
- players with no honest production metric (bare OL) are omitted, not fabricated.

## 14. UI terminology changes

- "PFF-Style Performance Grades" → "Game Performance Grades" with the subtitle
  "In-game estimate from simulated production & participation".
- "PFF" badge stamp removed (grade number only).
- "N snaps" removed; rows show an honest participation metric (`att`, `touches`,
  `tgt`, `inv`) drawn from canonical counts, or nothing when none is honest.

## 15. Team-filter behavior

Every grade row is tagged with its team. A team filter defaults to the user's
team (starred), with the opponent and an "All" view available; an
Offense/Defense sub-filter never hides team ownership. Leaders rows also carry a
team tag.

## 16. Archive changes

`PostGameScreen`'s archive payload now persists the **canonical** `playerStats`
(never narration-derived totals). When canonical stats are unavailable it stores
empty sides rather than recounting log references. The season/batch archive path
already stored `result.boxScore`; both paths now agree.

## 17. Save/reload result

The Game Book (`boxScoreViewModel`) already consumes the archived canonical
`playerStats`; because the archive now stores the same canonical box score the
PostGameScreen shows, opening the Game Book no longer swaps to a different set of
totals. Legacy archives remain readable and fall back to an honest limited-detail
state.

## 18. Season-stat accumulation result

Unchanged and still committed exactly once: `commitGameResult` accumulates
`player.stats.game` into season/career via `accumulateStats` with a per-game
`_processedGameIds` guard. The postgame archive write is presentation persistence
only and never re-adds to season totals. The QB reconciliation mutates
`player.stats.game` **before** accumulation, so season totals inherit the
reconciled (consistent) line.

## 19. Determinism result

No `Math.random`, time seeds, or reroll loops were added. The QB↔receiver
reconciliation performs zero RNG draws (pure reassignment of already-drawn
values), so seeded scores and drive outcomes are byte-for-byte unchanged. Only
the QB's displayed completions/yards change — intentionally, to reconcile.

## 20. Plausibility matrix

Across seeds `[6, 39, 123, 777, 2026, 4242, 8888]` (low/avg/high/blowout/close):
one starter QB per team, passing reconciles to receiving for both teams, scores
non-negative and internally consistent. See the regression suite.

## 21. Files changed

- `src/core/simulation/index.js` — QB↔receiver passing reconciliation.
- `src/core/simulation/gameStatReconciliation.js` — new pure reconciliation invariants.
- `src/ui/utils/gamePerformanceGrades.js` — new canonical grade module.
- `src/ui/components/AdvancedStats.jsx` — rewritten to canonical box score + team filter + no PFF/snaps.
- `src/ui/components/PostGameScreen.jsx` — canonical leaders + canonical archive; log-derivation removed.
- `src/worker/worker.js` — `PLAY_LOGS` now carries `playerStats`/`teamStats`.
- `src/worker/workerApi.js`, `src/ui/hooks/useWorker.js`, `src/ui/App.jsx` — plumb canonical stats to the UI.

## 22. Tests added

- `src/ui/utils/gamePerformanceGrades.test.js`
- `src/ui/components/__tests__/AdvancedStatsCanonical.test.jsx`
- `src/core/__tests__/simulation/canonicalGameAuthority.test.js`
- Updated `PostGameScreen.test.jsx`, `PostGameMobilePolish.test.jsx`.

## 23. Explicit untouched systems

Schedule generation, standings rules, playoff qualification, roster
construction, contracts, free agency, draft, progression, retirement, salary
cap, award formulas, #1692 strict final-score parsing, and #1690 honest score
placeholders are all unchanged.

## 24. Remaining canonical play-by-play limitations

The **scoring summary** and **quarter scores** are still derived from the
narration stream (`buildScoringSummaryFromSimulation`), whose per-quarter
attribution can lag the authoritative drive-engine total. Postgame does not
present these as authoritative (it shows the canonical final score and
presentation-only key moments), and `reconcileQuarterTotals` is provided to flag
any gap. A fully canonical play-by-play with `scoreAfter` events is deferred.

## 25. Recommended #1697 scope

**#1697 — Canonical Play-by-Play & Score-After Events V1**: have the drive engine
emit a canonical event ledger (`{ eventId, driveId, sequence, quarter,
possessionTeamId, eventType, points, scoreAfter{home,away},
primaryPlayerId, secondaryPlayerId, text }`), derive the scoring summary and
quarter scores from that ledger (so quarter totals equal the final score by
construction), let the Live scorebug update only from canonical score-after
events, and reduce `simulateFullGame` narration to formatting canonical events.
This retires the last narration-derived factual surface.
