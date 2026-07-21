# AI Post-Rollover Salary-Cap Compliance V1

## 1. Executive verdict

Multiple AI teams were unable to enter the Season 4 regular season legally under
the salary cap, deadlocking the five-season durability run during Season 4
preseason. The root cause is **two coupled defects**:

1. **Ordering** — the pre-advance legality gate in `handleAdvanceWeek` evaluated
   every team's cap on its *pre-cutdown* 67–74-man offseason roster, and it ran
   *before* the preseason cutdown + AI cap-management pass that produces the
   legal 53-man roster. By Season 4 the grown cap and inflated contracts made
   several teams' full offseason payroll exceed the cap, so the gate blocked the
   advance before the cutdown/cap-manager could ever run.
2. **The AI cap manager itself** (`AiLogic.executeAICapManagement`) planned
   against a stale constant cap (`Constants.SALARY_CAP.HARD_CAP = 301.2`, vs. the
   live Season-4 cap of `333.94`), decided whether action was needed from
   `capUsed` **excluding dead cap**, used a restructure formula that produced ~0
   current-year relief, and ranked cuts by cap-hit inefficiency rather than
   realizable net relief.

Both are fixed. AI cap management now runs **before** the legality gate during
preseason, and the manager plans against one canonical, live-cap equation that
includes dead cap. The five-season durability run completes all five seasons and
is deterministic across identical seeds.

This PR does **not** weaken the legality gate, change the configured cap amount,
erase dead cap, or auto-manage interactive user rosters.

## 2. Latest-main SHA

