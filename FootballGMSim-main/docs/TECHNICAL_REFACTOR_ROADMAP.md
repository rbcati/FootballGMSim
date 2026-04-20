# FootballGMSim Technical Refactor Roadmap

## Role Framing
This roadmap is written from a **Lead Software Architect + Game Systems Designer** perspective, with the explicit goal of pushing FootballGMSim beyond “single-rating + simple economy” depth into a layered, simulation-first management sandbox.

---

## 0) Root-Cause Analysis (Current Gaps)

Before adding systems, here are the architectural bottlenecks currently limiting depth:

1. **Simulation outcomes are still mostly rating-compressed**
   - The core simulation path in `game-simulator.js` still leans on broad team-level/off-vs-def abstractions in several flows (drive conversion probabilities, possession outcomes), which reduces emergent matchup texture.  
   - Result: “good team beats bad team” is stable, but **how** and **why** is less granular than genre leaders.

2. **Worker architecture is robust but mostly single-thread execution**
   - The worker already yields and batches for responsiveness, but long season simulations still run in one worker execution lane.  
   - Result: good stability, but limited headroom for CPU-heavy, attribute-level simulation.

3. **Economy model has strong primitives but shallow lifecycle mechanics**
   - Contract normalization/cap-hit logic exists, but dead-cap event lifecycle (cuts/trades/post-June behavior), bonus treatment, and cap carry-over strategy are not fully strategic.

4. **Trade AI valuation is still too linear**
   - Trade logic is improved, but still vulnerable to edge-case exploitation because valuation is largely static-player-centric and only lightly market-aware.

5. **UI has strong weekly hub foundations but gameplay loop context is fragmented**
   - Weekly hub and screen modules are strong building blocks, yet users still context-switch across Roster/Schedule/Contracts/News.

---

## 1) Pillar One: Simulation Engine (“The Brain”)

## 1.1 Objectives
- Replace broad OVR-resolution with **matchup-driven sub-attribute interactions**.
- Keep deterministic replay support (seeded RNG).
- Preserve frame responsiveness during 17-week and multi-season sim operations.

## 1.2 New Player Attribute Taxonomy (15+)

Implement per-position sub-attributes and expose a normalized `0..100` range.

### Offensive Skill Buckets
- **QB**: throwPower, throwAccuracyShort, throwAccuracyDeep, release, pocketPresence, decisionMaking
- **RB**: vision, burst, elusiveness, contactBalance, ballSecurity, passPro
- **WR/TE**: release, routeRunningShort, routeRunningDeep, separation, catchInTraffic, yac
- **OL**: passBlockFootwork, passBlockStrength, runBlockLeverage, awareness, penaltyDiscipline

### Defensive Skill Buckets
- **DL/EDGE**: getOff, handUsage, powerRush, finesseRush, runContain
- **LB**: blockShedding, pursuit, zoneCoverage, manCoverage, tackleReliability
- **CB/S**: pressCoverage, mirrorFootwork, zoneIQ, ballSkills, openFieldTackle

### Universal/Meta
- durability, stamina, clutch, discipline, footballIQ

## 1.3 Weighted Matchup Engine Design

For each play type, calculate offense and defense “win vectors” using weighted attributes.

### Example (short pass)
- Offense vector: QB short accuracy + release + WR release + route running + OL pass pro
- Defense vector: pass rush pressure + CB press/mirror + LB/S zone/man + disguised coverage IQ

Then compute outcome as:

```ts
const matchupDelta = offenseVector - defenseVector;
const pressurePenalty = pressureRate * pressureImpact;
const contextAdj = weatherAdj + fatigueAdj + moraleAdj + coachingAdj;

const successProb = sigmoid(
  base + matchupDelta * 0.055 - pressurePenalty + contextAdj
);
```

Where `sigmoid(x)=1/(1+e^-x)` keeps probabilities bounded and tunable.

## 1.4 Simulation Loop Snippet (Play Resolution)

