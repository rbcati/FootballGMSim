import { describe, it, expect } from 'vitest';
import {
  deriveNegotiationContext,
  NEGOTIATION_STANCES,
  REASON_CODES,
} from './deriveNegotiationContext.js';

// ── Builders ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    age: 27,
    ovr: 72,
    tenureYears: 0,
    negotiationState: { negotiationsFrozenUntilSeason: null },
    ...overrides,
  };
}

function makeTeam(overrides = {}) {
  return {
    id: 10,
    name: 'Test Team',
    wins: 8,
    losses: 8,
    ties: 0,
    frontOffice: { persona: 'PATIENT_BUILDER' },
    ...overrides,
  };
}

const league = { seasonId: 2026, year: 2026 };

// ── Determinism ───────────────────────────────────────────────────────────────

describe('deriveNegotiationContext — determinism', () => {
  it('returns identical output for identical inputs', () => {
    const player = makePlayer({ tenureYears: 4, age: 33, ovr: 85 });
    const team = makeTeam({ frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const a = deriveNegotiationContext({ player, team, league });
    const b = deriveNegotiationContext({ player, team, league });
    expect(a).toEqual(b);
  });
});

// ── Immutability (required guardrail) ─────────────────────────────────────────

describe('deriveNegotiationContext — immutability', () => {
  it('does not mutate any input', () => {
    const player = makePlayer({ tenureYears: 4, age: 33, ovr: 90 });
    const team = makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } });
    const playerBefore = structuredClone(player);
    const teamBefore = structuredClone(team);
    const leagueBefore = structuredClone(league);
    deriveNegotiationContext({ player, team, league });
    expect(player).toEqual(playerBefore);
    expect(team).toEqual(teamBefore);
    expect(league).toEqual(leagueBefore);
  });
});

// ── Individual reason codes fire correctly ────────────────────────────────────

describe('deriveNegotiationContext — reason code triggers', () => {
  it('LOYAL_TENURE fires at tenureYears >= 3 and not below', () => {
    const team = makeTeam();
    expect(
      deriveNegotiationContext({ player: makePlayer({ tenureYears: 3 }), team, league }).reasons,
    ).toContain(REASON_CODES.LOYAL_TENURE);
    expect(
      deriveNegotiationContext({ player: makePlayer({ tenureYears: 2 }), team, league }).reasons,
    ).not.toContain(REASON_CODES.LOYAL_TENURE);
  });

  it('VETERAN_LOYALTY requires age >= 32 AND tenureYears >= 2', () => {
    const team = makeTeam();
    expect(
      deriveNegotiationContext({ player: makePlayer({ age: 32, tenureYears: 2 }), team, league }).reasons,
    ).toContain(REASON_CODES.VETERAN_LOYALTY);
    expect(
      deriveNegotiationContext({ player: makePlayer({ age: 31, tenureYears: 2 }), team, league }).reasons,
    ).not.toContain(REASON_CODES.VETERAN_LOYALTY);
    expect(
      deriveNegotiationContext({ player: makePlayer({ age: 34, tenureYears: 1 }), team, league }).reasons,
    ).not.toContain(REASON_CODES.VETERAN_LOYALTY);
  });

  it('LOYALTY_PERSONA fires only for PLAYER_LOYALIST front office', () => {
    expect(
      deriveNegotiationContext({
        player: makePlayer(),
        team: makeTeam({ frontOffice: { persona: 'PLAYER_LOYALIST' } }),
        league,
      }).reasons,
    ).toContain(REASON_CODES.LOYALTY_PERSONA);
    expect(
      deriveNegotiationContext({
        player: makePlayer(),
        team: makeTeam({ frontOffice: { persona: 'WIN_NOW' } }),
        league,
      }).reasons,
    ).not.toContain(REASON_CODES.LOYALTY_PERSONA);
  });

  it('WIN_NOW_URGENCY requires WIN_NOW persona AND star-caliber OVR', () => {
    const team = makeTeam({ frontOffice: { persona: 'WIN_NOW' } });
    expect(
      deriveNegotiationContext({ player: makePlayer({ ovr: 80 }), team, league }).reasons,
    ).toContain(REASON_CODES.WIN_NOW_URGENCY);
    expect(
      deriveNegotiationContext({ player: makePlayer({ ovr: 70 }), team, league }).reasons,
    ).not.toContain(REASON_CODES.WIN_NOW_URGENCY);
  });

  it('CAP_HOARDER_FRICTION requires CAP_HOARDER persona AND OVR >= 78', () => {
    const team = makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } });
    expect(
      deriveNegotiationContext({ player: makePlayer({ ovr: 84 }), team, league }).reasons,
    ).toContain(REASON_CODES.CAP_HOARDER_FRICTION);
    expect(
      deriveNegotiationContext({ player: makePlayer({ ovr: 70 }), team, league }).reasons,
    ).not.toContain(REASON_CODES.CAP_HOARDER_FRICTION);
  });

  it('REBUILDER_FRICTION fires for a star on a clearly losing team', () => {
    const team = makeTeam({ wins: 3, losses: 13, ties: 0, frontOffice: { persona: 'PATIENT_BUILDER' } });
    expect(
      deriveNegotiationContext({ player: makePlayer({ ovr: 84 }), team, league }).reasons,
    ).toContain(REASON_CODES.REBUILDER_FRICTION);
  });

  it('REBUILDER_FRICTION does NOT fire on an unplayed (0-0) record', () => {
    const team = makeTeam({ wins: 0, losses: 0, ties: 0 });
    expect(
      deriveNegotiationContext({ player: makePlayer({ ovr: 90 }), team, league }).reasons,
    ).not.toContain(REASON_CODES.REBUILDER_FRICTION);
  });

  it('REBUILDER_FRICTION does NOT fire for a non-star on a losing team', () => {
    const team = makeTeam({ wins: 2, losses: 14, ties: 0 });
    expect(
      deriveNegotiationContext({ player: makePlayer({ ovr: 70 }), team, league }).reasons,
    ).not.toContain(REASON_CODES.REBUILDER_FRICTION);
  });
});

