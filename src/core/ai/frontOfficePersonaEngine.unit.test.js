import { describe, expect, it } from 'vitest';
import {
  FRONT_OFFICE_PERSONAS,
  buildFrontOfficeProfile,
  determineInitialPersona,
  applyTradePersonaModifier,
  shouldCapHoarderWalkAway,
  getRetentionPremium,
  maybeDriftPersona,
} from './frontOfficePersonaEngine.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return {
    id:       1,
    name:     'Test Team',
    ovr:      80,
    capUsed:  180_000_000,
    capTotal: 255_000_000,
    roster:   [],
    ...overrides,
  };
}

function makeRoster(count, avgAge) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1, age: avgAge, ovr: 75,
  }));
}

// ── FRONT_OFFICE_PERSONAS constants ───────────────────────────────────────────

describe('FRONT_OFFICE_PERSONAS', () => {
  it('exports all four persona keys as frozen constants', () => {
    expect(FRONT_OFFICE_PERSONAS.WIN_NOW).toBe('WIN_NOW');
    expect(FRONT_OFFICE_PERSONAS.PATIENT_BUILDER).toBe('PATIENT_BUILDER');
    expect(FRONT_OFFICE_PERSONAS.CAP_HOARDER).toBe('CAP_HOARDER');
    expect(FRONT_OFFICE_PERSONAS.PLAYER_LOYALIST).toBe('PLAYER_LOYALIST');
    expect(Object.isFrozen(FRONT_OFFICE_PERSONAS)).toBe(true);
  });
});

// ── buildFrontOfficeProfile ───────────────────────────────────────────────────

describe('buildFrontOfficeProfile', () => {
  it('returns expected multiplier structure for WIN_NOW', () => {
    const profile = buildFrontOfficeProfile('WIN_NOW');
    expect(profile.persona).toBe('WIN_NOW');
    expect(profile.tradeAggressiveness).toBeGreaterThan(0.6);
    expect(profile.draftPickPremium).toBeLessThan(1.0);
    expect(profile.extensionTolerance).toBeGreaterThan(0.7);
  });

  it('returns expected multiplier structure for PATIENT_BUILDER', () => {
    const profile = buildFrontOfficeProfile('PATIENT_BUILDER');
    expect(profile.persona).toBe('PATIENT_BUILDER');
    expect(profile.tradeAggressiveness).toBeLessThan(0.5);
    expect(profile.draftPickPremium).toBeGreaterThan(1.0);
    expect(profile.extensionTolerance).toBeLessThan(0.8);
  });

  it('returns expected multiplier structure for CAP_HOARDER', () => {
    const profile = buildFrontOfficeProfile('CAP_HOARDER');
    expect(profile.persona).toBe('CAP_HOARDER');
    expect(profile.extensionTolerance).toBeLessThan(0.6);
  });

  it('returns expected multiplier structure for PLAYER_LOYALIST', () => {
    const profile = buildFrontOfficeProfile('PLAYER_LOYALIST');
    expect(profile.persona).toBe('PLAYER_LOYALIST');
    expect(profile.extensionTolerance).toBeGreaterThan(1.0);
  });

  it('falls back to PATIENT_BUILDER for unknown persona', () => {
    const profile = buildFrontOfficeProfile('UNKNOWN_PERSONA');
    expect(profile.persona).toBe('PATIENT_BUILDER');
  });

  it('WIN_NOW is more aggressive than PATIENT_BUILDER', () => {
    const win    = buildFrontOfficeProfile('WIN_NOW');
    const pat    = buildFrontOfficeProfile('PATIENT_BUILDER');
    expect(win.tradeAggressiveness).toBeGreaterThan(pat.tradeAggressiveness);
    expect(win.draftPickPremium).toBeLessThan(pat.draftPickPremium);
  });
});

// ── determineInitialPersona ───────────────────────────────────────────────────

