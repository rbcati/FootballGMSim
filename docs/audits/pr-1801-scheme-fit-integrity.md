# PR #1801 — Scheme Fit Integrity V1

Starting main: `e34b8084477bf979b81e0ce4c8ddd0aa90ff819a` (fetched, not assumed).
PR #1801 and requested branch did not exist at initial inspection.

## Confirmed defects and scope

The original evaluator read `player.ratings || player`, never `attributesV2`.
The name wrappers did not recognize canonical IDs. Team roster readouts used
separate naming/position rules, and the full-state roster forwarded stored fit.
Lineup selected starters correctly; its local scheme-name resolver omitted
established legacy aliases. Coaching identity had yet another resolver and
mapped DB to S while canonical positional rules map DB to CB.
`playerEvaluation` independently inflated fit with team need and play-call
preferences; its displayed score now uses scheme-core and does not add those
unrelated opportunity bonuses. This module is consumed by presentation only
(Roster, FreeAgency and PlayerComparison), not contract pricing or AI selection. FreeAgency now supplies
its actual user-team scheme context to this presentation evaluator; pricing,
demand, offer scoring and AI targets keep their existing authorities.

Intended code scope after the consumer audit: scheme-core, a small frozen
compatibility helper, immediate UI readout/resolver consumers, worker roster
view construction, and explicit compatibility imports in worker/AI valuation.
The roster tooltip identifies its existing adjustment as display OVR, rather
than implying an on-field ratings bonus, uses the player’s scheme family,
and does not call a non-neutral score neutral when a summary omits bonus fields.
No simulation algorithms, constants, eligibility, depth ownership, attribute
migration/generation, OVR formulas, database schema or protocol changes.
`SchemeSelection.jsx` has no live imports and was inspected but left untouched.
Its obsolete source comment is not an active user-facing promise.

## Attribute compatibility matrix

All rows below are real legacy scheme weight keys and legacy rating keys.
"None" means no established semantic V2-to-legacy projection was found in
attributeMigrator, playerDerivedRatings, weekSimulationBridge, playerEvaluation,
positionalMultipliers, simulation or player generation. Buckets/OVR composites
are not inverse attribute conversions.

| Scheme weight key | Legacy | Exact AttributesV2 key | Canonical projection | Original missing behavior |
|---|---|---|---|---|
| throwAccuracy | yes | none (short/deep are distinct) | none | omitted |
| awareness | yes | none | none | omitted |
| intelligence | yes | none | none | omitted |
| throwPower | yes | throwPower | exact key | omitted even when V2 present |
| catching | yes | none | none | omitted |
| catchInTraffic | yes | catchInTraffic | exact key | omitted even when V2 present |
| speed | yes | none | none | omitted |
| acceleration | yes | none | none | omitted |
| juking | yes | none | none | omitted |
| trucking | yes | none | none | omitted |
| passBlock | yes | none (footwork/strength are distinct) | none | omitted |
| runBlock | yes | none | none | omitted |
| runStop | yes | none | none | omitted |
| passRushPower | yes | none (passRush is distinct) | none | omitted |
| passRushSpeed | yes | none (passRush is distinct) | none | omitted |
| coverage | yes | none (press/zone are distinct) | none | omitted |

Resolution authority: `resolveSchemeAttribute` in scheme-core. Valid finite
numbers in (0,100] are read per exact key: nested legacy rating, flat legacy
attribute, then AttributesV2. This preserves valid legacy/migrated evidence and
lets missing/invalid legacy keys use actual exact-key modern evidence. The
existing weighted average, rounding and 0–100 scale remain unchanged. Invalid,
zero, negative and >100 values are omitted. No observed weighted attributes
means 50. Missing attributes are never synthesized from OVR or other skills.
Inputs and their nested records are not mutated. Tooltip topAttr now identifies
observed evidence rather than advertising an absent highest-weight attribute.

`ensureAttributesV2` synthesizes attributes from overall and seeded jitter; it
is not an appropriate scheme-fit projection and is deliberately not called.
Modern-only QB throwPower and WR catchInTraffic produce meaningful non-neutral
readouts. Modern-only defenders/OL/RB with no exact weighted keys stay neutral:
there is no defensible repository projection. RouteRunning, separation,
ballTracking, pocketPresence, passRush and coverage subskills are not silently
substituted. The fit remains an average of available evidence, not a confidence
estimate or a promise that every scheme dimension was measured.