// ── Stance resolution ─────────────────────────────────────────────────────────

describe('deriveNegotiationContext — stance resolution', () => {
  it('loyal star on a contender → EAGER', () => {
    const player = makePlayer({ tenureYears: 5, ovr: 88, age: 29 });
    const team = makeTeam({ wins: 13, losses: 4, frontOffice: { persona: 'WIN_NOW' } });
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.EAGER);
  });

  it('high-OVR starter on a rebuilder → RELUCTANT', () => {
    const player = makePlayer({ tenureYears: 0, ovr: 84, age: 27 });
    const team = makeTeam({ wins: 3, losses: 13, frontOffice: { persona: 'PATIENT_BUILDER' } });
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.RELUCTANT);
  });

  it('neutral mid-tier player → NEUTRAL', () => {
    const player = makePlayer({ tenureYears: 1, ovr: 70, age: 26 });
    const team = makeTeam({ wins: 8, losses: 8, frontOffice: { persona: 'PATIENT_BUILDER' } });
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.NEUTRAL);
  });

  it('a single positive code is not enough for EAGER (stays NEUTRAL)', () => {
    const player = makePlayer({ tenureYears: 4, ovr: 70, age: 28 });
    const team = makeTeam({ frontOffice: { persona: 'PATIENT_BUILDER' } });
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.NEUTRAL);
  });

  it('any negative code outweighs positives → RELUCTANT', () => {
    // Loyal tenure (positive) but a cap-hoarder front office (negative).
    const player = makePlayer({ tenureYears: 5, ovr: 85, age: 30 });
    const team = makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } });
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.RELUCTANT);
    // The friction reason leads the displayed labels.
    expect(ctx.reasons[0]).toBe(REASON_CODES.CAP_HOARDER_FRICTION);
  });
});

// ── UNAVAILABLE ───────────────────────────────────────────────────────────────