describe('determineInitialPersona', () => {
  it('is deterministic: same inputs always yield same persona', () => {
    const team    = makeTeam({ id: 5, ovr: 85, roster: makeRoster(20, 28) });
    const allTeams = [
      team,
      ...Array.from({ length: 15 }, (_, i) => makeTeam({ id: i + 10, ovr: 70 })),
    ];
    const ctx = { allTeams };
    const p1  = determineInitialPersona(team, ctx);
    const p2  = determineInitialPersona(team, ctx);
    expect(p1.persona).toBe(p2.persona);
    expect(p1.tradeAggressiveness).toBe(p2.tradeAggressiveness);
  });

  it('contender team with old roster maps to WIN_NOW', () => {
    const oldRoster = makeRoster(20, 29);
    const team      = makeTeam({ id: 1, ovr: 92, roster: oldRoster });
    const allTeams  = [
      team,
      ...Array.from({ length: 20 }, (_, i) => makeTeam({ id: i + 2, ovr: 70 })),
    ];
    const profile = determineInitialPersona(team, { allTeams });
    expect(profile.persona).toBe('WIN_NOW');
  });

  it('weak team with young roster maps to PATIENT_BUILDER', () => {
    const youngRoster = makeRoster(20, 22);
    const weakTeam    = makeTeam({ id: 32, ovr: 58, roster: youngRoster });
    const allTeams    = [
      ...Array.from({ length: 20 }, (_, i) => makeTeam({ id: i + 1, ovr: 88 })),
      weakTeam,
    ];
    const profile = determineInitialPersona(weakTeam, { allTeams });
    expect(profile.persona).toBe('PATIENT_BUILDER');
  });

  it('very young average age alone triggers PATIENT_BUILDER', () => {
    const youngRoster = makeRoster(20, 22);
    const team        = makeTeam({ id: 1, ovr: 78, roster: youngRoster });
    const allTeams    = [team, makeTeam({ id: 2, ovr: 80 })];
    const profile     = determineInitialPersona(team, { allTeams });
    expect(profile.persona).toBe('PATIENT_BUILDER');
  });

  it('cap-stressed mid-pack team maps to CAP_HOARDER', () => {
    const team     = makeTeam({ id: 1, ovr: 78, capUsed: 240_000_000, capTotal: 255_000_000, roster: makeRoster(10, 28) });
    const allTeams = [
      makeTeam({ id: 2, ovr: 90 }),
      makeTeam({ id: 3, ovr: 85 }),
      makeTeam({ id: 4, ovr: 82 }),
      makeTeam({ id: 5, ovr: 80 }),
      makeTeam({ id: 6, ovr: 79 }),
      team,
      makeTeam({ id: 8, ovr: 72 }),
      makeTeam({ id: 9, ovr: 68 }),
      makeTeam({ id: 10, ovr: 62 }),
    ];
    const profile = determineInitialPersona(team, { allTeams });
    expect(profile.persona).toBe('CAP_HOARDER');
  });

  it('produces a valid persona string for any team', () => {
    const validPersonas = Object.values(FRONT_OFFICE_PERSONAS);
    for (let id = 1; id <= 32; id++) {
      const team    = makeTeam({ id, ovr: 60 + id, roster: makeRoster(5, 25) });
      const profile = determineInitialPersona(team, { allTeams: [team] });
      expect(validPersonas).toContain(profile.persona);
    }
  });

  it('works with no allTeams context (graceful fallback)', () => {
    const team    = makeTeam({ id: 1, ovr: 75 });
    const profile = determineInitialPersona(team);
    expect(Object.values(FRONT_OFFICE_PERSONAS)).toContain(profile.persona);
  });
});

// ── applyTradePersonaModifier ─────────────────────────────────────────────────

describe('applyTradePersonaModifier', () => {
  function winNowTeam() {
    return makeTeam({ frontOffice: { persona: 'WIN_NOW' } });
  }
  function patientTeam() {
    return makeTeam({ frontOffice: { persona: 'PATIENT_BUILDER' } });
  }

  it('WIN_NOW down-weights own future picks when giving', () => {
    const team   = winNowTeam();
    const asset  = { type: 'pick', pick: { round: 1 } };
    const result = applyTradePersonaModifier(team, asset, 1000, { direction: 'giving' });
    expect(result).toBeLessThan(1000);
    expect(result).toBeCloseTo(800);
  });

  it('WIN_NOW up-weights incoming veteran players (age ≤ 30)', () => {
    const team   = winNowTeam();
    const asset  = { type: 'player', player: { age: 28, ovr: 85 } };
    const result = applyTradePersonaModifier(team, asset, 1000, { direction: 'receiving' });
    expect(result).toBeGreaterThan(1000);
    expect(result).toBeCloseTo(1150);
  });

  it('WIN_NOW does not up-weight old incoming players (age > 30)', () => {
    const team   = winNowTeam();
    const asset  = { type: 'player', player: { age: 34, ovr: 82 } };
    const result = applyTradePersonaModifier(team, asset, 1000, { direction: 'receiving' });
    expect(result).toBe(1000);
  });

  it('PATIENT_BUILDER up-weights incoming draft picks', () => {
    const team   = patientTeam();
    const asset  = { type: 'pick', pick: { round: 1 } };
    const result = applyTradePersonaModifier(team, asset, 1000, { direction: 'receiving' });
    expect(result).toBeGreaterThan(1000);
    expect(result).toBeCloseTo(1200);
  });

  it('PATIENT_BUILDER down-weights older players (age ≥ 30)', () => {
    const team   = patientTeam();
    const asset  = { type: 'player', player: { age: 33, ovr: 82 } };
    const result = applyTradePersonaModifier(team, asset, 1000, { direction: 'receiving' });
    expect(result).toBeLessThan(1000);
    expect(result).toBeCloseTo(820);
  });

  it('PATIENT_BUILDER does not penalise young players', () => {
    const team   = patientTeam();
    const asset  = { type: 'player', player: { age: 24, ovr: 80 } };
    const result = applyTradePersonaModifier(team, asset, 1000, { direction: 'receiving' });
    expect(result).toBe(1000);
  });

  it('returns baseValue unchanged when no persona is set', () => {
    const team   = makeTeam();
    const asset  = { type: 'pick' };
    const result = applyTradePersonaModifier(team, asset, 1000, { direction: 'giving' });
    expect(result).toBe(1000);
  });

  it('returns 0 safely when baseValue is 0', () => {
    const team   = winNowTeam();
    const asset  = { type: 'pick' };
    const result = applyTradePersonaModifier(team, asset, 0, { direction: 'giving' });
    expect(result).toBe(0);
  });
});

