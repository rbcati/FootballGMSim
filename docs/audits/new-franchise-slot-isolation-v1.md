# New franchise slot isolation V1

Audit base: `6b5b509edb5827e6a9027804b41fc9608048fe8e` (fetched main, October 24, 2026).

## Persistence ownership and causal trace

`SaveSlotManager` classifies cards from `footballgm_slot_N_meta` in localStorage. Its empty-slot CTA calls `App.onNew`; it does not generate or save a league itself. Before this fix, that callback assigned both pendingNewSlot and activeSlot while retaining the existing worker/UI league.

App's setup branch required `!leagueReady`, so a loaded career prevented the team picker from appearing. Independently, the pending-slot effect called `shouldFinalizeNewSlotBootstrap` with only the league and slot. The helper accepted any playable view, including the existing career. The effect sent SAVE_SLOT, assigned the target active, and cleared pending without awaiting persistence. App's active-slot metadata effect could also publish the old team's record immediately. The beforeunload save and normal save controls then had the wrong active target. These are multiple consequences of assigning an uncreated slot an active identity.

Worker `handleSaveSlot` deliberately copies every store when source and target IDs differ, preserving the generation ID. It flushes the source, snapshots it, copies into the target DB, changes the active worker database, and publishes save/manifest updates. That is valid for an explicit copy, but made the UI's accidental SAVE_SLOT an actual persisted duplicate. This function remains available for deliberate Save Changes operations.

`handleNewLeague` generates a unique temporary league database, mints a franchise generation ID, persists its meta and entities, publishes the global save entry last, then returns FULL_STATE carrying bootRequestId. `handleLoadSlot` delegates to the normal load handler. NEW_LEAGUE, SAVE_SLOT and LOAD_SLOT run through the worker's existing sequential message queue, so a return-to-existing load queues behind an in-flight creation rather than switching its database during an awaited write. UI boot invalidation rejects the late creation response; it does not undo an already-created temporary database. `src/db/index.js` owns the IndexedDB connections: `FootballGM_Meta/saves` is the global save index; `FootballGM_League_<id>` holds each league's stores. Worker manifest messages update `gmsim_save_manifest` in localStorage; this and the slot-card metadata are UI projections, not additional authoritative franchise storage.

`saveSlotStorage.js` is the legacy numeric-slot/localStorage contract (`nflGM4.*`). This change does not alter it or invoke a new migration. `franchiseGeneration.js` preserves existing IDs and explicitly chooses preserve/mint on copies. No schema, DB version, existing generation ID, or old-save payload is changed.

The older phase-based bootstrap selectors (`shouldStartNewSlotInitialSave`, `canPersistActiveSlot`, and the save-event finalization branch) have no production callers that write a pending slot; they remain covered by their existing tests. `hydrateLeagueSnapshot` can change UI readiness, but cannot authorize the new response-driven opening save.

The worker hook resolves request promises and separately applies FULL_STATE boot-request guards and epoch/generation guards to state updates. A playable league or a resolved promise alone is insufficient proof: cancelled/discarded, stale, missing-ID and same-generation responses must not authorize the initial slot save.

## Correction

- Keep the intended slot pending throughout setup; setup renders even with a loaded playable league.
- Keep the setup component mounted during creation. Its synchronous ref prevents duplicate Start Dynasty submissions before React updates `creating`.
- Finalize only through the current NEW_LEAGUE success callback, validating FULL_STATE, boot request ID, playable payload, and a fresh generation ID.
- Await the opening SAVE_SLOT. The worker verifies the expected generation before any flush/copy, publishes its storage-scope update, then settles the request with SAVED. Existing fire-and-forget save callers retain their interface.
- Publish active selection and card metadata only after success. Block pending-slot metadata and unload autosaves. Cancel/error invalidates the creation request and leaves the target unassigned; the existing career can be reopened normally.

No initialization deletes or rewrites an existing franchise. The existing temporary-generation then slot-copy protocol remains the persistence mechanism. No migration is required; legacy saves without generation IDs continue to use existing load-time backfill.

## Remaining generation/fallback risks

Normal NEW_LEAGUE falls back to `buildDefaultLeague()` when generation validation fails. The audit confirmed that the core generator omits `phase`, while `getPlayableLeagueValidation` requires it. Thus a normal core-generated league is currently rejected at this boundary. Correcting that boundary activates different rosters and changes existing depth-chart smoke behavior; it is deliberately deferred rather than changing generation behavior in this PR.