```ts
type PlayContext = {
  down: number;
  distance: number;
  yardLine: number;
  clockSec: number;
  quarter: number;
  weather: 'clear'|'rain'|'snow'|'wind';
  fatigueFactor: number; // 0..1
};

function resolvePassPlay(ctx: PlayContext, offense: TeamUnit, defense: TeamUnit, rng: RNG) {
  const passConcept = pickConcept(offense.scheme, ctx, rng); // slants, dagger, mesh, etc.

  const qb = offense.qb;
  const target = selectTarget(offense, passConcept, rng);
  const coverDef = assignCoverageDefender(defense, target, passConcept, ctx);
  const passRush = computePassRushPressure(defense.front7, offense.ol, ctx, rng);

  const sep = weighted([
    [target.routeRunningShort, 0.25],
    [target.release, 0.15],
    [target.separation, 0.20],
    [coverDef.pressCoverage, -0.15],
    [coverDef.mirrorFootwork, -0.20],
    [defense.call.disguiseIQ, -0.05],
  ]);

  const accuracy = weighted([
    [qb.throwAccuracyShort, 0.35],
    [qb.release, 0.10],
    [qb.decisionMaking, 0.15],
    [qb.pocketPresence, 0.10],
    [passRush, -0.30],
  ]);

  const completionProb = sigmoid(-0.8 + sep * 0.045 + accuracy * 0.05 + situationalAdj(ctx));

  if (rng.next() > completionProb) {
    return maybeTurnoverOnTarget(rng, qb, coverDef, passRush, ctx);
  }

  const yards = sampleYardsAfterCatch(target, coverDef, ctx, rng);
  return { type: 'COMPLETE', yards, targetId: target.id };
}
```

## 1.5 Multi-Threading Architecture (Web Worker Pool)

### Current state
- Single worker is already stable and message-driven.

### Proposed target
- Keep current worker as **Orchestrator Worker**.
- Add **N Simulation Workers** (pool = `navigator.hardwareConcurrency - 1`, min 2, max 6).
- Partition weekly schedule into chunks (e.g., 2–4 games/chunk).
- Orchestrator merges results deterministically by `gameId` order.

### Pipeline
1. UI sends `SIMULATE_WEEK_BATCH` to orchestrator.
2. Orchestrator computes deterministic seeds per game.
3. Dispatch chunk payloads to worker pool.
4. Worker returns compact archive payload (`score`, `teamStats`, `playerStatDiff`, `eventsDigest`).
5. Orchestrator applies diffs in canonical order and flushes to IndexedDB in single batched commit.

### Core pool loop snippet

```ts
// Orchestrator worker
async function simulateWeekParallel(games: GameStub[], leagueSnapshot: Snapshot) {
  const chunks = chunkGames(games, dynamicChunkSize());
  const jobs = chunks.map((chunk, idx) => ({
    chunkId: idx,
    seedBase: leagueSnapshot.seed ^ (idx * 2654435761),
    games: chunk,
  }));

  const results = await Promise.all(jobs.map(job => pool.exec('SIM_CHUNK', {
    ...job,
    rosterSlice: buildChunkRosterSlice(job.games, leagueSnapshot),
  })));

  return results
    .flatMap(r => r.games)
    .sort((a, b) => a.gameOrder - b.gameOrder);
}
```

### Guardrails
- Determinism mode for testing: fixed seed + stable sort + pure simulation functions.
- If Worker pool fails, fallback to single-worker path.
- Transfer only minimal data slices (no full league object fan-out).

## 1.6 Priority Implementation Sequence (Simulation)
1. Introduce `playerAttributesV2` schema with migration adapters.
2. Add matchup calculator module (`core/sim/matchupEngine.ts`).
3. Migrate one play family at a time (pass, run, special teams).
4. Add worker pool behind feature flag.
5. Run parity suite: old-vs-new sim distributions across 10k games.

---