Pre-change complete legacy fixture: QB West Coast/Vertical/Smashmouth
`78/85/77`; DL Cover 2/Blitz 34/Man `82/83/84`. Migrating the same QB does not
change those scores. Seeded game snapshots were generated before production
changes, rerun without update after the patch, and hash the complete result.

## Scheme, position and selection contracts

`resolveOffensiveScheme` / `resolveDefensiveScheme` return existing canonical
objects. Case, whitespace, hyphen and underscore variants are normalized.
Supported names are exact normalized matches, never fuzzy matches.

Offense: WEST_COAST / West Coast / west-coast / Balanced; VERTICAL / Vertical /
Vertical / Air Raid / Air Raid / Pass Heavy; SMASHMOUTH / Smashmouth / Run Heavy.
Defense: COVER_2 / Cover 2 / 4-3 Cover 2 / 4-3 / Conservative; BLITZ_34 /
3-4 Blitz / 3-4 / Aggressive; MAN_COVERAGE / Man Coverage / Nickel.
Nickel and Aggressive preserve existing aliases only within this scheme family;
other tactical domains are not changed. Staff philosophy helpers also define
SPREAD, POWER_RUN, BLITZ_HEAVY and HYBRID with separate simulation coefficients;
they remain separate domains. Pro Style is an existing league-level historical
name without a defined equivalence in this six-scheme family, so it retains
the prior unknown-name fallback rather than gaining an invented alias. Unknown/missing names retain West Coast
or Cover 2 defaults. Vertical Spread, 3-4 Zone, Tampa 2 and other unestablished
names are not invented as new aliases.

Scheme position grouping reuses positionalMultipliers.normalizePosition,
then groups OT/OG/C as OL and EDGE/IDL as DL. HB/FB→RB, FL/SE→WR,
LT/LG/C/RG/RT/OT/OG→OL, DE/DT/NT/EDGE/IDL→DL, MLB/OLB/ILB→LB,
DB/NCB→CB, FS/SS→S, PK→K. K/P/RS and unknowns have no weighted scheme evidence
and remain neutral. No simulation participant or eligibility pool is expanded.

* computeTeamSchemeFits: every supplied roster player; caller owns selection.
  Worker readouts and coaching identity intentionally include bench players.
* Lineup: aggregateTeamUnitsFromRoster owns availability and selected starter IDs;
  comparison averages only those selected players, using calculatePlayerSchemeFit.
  Editable lineup ownership and displayed OVR remain unchanged.
* Player Profile/roster state: fresh schemeFit on detached view copies only.
* GET_ROSTER: fresh evaluation using selected team strategies, then coach fallback,
  including teams without a head coach. No stored player fit is overwritten.
* StrategyPanel resolves selected labels without rewriting stored identifiers.
  Its former mount-time auto-save could persist fallback labels and default
  tactical plans during hydration. Auto-save is now gated by actual user edits;
  explicitly applying/changing a strategy retains the existing save behavior.
  This prevents readout normalization from changing game tactics.
* Roster/scheme changes: readouts recompute on each worker response; Lineup
  recomputes for new team/roster inputs. No persisted display-fit cache exists.

## Simulation balance firewall and deferred authority

Live balance-sensitive consumers were audited before changing exports:

| Consumer | Authority / handling |
|---|---|
| simulation/index.js simGameStats | calculateTeamRatingWithSchemeFit → _cachedSchemeFit; existing 0.9–1.1 strength multiplier preserved |
| simulation/index.js simulateBatch | clears _cachedSchemeFit/_cachedMorale/_cachedSimStaff between batches; unchanged |
| scheme-core calculateTeamRatingWithSchemeFit | legacy whole-roster raw-position selection, K/P inclusion, name fallback, fit/OVR/chemistry arithmetic preserved |
| scheme-core recalcTeamSchemeFit | legacy team cache and team.schemeFit write contract preserved |
| worker recalcSchemeFitForTeams | release/sign/trade/roster cache paths retain legacy behavior |
| core/ai-logic.js offer resolution | explicit legacy wrappers preserve free-agency scoring |
| worker handleEvaluateFreeAgentOffer | explicit legacy wrappers preserve negotiation/valuation |
| worker buildRosterView | computeTeamSchemeFits derives view-only schemeBonus/schemeAdjustedOVR; no persisted player ratings writes |
| DragAndDropDepthChart / rosterBuildingAnalysis | consume view adjusted OVR for UI sorting/advice; no simulation rating authority |
| core/depthChart.js | consumes stored player.schemeFit in existing selection logic; stored values untouched |
| richGameSimulator / weekSimulationBridge / matchupEngine | existing AttributesV2, tactical, role and morale pathways; no new scheme-fit multiplier |
| other stored schemeFit consumers | contract/development/retention/draft/FA pathways retain stored data and coefficients |

