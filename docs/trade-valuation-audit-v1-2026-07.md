# Canonical Trade Valuation Audit & Characterization V1 (2026-07)

## 1. Executive summary

This audit found **three live numerical families** in trade-adjacent code:

1. **Unified engine asset scale**: `getAssetValue` / `getPlayerAssetValue` / `getPickAssetValue`, with players and picks intended to be comparable. Representative range: low-depth players about 300-450, average starters about 750-900, elite young QBs about 2,300-2,500, current R1 pick 950.
2. **Negotiation/package scale**: worker `calcAssetBundleValue` and trade-finder `evaluateMultiAssetPackageValue`, which start from the unified asset scale or pick matrix, then apply context modifiers and diminishing returns. Higher is better; direct comparison to raw single-asset values is invalid unless package context is included.
3. **UI-only estimate scale**: `TradeCenter.jsx` local `playerTradeValue`, an OVR^1.8 display heuristic. It is not the acceptance engine and can be more than 3x the current engine value for premium fixtures.

No broad gameplay rebalance was made. No acceptance thresholds, coefficients, pick tables, cap rules, deadline rules, persona effects, save schema, or worker response contracts were changed.

A narrow patch was **not** made because the live engine player paths already delegate through the established `getAssetValue` authority. The confirmed live inconsistency is a **label/display inconsistency**, not an acceptance-path wiring defect: the Trade Center value display is still a local estimate and is not the engine value.

## 2. Live-path call graph

### User-proposed trade from Trade Center

`TradeCenter` calls worker action `TRADE_OFFER` with `{ fromTeamId, toTeamId, offering, receiving }`.

Worker path:

`handleTradeOffer` → deadline guard → team-direction/need/cap context → `calcAssetBundleValue(offering)` and `calcAssetBundleValue(receiving)` → `_tradeValue(player)` → `getAssetValue(player)` for players; `getPickRoundValue` for picks → strategic, positional-need, cap-burden, draft-board modifiers → `evaluateMultiAssetPackageValue` → difficulty threshold → legality → `executeAcceptedTrade`.

Acceptance control: `offerVal >= receiveVal * difficulty/context multipliers` after quick-reject and draft-protection guards.

### Incoming proactive AI offers

`generateInboundOffersToUser` builds offers from AI trade-block assets.

Path:

`generateInboundOffersToUser` → `generateAITradeBlock` → local `playerValue` / `pickValue` → offer construction if AI asset value is within roughly 0.82x-1.45x of the requested user asset, with possible pick sweetener.

Accepting an incoming offer:

`handleAcceptIncomingTrade` → deadline guard → `evaluateTradeLegality` → `executeAcceptedTrade`.

Acceptance control: the user accepts/rejects; no fresh valuation gate is applied on accept. Valuation controls offer generation and filtering only.

### User counter to AI trade-block offer

`handleCounterTradeOffer` → `calcAssetBundleValue(userBundle)` and `calcAssetBundleValue(aiBundle)` → `evaluateCounterOffer` from `aiTradeEngine.js` → accept/reject/counter.

Acceptance control: AI accepts when `aiReceivesValue >= originalOffer.acquisitionValue * 0.90`, rejects below 0.60, and seeded counter/rejects in the middle band.

### AI offers for user trade-block players

`handleInitiateTradeBlock` / weekly generation paths use `getAITradeBlockTargets`, `buildAITradeOffer`, and `improveAIOffer`.

Path:

`computeAIPositionNeed` → `computeAIOfferValue` → `getAssetValue(targetPlayer)` → trade-request modifier → need/aggression/seeded variance → bundle assembly from `getAssetValue` players and picks.

Acceptance control: user accepts; generation requires assembled bundle to reach at least 70% of acquisition value.

### AI-to-AI trades

There are two AI-to-AI systems:

* Legacy/live `trade-logic.js`: `simulateAITrades` / matching code uses `calculatePlayerValue`, which now delegates to `getAssetValue` plus market-realism and trade-request modifiers. It primarily executes 1-for-1 player swaps.
* Pure `aiToAiTradeEngine.js`: uses `getAssetValue` plus front-office persona modifiers and deadline tension. It is covered by tests and may be wired by worker generation routines depending on phase/week.