## 2) Pillar Two: Economic Complexity (“The Strategy”)

## 2.1 Objectives
- Make cap management a year-over-year strategic puzzle.
- Ensure contracts feel different by structure, not only by annual value.

## 2.2 Cap Model Extensions

### Contract Structure
Add `contract.structure[]` yearly rows:

```ts
type ContractYear = {
  season: number;
  baseSalary: number;
  rosterBonus: number;
  workoutBonus: number;
  signingBonusProration: number;
  optionBonusProration: number;
  guaranteesLocked: number;
};
```

### Dead Cap Rules
- On release/trade, accelerate remaining prorated bonus into current cap (configurable June-1 style split optional).
- Guarantee vesting windows apply if release occurs after trigger date.
- Store `deadCapLedger[season]` for team-level cap snapshots.

### Back-Loaded Contract Generator
Use curve profiles:
- **Balanced** (flat-ish)
- **Backloaded** (cap relief now, pressure later)
- **Win-Now** (void years + bonus-heavy)

```ts
function buildBackloadedBase(totalBase: number, years: number) {
  const weights = [0.16, 0.19, 0.22, 0.43].slice(0, years);
  const normalized = normalizeWeights(weights, years);
  return normalized.map(w => round2(totalBase * w));
}
```

## 2.3 AI Contract Decision Logic
AI signs by:
- cap space now,
- projected cap in +2 years,
- dead cap sensitivity,
- window state (rebuild/contender).

This prevents unrealistic “all-in every season” spending.

## 2.4 Draft Value Chart + Anti-Cheese Trade Logic

### Base layer
Create pick values by curve (close to modern NFL consensus behavior):
- Early 1st: nonlinear premium
- Mid rounds: smoother decay
- Late rounds: lottery floor

```ts
function pickValue(overallPick: number): number {
  // Exponential + floor to avoid zero-value late picks
  return Math.round(2800 * Math.exp(-0.065 * (overallPick - 1)) + 30);
}
```

### Context multipliers
- Team need multiplier (QB premium when QB room weak)
- Class strength multiplier (strong QB class inflates top-10)
- Time discount (future picks discounted by season distance)

### Trade fairness score

```ts
const net = assetsInValue - assetsOutValue;
const tolerance = Math.max(40, teamUrgency * 18);
const accept = net >= -tolerance && chemistryPenalty <= maxPenalty && capImpactOK;
```

### Anti-cheese constraints
- Hard reject if user repeatedly extracts “future 1st + starter” without value parity.
- Trust model per GM relationship (exploit attempts reduce trust; trust widens/ tightens tolerance).
- Cooldown windows after major trades.

## 2.5 Priority Implementation Sequence (Economy)
1. Add contract yearly-structure schema and dead-cap ledger.
2. Introduce cap forecast panel and validation rules.
3. Implement pick-value engine + trade fairness score.
4. Add GM trust memory + exploit dampening.
5. Rebalance AI aggressiveness per team direction.

---

## 3) Pillar Three: UI/UX (“The Experience”)

## 3.1 Single Page Weekly Dashboard (Tailwind-First)

### Goal
Keep users inside one tactical command center during weekly loop.

### Layout (desktop)
- **Top row**: Week header, opponent card, sim controls.
- **Middle-left**: roster readiness/depth chart alerts.
- **Middle-center**: gameplan + injury + morale panel.
- **Middle-right**: cap + contracts + pending negotiations.
- **Bottom-left**: schedule/results timeline.
- **Bottom-right**: trade market + news pulse.

### Mobile
- Same modules in vertical accordion stack.
- Sticky CTA bar: `Set Lineup`, `Sim Week`, `Review Results`.

### Suggested component map
- `WeeklyDashboardShell`
- `WeekCommandCenter`
- `RosterReadinessPanel`
- `CapAndContractsPanel`
- `ScheduleTimelinePanel`
- `PlayerTrajectoryPanel`
- `LiveTradePulsePanel`

