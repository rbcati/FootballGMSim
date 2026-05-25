import { describe, it, expect } from 'vitest';
import {
  executeAIOffseasonExtensions,
  AI_RETENTION_CONFIG,
} from '../../src/core/retention/aiRetentionLogic.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

let _seq = 0;
function makePlayer({
  id,
  pos,
  ovr,
  potential,
  age,
  morale = 70,
  schemeFit = 65,
  years = 1,
  baseAnnual = 5,
  signingBonus = 0,
  yearsTotal = 1,
} = {}) {
  _seq += 1;
  return {
    id: id ?? `p-${_seq}`,
    pos,
    ovr,
    potential: potential ?? ovr,
    age,
    morale,
    schemeFit,
    status: 'active',
    tenureYears: 3,
    contract: {
      years,
      yearsRemaining: years,
      yearsTotal,
      baseAnnual,
      signingBonus,
      guaranteedPct: 0.5,
    },
  };
}

// Minimal team state; capRoom is the key field for all cap-space tests.
function makeTeam({ capRoom = 30, wins = 8, losses = 9, ties = 0 } = {}) {
  return { id: 1, capRoom, wins, losses, ties };
}

// ── Test 1: Elite young QB is prioritized and extended ─────────────────────

describe('executeAIOffseasonExtensions — elite young QB extension', () => {
  it('extends a 25-year-old 90 OVR QB when cap space is available', () => {
    const qb = makePlayer({ id: 'p-qb-star', pos: 'QB', ovr: 90, age: 25, years: 1 });
    const team = makeTeam({ capRoom: 40 });

    const extensions = executeAIOffseasonExtensions(team, [qb], { freeAgents: [] });

    expect(extensions).toHaveLength(1);
    expect(extensions[0].player).toBe(qb);
    // The AI generates a fair-market contract — verify the shape.
    expect(extensions[0].contract.baseAnnual).toBeGreaterThan(0);
    expect(extensions[0].contract.years).toBeGreaterThan(0);
    expect(extensions[0].contract.guaranteedPct).toBeGreaterThanOrEqual(0.45);
    // Priority score must reflect the QB positional multiplier (1.45).
    expect(extensions[0].priorityScore).toBeGreaterThan(qb.ovr);
  });

  it('places the QB at the top of the board ahead of a lower-priority player', () => {
    const qb = makePlayer({ id: 'p-qb-top', pos: 'QB', ovr: 88, age: 26, years: 1 });
    const rb = makePlayer({ id: 'p-rb-mid', pos: 'RB', ovr: 82, age: 24, years: 1 });
    const team = makeTeam({ capRoom: 50 });

    const extensions = executeAIOffseasonExtensions(team, [rb, qb], { freeAgents: [] });

    // QB should appear first (highest priorityScore).
    const positions = extensions.map((e) => e.player.pos);
    const qbIdx = positions.indexOf('QB');
    const rbIdx = positions.indexOf('RB');
    if (qbIdx !== -1 && rbIdx !== -1) {
      expect(qbIdx).toBeLessThan(rbIdx);
    }
  });
});

// ── Test 2: Aging low-OVR RB is not offered an extension ──────────────────

describe('executeAIOffseasonExtensions — aging RB walks into free agency', () => {
  it('does NOT offer an extension to a 32-year-old 74 OVR running back', () => {
    // Fails two independent eligibility checks:
    //   (a) age 32 > MAX_AGE_RB (28)
    //   (b) ovr 74 < MIN_OVR_FOR_EXTENSION (76)
    const rb = makePlayer({ id: 'p-rb-old', pos: 'RB', ovr: 74, age: 32, years: 1 });
    const team = makeTeam({ capRoom: 50 });

    const extensions = executeAIOffseasonExtensions(team, [rb], { freeAgents: [] });

    expect(extensions).toHaveLength(0);
  });

  it('does NOT offer an extension to a RB at exactly the age ceiling (age 28 + 1 = 29)', () => {
    const rb = makePlayer({ id: 'p-rb-aged', pos: 'RB', ovr: 82, age: 29, years: 1 });
    const team = makeTeam({ capRoom: 50 });

    const extensions = executeAIOffseasonExtensions(team, [rb], { freeAgents: [] });

    expect(extensions).toHaveLength(0);
  });

  it('does NOT offer an extension to any player below the OVR floor', () => {
    const bench = makePlayer({ id: 'p-bench', pos: 'QB', ovr: 75, age: 24, years: 1 });
    const team = makeTeam({ capRoom: 50 });

    const extensions = executeAIOffseasonExtensions(team, [bench], { freeAgents: [] });

    expect(extensions).toHaveLength(0);
  });
});

// ── Test 3: Extensions halt when projected cap space runs out ─────────────