Acceptance control: legacy swaps use ±10% tolerance after need/surplus matching. Pure engine uses contender/rebuilder thresholds, persona modifiers, deadline pressure, and generated trade validation.

### Trade Finder / recommendations

`TradeFinder.jsx` renders analysis derived by `buildTradeFinderAnalysis`.

Path:

`buildTradeFinderAnalysis` → `calculatePlayerValue` for player chips → pick matrix + future-pick decay for pick chips → `evaluateMultiAssetPackageValue` for packages → fit score sorting.

Acceptance control: none. It recommends candidate structures only; final acceptance still goes through worker trade handlers.

### UI trade-value displays

`TradeCenter.jsx` local `playerTradeValue` computes `Math.pow(ovr, 1.8) * positionMultiplier * ageFactor`. This is displayed to users as a value estimate and is **not** used by worker acceptance.

## 3. Function inventory

| Function | File | Status | Direct callers | User-facing flow | Scale/range | Inputs/modifiers | Higher better | Displayed | Acceptance control | Difficulty | Deterministic | Shares values |
|---|---|---:|---|---|---|---|---|---|---|---|---|---|
| `getPlayerAssetValue` | `src/core/trades/assetValuation.js` | Live canonical candidate | `getAssetValue`, tests | user trades, AI offers, AI-to-AI, trade finder through adapters | unified player scale, approx 0-2500+ | OVR, potential, age, position, contract, scheme, morale, direction, need | yes | indirectly | yes via callers | no direct | yes | shares with picks through `getAssetValue` |
| `getPickAssetValue` | `src/core/trades/assetValuation.js` | Live canonical candidate | `getAssetValue`, tests | AI block offers, pure AI offers, some recommendation paths | pick matrix, R1 950/R2 360/R7 4/default 8 with decay | round, season/year, current season | yes | indirectly | yes via callers | no | yes | shares with players through `getAssetValue` |
| `getAssetValue` | `src/core/trades/assetValuation.js` | Live canonical candidate | worker `_tradeValue`, AI engines, tests | most engine paths | unified asset scale | player/pick dispatch plus context | yes | indirectly | yes | no direct | yes | yes |
| `calculatePlayerValue` | `src/core/trade-logic.js` | Live adapter | AI-to-AI legacy, trade finder | AI-to-AI swaps; recommendations | unified value plus market realism/request modifier | `getAssetValue`, market realism, trade request modifier | yes | trade finder indirectly | yes in AI-to-AI legacy; no in finder | no | yes | player-only adapter |
| `_tradeValue` | `src/worker/worker.js` | Live worker adapter | `calcAssetBundleValue`, availability code | user proposed trades/counters | unified player scale | delegates `getAssetValue` | yes | response values only | yes | no direct | yes | player side shares unified scale |
| `calcAssetBundleValue` | `src/worker/worker.js` | Live local | user trade, counteroffer | user proposal and counteroffer acceptance | package scale after modifiers/DR | players, picks, team posture, needs, cap room, draft mode, comp picks | yes | response rounded values | yes | threshold external | yes | mixes player/pick but worker pick path uses `getPickRoundValue` |
| `getPickRoundValue` | `src/worker/worker.js` | Live local | `calcAssetBundleValue`, draft trade logic | user trade picks, draft trade paths | worker pick value envelope | round, week, team direction, projected range | yes | response rounded values | yes | no direct | yes | not identical API to `getPickAssetValue` |
| `evaluateMultiAssetPackageValue` | `src/core/trades/tradeValuationModifiers.js` | Live helper | worker, trade finder, tests | package scoring | sum with diminishing returns | sorted asset values and retention constants | yes | indirectly | yes through worker | no | yes | scale-preserving package adapter |
| `calculateTotalPackageScore` | `src/core/trades/tradeValuationModifiers.js` | Live/test helper | trade finder/tests | recommendations | package scale | player/pick value lookups, decay, DR | yes | indirectly | no direct | no | yes | configurable |
| `computeAIOfferValue` | `src/core/trades/aiTradeEngine.js` | Live pure | AI trade-block offer builders | AI offers for user block | acquisition target scale, typically 75%-112% of unified asset | target asset, trade-request modifier, positional need, aggression, seeded variance | yes | offer metadata | generation only | no | seeded deterministic | starts with `getAssetValue` |
| `evaluateCounterOffer` | `src/core/trades/aiTradeEngine.js` | Live pure | worker counter handler | counteroffers | threshold comparison, not value scale | precomputed values and acquisition target | higher AI receives better | no | yes | no | seeded in middle band | expects package values |
| `playerValue` | `src/core/trades/tradeBlockGenerator.js` | Live local | trade-block generation | inbound proactive AI offers | wrapper around shared value family | player | yes | offer metadata | generation/filter only | no | yes | appears unified via shared helper imports |
| `pickValue` | `src/core/trades/tradeBlockGenerator.js` | Live local | trade-block generation | inbound proactive AI offers | pick matrix/decay family | pick/current season | yes | offer metadata | generation/filter only | no | yes | comparable to playerValue in generator |
| `applyTradePersonaModifier` | `src/core/ai/frontOfficePersonaEngine.js` | Live modifier | pure AI-to-AI engine/tests | AI-to-AI | multiplicative modifier | team persona, asset type, context direction | yes | no | yes in pure AI-to-AI | no | yes | modifies base values |
| `applyDeadlinePressureModifiers` | `src/core/trades/tradeDeadlinePressure.js` | Live modifier | trade logic / AI-to-AI | late-season AI trade behavior | multiplicative modifier | week/deadline/posture | yes | no | yes in AI paths | no | yes | modifier only |
| `applyPositionalNeedModifiers` | `src/core/trades/tradePositionalNeeds.js` | Live modifier | worker package scoring | user proposal acceptance | multiplicative modifier | depth needs/team posture | yes | no | yes | no | yes | modifier only |
| `applyContractCapBurdenModifiers` | `src/core/trades/tradeFinancialModifiers.js` | Live modifier | worker package scoring | user proposal acceptance | multiplicative modifier | cap room, player contract burden | yes | no | yes | no | yes | modifier only |
| `playerTradeValue` | `src/ui/components/TradeCenter.jsx` | Live UI-only | TradeCenter render totals | displayed fairness estimate | OVR^1.8 UI scale, elite QB fixture 7408 | OVR, age, position | yes | yes | no | no | yes | does not share engine scale |
| `estimateTradeValue` | `src/core/trades/tradeFinderAnalysis.js` | Live fallback | trade finder chip builder | recommendations | prefers `calculatePlayerValue`; fallback OVR heuristic | player | yes | recommendation details | no | no | yes | player-only |
| `TradeLogicService.calculatePlayerValue` | `trade-logic-service.js` | Legacy/root test harness | root `.mjs` tests | none proven in Vite app | separate legacy scale | OVR/age/contract | yes | no | no | no | yes | no |

