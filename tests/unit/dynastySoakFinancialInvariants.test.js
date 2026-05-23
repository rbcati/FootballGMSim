import { describe, expect, it } from 'vitest';
import { runDynastySoakAudit } from '../../src/core/dynastySoakAudit.js';

function makeRoster(prefix, count = 45) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    pos: i === 0 ? 'QB' : ['OL', 'WR', 'CB', 'DL', 'LB', 'S', 'TE', 'RB'][i % 8],
    age: 23 + (i % 8),
    ovr: 68 + (i % 10),
    potential: 75,
    contract: { yearsRemaining: 2, yearsTotal: 4, baseAnnual: 2, signingBonus: 4 },
  }));
}

function baseTeam(id, prefix, overrides = {}) {
  return {
    id,
    abbr: `T${id}`,
    wins: 8,
    losses: 8,
    ptsFor: 300,
    ptsAgainst: 280,
    capUsed: 200,
    capRoom: 100,
    capTotal: 301,
    deadCap: 0,
    deadMoneyNextYear: 0,
    roster: makeRoster(prefix),
    ...overrides,
  };
}

function baseView(overrides = {}) {
  return {
    phase: 'preseason',
    year: 2028,
    userTeamId: 0,
    seasonId: 's3',
    schedule: { weeks: [{ week: 1, games: [{ home: 0, away: 1 }] }] },
    standings: [{ id: 0, wins: 8, losses: 8 }],
    leagueHistory: [],
    recordBook: { schemaVersion: 1 },
    hallOfFameClasses: [],
    teams: [baseTeam(0, 'a'), baseTeam(1, 'b')],
    ...overrides,
  };
}

// ─── Dead cap / dead money invariants ────────────────────────────────────────

describe('dynastySoakAudit financial invariants — deadCap', () => {
  it('passes when deadCap is zero', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'dead_cap_invalid')).toBe(false);
  });

  it('passes when deadCap is a positive finite value', () => {
    const teams = [baseTeam(0, 'a', { deadCap: 12.5 }), baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'dead_cap_invalid')).toBe(false);
  });

  it('fails when deadCap is NaN', () => {
    const teams = [baseTeam(0, 'a', { deadCap: NaN }), baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'dead_cap_invalid')).toBe(true);
  });

  it('fails when deadCap is Infinity', () => {
    const teams = [baseTeam(0, 'a', { deadCap: Infinity }), baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'dead_cap_invalid')).toBe(true);
  });

  it('fails when deadCap is negative', () => {
    const teams = [baseTeam(0, 'a', { deadCap: -5 }), baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'dead_cap_invalid')).toBe(true);
  });

  it('skips deadCap check when field is absent', () => {
    const teams = [
      { ...baseTeam(0, 'a'), deadCap: undefined },
      baseTeam(1, 'b'),
    ];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'dead_cap_invalid')).toBe(false);
  });
});

describe('dynastySoakAudit financial invariants — deadMoneyNextYear', () => {
  it('passes when deadMoneyNextYear is zero', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'dead_money_next_year_invalid')).toBe(false);
  });

  it('fails when deadMoneyNextYear is NaN', () => {
    const teams = [baseTeam(0, 'a', { deadMoneyNextYear: NaN }), baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'dead_money_next_year_invalid')).toBe(true);
  });

  it('fails when deadMoneyNextYear is negative', () => {
    const teams = [baseTeam(0, 'a', { deadMoneyNextYear: -1 }), baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'dead_money_next_year_invalid')).toBe(true);
  });

  it('passes with realistic rolled dead money', () => {
    const teams = [baseTeam(0, 'a', { deadMoneyNextYear: 8.75 }), baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'dead_money_next_year_invalid')).toBe(false);
  });
});

// ─── calculateTeamCapObligations integration ─────────────────────────────────

describe('dynastySoakAudit financial invariants — contract obligations', () => {
  it('does not fail on a healthy team with a bonus-bearing contract', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'contract_obligations_throw')).toBe(false);
    expect(r.failures.some((f) => f.code === 'contract_obligations_nan')).toBe(false);
  });

  it('does not fail on a legacy team whose players have no signingBonus', () => {
    const legacyRoster = Array.from({ length: 45 }, (_, i) => ({
      id: `lg${i}`,
      pos: i === 0 ? 'QB' : 'OL',
      age: 25,
      ovr: 70,
      potential: 75,
      contract: { yearsRemaining: 2, baseAnnual: 3 },
    }));
    const teams = [
      { ...baseTeam(0, 'a'), roster: legacyRoster },
      baseTeam(1, 'b'),
    ];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'contract_obligations_throw')).toBe(false);
    expect(r.failures.some((f) => f.code === 'contract_obligations_nan')).toBe(false);
  });

  it('does not fail on an empty roster team (dead cap only)', () => {
    const teams = [
      { ...baseTeam(0, 'a', { deadCap: 20 }), roster: [{ id: 'qb0', pos: 'QB', age: 26, ovr: 78, potential: 82, contract: { yearsRemaining: 2, baseAnnual: 5 } }].concat(makeRoster('ax', 44)) },
      baseTeam(1, 'b'),
    ];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'contract_obligations_throw')).toBe(false);
  });
});