## 3.2 Real-Time Career Trajectory Visualization (Recharts)

> Dependency note: Recharts is not currently listed in dependencies. Add only after explicit approval.

Use charts for:
- OVR/POT trend by season,
- snap share trend,
- injury burden vs performance,
- contract value vs production.

```tsx
<LineChart data={careerSeries}>
  <XAxis dataKey="season" />
  <YAxis domain={[40, 99]} />
  <Tooltip />
  <Legend />
  <Line type="monotone" dataKey="ovr" stroke="#3b82f6" />
  <Line type="monotone" dataKey="pot" stroke="#a855f7" />
  <Line type="monotone" dataKey="warLikeImpact" stroke="#22c55e" />
</LineChart>
```

## 3.3 Prioritized React Component Updates

### P0 (Foundation)
1. `src/ui/components/WeeklyHub.jsx`
   - evolve into shell coordinator + module slots.
2. `src/ui/App.jsx`
   - route weekly actions into dashboard modules, reduce tab thrash.
3. `src/ui/utils/weeklyHubLayout.js`
   - expand to produce panel-ready normalized state.

### P1 (Core gameplay depth)
4. `Roster` + `GamePlanScreen` integration
   - inline depth/scheme changes from weekly dashboard.
5. `ContractCenter` integration
   - live cap impact widget in weekly loop.
6. `TradeCenter` integration
   - draft chart value preview and fairness meter.

### P2 (Insight layer)
7. `AnalyticsDashboard` + `PlayerProfile`
   - embed career trajectories and decline-risk overlays.
8. `NewsFeed`
   - add “sim explainability” card: why result happened.

---

## 4) System Architecture Blueprint (Target)

- **UI Thread**: dashboard rendering, interactions, optimistic UI states.
- **Orchestrator Worker**: commands, validation, DB writes, deterministic ordering.
- **Simulation Worker Pool**: play/game chunk computation only.
- **Persistence Layer**: IndexedDB + compact yearly archives.
- **Analytics Layer**: precomputed weekly snapshots to avoid heavy on-render transforms.

---

## 5) Delivery Plan (90-Day)

### Phase 1 (Weeks 1–3): Simulation schema and instrumentation
- Add sub-attribute schema + migration.
- Introduce matchup engine prototypes (pass game only).
- Build simulation telemetry dashboard (distribution sanity checks).

### Phase 2 (Weeks 4–6): Parallel sim and deterministic merge
- Worker pool implementation behind feature flag.
- Parity tests and performance benchmarks.
- Rollout to preseason + regular week sim.

### Phase 3 (Weeks 7–9): Economy depth and AI trade parity
- Dead cap and contract structure engine.
- Draft value chart + trust-based AI trade gating.
- Financial forecast UX + warnings.

### Phase 4 (Weeks 10–12): Weekly dashboard unification + analytics
- Tailwind module grid dashboard.
- Inline roster/schedule/contracts panels.
- Player trajectory visualizations and explainability cards.

---

## 6) Quality Gates

- **Simulation realism gate**: KPI distributions (yards/play, sack rate, INT rate, explosive plays) remain in configured NFL-like bands.
- **Economy gate**: AI cap health over 10-year sim avoids mass insolvency/constant cap violations.
- **UX gate**: weekly loop actions reachable within max 2 interactions.
- **Performance gate**: 17-week sim target under agreed threshold on mid-tier hardware with no UI jank.

---

## 7) Immediate Next Actions (Actionable)

1. Approve schema proposal for `playerAttributesV2` and `contract.structure[]`.
2. Implement a single play-family pilot (`short_pass`) using weighted vectors.
3. Add orchestrator-compatible chunk payload contract for worker pool.
4. Add draft pick value service and integrate into trade offer review UI.
5. Refactor `WeeklyHub` into panelized dashboard shell (without changing save format).

This path adds depth while preserving current stability characteristics and backward compatibility.