## 4. Numerical scale table

| Scale | Representative values | Acceptance threshold | Valid comparisons |
|---|---:|---|---|
| Unified asset | elite young QB 2380; veteran elite QB 734; young WR 1604; average LB 788; expensive veteran 169; current R1 950; future R1 760 | caller-defined | player vs pick is intended to be comparable |
| Worker package | average LB + R2 = 1112 after DR; raw sum would be 1148 | user proposal threshold = receive package x difficulty/context multipliers | only compare package-to-package under same context |
| AI offer acquisition | elite young QB neutral/medium seed 42 = 1953; young WR = 1317; average LB = 647 | generation must assemble at least 70% of acquisition value | acquisition target vs assembled bundle in same offer builder |
| Counteroffer | accepts at 90% of acquisition value, rejects below 60%, seeded middle | 0.90/0.60 | only package values computed by worker for that offer |
| UI estimate | elite young QB fixture = 7408 vs engine 2380 | none | display-only; invalid to compare to engine acceptance values |

## 5. Fixture comparison matrix

| Fixture | `getPlayerAssetValue` | `calculatePlayerValue` | `computeAIOfferValue` neutral/medium seed 42 | Notes |
|---|---:|---:|---:|---|
| Elite young QB | 2380 | 2436 | 1953 | elite asset; highest value in tested set |
| Veteran elite QB | 734 | 717 | 602 | age/contract drag is material |
| Young high-upside WR | 1604 | 1640 | 1317 | position need raises this to 1701 when WR is needed |
| Prime starter CB | 1284 | 1284 | 1054 | stable starter value |
| Average starter LB | 788 | 788 | 647 | near current R1 pick but below it |
| Replaceable veteran RB | 338 | 306 | 278 | low-premium age drag |
| Low-rated OL depth | 403 | 403 | 331 | cheap contract can exceed replaceable veteran |
| Expensive veteran S | 169 | 134 | 139 | heavy contract/age discount |