The existing fallback builder already supports a selected team/year. This PR passes those options through (previously the worker called it with no arguments, silently replacing the selected year with 2026). The finalization proof also checks requested team and year. Other settings continue through the worker's existing settings normalization.

Remaining fallback limitations: offline rosters are static templates, so independent new generations can start with identical player IDs/attributes; that alone does not prove a cross-slot copy. The fallback's draft-pick helper still uses its fixed starting-year constant, and fallback structure is fixed at 32 teams. These require a separate generation audit, especially for custom years/league sizes. No player-generation, draft-valuation, simulation, cap, or AI algorithms are changed here. The separate explicit safe-starter path also commits fallback data; ordinary new-franchise creation now stays in its setup/request lifecycle and cannot be finalized by an existing playable view.

NEW_LEAGUE can leave a temporary generated DB/global save entry if the browser is interrupted after generation but before the opening slot save. The intended slot remains unassigned until SAVE_SLOT. This pre-existing temporary storage behavior is not a second save system. The current copy implementation is not a single transaction across two IndexedDB databases; an interruption during the actual initial copy can leave an unlisted partial target DB. General cross-database crash recovery is outside this focused UI isolation repair.

## Verification

The pre-fix browser run on audited main failed at the missing team-picker assertion. Its snapshots show Detroit at Week 6, 2–3, in both slots with identical generation ID `franchise_5a8b128f-c160-4f21-82f8-ced3ff75f797`. See [before](slot-isolation-evidence/pre-fix-before-slot-1.json) and [after selection](slot-isolation-evidence/pre-fix-after-select-slot-2.json).

The corrected run passed all six browser cases (four new slot cases plus the existing desktop first-week and mobile HQ cases) in 1.4 minutes. The completed second franchise selects Miami, 2031, Hard; old/new stores survive independent reloads. The onboarding-tour completion flag was seeded for deterministic navigation. An unconditioned smoke attempt was blocked by the existing tour overlay intercepting the progression button; existing regression assertions were not changed. The desktop Manage Saves handler is invoked through its DOM control because an existing HQ stacking context covers the menu.

Snapshots compare SHA-256 of every store without omitting fields. Normal initial load-time migrations are completed and flushed before establishing each loaded-save baseline; an additional snapshot records Slot 2 immediately after creation. See [empty target](slot-isolation-evidence/post-fix-after-select-slot-2.json), [created second franchise](slot-isolation-evidence/post-fix-completed-slot-2.json), and [loaded second franchise](slot-isolation-evidence/post-fix-loaded-slot-2.json).

See the PR for final unit, durability and deployment command results. The browser regression uses isolated Playwright storage, deterministic worker generation seeds, real worker simulation/save/load, SHA-256 fingerprints and row/byte counts of every persistent store, plus inspectable metadata snapshots, cancellation, injected worker error, repeated clicks, interruption and reload. It compares every store for the old career, including contracts, roster, transactions, games and history. Snapshot attachments are generated by Playwright, rather than checking generated franchise blobs into the repository.


Final verification used Node 22.23.4:

| Command/check | Result |
| --- | --- |
| Focused bootstrap/hook/legacy slot unit tests | 28 passed |
| `npm run test:unit -- --maxWorkers=1` | 524 files / 6,446 tests passed; one existing file/test skipped (327.50s) |
| `npm run durability:test -- --maxWorkers=1` | 9 files / 98 tests passed (378.10s) |
| `npm run test:soak -- --maxWorkers=1` | 8 files / 103 tests passed (3.17s) |
| Targeted production-preview Playwright (slot isolation + first-week smoke) | 6 passed (1.4m), with onboarding tour complete |
| `npm run build` | passed; expected large-chunk warning |
| `npm run check:deploy` | passed: Netlify artifact/routing parity, production CLI build, deploy-preview CLI build |
| `git diff --check` | passed |

The browser run used an immutable production bundle served on local port 4174 with system Chromium. The baseline ran on a separate audited-main worktree and origin. Earlier validation attempts interrupted by dependency reinstalls/resource contention were discarded and superseded by the clean complete runs above. No live user storage was accessed and no deployment was performed. Longer manual 5/10/20-season CLI campaigns were not run.