// ── shouldCapHoarderWalkAway ──────────────────────────────────────────────────

describe('shouldCapHoarderWalkAway', () => {
  it('returns true for CAP_HOARDER when Shark premium exceeds 12%', () => {
    const team = makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } });
    expect(shouldCapHoarderWalkAway(team, { sharkPremiumPct: 0.15 })).toBe(true);
  });

  it('returns false for CAP_HOARDER when Shark premium is at or below 12%', () => {
    const team = makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } });
    expect(shouldCapHoarderWalkAway(team, { sharkPremiumPct: 0.12 })).toBe(false);
    expect(shouldCapHoarderWalkAway(team, { sharkPremiumPct: 0.08 })).toBe(false);
  });

  it('returns false for non-CAP_HOARDER personas regardless of premium', () => {
    const win = makeTeam({ frontOffice: { persona: 'WIN_NOW' } });
    expect(shouldCapHoarderWalkAway(win, { sharkPremiumPct: 0.25 })).toBe(false);

    const loy = makeTeam({ frontOffice: { persona: 'PLAYER_LOYALIST' } });
    expect(shouldCapHoarderWalkAway(loy, { sharkPremiumPct: 0.25 })).toBe(false);
  });

  it('returns false when no frontOffice is set', () => {
    const team = makeTeam();
    expect(shouldCapHoarderWalkAway(team, { sharkPremiumPct: 0.25 })).toBe(false);
  });

  it('returns false when sharkPremiumPct is missing (defaults to 0)', () => {
    const team = makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } });
    expect(shouldCapHoarderWalkAway(team, {})).toBe(false);
  });
});

// ── getRetentionPremium ───────────────────────────────────────────────────────