| Pick fixture | Matrix base | `getPickAssetValue` at 2026 | Notes |
|---|---:|---:|---|
| Current-year first | 950 | 950 | no decay |
| Future first, 2028 | 950 | 760 | two years out |
| Current second | 360 | 360 | no decay |
| Late sixth | 12 | 12 | low-value pick |
| Unknown round | 8 | 8 | default fallback |

| Package fixture | Raw components | Adjusted result | Agreement notes |
|---|---:|---:|---|
| Average starter + R2 | 788 + 360 = 1148 | 1112 | DR applies to second asset |
| Multiple depth players for one star | engine applies DR | context-sensitive | intended anti-spam behavior |
| Salary-heavy package | expensive veteran 169 | context may reduce further | cap-burden modifiers can apply in worker |
| UI elite QB display vs engine | 7408 vs 2380 | n/a | confirmed displayed estimate disagreement |

## 6. Difficulty analysis

Difficulty applies in `handleTradeOffer` to user-proposed trades. It modifies the AI's required value threshold, not the raw asset values.

| Difficulty | Multiplier | Example if AI gives 1000 value | Finding |
|---|---:|---:|---|
| Easy | 0.80 | user must offer 800 before other modifiers | easier acceptance; possible exploitation is a balance/product decision |
| Normal | 1.00 | user must offer 1000 | baseline |
| Hard | 1.15 | user must offer 1150 | stricter acceptance |
| Legendary | 1.30 | user must offer 1300 | present in code but outside requested Easy/Normal/Hard matrix |

Custom `settings.tradeDifficulty` further multiplies this by `0.7 + slider/100 * 0.8` when finite.

Difficulty does **not** directly modify `getAssetValue`, pick matrix values, UI display values, or AI trade-block offer generation.

## 7. Confirmed inconsistencies

### Confirmed bug

None patched in this PR.

### Inconsistent but live domain behavior

* Worker package scoring is not a raw asset score. It layers strategic direction, positional needs, cap burden, draft-board penalties, compensatory-pick discounts, and diminishing returns. This is valid domain behavior but needs named types/adapters to prevent accidental raw-vs-package comparison.
* AI offer acquisition value is a willingness-to-pay value, not a raw market value. It intentionally applies need, aggression, trade-request discount, and seeded variance.
* Incoming proactive offers are valuation-gated at generation time but are user-accepted without a fresh value gate. This is intentional user agency unless product decides otherwise.

### Display inconsistency

`TradeCenter.jsx` displays a local `playerTradeValue` estimate that does not match engine acceptance valuation. Characterization test documents an elite young QB at 7408 UI estimate vs 2380 engine value.

### Product/balance decisions

* Easy multiplier at 0.80 can allow trades below Normal fair value. This is difficulty design, not a wiring bug.
* Expensive veterans can be deeply discounted. Current unified asset valuation does penalize them strongly; whether it is too strong or too weak is balance.

### Dead/legacy/uncertain

* Root `trade-logic-service.js` and `tests/test_trade_logic_service.mjs` appear legacy and not part of the Vite worker/UI live path.
* Some source-level worker cutoff tests exist; they are not valuation tests and should not be treated as proof of behavior.

## 8. Exploitability assessment

No confirmed three-scale live acceptance exploit was reproduced in this PR. The previously reported worst issue (180-scale players mixed with 950-scale picks) appears mitigated in current code because `calculatePlayerValue` and worker `_tradeValue` delegate to `getAssetValue`.

Remaining exploit risk is **medium**:

