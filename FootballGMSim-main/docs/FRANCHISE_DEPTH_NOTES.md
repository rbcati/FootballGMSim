# Franchise Depth Sprint Notes

## What was wired this sprint

- **Weekly Hub → Franchise HQ refresh** (`WeeklyHub.jsx`):
  - Added high-signal cards for standings/playoff race, last-5 form, pressure snapshot, cap+payroll, injury summary, top storylines, and required quick actions.
  - Preserved existing primary-action workflow while reducing dead space with explicit empty-state messaging.

- **Universal Box Score entrypoints expanded**:
  - `SeasonRecap.jsx` now surfaces a "Completed games" list with direct links into shared `Game Detail` via `resolveCompletedGameId`.
  - `LeagueDashboard.jsx` wires these clicks through `openGameDetail(...)` so all entrypoints converge on the shared game detail screen.

- **History depth UX improvements** (`TeamHistoryScreen.jsx`):
  - Added timeline search/filter by year and scope toggles (`All-time`, `Playoff-caliber`, `Championship years`) to improve multi-season browsing.

- **Contextual explainability**:
  - Added lightweight inline `InfoTip` component for contextual explanations.
  - Used in Weekly Hub pressure/playoff race cards and Finance header.
  - Added a concise "How this works" section in `FinancialsView.jsx` with weekly/seasonal/yearly cause-effect framing.

## Data model and persistence notes

- These UI upgrades leverage existing persisted state (`leagueHistory`, `recordBook`, `franchiseHistoryByTeam`, `hallOfFame`, and archived game data) rather than introducing a parallel persistence layer.
- Save compatibility remains stable because no breaking schema writes were introduced in this pass.
- If future sprints add explicit finance history time-series arrays, migration should be done in worker meta defaults (`ensureLeagueMemoryMeta` / save integrity checks).