// ─── Active cap hit per player ────────────────────────────────────────────────

describe('dynastySoakAudit financial invariants — active cap hit', () => {
  it('does not fail when all players have clean contracts', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'player_cap_hit_nan')).toBe(false);
    expect(r.failures.some((f) => f.code === 'player_cap_hit_throw')).toBe(false);
  });

  it('fails when a player contract produces a NaN cap hit', () => {
    const roster = makeRoster('c');
    roster[3] = { ...roster[3], contract: { yearsRemaining: NaN, baseAnnual: NaN } };
    const teams = [{ ...baseTeam(0, 'a'), roster }, baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'player_cap_hit_nan' || f.code === 'contract_value_invalid')).toBe(true);
  });
});

// ─── signingBonus / yearsTotal contract field validity ────────────────────────

describe('dynastySoakAudit financial invariants — signingBonus / yearsTotal', () => {
  it('passes with valid signingBonus and yearsTotal', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'contract_bonus_invalid')).toBe(false);
    expect(r.failures.some((f) => f.code === 'contract_years_total_invalid')).toBe(false);
  });

  it('fails when signingBonus is negative', () => {
    const roster = makeRoster('d');
    roster[2] = { ...roster[2], contract: { yearsRemaining: 2, yearsTotal: 4, baseAnnual: 2, signingBonus: -10 } };
    const teams = [{ ...baseTeam(0, 'a'), roster }, baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'contract_bonus_invalid')).toBe(true);
  });

  it('fails when signingBonus is NaN', () => {
    const roster = makeRoster('e');
    roster[1] = { ...roster[1], contract: { yearsRemaining: 3, yearsTotal: 5, baseAnnual: 4, signingBonus: NaN } };
    const teams = [{ ...baseTeam(0, 'a'), roster }, baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'contract_bonus_invalid')).toBe(true);
  });

  it('fails when yearsTotal is zero', () => {
    const roster = makeRoster('f');
    roster[4] = { ...roster[4], contract: { yearsRemaining: 1, yearsTotal: 0, baseAnnual: 3, signingBonus: 0 } };
    const teams = [{ ...baseTeam(0, 'a'), roster }, baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'contract_years_total_invalid')).toBe(true);
  });

  it('fails when yearsTotal is NaN', () => {
    const roster = makeRoster('g');
    roster[5] = { ...roster[5], contract: { yearsRemaining: 2, yearsTotal: NaN, baseAnnual: 3 } };
    const teams = [{ ...baseTeam(0, 'a'), roster }, baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'contract_years_total_invalid')).toBe(true);
  });

  it('skips signingBonus check when field is absent (legacy contract)', () => {
    const roster = makeRoster('h').map((p) => ({
      ...p,
      contract: { yearsRemaining: 2, baseAnnual: 3 },
    }));
    const teams = [{ ...baseTeam(0, 'a'), roster }, baseTeam(1, 'b')];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'contract_bonus_invalid')).toBe(false);
  });
});

// ─── Draft pick ownership uniqueness ─────────────────────────────────────────

describe('dynastySoakAudit financial invariants — draft pick uniqueness', () => {
  it('passes when picks are absent on all teams', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'duplicate_draft_pick_id')).toBe(false);
  });

  it('passes when each team has distinct pick IDs', () => {
    const teams = [
      { ...baseTeam(0, 'a'), picks: [{ id: '2028_1_1' }, { id: '2028_2_1' }] },
      { ...baseTeam(1, 'b'), picks: [{ id: '2028_1_2' }, { id: '2028_3_5' }] },
    ];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'duplicate_draft_pick_id')).toBe(false);
  });

  it('fails when the same pick ID appears on two different teams', () => {
    const teams = [
      { ...baseTeam(0, 'a'), picks: [{ id: '2028_1_1' }] },
      { ...baseTeam(1, 'b'), picks: [{ id: '2028_1_1' }] },
    ];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'duplicate_draft_pick_id')).toBe(true);
  });

  it('skips picks without an id field', () => {
    const teams = [
      { ...baseTeam(0, 'a'), picks: [{ round: 1 }] },
      { ...baseTeam(1, 'b'), picks: [{ round: 2 }] },
    ];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'duplicate_draft_pick_id')).toBe(false);
  });
});

// ─── State size monitoring ────────────────────────────────────────────────────