The legacy wrappers/evaluator live behind explicit compatibility functions.
Their original aliases, raw-position behavior and even invalid-data semantics
are intentionally frozen; they must not be reused for new readouts. Shared
scheme weight definitions and all numerical bonus constants are unchanged.

The legacy team rating is intentionally not the GM summary: it averages the
whole legacy roster with its old raw-position/specialist membership. Correcting
its canonical-ID interpretation or modern attributes would change game strength.
That discrepancy, along with legacy runtime cache semantics, belongs to a
separate simulation-authority review (#1802 if authorized). Nothing in this PR
claims that the legacy multiplier now uses the corrected GM score. No new OVR,
accuracy, rushing, turnover, sack, injury, fatigue, morale or development bonuses.

## Validation

Results and current-head hosted checks are recorded in the PR and final report.
Focused coverage includes legacy/migrated/V2/mixed/invalid evidence, aliases,
positions/specialists, immutability, observed tooltip attributes, selected-starter
parity, coaching identity, roster refresh, worker strategy refresh without writes,
playerEvaluation and complete seeded legacy simulation result hashes (12 cases).

Local targeted validation: 167 tests across 10 focused files passed, including
the 12 untouched pre-change game snapshots. An additional direct comparison
against the saved pre-change module checked 34,100 legacy valuation/team outputs
across 100 mixed-data rosters, all supported old names, canonical-ID legacy
fallbacks and detailed/unsupported positions: exact parity.

Node 22.23.3 was installed as temporary tooling (the environment initially had
Node 24). TypeScript 5.9.3 was also supplied outside the repository because the
requested type-check script has no compiler in package dependencies. No package
or lockfile changes were made. Production build, simulation types, production
and deploy-preview parity passed. Bounded durability: 5 files / 89 tests passed.
Desktop first-session smoke passed. Full 390px first session plus desktop/390px
Lineup readout checks: 4 tests passed. The mobile screenshot was inspected;
fit labels, starter OVR and expanded 0–100 comparison scores remain readable.
The first new mobile test used a shared desktop-only section-tab assumption;
its navigation was corrected to use the actual Team control and rerun green.

## Exact changed files

* `docs/audits/pr-1801-scheme-fit-integrity.md`
* `src/core/__tests__/aiFreeAgencyOffers.test.js`
* `src/core/__tests__/playerEvaluation.test.js`
* `src/core/ai-logic.js`
* `src/core/playerEvaluation.js`
* `src/core/scheme-core.js`
* `src/core/schemeFitCompatibility.js`
* `src/ui/components/FreeAgency.jsx`
* `src/ui/components/LineupCommandCenter.test.jsx`
* `src/ui/components/Roster.jsx`
* `src/ui/components/StrategyPanel.jsx`
* `src/ui/components/StrategyPanel.test.jsx`
* `src/ui/utils/coachingIdentity.js`
* `src/ui/utils/lineupCommandCenter.js`
* `src/ui/utils/lineupCommandCenter.test.js`
* `src/worker/handlers/rosterHandlers.js`
* `src/worker/worker.js`
* `tests/e2e/scheme_fit_integrity.spec.js`
* `tests/integration/blitzStrategyUpdate.worker.test.js`
* `tests/unit/__snapshots__/schemeSimulationParity.test.js.snap`
* `tests/unit/aiFreeAgencyBidding.test.js`
* `tests/unit/coachingSchemeIntegrity.test.js`
* `tests/unit/scheme-core.test.js`
* `tests/unit/schemeSimulationParity.test.js`
* `tests/unit/worker/handlers/rosterHandlers.test.js`
