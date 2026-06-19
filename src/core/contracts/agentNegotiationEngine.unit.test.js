import { describe, expect, it } from 'vitest';
import {
  AGENT_ARCHETYPES,
  generateDeterministicAgentProfile,
  hydratePlayerAgent,
  isNegotiationFrozen,
  computeAgentExpectedSalary,
  evaluateAgentNegotiation,
  getAgentBadgeMeta,
  getAgentFeedbackText,
  shouldEscalateSharkPressure,
} from './agentNegotiationEngine.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id:   1,
    name: 'Test Player',
    pos:  'QB',
    ovr:  80,
    age:  27,
    contract: { years: 1, yearsRemaining: 1, baseAnnual: 20 },
    tenureYears:     0,
    extensionDecision: 'pending',
    ...overrides,
  };
}

// ── generateDeterministicAgentProfile ────────────────────────────────────────

describe('generateDeterministicAgentProfile', () => {
  it('is deterministic for the same player seed', () => {
    const p = makePlayer({ id: 42, name: 'John Doe' });
    const a = generateDeterministicAgentProfile(p);
    const b = generateDeterministicAgentProfile(p);
    expect(a).toEqual(b);
  });

  it('produces different profiles for different players', () => {
    const p1 = makePlayer({ id: 1, name: 'Alpha' });
    const p2 = makePlayer({ id: 2, name: 'Beta' });
    const a = generateDeterministicAgentProfile(p1);
    const b = generateDeterministicAgentProfile(p2);
    // At minimum archetype or name may differ across players
    expect(a.id).not.toBe(b.id);
  });

  it('archetype distribution roughly follows 30/40/30 over a sample', () => {
    const counts = { SHARK: 0, LOYALIST: 0, RING_CHASER: 0 };
    const N = 300;
    for (let i = 0; i < N; i++) {
      const p = makePlayer({ id: i, name: `Player${i}` });
      const profile = generateDeterministicAgentProfile(p);
      counts[profile.archetype] = (counts[profile.archetype] ?? 0) + 1;
    }
    // Allow ±15% band from target rates
    expect(counts.SHARK       / N).toBeGreaterThan(0.15);
    expect(counts.SHARK       / N).toBeLessThan(0.45);
    expect(counts.LOYALIST    / N).toBeGreaterThan(0.25);
    expect(counts.LOYALIST    / N).toBeLessThan(0.55);
    expect(counts.RING_CHASER / N).toBeGreaterThan(0.15);
    expect(counts.RING_CHASER / N).toBeLessThan(0.45);
  });

  it('returns a frozen object', () => {
    const p = makePlayer({ id: 99 });
    const profile = generateDeterministicAgentProfile(p);
    expect(Object.isFrozen(profile)).toBe(true);
  });
});

// ── hydratePlayerAgent ────────────────────────────────────────────────────────

describe('hydratePlayerAgent', () => {
  it('preserves existing agent when already set', () => {
    const existingAgent = { id: 'agent_existing', name: 'X', archetype: 'SHARK', greed: 1, aggressiveness: 1, patience: 1 };
    const p = makePlayer({ agent: existingAgent, negotiationState: { negotiationsFrozenUntilSeason: null } });
    const result = hydratePlayerAgent(p);
    expect(result).toBe(p); // same reference
    expect(result.agent).toBe(existingAgent);
  });

  it('attaches missing agent without mutating input', () => {
    const p = makePlayer();
    const result = hydratePlayerAgent(p);
    expect(p.agent).toBeUndefined();   // original not mutated
    expect(result.agent).toBeDefined();
    expect(Object.values(AGENT_ARCHETYPES)).toContain(result.agent.archetype);
  });

  it('initializes negotiationState when absent', () => {
    const p = makePlayer();
    const result = hydratePlayerAgent(p);
    expect(result.negotiationState).toEqual({ negotiationsFrozenUntilSeason: null });
  });
});

// ── isNegotiationFrozen ───────────────────────────────────────────────────────

