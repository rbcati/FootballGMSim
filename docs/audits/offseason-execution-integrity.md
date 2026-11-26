# Offseason execution integrity (follow-up to #1808)

PR #1808 fixed how offseason decisions are **recorded**. The Nov 23 playtest showed they were never
**executed**, so a franchise could not finish an offseason. Each root cause below was reproduced in a
real browser (Playwright driving a built bundle) before it was changed.

## Root causes

| # | Symptom | Verified root cause | Fix |
|---|---------|--------------------|-----|
| 1 | Confirm extension does nothing / random agent refusals | (a) The preview sent client-side `estimateDemand` terms, which were below the worker's demand, so the agent declined. (b) `calculateExtensionDemand()` draws its term length and value from the global RNG, so each quote or confirm re-rolled the demand, and the same terms could be accepted on one call and refused on the next. (c) Feedback rendered at the top of the page, away from the preview. | New `GET_EXTENSION_QUOTE` and one shared `evaluateExtensionTerms()` used by quote and commit. Demand is memoized per player, season and ratings; the valuation is unchanged. Commit is idempotent (a repeated confirm writes no second `EXTEND`). Feedback shows inside the preview, and the preview closes on commit. |
| 2 | Let Walk players stay on the roster forever; FA pool ≈ 1 player | **No contract-expiry step existed anywhere in the code.** Contracts never decremented and expired contracts were never released (repo history has no decrement either). | `src/core/contracts/contractExpiry.js` plus `executeContractExpiry()` at the re-signing → FA transition. Expiring contracts that are not extended or tagged run out. Every other contract that was not re-signed in this window loses one year. One `CONTRACT_EXPIRED` transaction is logged for each release. |
| 2b | Defer reserves cap forever; Financials shows "Let Walk 0" | The Re-signing Center reduced "projected cap room" for every deferred player. The Financials dashboard read only the recommendation tier and ignored committed decisions. | Deferred players do not reserve cap, because they enter FA when the window closes. Financials now overlays committed decisions (tier, reason and a "Decision:" line). |
| 3 | Advance silently refuses | `window.confirm` was the only feedback, and declining it (or a browser suppressing it) did nothing visible. The "key" definition also differed: Advance used OVR ≥ 74, while the center's card used OVR ≥ 82. | One shared `isKeyExpiringPlayer`. The confirm names every unresolved player. Declining it leaves a persistent alert that names them. Every other early return also shows a message. The center adds a one-click **Let all remaining walk** action. |
| 4 | Team 19 at 51/53, which blocks 2027 | Root cause is #2: the FA pool was nearly empty, so AI teams that lost players to retirement could not refill. | With expiry, the pool holds about 295 free agents at FA day 1, and `ensureMinimumRosters` refills every AI team. |
| 4b | A failed "Sim to Season" mutated the save | The auto-draft flushed picks, rookies and transactions before the rollover's preflight refused. | The draft stage and the rollover in Sim-to-Season run as one atomic transition: deferred `flushDirty`, staged `Transactions`/`News` writes (`beginDirectWriteStaging`), a cache snapshot, and a full rollback on refusal. Staged rows commit inside the rollover's single league transaction. |
| 5 | Draft page React #185 | Radix `ScrollArea` under React 19 loops between its scrollbar visibility state and ref-callback state when a list sits near its max height. This depends on the data (row count), not on code, which explains Nov 5 working and Nov 23 crashing. No draft code changed between #1807 and #1808. | `ui/scroll-area.jsx` is now a native overflow container with the same API. |
| 5b | Draft History empty after 224 picks | `logDraftPickTransaction` did `Number(playerId)` and returned on `NaN`, which dropped every opaque ID. | Numeric legacy IDs stay numbers and opaque IDs stay strings. |
| 5c | Manual picks impossible (Draft buttons disabled) | `useDraftBoard`'s pick-flash effect listed `pickFlash?.overall` in its own deps, so its cleanup cancelled the 700 ms timer and the room stayed in `PICK_MADE`. | The timer lives in a ref and survives re-renders. |
| 6 | Super Bowl never shown | The worker **did** simulate it (champion +1 W). The same advance flips the phase to `offseason_resign`, and the reducer then cleared `lastResults`, so the UI showed "Week 0 · 0 games". | `seasonFinale` state is kept across the phase flip. The Season Complete splash shows the final score, with a fallback to the persisted week-22 schedule row after reload. LiveGame falls back to the authoritative results. |

## Documented re-signing gate

Unresolved expiring players (**Pending** or **Decide Later**) **may carry into Free Agency**: when the
window closes they leave the roster and enter the free-agent pool, where the user can still sign them.
Advance never refuses silently. If anything is unresolved, the confirm lists every key and non-key player
by name. Cancelling leaves a persistent alert that names them, and the Re-signing Center offers
**Let all remaining walk (N)**.

## Scope notes

- No salary-cap formulas, trade valuation, game-plan logic or sim-engine statistics were changed. No IndexedDB
  schema, store or index changed. Released players gain optional `lastTeamId`/`contractExpiredFromTeamId`
  fields. Existing saves load unmodified, and the expiry step runs only at the next re-signing → FA transition.
- Atomicity covers the failing transition: the auto-draft plus the rollover inside "Sim to Season". Earlier
  phases of a multi-phase batch, such as regular-season weeks, are legitimate progress and stay saved.
