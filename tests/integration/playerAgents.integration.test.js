/**
 * playerAgents.integration.test.js
 *
 * Integration tests verifying that the agent negotiation engine is correctly
 * wired into the game's contract/holdout pipeline without breaking existing logic.
 *
 * These tests operate directly on core modules rather than booting the full
 * worker (which has its own dedicated worker integration tests).
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_ARCHETYPES,
  hydratePlayerAgent,
  evaluateAgentNegotiation,
  shouldEscalateSharkPressure,
  generateDeterministicAgentProfile,
  getAgentFeedbackText,
  computeAgentExpectedSalary,
} from '../../src/core/contracts/agentNegotiationEngine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id:                1,
    name:              'Test Player',
    pos:               'QB',
    ovr:               80,
    age:               27,
    contract:          { years: 1, yearsRemaining: 1, baseAnnual: 20 },
    tenureYears:       0,
    extensionDecision: 'pending',
    ...overrides,
  };
}

/** Returns first player of a given archetype from a pool of generated ids */
function findPlayerWithArchetype(archetype, opts = {}) {
  for (let i = 0; i < 300; i++) {
    const p = makePlayer({ id: i, name: `Player${i}`, ...opts });
    const profile = generateDeterministicAgentProfile(p);
    if (profile.archetype === archetype) {
      return { ...p, agent: profile, negotiationState: { negotiationsFrozenUntilSeason: null } };
    }
  }
  return null;
}

// ── 1. Legacy save hydration ──────────────────────────────────────────────────