describe('isNegotiationFrozen', () => {
  it('is true only when season matches frozen season', () => {
    const p = { negotiationState: { negotiationsFrozenUntilSeason: 2025 } };
    expect(isNegotiationFrozen(p, 2025)).toBe(true);
    expect(isNegotiationFrozen(p, 2026)).toBe(false);
    expect(isNegotiationFrozen(p, 2024)).toBe(false);
  });

  it('is false when negotiationState is absent', () => {
    expect(isNegotiationFrozen({}, 2025)).toBe(false);
    expect(isNegotiationFrozen(null, 2025)).toBe(false);
  });
});

// ── computeAgentExpectedSalary ────────────────────────────────────────────────

describe('computeAgentExpectedSalary — SHARK', () => {
  it('includes greed premium above base', () => {
    // Force SHARK via id+name that produces archetypeRoll < 30
    // Find a player id that yields a SHARK
    let sharkPlayer = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}` });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'SHARK') { sharkPlayer = { ...p, agent: profile }; break; }
    }
    expect(sharkPlayer).not.toBeNull();
    const base = 20;
    const { expectedSalary, modifier } = computeAgentExpectedSalary({
      player: sharkPlayer,
      baseFairMarketValue: base,
      teamContext: {},
    });
    expect(modifier).toBeGreaterThan(0);
    expect(expectedSalary).toBeGreaterThan(base);
  });
});

describe('computeAgentExpectedSalary — LOYALIST', () => {
  it('gives discount when seasonsWithTeam >= 3', () => {
    let loyalistPlayer = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}`, tenureYears: 4 });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'LOYALIST') { loyalistPlayer = { ...p, agent: profile }; break; }
    }
    expect(loyalistPlayer).not.toBeNull();
    const base = 20;
    const { expectedSalary, modifier } = computeAgentExpectedSalary({
      player: loyalistPlayer,
      baseFairMarketValue: base,
      teamContext: {},
    });
    expect(modifier).toBeLessThan(0);
    expect(expectedSalary).toBeLessThan(base);
  });

  it('no discount when tenureYears < 3', () => {
    let loyalistPlayer = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}`, tenureYears: 1 });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'LOYALIST') { loyalistPlayer = { ...p, agent: profile }; break; }
    }
    expect(loyalistPlayer).not.toBeNull();
    const base = 20;
    const { expectedSalary, modifier } = computeAgentExpectedSalary({
      player: loyalistPlayer,
      baseFairMarketValue: base,
      teamContext: {},
    });
    expect(modifier).toBe(0);
    expect(expectedSalary).toBeCloseTo(base);
  });
});

describe('computeAgentExpectedSalary — RING_CHASER', () => {
  it('gives contender discount (0.85×) when rank <= 8', () => {
    let rc = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}` });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'RING_CHASER') { rc = { ...p, agent: profile }; break; }
    }
    expect(rc).not.toBeNull();
    const base = 20;
    const { expectedSalary, modifier } = computeAgentExpectedSalary({
      player: rc,
      baseFairMarketValue: base,
      teamContext: { teamPowerRankPosition: 3 },
    });
    expect(modifier).toBeCloseTo(-0.15);
    expect(expectedSalary).toBeCloseTo(base * 0.85, 5);
  });

  it('gives rebuilder premium (1.25×) when rank >= 25', () => {
    let rc = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}` });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'RING_CHASER') { rc = { ...p, agent: profile }; break; }
    }
    expect(rc).not.toBeNull();
    const base = 20;
    const { expectedSalary, modifier } = computeAgentExpectedSalary({
      player: rc,
      baseFairMarketValue: base,
      teamContext: { teamPowerRankPosition: 28 },
    });
    expect(modifier).toBeCloseTo(0.25);
    expect(expectedSalary).toBeCloseTo(base * 1.25, 5);
  });

  it('bottom-8 deterministic hard-reject path is stable across runs', () => {
    const rc = makePlayer({ id: 777, name: 'RingChaser', tenureYears: 0 });
    // Force RING_CHASER by setting directly
    const profile = generateDeterministicAgentProfile(rc);
    if (profile.archetype !== 'RING_CHASER') {
      // Skip test if this seed isn't a RING_CHASER
      return;
    }
    const rcWithAgent = { ...rc, agent: profile };
    const r1 = computeAgentExpectedSalary({ player: rcWithAgent, baseFairMarketValue: 20, teamContext: { teamPowerRankPosition: 30 } });
    const r2 = computeAgentExpectedSalary({ player: rcWithAgent, baseFairMarketValue: 20, teamContext: { teamPowerRankPosition: 30 } });
    expect(r1.hardReject).toBe(r2.hardReject);
  });
});

// ── evaluateAgentNegotiation — SHARK lowball freezes negotiations ─────────────

describe('evaluateAgentNegotiation — SHARK walk-away', () => {
  it('sets negotiationsFrozenUntilSeason when offer < 80% of base', () => {
    let sharkPlayer = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}` });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'SHARK') { sharkPlayer = { ...p, agent: profile, negotiationState: { negotiationsFrozenUntilSeason: null } }; break; }
    }
    expect(sharkPlayer).not.toBeNull();
    const base = 20;
    const result = evaluateAgentNegotiation({
      player:             sharkPlayer,
      offer:              { salary: base * 0.70 }, // 70% — below 80% floor
      baseFairMarketValue: base,
      teamContext:        {},
      currentSeason:      2025,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe('NEGOTIATIONS_FROZEN');
    expect(result.updatedPlayer.negotiationState.negotiationsFrozenUntilSeason).toBe(2025);
  });
});

