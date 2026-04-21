# Football GM Sim phased hardening backlog

This backlog is intentionally scoped to reliability and core GM loop UX before any broad feature expansion.

## Must-fix (Phase 1: stability and trust)

1. **Franchise bootstrap state clarity + recovery**
   - **User problem:** Loading a save or starting a franchise can look stalled with unclear next action.
   - **Fix:** Add explicit in-progress slot state, contextual retry actions (retry load vs retry setup), and visible recovery copy.
   - **Manual verify:** Start/load a slot, interrupt network/worker, confirm clear error + retry path.

2. **Loading-gate reliability around save metadata writes**
   - **User problem:** Corrupted local slot metadata can throw during autosave metadata sync and create brittle startup behavior.
   - **Fix:** Guard slot metadata parse/write path and default safely.
   - **Manual verify:** Corrupt `footballgm_slot_X_meta` in localStorage and ensure app still enters playable franchise.

3. **Error action routing should not mutate simulation state incorrectly**
   - **User problem:** Global error retry currently uses week-advance action even for load/setup failures.
   - **Fix:** Route retry by context (load/new/reload) rather than simulation actions.
   - **Manual verify:** Force load failure and ensure retry does `loadSlot`, not `advanceWeek`.

## Should-fix (Phase 2: core GM loop UX, highest value first)

1. **Dashboard quick triage strip**
   - Show team need summary, cap red flags, and pending decisions at top of HQ.
2. **Transactions IA split**
   - Separate Team actions vs League feed vs Trade workspace with clear labels.
3. **Box score affordances**
   - Standardize “Open Game Book” entry points on dashboard ticker, weekly results, and schedule cards.
4. **Roster/depth chart flow friction**
   - Keep depth and roster action bars pinned while scrolling on dense tables.

## Nice-to-have (Phase 3+)

1. Visual hierarchy standardization pass (cards, headers, spacing, badges).
2. Mobile-first 375px optimization for dense roster/contracts tables.
3. Performance pass: memoize heavy transforms in dashboard and transaction screens.
4. Accessibility pass: landmark structure + heading levels + keyboard trap audits.

## Manual QA checklist (run after each reliability/core-loop batch)

### Dashboard
1. Load an existing slot and verify HQ renders without console errors.
2. Confirm top actions: Advance, Sim to phase, Save, Slots, Reset.
3. Confirm error banner retry uses contextual action (load/setup/reload).

### Roster management
1. Open Team → Roster.
2. Release/sign/update a player.
3. Verify state reflects in roster count and salary cap panel.

### Depth chart edits
1. Open Team → Depth Chart.
2. Make several rapid reorder changes.
3. Verify final ordering persists after navigation + save/load.

### Game result review
1. Sim one week in regular season.
2. Open result from ticker and Weekly Results center.
3. Verify box score opens with recap + team/player stat sections.

### Transactions
1. Open Transactions center and inspect latest actions.
2. Submit/accept/reject one trade flow.
3. Confirm notifications and roster/cap updates are consistent.

### Draft flow
1. Enter draft phase.
2. Open Draft/Draft Room, make user pick, simulate AI picks.
3. Confirm next pick state and board updates are deterministic.

### Free agency
1. Enter Free Agency.
2. Submit offers/sign player.
3. Advance FA day and verify contract/cap changes and transaction log.

### Week advance
1. Advance week from preseason/regular/playoffs.
2. Verify deterministic week progression and standings update.
3. Confirm no duplicate simulations from rapid clicks.