* Easy difficulty intentionally lowers threshold to 80% before other modifiers.
* UI display values can mislead users about engine fairness.
* Worker pick valuation uses `getPickRoundValue` while canonical pick assets use `getPickAssetValue`; if envelopes diverge, future patches could reintroduce inconsistent player/pick treatment.

## 9. Dead and legacy code findings

* Root-level `trade-logic-service.js` is covered by root `.mjs` tests but no live SPA path was found.
* `TradeCenter.jsx` value display is live but display-only, not dead.
* `tradeValuationModifiers.js` header still says integration is used by trade finder only, but worker `calcAssetBundleValue` also uses `evaluateMultiAssetPackageValue`. This is documentation drift, not behavior.

## 10. Canonical candidate assessment

**Outcome A — One canonical function already exists.**

Best candidate: `getAssetValue(asset, league, context)` in `src/core/trades/assetValuation.js`.

Reasons:

* It values players and picks together.
* It is already used by worker `_tradeValue`, AI trade-block pursuit, pure AI-to-AI, and the `calculatePlayerValue` adapter.
* It is deterministic and pure.
* It supports player context including direction and positional need.
* It applies contract, age, position, potential, control, scheme, morale, and draft-board modifiers.
* It is testable without worker/cache setup.
* It preserves old saves because it consumes existing player/pick shapes and legacy `year` fallback for picks.

Limitations before full canonical migration:

* Worker pick scoring still goes through `getPickRoundValue`, not `getAssetValue(pick)`.
* Package values need an explicit named type because `evaluateMultiAssetPackageValue` changes the unit from raw asset score to package-adjusted score.
* UI display uses a separate heuristic and should be relabeled or moved to a shared display adapter.
* Difficulty belongs outside raw asset value by design.
* Deadline and persona modifiers should remain explicit modifiers, not hidden inside raw value.

## 11. Recommended implementation sequence

1. Add named value contracts/types in docs or code comments: `RawAssetValue`, `PackageAdjustedValue`, `AcquisitionWillingnessValue`, `DisplayedEstimateValue`.
2. Route worker pick valuation inside `calcAssetBundleValue` through `getAssetValue(pick, null, { currentSeason })` unless review confirms `getPickRoundValue` has intentionally different draft-board semantics.
3. Replace or relabel `TradeCenter.jsx` `playerTradeValue` display as an estimate, or feed it from a worker valuation preview endpoint.
4. Add a pure adapter for worker package valuation so tests can exercise exact user proposal thresholds without cache-heavy worker integration.
5. Add integration tests for one user proposal including player + pick across Easy/Normal/Hard once the package adapter is exposed.
6. Decide product stance on Easy exploit tolerance and whether user-facing fairness should disclose difficulty-adjusted required value.

## 12. Explicit do-not-touch list

This PR intentionally did not change:

* acceptance thresholds;
* difficulty balance;
* player-value coefficients;
* pick-value tables;
* salary-cap rules;
* team-need weights;
* front-office personality effects;
* trade deadline behavior;
* save schema;
* worker request IDs;
* worker response shapes;
* UI layout or interaction model;
* legacy code deletion.

## 13. Tests added

Added `tests/unit/tradeValuationAuditCharacterization.test.js` covering:

* same player fixtures across live player valuation functions;
* same pick fixtures across pick valuation functions;
* mixed package diminishing returns;
* Easy/Normal/Hard threshold characterization;
* position-of-need effects;
* age and contract effects;
* determinism and no invalid values;
* stable ordering inside a valuation function;
* counteroffer acceptance thresholds;
* UI displayed fairness disagreement with engine valuation.

## 14. Any narrow patch made

No production patch was made. Only characterization tests and this audit document were added.

## 15. Deferred product decisions

* Should Trade Center display engine-required value, raw market value, or clearly labeled estimate?
* Should Easy remain at 0.80, move closer to Normal, or be shown as a difficulty discount?
* Should incoming proactive AI offers be re-valued on accept, or is generation-time validation enough?
* Should draft-board pick protection remain a worker-local modifier or be moved to a package valuation adapter?
* Should front-office persona/deadline modifiers be visible to users as reasons?
