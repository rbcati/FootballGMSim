# Mobile Game-Day Trust & Recovery V1

Scope: the game-day loop — Live Game → Final → Postgame → Game Book → Return to
Franchise HQ — on phone-sized viewports. Frontend presentation, navigation,
view-state interpretation, and error recovery only. No simulation, roster,
offseason, worker-lifecycle, or save-schema changes (PR #1689 territory is
untouched).

---

## 1. Screenshot evidence matrix

| # | Screenshot issue | Classification | Root cause / disposition |
|---|---|---|---|
| 1a | Scorebug reads 0–7 while a TOUCHDOWN card reads 0–0 | **Confirmed live defect (upstream data)** | Play-log score snapshots are written *before* the scoring increment (`src/core/simulation/index.js` — `addLog` at ~L783 runs before `offTeam.score += td.points` at ~L935), **and** the entire narrated running score belongs to a different engine than the recorded final (see §4). UI now omits per-play scores entirely. |
| 1b | Every event stamped `Q1 15:10` | **Confirmed live defect (upstream data)** | The clock is drive-granular: one string per drive shared by all of its plays, with randomized seconds (`clockStr` built once per drive; seconds via `U.rand(0,5)*10`, which can even exceed `15:00`). UI now shows quarter + event sequence, never a per-play clock. |
| 1c | Touchdown ordering ambiguous among same-timestamp cards | **Confirmed layout problem** | Feed was already newest-last but nothing said so and identical clocks blurred order. Feed is now `role="log"` "newest play last" with `#sequence` indicators, quarter markers, and drive dividers. |
| 1d | Controls/filters/Standouts consume most of the screen | **Confirmed layout problem** | Speed/Skip/Playcall columns + open Standouts list measured ~339 px of a 844 px viewport. Now one 53 px sticky tray + collapsible Standouts; live feed area grew from ~310 px to ~537 px at 390×844. |
| 2 | Postgame: oversized result banner, disconnected Game Flow row, tall leader cards | **Confirmed layout problem** | Banner compacted to one line (emoji + W/L + week + saved chip), score card tightened, Game Flow empty state honest and compact. Leader rows kept (already compact); calculations untouched. |
| 3 | "Game recap failed / Returning you to the Weekly Hub…" modal over an unrelated Franchise History screen | **Confirmed live defect** | Two stacked causes, see §3. Recovery surface redesigned per §5. |
| 4a | Partially visible left drawer after returning to HQ | **Unable to reproduce** (drawer verified off-screen at `translateX(300px)` after the loop) | Hardened anyway: drawer now closes on *any* tab change (was: section change only) and a closed drawer is `visibility:hidden` after its slide, so an interrupted transition can never leave a sliver. |
| 4b | Stacked full-width activity toasts covering week results | **Confirmed live defect** | Worker `NOTIFICATION`s (e.g. "Weekly simulation ran on the AttributesV2 engine.") never auto-dismissed and stacked up to 10 full-width cards. Now: info-level auto-dismisses after 7 s, max 3 visible rows (newest last), older rows collapse into one "+N earlier notices" row, compact styling. Warnings and retryable notices persist. |
| 4c | Bottom nav covering content | **Confirmed layout problem** | `.app-shell` mobile bottom padding didn't include `env(safe-area-inset-bottom)`; the floating nav (60 px + 10 px inset + home indicator) could cover the last row. Fixed. |
| 4d | "Games resolved: 15 / 16" warning | **Intentional behavior — preserved** | The honest partial-results warning in `LiveGame.jsx` is untouched. |

Bonus defect found while reproducing (not in the screenshots but underlying
several of them): an **infinite React update loop** ran on every screen — see §3.

## 2. Confirmed vs unconfirmed

- Confirmed & fixed: 1a–1d, 2, 3, 4b, 4c, plus the update-loop and the
  narrated-vs-canonical score divergence at the postgame seam.
- Unable to reproduce: the drawer sliver (4a) — hardened defensively.
- Intentional & preserved: partial-results warning (4d); `LiveGame.jsx`'s
  openly synthetic week-sim ticker (documented as deferred, §15).