describe('getRetentionPremium', () => {
  it('returns > 1 for PLAYER_LOYALIST with homegrown star', () => {
    const team   = makeTeam({ id: 1, frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const player = { id: 10, ovr: 85, tenureYears: 4 };
    expect(getRetentionPremium(team, player, { teamId: 1 })).toBeGreaterThan(1.0);
  });

  it('returns highest premium (1.08) for homegrown + star', () => {
    const team   = makeTeam({ id: 1, frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const player = { id: 10, ovr: 85, tenureYears: 4 };
    expect(getRetentionPremium(team, player, { teamId: 1 })).toBeCloseTo(1.08);
  });

  it('returns 1.04 for homegrown non-star', () => {
    const team   = makeTeam({ id: 1, frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const player = { id: 10, ovr: 75, tenureYears: 4 };
    expect(getRetentionPremium(team, player, { teamId: 1 })).toBeCloseTo(1.04);
  });

  it('returns 1.03 for non-homegrown star', () => {
    const team   = makeTeam({ id: 1, frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const player = { id: 10, ovr: 85, tenureYears: 1 };
    expect(getRetentionPremium(team, player, { teamId: 1 })).toBeCloseTo(1.03);
  });

  it('returns 1.0 for non-homegrown non-star', () => {
    const team   = makeTeam({ id: 1, frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const player = { id: 10, ovr: 72, tenureYears: 1 };
    expect(getRetentionPremium(team, player, { teamId: 1 })).toBe(1.0);
  });

  it('returns 1.0 for non-PLAYER_LOYALIST persona', () => {
    const team   = makeTeam({ id: 1, frontOffice: { persona: 'WIN_NOW' } });
    const player = { id: 10, ovr: 90, tenureYears: 10 };
    expect(getRetentionPremium(team, player, { teamId: 1 })).toBe(1.0);
  });

  it('recognises drafted-here players as homegrown', () => {
    const team   = makeTeam({ id: 1, frontOffice: { persona: 'PLAYER_LOYALIST' } });
    const player = { id: 10, ovr: 85, tenureYears: 1, draftedByTeamId: 1 };
    expect(getRetentionPremium(team, player, { teamId: 1 })).toBeCloseTo(1.08);
  });
});

// ── maybeDriftPersona ────────────────────────────────────────────────────────

describe('maybeDriftPersona', () => {
  it('returns null when team has no frontOffice', () => {
    const team = makeTeam();
    expect(maybeDriftPersona(team, { madePostseason: false })).toBeNull();
  });

  it('does not drift non-WIN_NOW personas on postseason miss', () => {
    const team = makeTeam({
      frontOffice: { persona: 'PATIENT_BUILDER', missedPostseasonStreak: 2, tradeAggressiveness: 0.35, draftPickPremium: 1.4, extensionTolerance: 0.65 },
    });
    const result = maybeDriftPersona(team, { madePostseason: false });
    // Streak changes but persona stays
    if (result !== null) {
      expect(result.persona).toBe('PATIENT_BUILDER');
    }
  });

  it('increments streak on postseason miss for WIN_NOW', () => {
    const team   = makeTeam({
      frontOffice: { persona: 'WIN_NOW', missedPostseasonStreak: 0, tradeAggressiveness: 0.75, draftPickPremium: 0.6, extensionTolerance: 0.85 },
    });
    const result = maybeDriftPersona(team, { madePostseason: false });
    expect(result).not.toBeNull();
    expect(result.persona).toBe('WIN_NOW');
    expect(result.missedPostseasonStreak).toBe(1);
  });

  it('drifts WIN_NOW to PATIENT_BUILDER after 2 consecutive missed postseasons', () => {
    const team   = makeTeam({
      frontOffice: { persona: 'WIN_NOW', missedPostseasonStreak: 1, tradeAggressiveness: 0.75, draftPickPremium: 0.6, extensionTolerance: 0.85 },
    });
    const result = maybeDriftPersona(team, { madePostseason: false });
    expect(result).not.toBeNull();
    expect(result.persona).toBe('PATIENT_BUILDER');
    expect(result.missedPostseasonStreak).toBe(0);
  });

  it('resets streak to 0 when team makes postseason', () => {
    const team   = makeTeam({
      frontOffice: { persona: 'WIN_NOW', missedPostseasonStreak: 1, tradeAggressiveness: 0.75, draftPickPremium: 0.6, extensionTolerance: 0.85 },
    });
    const result = maybeDriftPersona(team, { madePostseason: true });
    expect(result).not.toBeNull();
    expect(result.persona).toBe('WIN_NOW');
    expect(result.missedPostseasonStreak).toBe(0);
  });

  it('returns null when no streak change and no persona change', () => {
    const team   = makeTeam({
      frontOffice: { persona: 'WIN_NOW', missedPostseasonStreak: 0, tradeAggressiveness: 0.75, draftPickPremium: 0.6, extensionTolerance: 0.85 },
    });
    // Made postseason and streak is already 0 — no change
    const result = maybeDriftPersona(team, { madePostseason: true });
    expect(result).toBeNull();
  });

  it('drift does not mutate the input profile', () => {
    const foProfile = { persona: 'WIN_NOW', missedPostseasonStreak: 1, tradeAggressiveness: 0.75, draftPickPremium: 0.6, extensionTolerance: 0.85 };
    const team      = makeTeam({ frontOffice: foProfile });
    maybeDriftPersona(team, { madePostseason: false });
    expect(team.frontOffice.missedPostseasonStreak).toBe(1); // unchanged
  });
});

// ── no Math.random in module ──────────────────────────────────────────────────

describe('frontOfficePersonaEngine — no Math.random', () => {
  it('does not reference Math.random in module source', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const url  = await import('url');
    const dir  = path.dirname(url.fileURLToPath(import.meta.url));
    const src  = fs.readFileSync(path.join(dir, 'frontOfficePersonaEngine.js'), 'utf8');
    expect(src).not.toContain('Math.random(');
  });
});
