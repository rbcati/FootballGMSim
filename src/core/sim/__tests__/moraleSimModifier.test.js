import { describe, it, expect } from 'vitest';
import {
  MORALE_MODIFIER_TABLE,
  getMoraleOvrModifier,
  applyMoraleToEffectiveOvr,
} from '../moraleSimModifier.js';
import { simulateRichGame } from '../richGameSimulator.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayerRef({ ovr = 78, morale = undefined, pos = 'WR', id = 1 } = {}) {
  const p = { id, name: 'Test Player', pos, ovr };
  if (morale !== undefined) p.morale = morale;
  return p;
}

function makeMinimalPayload(homePlayers, awayPlayers) {
  const offense = {
    throwAccuracyShort: 75, throwAccuracyDeep: 70, throwPower: 72, release: 74,
    routeRunning: 73, separation: 71, catchInTraffic: 70, ballTracking: 72,
    decisionMaking: 74, pocketPresence: 73, passBlockFootwork: 70, passBlockStrength: 71,
    passRush: 70, pressCoverage: 68, zoneCoverage: 69, tackleStrength: 70,
    runBlockStrength: 70, runBlockFootwork: 70, speedRating: 72, agilityRating: 71,
  };
  const defense = { ...offense };
  return {
    gameId: 'test-morale-1',
    seed: 42,
    homeTeamId: 1,
    awayTeamId: 2,
    homeOffense: offense,
    awayOffense: { ...offense },
    homeDefense: defense,
    awayDefense: { ...defense },
    homePlayers,
    awayPlayers,
  };
}

function makeDefaultRoster(side) {
  const prefix = side === 'home' ? 'H' : 'A';
  const teamId = side === 'home' ? 1 : 2;
  return [
    { id: `${teamId}-QB1`,  name: `${prefix} QB1`,   pos: 'QB',   ovr: 78 },
    { id: `${teamId}-RB1`,  name: `${prefix} RB1`,   pos: 'RB',   ovr: 76 },
    { id: `${teamId}-WR1`,  name: `${prefix} WR1`,   pos: 'WR',   ovr: 79 },
    { id: `${teamId}-WR2`,  name: `${prefix} WR2`,   pos: 'WR',   ovr: 75 },
    { id: `${teamId}-TE1`,  name: `${prefix} TE1`,   pos: 'TE',   ovr: 74 },
    { id: `${teamId}-EDGE1`,name: `${prefix} EDGE1`, pos: 'EDGE', ovr: 77 },
    { id: `${teamId}-LB1`,  name: `${prefix} LB1`,   pos: 'LB',   ovr: 75 },
    { id: `${teamId}-CB1`,  name: `${prefix} CB1`,   pos: 'CB',   ovr: 77 },
    { id: `${teamId}-S1`,   name: `${prefix} S1`,    pos: 'S',    ovr: 74 },
    { id: `${teamId}-K1`,   name: `${prefix} K1`,    pos: 'K',    ovr: 73 },
    { id: `${teamId}-P1`,   name: `${prefix} P1`,    pos: 'P',    ovr: 72 },
  ];
}

// ── MORALE_MODIFIER_TABLE ─────────────────────────────────────────────────────

describe('MORALE_MODIFIER_TABLE', () => {
  it('is exported and frozen', () => {
    expect(MORALE_MODIFIER_TABLE).toBeDefined();
    expect(Object.isFrozen(MORALE_MODIFIER_TABLE)).toBe(true);
  });

  it('has five bands in descending min order', () => {
    expect(MORALE_MODIFIER_TABLE).toHaveLength(5);
    const mins = MORALE_MODIFIER_TABLE.map((b) => b.min);
    expect(mins).toEqual([85, 70, 55, 40, 0]);
  });

  it('labels match the spec', () => {
    const labels = MORALE_MODIFIER_TABLE.map((b) => b.label);
    expect(labels).toEqual(['Thriving', 'Settled', 'Neutral', 'Frustrated', 'Disgruntled']);
  });

  it('modifier values match the spec', () => {
    const mods = MORALE_MODIFIER_TABLE.map((b) => b.modifier);
    expect(mods).toEqual([2, 0, 0, -2, -4]);
  });
});

// ── getMoraleOvrModifier ──────────────────────────────────────────────────────