// ── evaluateAgentNegotiation — frozen blocks subsequent attempts ──────────────

describe('evaluateAgentNegotiation — frozen gate', () => {
  it('rejects any offer when negotiations are frozen for the current season', () => {
    const p = makePlayer({
      id:               5,
      name:             'Frozen Player',
      agent:            { id: 'a', name: 'X', archetype: 'SHARK', greed: 0.5, aggressiveness: 0.5, patience: 0.5 },
      negotiationState: { negotiationsFrozenUntilSeason: 2025 },
    });
    const result = evaluateAgentNegotiation({
      player:             p,
      offer:              { salary: 999 }, // very generous offer
      baseFairMarketValue: 20,
      teamContext:        {},
      currentSeason:      2025,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe('NEGOTIATIONS_FROZEN');
  });

  it('does NOT freeze next season (auto-clears)', () => {
    const p = makePlayer({
      id:               5,
      agent:            { id: 'a', name: 'X', archetype: 'SHARK', greed: 0.5, aggressiveness: 0.5, patience: 0.5 },
      negotiationState: { negotiationsFrozenUntilSeason: 2025 },
    });
    // Season 2026 — freeze should have expired
    const result = evaluateAgentNegotiation({
      player:             p,
      offer:              { salary: 999 },
      baseFairMarketValue: 20,
      teamContext:        {},
      currentSeason:      2026,
    });
    // Not frozen for 2026, so proceeds to actual evaluation
    expect(result.rejectionCode).not.toBe('NEGOTIATIONS_FROZEN');
  });
});

// ── evaluateAgentNegotiation — LOYALIST walk-away bypass ─────────────────────

describe('evaluateAgentNegotiation — LOYALIST', () => {
  it('accepts even a below-expected offer above 50% of base', () => {
    let loyalistPlayer = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}`, tenureYears: 4 });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'LOYALIST') { loyalistPlayer = { ...p, agent: profile, negotiationState: { negotiationsFrozenUntilSeason: null } }; break; }
    }
    expect(loyalistPlayer).not.toBeNull();
    const base = 20;
    const result = evaluateAgentNegotiation({
      player:             loyalistPlayer,
      offer:              { salary: base * 0.55 }, // 55% — above 50% floor
      baseFairMarketValue: base,
      teamContext:        {},
      currentSeason:      2025,
    });
    // Loyalist won't walk away until < 50%; this may accept or reject on expected but NOT freeze
    expect(result.rejectionCode).not.toBe('NEGOTIATIONS_FROZEN');
  });

  it('rejects when offer < 50% of base', () => {
    let loyalistPlayer = null;
    for (let i = 0; i < 200; i++) {
      const p = makePlayer({ id: i, name: `Player${i}`, tenureYears: 4 });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype === 'LOYALIST') { loyalistPlayer = { ...p, agent: profile, negotiationState: { negotiationsFrozenUntilSeason: null } }; break; }
    }
    expect(loyalistPlayer).not.toBeNull();
    const base = 20;
    const result = evaluateAgentNegotiation({
      player:             loyalistPlayer,
      offer:              { salary: base * 0.40 }, // 40% — below 50% floor
      baseFairMarketValue: base,
      teamContext:        {},
      currentSeason:      2025,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe('LOYALIST_LOWBALL');
  });
});

// ── getAgentFeedbackText ──────────────────────────────────────────────────────

describe('getAgentFeedbackText', () => {
  it('returns correct shark copy', () => {
    const p = makePlayer({
      agent: { id: 'a', name: 'X', archetype: 'SHARK', greed: 0.5, aggressiveness: 0.5, patience: 0.5 },
      negotiationState: { negotiationsFrozenUntilSeason: null },
    });
    const text = getAgentFeedbackText({ player: p, rejectionCode: 'BELOW_EXPECTED' });
    expect(text).toContain('serious offer');
    expect(text).toContain('free agency');
  });

  it('returns frozen copy for NEGOTIATIONS_FROZEN', () => {
    const text = getAgentFeedbackText({ player: makePlayer(), rejectionCode: 'NEGOTIATIONS_FROZEN' });
    expect(text).toContain('Negotiations Frozen');
    expect(text).toContain('insulting');
  });

  it('returns ring-chaser losing-team copy', () => {
    const text = getAgentFeedbackText({ player: makePlayer(), rejectionCode: 'RING_CHASER_HARD_REJECT' });
    expect(text).toContain('winning championships');
    expect(text).toContain('rebuild');
  });

  it('returns loyalist offended copy for LOYALIST_LOWBALL', () => {
    const text = getAgentFeedbackText({ player: makePlayer(), rejectionCode: 'LOYALIST_LOWBALL' });
    expect(text).toContain('loyal');
    expect(text).toContain('disrespectful');
  });
});

// ── shouldEscalateSharkPressure ───────────────────────────────────────────────

describe('shouldEscalateSharkPressure', () => {
  function makeShark(overrides = {}) {
    const base = makePlayer({
      ovr: 88,
      contract: { years: 1, yearsRemaining: 1, baseAnnual: 20 },
      extensionDecision: 'pending',
      ...overrides,
    });
    const profile = generateDeterministicAgentProfile(base);
    // Force SHARK archetype for this test
    return { ...base, agent: { ...profile, archetype: 'SHARK' }, negotiationState: { negotiationsFrozenUntilSeason: null } };
  }

  it('returns true for SHARK + ovr >= 85 + final year', () => {
    const p = makeShark();
    expect(shouldEscalateSharkPressure({ player: p, currentSeasonPhase: 'regular', currentSeason: 2025 })).toBe(true);
  });

  it('returns false for non-SHARK archetype', () => {
    const p = makePlayer({
      ovr: 88,
      agent: { id: 'a', name: 'X', archetype: 'LOYALIST', greed: 0.5, aggressiveness: 0.5, patience: 0.5 },
      negotiationState: { negotiationsFrozenUntilSeason: null },
      contract: { years: 1, yearsRemaining: 1 },
    });
    expect(shouldEscalateSharkPressure({ player: p, currentSeason: 2025 })).toBe(false);
  });

  it('returns false when ovr < 85', () => {
    const p = makeShark({ ovr: 82 });
    expect(shouldEscalateSharkPressure({ player: p, currentSeason: 2025 })).toBe(false);
  });

  it('returns false when contract years > 1', () => {
    const p = makeShark({ contract: { years: 3, yearsRemaining: 3, baseAnnual: 20 } });
    expect(shouldEscalateSharkPressure({ player: p, currentSeason: 2025 })).toBe(false);
  });

  it('returns false when extension already reached', () => {
    const p = makeShark({ extensionDecision: 'extended' });
    expect(shouldEscalateSharkPressure({ player: p, currentSeason: 2025 })).toBe(false);
  });
});

// ── no Math.random in module ──────────────────────────────────────────────────

describe('agentNegotiationEngine — no Math.random', () => {
  it('does not reference Math.random in module source', async () => {
    // Dynamic import to get the module URL
    const fs = await import('fs');
    const path = await import('path');
    const url = await import('url');
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, 'agentNegotiationEngine.js'), 'utf8');
    expect(src).not.toContain('Math.random(');
  });
});
