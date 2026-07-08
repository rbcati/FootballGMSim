/**
 * Coaching Philosophy Wiring V1 — integration regression suite.
 *
 * Proves that the EXISTING coaching-philosophy-effects.js implementation is
 * wired into the live simGameStats() path (it is not rebuilt or duplicated
 * here), that normalizeTeamStaff() now reaches the simulation before games run,
 * that the makeCoach → offScheme/defScheme → readOffPhil/readDefPhil fallback is
 * intact, and that behavior stays deterministic and within the documented
 * ±15% coaching clamp (kept distinct from the ±5% game-plan strategic edge).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Spy on the REAL implementations without replacing them, so we can assert the
// live sim path invokes the existing exports (reuse, not duplication).
vi.mock('../../coaching-philosophy-effects.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    applyCoachingModifiers: vi.fn(actual.applyCoachingModifiers),
  };
});

vi.mock('../../staff/staffPhilosophy.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    normalizeTeamStaff: vi.fn(actual.normalizeTeamStaff),
  };
});

import { Utils as U } from '../../utils.js';
import { simGameStats } from '../../game-simulator.js';
import {
  applyCoachingModifiers,
  getOffensivePhilosophyModifiers,
  getDefensivePhilosophyModifiers,
} from '../../coaching-philosophy-effects.js';
import { normalizeTeamStaff } from '../../staff/staffPhilosophy.js';

// ── Minimal roster factory (mirrors the engine's expected player shape) ─────────
function makePlayer(id, pos, ovr = 75) {
  const ratings = {
    QB: { throwPower: 75, throwAccuracy: 75, awareness: 75, speed: 65, agility: 65 },
    RB: { speed: 78, trucking: 72, juking: 70, awareness: 65 },
    WR: { speed: 85, awareness: 72, catching: 80 },
    TE: { speed: 72, awareness: 70, catching: 74 },
    OL: { passBlock: 73, runBlock: 74 },
    DL: { passRushPower: 73, passRushSpeed: 71, tackle: 72, strength: 74 },
    LB: { tackle: 75, awareness: 72, speed: 72, strength: 70 },
    CB: { speed: 82, awareness: 72, agility: 78 },
    S:  { speed: 78, awareness: 75, tackle: 70 },
    K:  { kickPower: 78, kickAccuracy: 76 },
    P:  { kickPower: 76 },
  };
  return { id: `${id}`, pos, ovr, name: `${pos} ${id}`, ratings: ratings[pos] || {} };
}

function buildRoster(id) {
  return [
    makePlayer(`${id}-qb1`, 'QB', 80),
    makePlayer(`${id}-qb2`, 'QB', 64),
    makePlayer(`${id}-rb1`, 'RB', 76),
    makePlayer(`${id}-rb2`, 'RB', 70),
    makePlayer(`${id}-wr1`, 'WR', 79),
    makePlayer(`${id}-wr2`, 'WR', 74),
    makePlayer(`${id}-wr3`, 'WR', 70),
    makePlayer(`${id}-te1`, 'TE', 74),
    makePlayer(`${id}-ol1`, 'OL', 74),
    makePlayer(`${id}-ol2`, 'OL', 72),
    makePlayer(`${id}-ol3`, 'OL', 71),
    makePlayer(`${id}-dl1`, 'DL', 76),
    makePlayer(`${id}-dl2`, 'DL', 72),
    makePlayer(`${id}-lb1`, 'LB', 74),
    makePlayer(`${id}-lb2`, 'LB', 71),
    makePlayer(`${id}-cb1`, 'CB', 75),
    makePlayer(`${id}-cb2`, 'CB', 72),
    makePlayer(`${id}-s1`,  'S',  73),
    makePlayer(`${id}-k1`,  'K',  70),
    makePlayer(`${id}-p1`,  'P',  70),
  ];
}

// staff shapes -----------------------------------------------------------------
const POWER_RUN_STAFF = {
  headCoach: { name: 'HC PowerRun', offensivePhilosophy: 'POWER_RUN', defensivePhilosophy: 'COVER_2' },
};
const SPREAD_STAFF = {
  headCoach: { name: 'HC Spread', offensivePhilosophy: 'SPREAD', defensivePhilosophy: 'BLITZ_HEAVY' },
};
// makeCoach() writes offScheme/defScheme (not offensivePhilosophy), so this
// exercises the readOffPhil/readDefPhil fallback path end-to-end.
const LEGACY_SCHEME_STAFF = {
  headCoach: { name: 'HC Legacy', offScheme: 'West Coast', defScheme: '4-3' },
};
// A staff record with no philosophy fields at all (oldest saves).
const BARE_STAFF = { headCoach: { name: 'HC Bare' } };

function buildTeam(id, staff = null) {
  const team = { id, abbr: `T${id}`, name: `Team ${id}`, roster: buildRoster(id) };
  if (staff) team.staff = staff;
  return team;
}

function buildLeague(home, away) {
  return { week: 1, seasonId: 2030, year: 2030, userTeamId: null, teams: [home, away], resultsByWeek: { 0: [] } };
}

function runGame(seed, { homeStaff = null, awayStaff = null } = {}) {
  const home = buildTeam(1, homeStaff);
  const away = buildTeam(2, awayStaff);
  const league = buildLeague(home, away);
  U.setSeed(seed);
  return simGameStats(home, away, { generateLogs: true, league, homeAbbr: 'T1', awayAbbr: 'T2' });
}

afterEach(() => {
  vi.mocked(applyCoachingModifiers).mockClear();
  vi.mocked(normalizeTeamStaff).mockClear();
});

// ── 1. applyCoachingModifiers is invoked in the live simGameStats path ──────────
describe('simGameStats — coaching philosophy is wired into the live path', () => {
  it('invokes the existing applyCoachingModifiers() for both home and away', () => {
    const r = runGame(1234, { homeStaff: POWER_RUN_STAFF, awayStaff: SPREAD_STAFF });
    expect(r).toBeTruthy();
    // Once per team, per game — no philosophy math scattered elsewhere.
    expect(vi.mocked(applyCoachingModifiers)).toHaveBeenCalledTimes(2);
  });

  it('reaches normalizeTeamStaff() before the game runs (previously UI-only)', () => {
    runGame(1234, { homeStaff: POWER_RUN_STAFF, awayStaff: SPREAD_STAFF });
    // Both teams normalized before stat generation consumes the mods.
    expect(vi.mocked(normalizeTeamStaff)).toHaveBeenCalled();
    const teamsSeen = vi.mocked(normalizeTeamStaff).mock.calls.map(([team]) => team?.id).sort();
    expect(teamsSeen).toEqual([1, 2]);
  });

  it('feeds normalized philosophy fields into applyCoachingModifiers', () => {
    runGame(1234, { homeStaff: LEGACY_SCHEME_STAFF, awayStaff: SPREAD_STAFF });
    // 3rd positional arg is the staff object the modifier reads philosophy from.
    const [, , staffArg] = vi.mocked(applyCoachingModifiers).mock.calls[0];
    // normalizeTeamStaff canonicalized offScheme:'West Coast' → WEST_COAST.
    expect(staffArg.headCoach.offensivePhilosophy).toBe('WEST_COAST');
    expect(staffArg.headCoach.defensivePhilosophy).toBe('HYBRID'); // '4-3' → HYBRID
  });
});

// ── 2. Different philosophies produce different deterministic modifiers/stats ────
describe('coaching philosophy produces distinct deterministic tendencies', () => {
  it('POWER_RUN and SPREAD yield different offensive modifiers (pure, reused module)', () => {
    const power = getOffensivePhilosophyModifiers(POWER_RUN_STAFF.headCoach, POWER_RUN_STAFF);
    const spread = getOffensivePhilosophyModifiers(SPREAD_STAFF.headCoach, SPREAD_STAFF);
    expect(power.rushingMod).toBeGreaterThan(1); // POWER_RUN lifts the run game
    expect(spread.passingMod).toBeGreaterThan(1); // SPREAD lifts the pass game
    expect(power.rushingMod).toBeGreaterThan(spread.rushingMod);
    expect(spread.passingMod).toBeGreaterThan(power.passingMod);
  });

  it('a philosophy change shifts full-game stat generation under a shared seed', () => {
    // Same seed, same rosters, same opponent — only the home HC philosophy
    // changes (POWER_RUN vs SPREAD). The modifiers are applied without consuming
    // RNG, so any divergence is purely the philosophy math flowing into stat
    // generation (pass/run distribution surfaces in the play logs).
    let sawDifference = false;
    for (let i = 0; i < 10 && !sawDifference; i++) {
      const seed = 5200 + i * 17;
      const run = runGame(seed, { homeStaff: POWER_RUN_STAFF, awayStaff: SPREAD_STAFF });
      const pass = runGame(seed, { homeStaff: SPREAD_STAFF, awayStaff: SPREAD_STAFF });
      if (JSON.stringify(run) !== JSON.stringify(pass)) {
        sawDifference = true;
      }
    }
    expect(sawDifference).toBe(true);
  });
});

// ── 3. Field-name fallback (makeCoach offScheme/defScheme) ──────────────────────
describe('offScheme/defScheme and offensivePhilosophy field-name fallback', () => {
  it('reads makeCoach-style offScheme/defScheme when explicit philosophy is absent', () => {
    const off = getOffensivePhilosophyModifiers(LEGACY_SCHEME_STAFF.headCoach, LEGACY_SCHEME_STAFF);
    const def = getDefensivePhilosophyModifiers(LEGACY_SCHEME_STAFF.headCoach, LEGACY_SCHEME_STAFF);
    // 'West Coast' → WEST_COAST → passing/tempo lift.
    expect(off.passingMod).toBeGreaterThan(1);
    // '4-3' → HYBRID → balanced pressure/coverage/run-stop lift.
    expect(def.runStopMod).toBeGreaterThan(1);
  });

  it('prefers the explicit normalized philosophy field over legacy scheme text', () => {
    const mixed = { headCoach: { offensivePhilosophy: 'SPREAD', offScheme: 'West Coast' } };
    const off = getOffensivePhilosophyModifiers(mixed.headCoach, mixed);
    const spread = getOffensivePhilosophyModifiers(SPREAD_STAFF.headCoach, SPREAD_STAFF);
    expect(off.passingMod).toBe(spread.passingMod); // SPREAD wins, not West Coast
  });

  it('normalizeTeamStaff canonicalizes legacy schemes for the sim', () => {
    const staff = normalizeTeamStaff({ staff: LEGACY_SCHEME_STAFF });
    expect(staff.headCoach.offensivePhilosophy).toBe('WEST_COAST');
    expect(staff.headCoach.defensivePhilosophy).toBe('HYBRID');
  });
});

// ── 4. Legacy / missing staff never throws ──────────────────────────────────────
describe('legacy and missing staff safety', () => {
  it('does not throw when staff has no philosophy fields', () => {
    const off = getOffensivePhilosophyModifiers(BARE_STAFF.headCoach, BARE_STAFF);
    expect(off.rushingMod).toBe(1); // BALANCED → neutral
    expect(() => runGame(4321, { homeStaff: BARE_STAFF, awayStaff: null })).not.toThrow();
  });

  it('simGameStats runs when neither team has a staff record', () => {
    const r = runGame(4321, { homeStaff: null, awayStaff: null });
    expect(r).toBeTruthy();
    expect(Number.isFinite(r.homeScore)).toBe(true);
    expect(Number.isFinite(r.awayScore)).toBe(true);
  });

  it('applyCoachingModifiers returns an unchanged copy with no coach and no staff', () => {
    const base = { passVolume: 1.2, runVolume: 0.9 };
    expect(applyCoachingModifiers(base, null, null)).toEqual(base);
  });
});

// ── 5. Determinism ──────────────────────────────────────────────────────────────
describe('deterministic simulation', () => {
  it('identical staff + seed yields identical outcomes', () => {
    const opts = { homeStaff: POWER_RUN_STAFF, awayStaff: SPREAD_STAFF };
    const a = runGame(9999, opts);
    const b = runGame(9999, opts);
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    expect(a.teamDriveStats).toEqual(b.teamDriveStats);
  });
});

// ── 6. Cap alignment: coaching philosophy ±15%, distinct from game-plan ±5% ──────
describe('cap alignment (Option A: ±15% coaching clamp)', () => {
  it('offensive and defensive modifiers never exceed the ±15% philosophy clamp', () => {
    // Stack every positive contributor (HC + OC/DC + traits) and assert the
    // module-level clamp holds at 0.85..1.15.
    const stackedOff = {
      headCoach: { offensivePhilosophy: 'POWER_RUN', traits: ['DISCIPLINARIAN', 'SCHEME_TEACHER'] },
      offCoordinator: { offensivePhilosophy: 'POWER_RUN' },
    };
    const stackedDef = {
      headCoach: { defensivePhilosophy: 'MAN_COVERAGE', traits: ['DISCIPLINARIAN', 'SCHEME_TEACHER'] },
      defCoordinator: { defensivePhilosophy: 'MAN_COVERAGE' },
    };
    const off = getOffensivePhilosophyModifiers(stackedOff.headCoach, stackedOff);
    const def = getDefensivePhilosophyModifiers(stackedDef.headCoach, stackedDef);
    for (const v of [...Object.values(off), ...Object.values(def)]) {
      expect(v).toBeGreaterThanOrEqual(0.85);
      expect(v).toBeLessThanOrEqual(1.15);
    }
  });

  it('applyCoachingModifiers keeps its multipliers within the ±15% band', () => {
    const base = { passVolume: 1, runVolume: 1, passAccuracy: 1, sackChance: 1, defIntChance: 1, runStop: 1 };
    const staff = {
      headCoach: { offensivePhilosophy: 'SPREAD', defensivePhilosophy: 'BLITZ_HEAVY', traits: ['SCHEME_TEACHER'] },
      offCoordinator: { offensivePhilosophy: 'SPREAD' },
      defCoordinator: { defensivePhilosophy: 'BLITZ_HEAVY' },
    };
    const out = applyCoachingModifiers(base, staff.headCoach, staff);
    for (const key of ['passVolume', 'runVolume', 'passAccuracy', 'sackChance', 'defIntChance', 'runStop']) {
      expect(out[key]).toBeGreaterThanOrEqual(0.85);
      expect(out[key]).toBeLessThanOrEqual(1.15);
    }
  });
});
