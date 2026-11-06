# Offseason decision integrity verification

Base: `255a0d708cd821a80ec8419e2e7ce6a9efcf19ed` (verified checkout before edits).
Branch: `fix/offseason-decision-integrity`.

## Confirmed causes and scope

- ContractCenter, Roster management controls, and Financials rejected valid numeric team ID 0; Roster also hid management controls for player ID 0.
- ContractCenter's offseason early return hid its action feedback.
- Management and tag feedback now requires the worker's STATE_UPDATE acknowledgement. Accepted extensions and tags already persist their decision in the worker; redundant follow-up management mutations were removed.
- The worker's management handler flushes intent without releasing the player. Extension/tag handlers own contract mutations, cap recalculation, transactions and flushes. These handlers and save schema are unchanged.
- Advance uses request/response in useWorker, but App discarded its promise. App now catches failures and resets its local guard. Native unresolved-contract confirmation remains, pending browser acceptance/cancellation verification. The reported six-click incident is not yet independently reproduced.
- The modal's Reject button only closes the offer; its label now says Close offer.

## Verification status

- Node 22 runtime installed separately for repository engine parity.
- Production build passed (42.31s), expected large-chunk warning.
- Component regression run: 3 files, 25 tests passed (14.08s), including numeric team/player zero and opaque player identities.
- Existing fresh-franchise first-week browser smoke passed (1.4m).
- Existing mobile HQ acceptance failed tooltip placement: y=177.140625, expected >=201.75. Outside changed contract workflow; assertion unchanged.
- Initial Buffalo season-progression browser attempt timed out at Week 12 during active simulation before reaching re-signing. Rerun has a longer bounded simulation timeout.
- Worker integration, full unit suite, durability suite and Buffalo/Miami browser regression verification are in progress. No pass is claimed yet.
- Netlify preview URL, deployed head and live save/reload evidence: pending draft PR deployment.

This PR must remain draft and unmerged until outstanding checks and live preview verification are recorded.