describe('legacy save hydration', () => {
  it('attaches agent to legacy player without agent field', () => {
    const legacyPlayer = makePlayer({ contract: { years: 2, baseAnnual: 15, signingBonus: 5, yearsTotal: 4 } });
    expect(legacyPlayer.agent).toBeUndefined();

    const hydrated = hydratePlayerAgent(legacyPlayer);

    expect(hydrated.agent).toBeDefined();
    expect(Object.values(AGENT_ARCHETYPES)).toContain(hydrated.agent.archetype);
  });

  it('does not drop existing contract data during hydration', () => {
    const legacyPlayer = makePlayer({
      contract: { years: 2, baseAnnual: 18, signingBonus: 6, yearsTotal: 4, guaranteedPct: 0.6 },
    });
    const hydrated = hydratePlayerAgent(legacyPlayer);

    expect(hydrated.contract.baseAnnual).toBe(18);
    expect(hydrated.contract.signingBonus).toBe(6);
    expect(hydrated.contract.guaranteedPct).toBe(0.6);
  });

  it('does not mutate the original player', () => {
    const p = makePlayer();
    const before = JSON.stringify(p);
    hydratePlayerAgent(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

// ── 2. New player generation ──────────────────────────────────────────────────

describe('new player generation', () => {
  it('makePlayer assigns a deterministic agent profile', async () => {
    const { makePlayer: makeP } = await import('../../src/core/player.js');
    const p = makeP('QB', 25, 80);
    expect(p.agent).toBeDefined();
    expect(Object.values(AGENT_ARCHETYPES)).toContain(p.agent.archetype);
    expect(typeof p.agent.greed).toBe('number');
  });

  it('new player has negotiationState initialized', async () => {
    const { makePlayer: makeP } = await import('../../src/core/player.js');
    const p = makeP('RB', 23, 72);
    expect(p.negotiationState).toBeDefined();
    expect(p.negotiationState.negotiationsFrozenUntilSeason).toBeNull();
  });
});

// ── 3. Extension offer — agent-adjusted rejection ─────────────────────────────

describe('extension offer rejection — agent threshold', () => {
  it('SHARK rejects offer below expected salary', () => {
    const shark = findPlayerWithArchetype('SHARK');
    expect(shark).not.toBeNull();

    const base = 20;
    const result = evaluateAgentNegotiation({
      player:              shark,
      offer:               { salary: base * 0.50 }, // well below shark expected
      baseFairMarketValue: base,
      teamContext:         {},
      currentSeason:       2025,
    });
    expect(result.accepted).toBe(false);
  });

  it('SHARK accepts offer at or above expected salary', () => {
    const shark = findPlayerWithArchetype('SHARK');
    expect(shark).not.toBeNull();

    const base = 20;
    const { expectedSalary } = computeAgentExpectedSalary({
      player: shark, baseFairMarketValue: base, teamContext: {},
    });
    const result = evaluateAgentNegotiation({
      player:              shark,
      offer:               { salary: expectedSalary },
      baseFairMarketValue: base,
      teamContext:         {},
      currentSeason:       2025,
    });
    expect(result.accepted).toBe(true);
  });
});

// ── 4. Restructure offer — agent-adjusted rejection ───────────────────────────

describe('restructure offer rejection — agent threshold', () => {
  it('evaluateAgentNegotiation with restructure-style offer (base == offered) accepts for non-freezing cases', () => {
    const loyalist = findPlayerWithArchetype('LOYALIST', { tenureYears: 2 });
    expect(loyalist).not.toBeNull();

    const base = 20;
    // For restructure: offer.salary === baseFairMarketValue (same amount)
    const result = evaluateAgentNegotiation({
      player:              loyalist,
      offer:               { salary: base },
      baseFairMarketValue: base,
      teamContext:         { teamPowerRankPosition: 16 },
      currentSeason:       2025,
    });
    // Loyalist with 2 seasons tenure and fair offer should accept
    expect(result.accepted).toBe(true);
  });

  it('RING_CHASER hard-reject gate fires on bottom-8 teams', () => {
    // Find a RING_CHASER that specifically has hardReject === true on a bottom team
    let found = false;
    for (let i = 0; i < 500; i++) {
      const p = makePlayer({ id: i, name: `Player${i}` });
      const profile = generateDeterministicAgentProfile(p);
      if (profile.archetype !== 'RING_CHASER') continue;

      const rc = { ...p, agent: profile, negotiationState: { negotiationsFrozenUntilSeason: null } };
      const { hardReject } = computeAgentExpectedSalary({ player: rc, baseFairMarketValue: 20, teamContext: { teamPowerRankPosition: 28 } });
      if (hardReject) {
        const result = evaluateAgentNegotiation({
          player:              rc,
          offer:               { salary: 999 },
          baseFairMarketValue: 20,
          teamContext:         { teamPowerRankPosition: 28 },
          currentSeason:       2025,
        });
        expect(result.accepted).toBe(false);
        expect(result.rejectionCode).toBe('RING_CHASER_HARD_REJECT');
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ── 5. Frozen shark blocks subsequent attempts ────────────────────────────────

describe('frozen shark', () => {
  it('blocks all subsequent negotiation attempts in same season', () => {
    const shark = findPlayerWithArchetype('SHARK');
    expect(shark).not.toBeNull();

    const base = 20;
    // Step 1: insult the shark
    const step1 = evaluateAgentNegotiation({
      player:              shark,
      offer:               { salary: base * 0.70 },
      baseFairMarketValue: base,
      teamContext:         {},
      currentSeason:       2025,
    });
    expect(step1.rejectionCode).toBe('NEGOTIATIONS_FROZEN');

    // Step 2: try again in same season with generous offer — should still be blocked
    const frozenPlayer = step1.updatedPlayer;
    const step2 = evaluateAgentNegotiation({
      player:              frozenPlayer,
      offer:               { salary: base * 2 }, // extremely generous
      baseFairMarketValue: base,
      teamContext:         {},
      currentSeason:       2025,
    });
    expect(step2.accepted).toBe(false);
    expect(step2.rejectionCode).toBe('NEGOTIATIONS_FROZEN');
  });
});

// ── 6. Frozen state clears next season ───────────────────────────────────────

describe('frozen state expiry', () => {
  it('auto-clears in next season without explicit reset (season mismatch)', () => {
    const frozenPlayer = makePlayer({
      agent:            { id: 'a', name: 'X', archetype: 'SHARK', greed: 0.5, aggressiveness: 0.5, patience: 0.5 },
      negotiationState: { negotiationsFrozenUntilSeason: 2025 },
    });

    // Season 2026: freeze has expired by definition
    const result = evaluateAgentNegotiation({
      player:              frozenPlayer,
      offer:               { salary: 30 }, // generous offer
      baseFairMarketValue: 20,
      teamContext:         {},
      currentSeason:       2026,
    });
    expect(result.rejectionCode).not.toBe('NEGOTIATIONS_FROZEN');
  });
});

// ── 7. Ring Chaser losing-team contextual feedback ───────────────────────────

describe('ring chaser on losing team', () => {
  it('returns contextual rejection copy mentioning winning championships', () => {
    const text = getAgentFeedbackText({ player: makePlayer(), rejectionCode: 'RING_CHASER_HARD_REJECT' });
    expect(text).toContain('winning championships');
  });
});

// ── 8. Shark pressure increases holdout/trade-request escalation weight ───────

describe('shark pressure holdout escalation', () => {
  it('shouldEscalateSharkPressure returns true for qualifying shark player', () => {
    const sharkElite = makePlayer({
      ovr:               90,
      extensionDecision: 'pending',
      contract:          { years: 1, yearsRemaining: 1, baseAnnual: 25 },
      agent:             { id: 'a', name: 'X', archetype: 'SHARK', greed: 0.8, aggressiveness: 0.8, patience: 0.2 },
      negotiationState:  { negotiationsFrozenUntilSeason: null },
    });
    expect(shouldEscalateSharkPressure({ player: sharkElite, currentSeasonPhase: 'regular', currentSeason: 2025 })).toBe(true);
  });

  it('returns false for a non-shark player even if elite', () => {
    const loyalistElite = makePlayer({
      ovr:    90,
      agent:  { id: 'a', name: 'X', archetype: 'LOYALIST', greed: 0.5, aggressiveness: 0.5, patience: 0.5 },
      contract: { years: 1, yearsRemaining: 1, baseAnnual: 25 },
    });
    expect(shouldEscalateSharkPressure({ player: loyalistElite, currentSeason: 2025 })).toBe(false);
  });
});

// ── 9. No regression in baseline extension acceptance ────────────────────────

describe('baseline extension acceptance regression', () => {
  it('LOYALIST with fair offer (at or above expected) should accept', () => {
    const loyalist = findPlayerWithArchetype('LOYALIST', { tenureYears: 4 });
    expect(loyalist).not.toBeNull();

    const base = 20;
    const { expectedSalary } = computeAgentExpectedSalary({ player: loyalist, baseFairMarketValue: base, teamContext: {} });

    const result = evaluateAgentNegotiation({
      player:              loyalist,
      offer:               { salary: expectedSalary + 1 },
      baseFairMarketValue: base,
      teamContext:         {},
      currentSeason:       2025,
    });
    expect(result.accepted).toBe(true);
  });

  it('neutral offer at 100% of base should not be rejected by ring chaser on a contender', () => {
    const rc = findPlayerWithArchetype('RING_CHASER');
    expect(rc).not.toBeNull();

    const base = 20;
    // Contender discount makes expectedSalary = 0.85 × base = 17
    const result = evaluateAgentNegotiation({
      player:              rc,
      offer:               { salary: base }, // base is above 0.85× so it should satisfy
      baseFairMarketValue: base,
      teamContext:         { teamPowerRankPosition: 4 }, // contender
      currentSeason:       2025,
    });
    expect(result.accepted).toBe(true);
  });
});