describe('getMoraleOvrModifier', () => {
  it('Thriving (morale >= 85) → +2', () => {
    expect(getMoraleOvrModifier({ morale: 85 })).toBe(2);
    expect(getMoraleOvrModifier({ morale: 100 })).toBe(2);
    expect(getMoraleOvrModifier({ morale: 90 })).toBe(2);
  });

  it('Settled (70–84) → 0', () => {
    expect(getMoraleOvrModifier({ morale: 70 })).toBe(0);
    expect(getMoraleOvrModifier({ morale: 84 })).toBe(0);
    expect(getMoraleOvrModifier({ morale: 75 })).toBe(0);
  });

  it('Neutral (55–69) → 0', () => {
    expect(getMoraleOvrModifier({ morale: 55 })).toBe(0);
    expect(getMoraleOvrModifier({ morale: 69 })).toBe(0);
    expect(getMoraleOvrModifier({ morale: 62 })).toBe(0);
  });

  it('Frustrated (40–54) → −2', () => {
    expect(getMoraleOvrModifier({ morale: 40 })).toBe(-2);
    expect(getMoraleOvrModifier({ morale: 54 })).toBe(-2);
    expect(getMoraleOvrModifier({ morale: 47 })).toBe(-2);
  });

  it('Disgruntled (< 40) → −4', () => {
    expect(getMoraleOvrModifier({ morale: 39 })).toBe(-4);
    expect(getMoraleOvrModifier({ morale: 0 })).toBe(-4);
    expect(getMoraleOvrModifier({ morale: 20 })).toBe(-4);
  });

  it('missing morale → 0 (old-save safe, no crash)', () => {
    expect(getMoraleOvrModifier({})).toBe(0);
    expect(getMoraleOvrModifier({ morale: undefined })).toBe(0);
    expect(getMoraleOvrModifier(null)).toBe(0);
    expect(getMoraleOvrModifier(undefined)).toBe(0);
  });

  it('non-finite morale → 0', () => {
    expect(getMoraleOvrModifier({ morale: NaN })).toBe(0);
    expect(getMoraleOvrModifier({ morale: Infinity })).toBe(0);
  });

  it('is deterministic: same input → same output', () => {
    const p = { morale: 88 };
    expect(getMoraleOvrModifier(p)).toBe(getMoraleOvrModifier(p));
    expect(getMoraleOvrModifier(p)).toBe(2);
    expect(getMoraleOvrModifier({ morale: 30 })).toBe(-4);
    expect(getMoraleOvrModifier({ morale: 30 })).toBe(-4);
  });

  it('boundary at exactly 85 gives Thriving (+2), not Settled', () => {
    expect(getMoraleOvrModifier({ morale: 85 })).toBe(2);
    expect(getMoraleOvrModifier({ morale: 84 })).toBe(0);
  });

  it('boundary at exactly 40 gives Frustrated (−2), not Disgruntled', () => {
    expect(getMoraleOvrModifier({ morale: 40 })).toBe(-2);
    expect(getMoraleOvrModifier({ morale: 39 })).toBe(-4);
  });
});

// ── applyMoraleToEffectiveOvr ─────────────────────────────────────────────────

describe('applyMoraleToEffectiveOvr', () => {
  it('Thriving player: effectiveOvr = baseOvr + 2', () => {
    expect(applyMoraleToEffectiveOvr(75, { morale: 90 })).toBe(77);
  });

  it('Settled player: effectiveOvr = baseOvr (no change)', () => {
    expect(applyMoraleToEffectiveOvr(75, { morale: 75 })).toBe(75);
  });

  it('Neutral player: effectiveOvr = baseOvr (no change)', () => {
    expect(applyMoraleToEffectiveOvr(75, { morale: 60 })).toBe(75);
  });

  it('Frustrated player: effectiveOvr = baseOvr − 2', () => {
    expect(applyMoraleToEffectiveOvr(75, { morale: 45 })).toBe(73);
  });

  it('Disgruntled player: effectiveOvr = baseOvr − 4', () => {
    expect(applyMoraleToEffectiveOvr(75, { morale: 25 })).toBe(71);
  });

  it('clamps result at upper bound (99)', () => {
    expect(applyMoraleToEffectiveOvr(99, { morale: 100 })).toBe(99);
    expect(applyMoraleToEffectiveOvr(98, { morale: 100 })).toBe(99);
  });

  it('clamps result at lower bound (1)', () => {
    expect(applyMoraleToEffectiveOvr(1, { morale: 0 })).toBe(1);
    expect(applyMoraleToEffectiveOvr(2, { morale: 0 })).toBe(1);
  });

  it('missing morale → effectiveOvr equals baseOvr', () => {
    expect(applyMoraleToEffectiveOvr(75, {})).toBe(75);
    expect(applyMoraleToEffectiveOvr(75, { morale: undefined })).toBe(75);
    expect(applyMoraleToEffectiveOvr(75, null)).toBe(75);
  });

  it('is deterministic: same inputs → same output every call', () => {
    const result1 = applyMoraleToEffectiveOvr(80, { morale: 30 });
    const result2 = applyMoraleToEffectiveOvr(80, { morale: 30 });
    expect(result1).toBe(result2);
    expect(result1).toBe(76);
  });

  it('max positive shift is +2 (Thriving cap)', () => {
    const base = 70;
    const result = applyMoraleToEffectiveOvr(base, { morale: 100 });
    expect(result - base).toBe(2);
  });

  it('max negative shift is −4 (Disgruntled floor)', () => {
    const base = 70;
    const result = applyMoraleToEffectiveOvr(base, { morale: 0 });
    expect(result - base).toBe(-4);
  });
});

