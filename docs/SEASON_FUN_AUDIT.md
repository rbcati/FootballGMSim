# Season Fun Audit (Weekly Decision Impact + Season Loop)

## What already works
- Weekly command loop has clear prep surfaces (HQ, Game Plan, Weekly Prep/War Room, Roster/Depth, Injuries, Training) and now closes the loop with a postgame Decision Review.
- The new simulation path applies game-plan/prep multipliers into play calling and success modeling, which makes weekly tactical choices visible in outcomes without fake certainty.
- Weekly practice is persisted (`weeklyDevelopmentFocus`, `weeklyTrainingBoost`) and now represented with explicit “logged vs not logged” language.

## Decision input audit (what reaches sim vs not)

| Input | Classification | Notes |
|---|---|---|
| offensive scheme (`offScheme`) | **Stored but not used** | Saved on team strategies for UX continuity; not consumed in weekSimulationBridge/rich sim path yet. |
| defensive scheme (`defScheme`) | **Stored but not used** | Same as above. |
| gamePlan sliders (`runPassBalance`, `aggressionLevel`, `deepShortBalance`) | **Used directly by sim** | Read in `buildWeekMatchupsFromLeague` → `deriveGamePlanMultipliers` → `simulateRichGame` play bias and attribute tuning. |
| risk / plan IDs (`offPlanId`, `defPlanId`, `riskId`) | **Used directly by legacy sim only** | Consumed by `game-simulator.js` strategy modifiers; rich sim currently uses slider+prep model. |
| depth chart assignments | **Used directly by sim (legacy), partial in rich sim** | Legacy sim uses depth order and injury filtering per group; rich sim aggregates roster by ratings (depth order not fully honored). |
| injured starters / unavailable players | **Used directly by sim** | Injury states affect lineup pools in legacy sim; rich sim prep penalties read injury stress and blocking starter injuries. |
| `weeklyTrainingBoost` from `conductDrill` | **Used directly by legacy sim only** | Applied to player OVR in legacy game sim; cleared on week advance. Rich sim does not yet map individual boosts into AttributesV2 aggregation. |
| `weeklyDevelopmentFocus` | **Stored + used by progression system** | Used by weekly evolution/development, not by in-game causal attribution. |
| prep completion state (`lineupChecked`, `planReviewed`, etc.) | **UI-only for now (new sim path unclear/future work)** | Tracked in local UI prep store and surfaced in UX; not currently persisted into worker sim inputs. |

## Postgame data audit (what exists today)

| Postgame artifact | Status |
|---|---|
| final score | ✅ present |
| box score | ✅ present in archived rich game payloads when available |
| team stats | ✅ present (`teamDriveStats`/`teamStats`) |
| player stats | ✅ present (`boxScore.home/away`) |
| injuries | ✅ present (`injuries` array on game result) |
| game summary/headline/storyline | ✅ present (`summary.storyline`, recap/headline fallbacks) |
| game-plan effects | ⚠️ indirect only (prep multipliers + reasons captured, no per-play attribution report) |
| matchup effects | ⚠️ indirect only (rating/prep influence in sim and recap copy, not explicit causal ledger) |
| training effects | ⚠️ partial (practice logs + weekly boosts exist; box score does not expose direct credit mapping) |

## What feels thin
- Rich sim does not yet ingest explicit depth-order usage, so lineup coaching can feel less tangible than UI implies.
- Prep checklist completion is not persisted into worker-facing sim inputs; UX can feel ahead of sim in that dimension.
- Training impact is real in legacy path and progression systems, but postgame attribution remains coarse.
- Game Book currently lacks a dedicated, trust-preserving prep context strip unless surfaced from decision review helpers.

## Top 5 highest-value next PRs
1. **Persist weekly prep completion state to worker input** and wire it into `deriveGamePlanMultipliers.hasTracking` (small schema + adapter).
2. **Map depth-order starters into rich sim roster aggregation** (starter-weighted unit aggregation, no rebalance).
3. **Emit prep snapshot on each completed game** (`planSaved`, `trainingStamp`, `injuryRiskCount`) for deterministic postgame context.
4. **Expose non-causal prep diagnostics in Game Book** (e.g., “pass bias +4%, injury stress active”) from existing sim factors.
5. **Unify legacy/rich training effect messaging** so users always see whether weekly training affected game sim, progression, or both.

## Systems most likely to make a full season feel fun
- Weekly tactical loop fidelity (Game Plan ↔ matchups ↔ postgame review).
- Injury/depth contingency play (meaningful starter loss management).
- Game Book storytelling quality (clear narrative + stats + drive context).
- Progression visibility tied to weekly operations decisions.

## Systems most likely to drive multi-season stickiness
- Development/progression arc clarity (prospect growth, aging curves, staff/facility leverage).
- Roster identity continuity (scheme/coach fit + draft/development outcomes).
- League memory/chronicle surfacing rivalry and franchise milestones.
- Offseason consequence loops (contracts, cap, succession planning).