describe('dynastySoakAudit financial invariants — state size', () => {
  it('does not warn for a compact normal view state', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.failures.some((f) => f.code === 'state_size_explosive')).toBe(false);
    expect(r.warnings.some((w) => w.code === 'state_size_large')).toBe(false);
    expect(typeof r.reportSummary.stateSizeKb).toBe('number');
    expect(r.reportSummary.stateSizeKb).toBeGreaterThan(0);
  });

  it('reports state size in reportSummary', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(Number.isFinite(r.reportSummary.stateSizeKb)).toBe(true);
  });
});

// ─── Deterministic audit repeatability ───────────────────────────────────────

describe('dynastySoakAudit deterministic repeatability', () => {
  it('produces identical failure codes, warning codes, and summary for the same input (run twice)', () => {
    const input = {
      viewState: baseView(),
      seasonIndex: 2,
      allSeasons: [{ id: 's1', year: 2026 }, { id: 's2', year: 2027 }],
      transactions: [
        { type: 'DRAFT', seasonId: 's1', teamId: 0, details: { playerId: 1, overall: 1 } },
        { type: 'RETIREMENT', seasonId: 's2', teamId: 1, details: { playerId: 2 } },
      ],
      recordsPayload: { records: {}, recordBook: { schemaVersion: 1 } },
      hofPayload: { players: [], classes: [] },
      draftClassesPayload: { classes: [{ seasonId: 's1', year: 2026, pickCount: 1, teamIds: [0] }] },
    };
    const r1 = runDynastySoakAudit(input);
    const r2 = runDynastySoakAudit(input);

    expect(r1.passed).toBe(r2.passed);
    expect(r1.failures.map((f) => f.code)).toEqual(r2.failures.map((f) => f.code));
    expect(r1.warnings.map((w) => w.code)).toEqual(r2.warnings.map((w) => w.code));
    expect(r1.summary).toEqual(r2.summary);
    expect(r1.reportSummary.teamCount).toBe(r2.reportSummary.teamCount);
    expect(r1.reportSummary.failureCount).toBe(r2.reportSummary.failureCount);
    expect(r1.reportSummary.warningCount).toBe(r2.reportSummary.warningCount);
  });

  it('produces identical results for the same input when teams have bonus contracts (deterministic cap hit path)', () => {
    const rosterWithBonus = makeRoster('det');
    const viewWithBonus = baseView({
      teams: [
        { ...baseTeam(0, 'det'), roster: rosterWithBonus, deadCap: 7.5, deadMoneyNextYear: 3.25 },
        baseTeam(1, 'det2'),
      ],
    });
    const r1 = runDynastySoakAudit({ viewState: viewWithBonus, seasonIndex: 1 });
    const r2 = runDynastySoakAudit({ viewState: viewWithBonus, seasonIndex: 1 });

    expect(r1.passed).toBe(r2.passed);
    expect(r1.failures.map((f) => f.code)).toEqual(r2.failures.map((f) => f.code));
    expect(r1.warnings.map((w) => w.code)).toEqual(r2.warnings.map((w) => w.code));
    expect(r1.reportSummary.stateSizeKb).toBe(r2.reportSummary.stateSizeKb);
  });

  it('produces different failure sets for different inputs (non-trivial distinguishability)', () => {
    const cleanView = baseView();
    const brokenView = baseView({
      teams: [baseTeam(0, 'x', { deadCap: NaN }), baseTeam(1, 'y')],
    });
    const rClean = runDynastySoakAudit({ viewState: cleanView, seasonIndex: 0 });
    const rBroken = runDynastySoakAudit({ viewState: brokenView, seasonIndex: 0 });

    expect(rClean.passed).toBe(true);
    expect(rBroken.passed).toBe(false);
    expect(rBroken.failures.some((f) => f.code === 'dead_cap_invalid')).toBe(true);
  });
});

// ─── reportSummary new fields ─────────────────────────────────────────────────

describe('dynastySoakAudit reportSummary financial fields', () => {
  it('includes deadCapWarnings, deadMoneyWarnings, contractObligationsThrows in reportSummary', () => {
    const r = runDynastySoakAudit({ viewState: baseView(), seasonIndex: 0 });
    expect(r.reportSummary).toHaveProperty('deadCapWarnings');
    expect(r.reportSummary).toHaveProperty('deadMoneyWarnings');
    expect(r.reportSummary).toHaveProperty('contractObligationsThrows');
    expect(r.reportSummary).toHaveProperty('stateSizeKb');
    expect(r.reportSummary.deadCapWarnings).toBe(0);
    expect(r.reportSummary.deadMoneyWarnings).toBe(0);
    expect(r.reportSummary.contractObligationsThrows).toBe(0);
  });

  it('increments deadCapWarnings for each team with invalid deadCap', () => {
    const teams = [
      baseTeam(0, 'a', { deadCap: NaN }),
      baseTeam(1, 'b', { deadCap: -1 }),
    ];
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 0 });
    expect(r.reportSummary.deadCapWarnings).toBe(2);
  });
});