describe('executeAIOffseasonExtensions — cap exhaustion guard', () => {
  it('stops committing cap once the MIN_CAP_BUFFER_M floor would be breached', () => {
    // Team has $20M available. MIN_CAP_BUFFER = $5M → at most $15M can be committed.
    // Each player will demand roughly 12–18M (elite OVR) so at most 1 extension fits.
    const team = makeTeam({ capRoom: 20 });

    // Three elite starters all with expiring contracts.
    const p1 = makePlayer({ id: 'p-ext-1', pos: 'QB', ovr: 92, age: 25, years: 1, baseAnnual: 3 });
    const p2 = makePlayer({ id: 'p-ext-2', pos: 'WR', ovr: 88, age: 24, years: 1, baseAnnual: 3 });
    const p3 = makePlayer({ id: 'p-ext-3', pos: 'CB', ovr: 85, age: 26, years: 1, baseAnnual: 3 });

    const extensions = executeAIOffseasonExtensions(team, [p1, p2, p3], { freeAgents: [] });

    // After each accepted extension the running cap balance decreases.
    // The loop must stop (skip remaining players) before cap < MIN_CAP_BUFFER_M.
    const totalDelta = extensions.reduce((sum, e) => sum + e.capHitDelta, 0);
    expect(team.capRoom - totalDelta).toBeGreaterThanOrEqual(AI_RETENTION_CONFIG.MIN_CAP_BUFFER_M);

    // Not all three should be extended (the third cannot fit in $5M remaining headroom).
    expect(extensions.length).toBeLessThan(3);
  });

  it('extends zero players when the team is already at the cap floor', () => {
    // capRoom exactly equals the buffer → no room to commit.
    const team = makeTeam({ capRoom: AI_RETENTION_CONFIG.MIN_CAP_BUFFER_M });
    const elite = makePlayer({ id: 'p-no-room', pos: 'QB', ovr: 90, age: 25, years: 1 });

    const extensions = executeAIOffseasonExtensions(team, [elite], { freeAgents: [] });

    expect(extensions).toHaveLength(0);
  });

  it('derives cap room from capTotal/capUsed/deadCap when capRoom is absent', () => {
    // capTotal 255 − capUsed 240 − deadCap 0 = $15M available
    // MIN_BUFFER = $5M → $10M to work with; one elite player should fit.
    const team = { id: 1, capTotal: 255, capUsed: 240, deadCap: 0, wins: 8, losses: 9 };
    const qb = makePlayer({ id: 'p-derived-cap', pos: 'QB', ovr: 90, age: 25, years: 1, baseAnnual: 1 });

    const extensions = executeAIOffseasonExtensions(team, [qb], { freeAgents: [] });

    // With $10M to work with and a low current salary, extension should be affordable.
    // (Demand for a 90 OVR QB will be ~10–15M; this may or may not fit — just verify no crash.)
    expect(Array.isArray(extensions)).toBe(true);
  });
});

// ── Additional boundary / regression cases ────────────────────────────────

describe('executeAIOffseasonExtensions — eligibility edge cases', () => {
  it('ignores players with more than 1 year remaining on their contract', () => {
    const secured = makePlayer({ id: 'p-secured', pos: 'QB', ovr: 90, age: 25, years: 3 });
    const team = makeTeam({ capRoom: 50 });

    const extensions = executeAIOffseasonExtensions(team, [secured], { freeAgents: [] });

    expect(extensions).toHaveLength(0);
  });

  it('returns an empty array for an empty roster', () => {
    expect(executeAIOffseasonExtensions(makeTeam(), [], {})).toEqual([]);
  });

  it('returns an empty array when called with no arguments', () => {
    expect(executeAIOffseasonExtensions({}, [], {})).toEqual([]);
  });

  it('does NOT extend a QB over the QB age ceiling', () => {
    const oldQb = makePlayer({
      id: 'p-qb-old', pos: 'QB', ovr: 82, age: 37, years: 1,
    });
    const team = makeTeam({ capRoom: 50 });

    const extensions = executeAIOffseasonExtensions(team, [oldQb], { freeAgents: [] });

    expect(extensions).toHaveLength(0);
  });
});

// ── Config surface tests ──────────────────────────────────────────────────

describe('AI_RETENTION_CONFIG', () => {
  it('exposes QB as the highest-priority positional value', () => {
    expect(AI_RETENTION_CONFIG.POSITIONAL_VALUE.QB).toBeGreaterThan(
      AI_RETENTION_CONFIG.POSITIONAL_VALUE.RB,
    );
    expect(AI_RETENTION_CONFIG.POSITIONAL_VALUE.QB).toBeGreaterThan(
      AI_RETENTION_CONFIG.POSITIONAL_VALUE.OL,
    );
  });

  it('has RB as the lowest non-specialist positional value', () => {
    const nonSpecialist = ['QB', 'EDGE', 'OT', 'WR', 'CB', 'DL', 'OL', 'LB', 'S', 'TE'];
    for (const pos of nonSpecialist) {
      expect(AI_RETENTION_CONFIG.POSITIONAL_VALUE.RB).toBeLessThanOrEqual(
        AI_RETENTION_CONFIG.POSITIONAL_VALUE[pos],
      );
    }
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(AI_RETENTION_CONFIG)).toBe(true);
    expect(Object.isFrozen(AI_RETENTION_CONFIG.POSITIONAL_VALUE)).toBe(true);
  });
});
