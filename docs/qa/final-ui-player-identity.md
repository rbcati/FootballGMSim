# PR #1807 — final UI player identity compatibility

This follow-up supersedes the outstanding merge holds in the earlier identity reports. It changes creation-exposed identity consumers only; it does not migrate saves or replace stored IDs. Validation results and the final review disposition are recorded below after execution.

## Reproductions on reviewed head 4e721e18

Production changes were made only after these focused reproductions failed:

| Boundary | Before repair | Regression |
| --- | --- | --- |
| Bulk release modal | Two normal-generated selections became an empty callback; the real worker was never called. | `FinalIdentityConsumers.test.jsx`, `finalUiIdentity.worker.test.jsx` |
| Injury report | One-week punter/third-QB/depth-RB/depth-WR injuries produced four risks and Critical. The same roster with numeric IDs produced one risk and Needs Attention. | `FinalIdentityConsumers.test.jsx` |
| Finder adjustment | An already-selected opaque player was suggested again instead of the eligible alternative; numeric-zero alternatives were ignored by the component guard. | `FinalIdentityConsumers.test.jsx` |
| Repeated release, team zero | Releasing a detached player again reported SUCCESS and charged dead cap again because Number(null) equals zero. | `finalUiIdentity.worker.test.jsx` |
| Roster depth auto-build | Numeric equality failed to associate optimistic assignments with opaque players. | `FinalIdentityConsumers.test.jsx` |
| Numeric-zero release selection | Bulk confirmation dropped player zero; single confirmation did not call the action. | `RosterBulkRelease.test.jsx` |
| Offseason FA attribution | Released/moved opaque player IDs were recorded as NaN. | `freeAgencyAttributionIdentity.worker.test.js` |
| FA competition attribution | A real daily AI bidding pulse omitted the user's opaque-ID bid (31 teams instead of 32). | `freeAgencyAttributionIdentity.worker.test.js` |
| Profile draft transaction readers | A historical draft row for a real opaque player lost its name; numeric counterpart passed. | `transactionReaderIdentity.worker.test.js` |

Corrected pre-fix runs: final consumer suite 9 failed / 2 passed; bulk worker flow 2 failed; numeric-zero bulk 1 failed / 2 passed; numeric-zero single release 1 failed / 3 passed; FA attribution 2 failed / 2 passed; transaction reader 1 failed / 1 passed. Early scratch runs with fixture errors were discarded and are not used as defect evidence.

## Changes and boundaries

- `BulkReleasePreviewModal.jsx` deduplicates and validates using canonicalIdKey, retaining the first original player object and its original ID. Selection count, preview financials and release rules are unchanged.
- `injuryReadinessModel.js` preserves IDs through depth construction/sorting, canonical roster indexes, starter membership and injured-list deduplication. The exact four-injury fixture now has only the punter replacement risk. Injury generation, duration, recovery and severity thresholds are unchanged.
- `tradeFinder.js` excludes every canonically selected player and invalid identity before the existing availability/ranking logic. No-alternative advice is explicit, including when the original value-gap advice still applies. `TradeFinder.jsx` uses the same identity comparison and validates numeric-zero IDs without truthiness. Existing needs, ordering and valuation stay intact.
- `Roster.jsx` retains valid zero IDs in confirmation and associates auto-built assignments with the correct player. Single release validates identity instead of truthiness.
- Worker release validation distinguishes a detached player from team zero, so repeat attempts fail without duplicate transactions/dead cap. Offseason release/movement snapshots retain player.id; competition events match the user's actual bid canonically.
- Worker profile/draft-class transaction readers use canonical keys for cache/model lookup, retaining the stored ID in responses. This repairs attribution only; draft selection, rendering and strategy are untouched.

## Bounded static audit

Inspected reachable roster decisions, injury/readiness, Finder/Builder/Trade Center selection, worker proposal/accept/counter/execute, free-agent offers/ledger, release/waiver handlers, and transaction attribution. Searches included Number(player.id), Number(playerId), selection map(Number), numeric player map keys and numeric equality. Each additional changed consumer above has a failing reproduction and a focused regression.

Remaining numeric conversions in these flows identify teams, scores, ratings, money, weeks or years; those domains are intentionally numeric. Trade pursuit/counter arithmetic that contributes to an RNG seed is not an entity lookup and was left unchanged to avoid altering AI strategy. Draft selection's historical numeric producer and scouting randomization are outside this bounded UI-to-worker audit; no new defect in those paths is claimed or repaired. They remain separate investigation work alongside the previously documented draft-rendering issue.

The audit is bounded, not a claim that every identity assumption throughout the simulation has been eliminated.

## Save and browser evidence

Real component interactions feed the actual worker in normal and numeric fallback franchises. Bulk cancel makes no mutation; confirm releases exactly two players, records their original IDs, and survives SAVE_NOW/LOAD_SAVE. Duplicate/unknown/invalid/repeated-release requests cannot release unrelated players. Unrelated player fields are byte-equal except the existing legitimate depthChart/depthOrder repair on affected-team survivors; other teams remain wholly unchanged.

The new production-preview Playwright scenarios create isolated fresh browser contexts and fresh saves only. The 2026 case uses actual Roster selection/preview/cancel/confirm, verifies 53 to 51 and exact release transactions after reload, then seeds controlled one-week injuries in that new test-owned save to check the actual Injury Report. The 2031 case selects actual generated players using production valuation/ranking, seeds a rebuilding market and availability in that new save (no ratings, salaries or ID rewrites), then exercises Finder → Builder → Summary → Builder, actual proposal/acceptance, both roster mutations, transaction attribution and reload. The advanced salary-cap setting is selected through supported onboarding UI. Existing user profiles/saves are never opened.

Independent generation/year/slot tests retain the original fallback save identities, contracts, ratings, records, generation IDs, draft-pick seasons and ownership. There is no save migration or historical pick rebasing.

## Independent gameplay issues

Initial unsigned population, draft-page rendering, cap-screen redesign and simulation balance remain outside this PR. Activating the normal generator does not create a free-agent population; released players are used to test the existing free-agent membership/resolution paths. No new population algorithm or valuation strategy is introduced.

## Validation and merge gate

Pending final full-suite/CI and review results. Do not merge on the basis of the focused tests alone. The PR remains open for independent review.
