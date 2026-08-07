# Trade Deadline Context V1 — implementation audit

## Live-state findings

- **Merged baseline:** this branch starts at merge commit `147ff4a`, the merge of PR #1737 (League Hub / Season Pulse). Player Decision Cards and their presentation model are present in `src/core/playerDecisionPresentation.js`; GM and contract decision queues are present in `src/core/gmDecisionQueue.js`; the GM Decision Center is present in `src/ui/components/GMDecisionCenter.jsx`.
- **Deadline authority:** `getTradeWindowSnapshot()` in `src/core/tradeWindow.js`. It reads normalized `league.settings.tradeDeadlineWeek`, whose canonical legacy default is week 9 in `src/core/leagueSettings.js`, and applies the repository's existing in-season cutoff (`currentWeek > deadlineWeek`). V1 does not add or hardcode a second deadline rule.
- **Trade-value authority:** `calculatePlayerValue()` in `src/core/trade-logic.js`, which delegates base valuation to the unified `getAssetValue()` authority before applying existing realism/request modifiers. V1 displays that numeric result and does not translate it into demand or draft-pick equivalence. The existing Trade Finder uses value 80 as the lower boundary of its factual `depth` value tier; V1 reuses that boundary as “meaningful value” eligibility rather than introducing a score.
- **Contract-term authority:** `buildPlayerDecisionPresentation()` in `src/core/playerDecisionPresentation.js`. Its contract presentation normalizes `contract.yearsRemaining`, then `yearsLeft`, then `years`, while retaining null/blank as unavailable. V1 uses the presentation result and requires exactly one recorded year for final-year context. `extensionDecision` values `extended`, `tagged`, and `let_walk` are the existing resolved set in `src/core/gmDecisionQueue.js` and suppress unresolved final-year context.
- **Role authority:** the same player-decision presentation reads `player.depthChart.role`, or canonical depth order fields (`depthChart.order`, `depthOrder`, `depthRank`). V1 never derives role from overall rating. Only displayed `Backup` and `Reserve` roles support the veteran-depth rule.
- **Standings authority:** `prepareStandingsView()` in `src/views/standingsView.js`. V1 uses its division ordering when available. Record and streak come directly from the supplied user team. It does not claim standings movement because no before/after snapshot is supplied.
- **Trade destination:** League Dashboard renders the existing trade workspace when its dashboard tab is `Transactions`; League Hub's existing `onNavigateTrade` callback seeds workspace view `Finder` and selects `Transactions`. Candidate metadata therefore records `{ view: 'Transactions', workspace: 'Finder', playerId }`. The current callback cannot focus an individual player, so `playerId` is preserved as metadata only.
- **Trade Center / Workspace:** `src/ui/components/TradeCenter.jsx` remains the trade interface, hosted by `src/ui/components/TradeWorkspace.jsx`. Existing legality stays authoritative through `src/core/tradeWindow.js`, `src/ui/utils/tradeLockReason.js`, and worker trade handlers; this feature performs no transaction.
- **Candidate/market helpers:** trade AI, Trade Finder, trade block, team strategic posture, and positional-needs helpers exist, but there is no canonical user-roster “review candidate” presentation helper suitable for neutral deadline context. Their buyer/seller, needs, surplus, target, and demand-style conclusions are intentionally not imported into V1.
- **Buyer/seller/team-need authority:** internal AI strategic posture and positional-need systems exist for AI valuation/matching. They do not establish neutral, player-facing user-team market demand, outside-team interest, or plausible destinations. V1 therefore makes none of those claims.

## V1 rules

A player is evaluated once per unique canonical ID after resolving supplied roster IDs against `league.players`. The player must belong to the supplied user team, be an active-roster or injured-reserve player according to Player Decision Presentation, and not be a free agent, practice-squad player, prospect/draft-class member, retired player, foreign-team player, or stale reference.

At least one explicit rule must then be true:

1. **Final-year veteran:** exactly one normalized contract year remains, recorded age is at least 27, retention is not already resolved as extended/tagged/let-walk, and canonical trade value is at least the existing value-tier boundary of 80.
2. **Veteran depth:** recorded age is at least 27, authoritative displayed role is Backup or Reserve, and canonical trade value is at least 80.

An expiring contract alone, age alone, role alone, or trade value alone is insufficient. Injury does not increase priority or imply interest.

Ordering is deterministic: unresolved final-year context first, then canonical trade value descending, depth-role relevance, recorded age as a late tie-breaker, and canonical player ID. Output is capped at five and deduplicates IDs and reason strings.

## UI, legacy, and performance

The compact section is integrated once in **League Hub → Overview**, immediately before general league stories. It renders only in the existing preseason/regular review window before or during the deadline week. It shows the canonical countdown, factual user record/division/streak when available, up to five review candidates, and the existing Trade Center entry point. Empty candidate output receives neutral copy; unsupported phases hide the section.

Legacy saves inherit the canonical normalized deadline default. Missing team, roster reference, standings, contract term, role, value inputs, or age only removes context/candidates. Numeric and string IDs compare canonically. No missing field becomes zero, expiring, depth, urgency, interest, or demand.

The helper prefilters the supplied user roster, resolves references through one player map, builds Player Decision Presentation and trade value once per unique eligible player, sorts only bounded roster candidates, and performs no persistence, archive, IndexedDB, worker, or full-league-per-player work.

## Intentionally omitted / remaining limitations

- Buyer/seller/contender/rebuilder labels, team-need matching, market demand, interest, rumors, destinations, offers, and trade likelihood.
- Redundancy inferred from rating, and any recommendation to trade.
- Individual-player focusing in Trade Center, because the current League Hub callback does not support it.
- Playoff-position prose beyond authoritative division ordering; no current selector exposes a stable “games outside” statement to this surface.
- New legality, valuation, AI, cap, contract, simulation, worker, persistence, or save-schema behavior.
