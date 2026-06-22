# Mobile UX Foundation & Live Game Polish V1

Focused UI/UX polish for the core mobile loop: **advance week → view week results →
watch/sim game → view postgame result.** No gameplay systems were added or changed.

## Screens touched
- **Franchise HQ** (`FranchiseHQ.jsx`) — compact activity strip for roster/sim notices.
- **Live game / week-results panel** (`LiveGame.jsx`) — critical bug fix + gamecast polish.
- **Postgame result screen** (`PostGameScreen.jsx`) — tighter cards, empty-state Game Flow.
- **Mobile shell** (`base.css`, `components.css`) — mobile spacing tokens + safe-area vars.

## Files changed
- `src/ui/components/LiveGame.jsx` — fix week-results integrity bug; add `MobileScorebug`,
  `LiveFinalCard`, `KeyMomentsStrip`; partial-results warning; play-feed hierarchy.
- `src/ui/components/PostGameScreen.jsx` — tighten top card, box-score affordance, leader
  spacing; hide empty Game Flow behind a compact useful empty state.
- `src/ui/components/FranchiseHQ.jsx` — collapse roster/simulation notices into the new
  `ActivityToastStack`.
- `src/ui/components/ActivityToastStack.jsx` — **new** reusable compact activity strip.
- `src/ui/styles/base.css` — new mobile UX tokens (card padding, compact button height,
  safe-area insets, sticky-footer gap, mobile type scale).
- `src/ui/styles/components.css` — styles for scorebug, final card, key moments, play
  highlights, and the activity toast stack.
- Tests: `ActivityToastStack.test.jsx`, `LiveGameMobilePolish.test.jsx`,
  `PostGameMobilePolish.test.jsx`, `FranchiseHQMobileShell.test.jsx`.

## Critical data bug fixed
HQ/live panel could simultaneously show **"Week complete"**, **"Games resolved: 15 / 16"**,
and **"No games to display."** Root cause: the header counted *all* resolved games while the
scoreboard only rendered the *user's* game, so a bye week / late skip / data mismatch left the
panel empty despite completed games existing.

Now:
- The user's resolved game is shown when present.
- If the user has no game but other games resolved, those completed games are surfaced.
- A compact partial-results warning appears when resolved games < scheduled games.
- The empty state only renders when there genuinely is no completed game data, and never
  contradicts the resolved-count line.

## Before / after UX behavior
| Area | Before | After |
|------|--------|-------|
| Week results | Empty "No games to display" despite resolved games | Always renders completed games; partial warning when incomplete |
| Live game | Debug-style play log, weak "final whistle" | Sticky mobile scorebug, prominent FINAL card with winner emphasis + "View Box Score", classified play feed (scoring/sack/turnover/latest), Key Moments strip |
| Postgame | Tall cards, empty Game Flow toggles | Tighter score card, prominent box-score button, Game Flow hidden/replaced by useful empty state, compact leaders |
| HQ notices | Stacked full-width alert cards | Single compact activity strip (toast stack) |
| Mobile shell | Ad-hoc spacing | Shared tokens for card padding, compact button height, safe-area insets, sticky-footer gap, mobile type scale |

## Tests added (15, all passing)
1. Week-results panel renders resolved games when available.
2. Panel does not show "No games to display" when completed games exist.
3. Partial-completion shows a compact warning when resolved < total.
4. Activity strip/toast stack renders roster/simulation messages (unit + HQ integration).
5. Live final state renders FINAL, final score, winner emphasis, box-score action.
6. Live play feed highlights scoring events (`data-play-kind`).
7. Live game handles missing/empty play log without crashing.
8. Postgame hides/improves empty Game Flow state.
9. Postgame leaders render compactly with partial leader data.
10. Mobile bottom nav/safe-area: primary Advance Week control sits outside the bottom nav.

Full suite: **4834 unit/integration tests passing**; production build succeeds.

## No gameplay logic changed
No changes to simulation math, play-by-play generation, awards, trades, free agency,
waivers, draft, playoffs/standings, owner pressure, media/front-office formulas, progression,
or the save schema. Changes are limited to UI components and stylesheets.

## Known remaining UX limitations
- The live week-advance panel (`LiveGame.jsx`) still uses *synthetic* play text and a
  synthetic clock/possession in the scorebug — real down/distance/ball-spot are only available
  in the dedicated watch overlay (`LiveGameViewer.jsx`), which already has a real `Scorebug`.
- The scorebug uses `position: sticky` inside an `overflow: hidden` panel, so it renders inline
  rather than truly pinning during long feeds.
- Desktop layout intentionally left unchanged; improvements target mobile-sized viewports.
- The richer "watch a single game" overlay (`LiveGameViewer.jsx`) was left as-is to limit risk;
  its speed controls and final card were already reasonably polished.