// ── Sim integration tests ─────────────────────────────────────────────────────

describe('moraleSimModifier — sim integration', () => {
  it('disgruntled starter produces lower effective OVR than neutral baseline at attribute lookup', () => {
    const baseOvr = 80;
    const disgruntled = makePlayerRef({ ovr: baseOvr, morale: 20 });
    const neutral = makePlayerRef({ ovr: baseOvr, morale: 70 });

    const disgruntledEffective = applyMoraleToEffectiveOvr(baseOvr, disgruntled);
    const neutralEffective = applyMoraleToEffectiveOvr(baseOvr, neutral);

    expect(disgruntledEffective).toBeLessThan(neutralEffective);
    expect(disgruntledEffective).toBe(baseOvr - 4);
  });

  it('thriving starter produces higher effective OVR than neutral baseline at attribute lookup', () => {
    const baseOvr = 80;
    const thriving = makePlayerRef({ ovr: baseOvr, morale: 90 });
    const neutral = makePlayerRef({ ovr: baseOvr, morale: 70 });

    const thrivingEffective = applyMoraleToEffectiveOvr(baseOvr, thriving);
    const neutralEffective = applyMoraleToEffectiveOvr(baseOvr, neutral);

    expect(thrivingEffective).toBeGreaterThan(neutralEffective);
    expect(thrivingEffective).toBe(baseOvr + 2);
  });

  it('modifier does not mutate player.ovr', () => {
    const player = makePlayerRef({ ovr: 80, morale: 20 });
    const originalOvr = player.ovr;

    applyMoraleToEffectiveOvr(player.ovr, player);
    getMoraleOvrModifier(player);

    expect(player.ovr).toBe(originalOvr);
  });

  it('simulateRichGame completes without crash when players have morale fields', () => {
    const homePlayers = makeDefaultRoster('home').map((p, i) => ({
      ...p,
      morale: i % 2 === 0 ? 30 : 90,
    }));
    const awayPlayers = makeDefaultRoster('away').map((p) => ({ ...p, morale: 70 }));

    expect(() => {
      simulateRichGame(makeMinimalPayload(homePlayers, awayPlayers));
    }).not.toThrow();
  });

  it('simulateRichGame completes without crash for old-save players (no morale field)', () => {
    const homePlayers = makeDefaultRoster('home');
    const awayPlayers = makeDefaultRoster('away');

    expect(() => {
      simulateRichGame(makeMinimalPayload(homePlayers, awayPlayers));
    }).not.toThrow();
  });

  it('simulateRichGame does not mutate player.ovr', () => {
    const homePlayers = makeDefaultRoster('home').map((p) => ({ ...p, morale: 20 }));
    const awayPlayers = makeDefaultRoster('away').map((p) => ({ ...p, morale: 90 }));
    const homeOvrBefore = homePlayers.map((p) => p.ovr);
    const awayOvrBefore = awayPlayers.map((p) => p.ovr);

    simulateRichGame(makeMinimalPayload(homePlayers, awayPlayers));

    expect(homePlayers.map((p) => p.ovr)).toEqual(homeOvrBefore);
    expect(awayPlayers.map((p) => p.ovr)).toEqual(awayOvrBefore);
  });

  it('simulateRichGame with all-neutral morale produces same result as no-morale (deterministic)', () => {
    const homePlayers = makeDefaultRoster('home');
    const awayPlayers = makeDefaultRoster('away');
    const homeWithNeutralMorale = homePlayers.map((p) => ({ ...p, morale: 70 }));
    const awayWithNeutralMorale = awayPlayers.map((p) => ({ ...p, morale: 70 }));

    const resultNoMorale = simulateRichGame(makeMinimalPayload(homePlayers, awayPlayers));
    const resultNeutral = simulateRichGame(makeMinimalPayload(homeWithNeutralMorale, awayWithNeutralMorale));

    // Neutral morale = 0 modifier, so outputs must be identical
    expect(resultNoMorale.homeScore).toBe(resultNeutral.homeScore);
    expect(resultNoMorale.awayScore).toBe(resultNeutral.awayScore);
    expect(resultNoMorale.totalPlays).toBe(resultNeutral.totalPlays);
  });
});