## 3. Exact live root cause of the Game Book failure

Two independent, verified-in-browser causes:

1. **Infinite update loop starving the archive fetch.**
   `SettingsContext.updateSetting` was recreated every render and always
   produced a new `settings` object even for identical values. `ThemeToggle`
   calls `updateSetting('theme', …)` from an effect with `updateSetting` in its
   dependency array → unbounded re-render loop ("Maximum update depth
   exceeded" repeatedly, verified via CDP stack: `ThemeToggle.jsx:36 →
   SettingsContext.jsx:30`). Under this storm the Game Book's
   `useStableRouteRequest` box-score fetch never settled, and the max-depth
   error could surface through `PostGameErrorBoundary` — producing the "Game
   recap failed" modal over whatever dashboard tab was mounted behind the
   overlay (e.g. Franchise History). Fix: `updateSetting` is memoized and
   bails out when the value is unchanged; `ThemeToggle` only persists a real
   change. Verified: 100+ loop errors per session before → 0 after.

2. **Serialization-default 0–0 masquerading as a final.**
   The slim schedule is packed into an `Int32Array`
   (`src/worker/serialization.js` — `Number(g.homeScore ?? 0)`), so every
   *unplayed* game reaches the UI with `homeScore: 0, awayScore: 0,
   played: false`. `recoverArchivedGameFromSchedule` only checked
   `score == null`, so whenever the archive lookup missed, the Game Book
   rendered a fake **"T · AWAY 0 – 0 HOME"** for a real game (reproduced
   live). Fix: rows explicitly marked unplayed are never treated as finals
   (`gameArchive.js`, `boxScoreAccess.js`, `canonicalCompletedGame.js`), and
   `normalizeArchivedGamePayload` now preserves the `played` flag.

`GameDetailScreen` additionally gained a loading state and an anchored
recovery surface (see §5) for the genuinely-missing-game case.

## 4. Score and clock authority map

| Value | Canonical source | Notes |
|---|---|---|
| Recorded final score | Drive engine — `buildDriveBasedSummary` (`src/core/simulation/index.js` ~L1176) → `GAME_EVENT.homeScore/awayScore`, schedule row, archive | This is what standings, HQ, and the Game Book record. |
| Narrated play stream (`playLogs`) | Legacy narration loop (`simulateFullGame`) | **A different engine.** Its running score routinely contradicts the recorded final (observed: narrated 3–26 vs recorded 41–35 in one game). Its per-play `homeScore/awayScore` are additionally *pre-play* snapshots. |
| Per-play clock | None | Drive-granular estimate with randomized seconds (can exceed 15:00). Not trustworthy per play. |
| Quarter | `playLogs[].quarter` | Trustworthy (derived deterministically from drive index). |
| Possession / down / distance / field position | `playLogs[]` | Narration-consistent; displayed as drive context, never as score claims. |
| Standouts | `playLogs[]` accumulations | Same engine as the box-score player stats — internally consistent. |

UI policy implemented (no simulation changes):
- Feed event cards carry **no score stamps** (`score: null`); only the
  `game_end` marker is stamped with the canonical final passed from the
  `GAME_EVENT` payload (`FINAL a–h` chip).
- The live scorebug shows quarter + `Play N of M` + possession/down/distance,
  with **“–” score placeholders** until the final whistle, then the canonical
  final with a FINAL chip. It never renders the narrated running score.
- `onComplete` → PostGameScreen → archive all use the canonical `GAME_EVENT`
  final (previously the narrated score leaked into PostGameScreen and
  *overwrote the UI archive*, producing an HQ "Last Result" card that showed a
  LOSS for a league-recorded WIN — reproduced live, now impossible).
- If no canonical final exists, the viewer shows an honest "Final score is
  being recorded…" note instead of fabricating one.

## 5. Route/recovery flow — before and after

Before: recap crash → translucent modal ("Game recap failed / Returning you to
the Weekly Hub…" **plus** a button, no actual auto-navigation) over whatever
screen was behind; missing archive → fake 0–0 tie Game Book.

After:
- Recap crash → fully opaque `role="alertdialog"` anchored surface; honest
  copy ("Game recap unavailable — The final result was saved…"); exactly one
  user-controlled action (**Return to HQ**) guarded to navigate once.
- Missing game → `GameDetailScreen` anchored recovery (`game-book-recovery`):
  "Game Book unavailable — The detailed recap for this game could not be
  loaded. Your league results are unaffected." + single Return-to-HQ action;
  loading state shown while the archive request is in flight; no placeholder
  teams or scores, no unrelated screen behind (modal + backdrop unchanged,
  content honest).

## 6. Mobile drawer root cause

Not reproducible as a live defect (measured `translateX(300px)`, off-screen,
after the full loop). Two hardening changes shipped: the drawer closes on any
`activeTab` change (previously only `activeSection`), and
`.mobile-nav-panel:not(.open)` becomes `visibility:hidden` once its slide
completes, so a stuck transform can never leave a visible sliver.

## 7. Toast-stack behavior — before / after

Before: up to 10 permanent full-width alert cards; routine post-sim info
notices persisted until manually dismissed. After: info-level auto-dismisses
(7 s), warnings/retryable persist, max 3 visible compact rows (newest last),
older rows collapse into a "+N earlier notices" summary with dismiss-all.
Content unchanged — nothing diagnostic was removed.

## 8. Postgame hierarchy changes

One-line result header (emoji + VICTORY/DEFEAT/TIE + week + inline "Game
saved" chip), tightened score card (42 px badges, 2.2 rem scores), honest
compact Game Flow empty state ("Detailed game flow was not recorded for this
matchup."), Leaders/Grades tabs and leader math untouched, Game Book CTA and
Back to Hub unchanged and reachable.

## 9. Controls compacting (live viewer)

Speed/Skip/Playcall moved from a stacked side-rail block into one sticky
bottom tray above the safe area: pause toggle + 4 speed steps + a `Skip ▾`
disclosure containing Next Score / Key Play / Sim End (+ playcall overrides
when available). Standouts became a collapsible `<details>` (open by default,
two-column on mobile). Jump pills unchanged (already horizontally scrollable).
No functionality removed. Side rail: ~339 px → ~108 px at 390×844.

## 10. Files changed

- `src/ui/context/SettingsContext.jsx`, `src/ui/components/ThemeToggle.jsx` — update-loop fix.
- `src/core/liveGame/liveGameEvents.js` — score omission policy, sequence, canonical-final stamping.
- `src/ui/components/GameEventFeed/GameEventFeed.jsx` — quarter+sequence display, final-only score chip, `role="log"`.
- `src/ui/components/Scorebug/Scorebug.jsx` — placeholder scores, no fabricated clock, FINAL chip.
- `src/ui/components/LiveGameViewer.jsx` — canonical `finalScore` prop, sticky control tray, collapsible standouts.
- `src/ui/App.jsx` — canonical final into viewer/postgame/archive; notification cap + auto-dismiss; `openBoxScore` E2E hook.
- `src/ui/components/PostGameScreen.jsx` — recovery boundary redesign, compact hierarchy.
- `src/ui/components/GameDetailScreen.jsx` — loading + anchored recovery states, navigate-once guard.
- `src/core/gameArchive.js`, `src/ui/utils/boxScoreAccess.js`, `src/ui/utils/canonicalCompletedGame.js` — unplayed-row 0–0 guards, `played` preserved through normalization.
- `src/ui/components/MobileNav.jsx`, `src/ui/styles/app-mobile.css` — drawer cleanup/hardening, safe-area shell padding, compact notification styles.
- `src/ui/utils/notificationsDisplay.js` — `capVisibleNotifications`.
- `playwright.config.ts` — optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` env (test infra only).
- Tests: see §13.

## 11. Mobile viewport validation

Swept 390×844, 393×852, 430×932, 360×780, 1440×900 on the built bundle:
no horizontal overflow anywhere; control tray on-screen above the safe area;
scorebug visible; drawer fully off-screen/hidden after the loop; bottom nav no
longer overlaps the last content row (shell padding includes safe-area inset).
Desktop keeps the two-column watch layout and in-flow controls.

## 12. Accessibility

- Recovery surfaces: `role="alertdialog"`/`role="alert"` with labelled
  title/description (screen-reader announcement of recap errors).
- Feed: `role="log"` + "newest play last" label; score/result meaning carried
  by text labels (FINAL chip, W/L letters), not color alone.
- Icon-only pause button has an aria-label; speed buttons expose
  `aria-pressed`; scorebug placeholders have descriptive aria-labels.
- Control tray buttons ≥44 px; semantic buttons throughout; no new animation
  (existing transitions only).

## 13. Tests

New:
- `src/core/liveGame/liveGameEvents.test.js` (7) — score omission, canonical
  final stamping, sequence, no default clock, jump filters.
- `src/ui/components/__tests__/LiveGameViewerTrust.test.jsx` (9) — scorebug
  never shows narrated scores; canonical final at completion; `onComplete`
  reports canonical; honest pending state; no fabricated clocks; scoring
  emphasis; explicit ordering; compact controls keep all functionality.
- `src/ui/components/__tests__/PostGameRecovery.test.jsx` (6) — user-team W/L
  heading, canonical Game Book id, continuation, anchored recovery dialog,
  navigate-exactly-once.
- `src/ui/components/__tests__/HQOverlayCleanup.test.jsx` (7) — drawer closes
  on tab change and on Game Book focus; notification cap; unplayed 0–0 rows
  never masquerade as finals.
- `tests/e2e/mobile_game_day_trust.spec.js` (2, 390×844) — full loop with
  canonical-score assertions end to end, and the missing-game recovery
  fixture (`gameController.openBoxScore('s1_w99_998_999')`).

Updated: `GameDetailScreen.test.jsx` (no-data case now asserts the anchored
recovery surface instead of a placeholder header).

Results: `npm run test:unit` — 444 files / 5492 tests passed (including the 29
new tests above). `npm run build` — passes. New E2E spec — 2/2 passed against the
production build. Pre-existing E2E failures on `main` (verified identical on a
clean `origin/main` worktree, 4 failures): `box_score_clickthrough.spec.js`
(2) and `franchise_hq_mobile_smoke.spec.js` HQ-essentials (2) — unrelated to
this PR and not introduced by it.

## 14. Explicitly untouched systems

Simulation engines and scoring math, play-outcome probabilities, clock-manager
math, game-stat calculations, league resolution semantics (the 15/16 partial
warning is preserved verbatim), worker lifecycle/protocol (no new message
types; no payload changes), save schema, roster/offseason/contracts/free
agency/draft/retirement, durability harness, season rollover, the passYd
archive warning.

## 15. Deferred upstream issues (recommended follow-ups)

1. **Narrated play stream vs recorded final divergence.** `WATCH_GAME` builds
   play-by-play with the legacy narration loop while
   `buildDriveBasedSummary` overrides the final score
   (`src/core/simulation/index.js` ~L1176). Fields affected:
   `playLogs[].homeScore/awayScore/scoreHome/scoreAway` (pre-play snapshots of
   a non-canonical score) and `playLogs[].clock/timeLeft` (drive-granular,
   randomized seconds). A separate engine PR should either emit per-play
   canonical `scoreAfter` from the drive engine or align the narration loop
   with it; the UI can then re-enable live running scores.
2. **`GAME_EVENT` lacks `quarterScores`** — adding the drive engine's quarter
   splits to the watched-game payload would allow an honest quarter-grain
   running scorebug.
3. **`LiveGame.jsx` week-sim ticker** generates fully synthetic plays/scores
   ("always plausible" narration). Out of screenshot scope here; recommend
   the same omission policy in a follow-up UI PR.