describe('deriveNegotiationContext — UNAVAILABLE', () => {
  it('frozen negotiations for the current season → UNAVAILABLE with no reasons', () => {
    const player = makePlayer({
      tenureYears: 5,
      ovr: 90,
      negotiationState: { negotiationsFrozenUntilSeason: 2026 },
    });
    const ctx = deriveNegotiationContext({ player, team: makeTeam(), league });
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.UNAVAILABLE);
    expect(ctx.reasons).toEqual([]);
    expect(ctx.reasonLabels).toEqual([]);
    expect(ctx.stanceLabel).toBeTruthy();
  });

  it('a stale freeze from a prior season does NOT mark UNAVAILABLE', () => {
    const player = makePlayer({
      negotiationState: { negotiationsFrozenUntilSeason: 2025 },
    });
    const ctx = deriveNegotiationContext({ player, team: makeTeam(), league });
    expect(ctx.stance).not.toBe(NEGOTIATION_STANCES.UNAVAILABLE);
  });

  it('without a known current season, a freeze cannot assert UNAVAILABLE', () => {
    const player = makePlayer({
      negotiationState: { negotiationsFrozenUntilSeason: 2026 },
    });
    const ctx = deriveNegotiationContext({ player, team: makeTeam(), league: {} });
    expect(ctx.stance).not.toBe(NEGOTIATION_STANCES.UNAVAILABLE);
  });
});

// ── Output shape / contract guarantees ────────────────────────────────────────

describe('deriveNegotiationContext — output contract', () => {
  it('reasonLabels has at most 3 entries', () => {
    // Stack many positives: loyal tenure + veteran loyalty + loyalty persona.
    const player = makePlayer({ tenureYears: 6, age: 34, ovr: 88 });
    const team = makeTeam({ frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.reasonLabels.length).toBeLessThanOrEqual(3);
    expect(ctx.reasons.length).toBeLessThanOrEqual(3);
  });

  it('stanceLabel is always a non-empty string', () => {
    for (const player of [makePlayer(), makePlayer({ tenureYears: 5, ovr: 90, age: 35 }), {}]) {
      const ctx = deriveNegotiationContext({ player, team: makeTeam(), league });
      expect(typeof ctx.stanceLabel).toBe('string');
      expect(ctx.stanceLabel.length).toBeGreaterThan(0);
    }
  });

  it('reasonLabels never expose raw reason codes', () => {
    const player = makePlayer({ tenureYears: 5, ovr: 85, age: 33 });
    const team = makeTeam({ frontOffice: { persona: 'WIN_NOW' } });
    const ctx = deriveNegotiationContext({ player, team, league });
    for (const label of ctx.reasonLabels) {
      expect(label).not.toMatch(/[A-Z]+_[A-Z]+/); // no SCREAMING_SNAKE codes
    }
  });
});

// ── Backward compatibility with old saves ─────────────────────────────────────

describe('deriveNegotiationContext — old save / missing fields', () => {
  it('missing player and team do not crash and default to NEUTRAL', () => {
    const ctx = deriveNegotiationContext({});
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.NEUTRAL);
    expect(ctx.stanceLabel).toBeTruthy();
    expect(ctx.reasons).toEqual([]);
  });

  it('completely empty call does not crash', () => {
    const ctx = deriveNegotiationContext();
    expect(ctx.stance).toBe(NEGOTIATION_STANCES.NEUTRAL);
  });

  it('player without negotiationState (old save) is not UNAVAILABLE', () => {
    const player = { id: 7, name: 'Legacy', pos: 'QB', age: 28, ovr: 75 };
    const team = { id: 2, wins: 9, losses: 7 };
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.stance).not.toBe(NEGOTIATION_STANCES.UNAVAILABLE);
  });

  it('team without frontOffice (old save) skips persona reasons silently', () => {
    const player = makePlayer({ tenureYears: 4 });
    const team = { id: 3, wins: 8, losses: 8 };
    const ctx = deriveNegotiationContext({ player, team, league });
    expect(ctx.reasons).toContain(REASON_CODES.LOYAL_TENURE);
    expect(ctx.reasons).not.toContain(REASON_CODES.LOYALTY_PERSONA);
  });
});