`c6b04863f11482f2b76d0f156a605ce19738cb63` (merge of PR #1702).

## 3. Seed and first failing checkpoint

- Seed: **1684**, five-season harness (`npm run durability:5`).
- First failure: **Season 4 (year 2029), phase = preseason**, at the
  `ADVANCE_WEEK` pre-advance legality gate (`runLegalityValidation('pre-advance')`).

## 4. Failing-team cap ledger (pre-fix, reproduced)

Live salary cap at Season 4 = **$333.94M** (base 301.2 grown at 3.5%/yr for 3
rollovers). The manager's stale constant target was **$301.2M**. Teams reported
over cap at the gate (pre-cutdown, ~67–74-man rosters):

| Team    | rosterCap | deadCap | committed | legal cap | overage | roster |
|---------|-----------|---------|-----------|-----------|---------|--------|
| CIN (5) | 333.18    | 1.49    | 334.67    | 333.94    | +0.73   | 67     |
| CLE (6) | 333.83    | 3.56    | 337.39    | 333.94    | +3.45   | 67     |
| KC (13) | 338.59    | 0.49    | 339.08    | 333.94    | +5.14   | 69     |
| WAS (19)| 334.41    | 1.73    | 336.14    | 333.94    | +2.20   | 74     |

The mission brief named "Indianapolis" as the failing team; on the actual pinned
main the failing teams are CIN/CLE/KC/WAS. The defect is **systemic**, not
team-specific — no team was special-cased.

## 5. First overcommit checkpoint

The **"before preseason cutdown"** checkpoint. Teams accumulate a full offseason
roster (re-signings + free agency + draft + rookies) whose aggregate cap hit,
after three seasons of 2.5% contract inflation against a 3.5% cap, exceeds the
cap while the roster is still ~70 players. This is expected and would be resolved
by the 53-man cutdown — the defect is that the cutdown/cap-manager never ran
(gate blocked first), and that the manager, had it run on a 53-man roster still
over cap, used the wrong ceiling and ignored dead cap.

## 6. Canonical cap-authority map

| Authority | Location | Role |
|-----------|----------|------|
| `meta.economy.currentSalaryCap` | `core/economy.js` | live legal cap, grows 3.5%/yr |
| `settings.salaryCap` | synced to `currentSalaryCap` | what the legality gate reads |
| `validateLeagueTeamLegality` | `core/teamValidation.js` | legal gate: `Σ capHit + deadCap ≤ cap` |
| `calculateContractCapHit` | `core/contracts/realisticContracts.js` | `base + signingBonus/yearsTotal + likely incentives` |
| `getActiveCapHit` / `calculateTeamCapObligations` | `core/contracts/contractObligations.js` | canonical pure cap helpers |
| **`buildTeamCapSnapshot`** (new) | `core/contracts/contractObligations.js` | single legal-compliance snapshot shared by planner + gate |
| `AiLogic._getSalaryCap` | `core/ai-logic.js` | reads live economy cap |
| `AiLogic.updateTeamCap` | `core/ai-logic.js` | writes team.capUsed/capRoom (capRoom already dead-cap aware) |
| `recalculateTeamCap` | `worker/worker.js` | worker cap fields (includes staff + dead cap in capUsed) |

## 7. Conflicting formulas found

- The legality gate counts `Σ activeCapHit + team.deadCap` against the **live**
  cap and **excludes** staff payroll.
- `AiLogic.executeAICapManagement` (pre-fix) compared `team.capUsed` (roster cap
  hits **only**, no dead cap) against a **static** `301.2` constant.
- `recalculateTeamCap` defines `capUsed` as `playerPayroll + staffPayroll +
  deadCap` — a third definition.

The new `buildTeamCapSnapshot` gives the planner exactly the gate's equation
(roster cap hits + dead cap vs. the live cap, staff excluded), so planner and
gate can no longer disagree.

## 8. capUsed-vs-capRoom result

**Confirmed defect.** The manager's action trigger and stop condition were
`team.capUsed <= hardCap`, which ignored `team.deadCap`. A team at
`capUsed = 295, deadCap = 18` was treated as safe even when `295 + 18 = 313`
exceeded the applicable cap. The manager now plans on `totalCommitted =
rosterCap + deadCap`, identical to the gate.

## 9. Live-cap-vs-constant result

**Confirmed defect.** `executeAICapManagement` used
`Constants.SALARY_CAP.HARD_CAP` (301.2) for the ceiling and the difficulty
buffer, while the live Season-4 cap was 333.94 and the legality gate used the
live value. The manager now uses `AiLogic._getSalaryCap()` (live economy cap) as
the legal ceiling; the difficulty buffer is applied to that live cap.

## 10. Restructure math before and after

**Before** (inline in the manager): `convert = base × 0.5`; added to signing
bonus as `convert × yearsRemaining`; the cap calculator then re-prorates the
signing bonus over `yearsTotal`. Net current-year relief =
`convert × (1 − yearsRemaining/yearsTotal)`, which is **0** for a contract in its
first year (`yearsRemaining == yearsTotal`) — the common case. It shifted money
into the future without lowering the current cap hit.

**After**: the manager now delegates to the canonical restructure engine
(`computeRestructure` / `applyRestructure`, used by the interactive
`RESTRUCTURE_CONTRACT` handler). It converts `0.40 × currentCapHit` from base to
bonus (`newBase = base − c`, `newBonus = bonus + c`), giving verified positive
relief `c × (yearsTotal − 1)/yearsTotal`. Example (base 20, SB 0, 4 yrs): before
cap hit = 20, convert = 8 → newBase 12, newBonus 8, after cap hit = 12 + 8/4 =
14, **relief = 6**. Every restructure the planner keeps is re-measured and
discarded if relief ≤ 0.

## 11. Release net-relief policy

A preseason (post-June-1) release charges `currentYearDead = signingBonus /
yearsTotal` now and defers the rest to `deadMoneyNextYear`. **Net current-year
relief = activeCapHit − currentYearDead** (= base + likely incentives). The
planner:

- filters out any candidate with `netRelief ≤ 0` (never worsens the current cap);
- ranks by net relief descending (a high-cap-hit, all-bonus player with tiny net
  relief is correctly deprioritised below a lower-cap-hit, all-base player);
- never cuts a position below its floor (`AiLogic.POSITION_FLOOR`).

## 12. Dead-money rollover result

Verified correct and **not duplicated**. At `startNewSeason` each team rolls
`deadMoneyNextYear → deadCap` exactly once, clears `deadMoneyNextYear`, and sets
`capTotal = nextEconomy.currentSalaryCap`. Save/reload preserves the scalar
`deadCap`/`deadMoneyNextYear` and does not re-apply the roll.

## 13. Upstream transaction prevention

Free-agency and re-signing commit points already gate on `team.capRoom`
(dead-cap-aware, live-cap-based via `team.capTotal`) and the pending-offer cap
reservation (`evaluatePendingOfferCapReservation`). These were **not** the first
causal defect and are left intact; the preseason manager remains the safety net.
No upstream transaction boundary was loosened.

## 14. Compliance planning stages

`buildAiCapCompliancePlan` (pure, deterministic, side-effect-free) discovers a
plan on clones, then `executeAICapManagement` commits it:

1. Recalculate canonical cap state (`buildTeamCapSnapshot`).
2. Restructures (non-destructive) toward the **planning target**
   (`legalCap − difficulty buffer`); only positive-relief actions kept; no player
   restructured twice in a season.
3. Releases (destructive) **only while still over the legal cap** — never to
   chase the buffer — ranked by net relief, respecting position floors.
4. Commit through cache + `Transactions`, recalc, and re-verify the **live**
   committed result (not the projection).
5. If no legal plan exists, return a structured failure with the exact remaining
   overage and protected positions — no infinite loop, no fabricated money.

## 15. Position and roster safeguards

Releases never drop a position below `AiLogic.POSITION_FLOOR`
(QB 2, RB 2, WR 3, TE 1, OL 5, DL 4, LB 3, CB 2, S 2, K 1, P 1). Depth charts are
repaired (`validateAndRepairAllTeamDepthCharts('post-ai-cutdown')`) after the
cutdown/cap-manager pass and before the legality gate, so no dangling
starter/backup references reach the gate. Released players get `teamId = null`,
`status = 'free_agent'`, and one `RELEASE` transaction each.

## 16. User-team isolation

The interactive user team is **never** auto-managed:
`executeAICapManagement({ autoManageUserCap })` skips `userTeamId` unless
`autoManageUserCap` is true. An interactive user over the cap still receives the
existing actionable legality-gate error at Start Season with roster and contracts
unchanged.

## 17. Headless lifecycle policy

Headless/durability lifecycles opt the user team in via
`autoManageUserCap: true`, gated by the **explicit** batch-sim capability
`globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__` (set only by the durability lifecycle
driver). `skipUserGame` is **not** used as blanket front-office consent for cap
management.

## 18. Save/reload result

Save/reload preserves the cap snapshot: `deadCap`, `deadMoneyNextYear`,
`capTotal`, and contract fingerprints round-trip unchanged; the dead-money roll
is not re-applied on load. Covered by the durability harness save/reload
checkpoints (see §20).

## 19. Season 4 reproduction result

- **Before fix:** durability:5 stops in Season 4 preseason — CIN/CLE/KC/WAS over
  cap at the pre-advance gate.
- **After fix:** the Season 4 preseason→regular transition passes for all teams;
  cap management runs before the gate and every AI team is legal.

## 20. Five-season result

`npm run durability:5` (seed 1684) completes **all five seasons**; every
preseason→regular checkpoint reports all AI teams legally cap compliant, all cap
aggregates finite, no invalid contracts, no duplicate releases, no broken depth
charts. (See PR body / CI for the exact console verdict.)

## 21. Determinism result

Two identical five-season runs (and the unit-level determinism test) produce
identical cap snapshots, restructure/release actions, and transaction
fingerprints.

## 22. Browser result

Production build passes (`npm run build`). Playwright browser coverage: see PR
body — reported honestly (only claimed if Playwright actually executed in CI).

## 23. Files changed

- `src/core/contracts/contractObligations.js` — new `buildTeamCapSnapshot`.
- `src/core/ai-logic.js` — rewrote `executeAICapManagement` as plan-then-commit;
  added `buildAiCapCompliancePlan`, `_capPlanningBuffer`, `_releaseDeadCapSplit`;
  new imports.
- `src/worker/worker.js` — run preseason AI cutdown + cap management + depth
  repair before the pre-advance legality gate; pass `autoManageUserCap` from the
  explicit batch-sim capability.
- `src/worker/__tests__/depthChartRepairAfterRelease.test.js` — updated the
  call-ordering sentinel for the new method signature.

## 24. Tests added

- `tests/unit/aiCapCompliancePlan.test.js` — snapshot equation, dead-cap
  compliance, live cap, restructure relief, no-repeat restructure, net-relief
  cuts, zero-relief skip, position floor, structured failure, determinism.
- `tests/unit/aiCapManagementExecution.test.js` — user-team isolation
  (interactive vs. headless), team-id-0 validity, live-cap legality, one
  transaction per action, determinism.

## 25. Unit-test result

`npm run test:unit` — **5640 passed / 460 files**.

## 26. Build result

`npm run build` — **passed**.

## 27. Durability result

- `npm run durability:test` — **62 passed / 5 files**.
- `npm run durability:smoke` — passed (1-season).
- `npm run durability:5` — five seasons complete; determinism stable.

## 28. Explicit untouched systems

Schedule generator and history-reference contract; scoring / gamecast;
standings / playoff rules; progression / retirement; team numbering (team id 0
remains valid, `teamId == null` still means free agent); the configured cap
amount; the legality gate's rule; interactive user roster control; contract
market value / demand model.

## 29. Remaining first failure, if any

None within the salary-cap causal cluster through five seasons at seed 1684. Any
future failure surfaced by longer runs should be triaged as its own defect.

## 30. Recommended next PR

Extend the deterministic cap-compliance harness to 10/20-season runs and multiple
seeds to confirm the cap manager holds under deeper contract inflation, and add
an explicit durability invariant `cap.ai-teams-legal-at-regular-season-start`.

## 31. Merge recommendation

**Merge.** The first causal cap defect is fixed with one canonical equation
shared by planning and the legality gate, no gameplay systems outside the cap
cluster changed, unit + durability suites green, and behaviour is deterministic.
