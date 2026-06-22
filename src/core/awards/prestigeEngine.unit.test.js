/**
 * prestigeEngine.unit.test.js — Pro Bowl & All-Pro Prestige Engine
 */
import { describe, it, expect } from 'vitest';
import {
  PRESTIGE_QUOTAS,
  mapPlayerToPrestigePosition,
  computePrestigeScore,
  rankPrestigeCandidates,
  selectAllProTeams,
  selectProBowlTeams,
  mergeHonorsIntoPlayers,
  getPriorSeasonPrestigePremium,
  buildSeasonHonorsSummary,
} from './prestigeEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeQB(overrides = {}) {
  return {
    id: 'qb1',
    name: 'Test QB',
    pos: 'QB',
    ovr: 85,
    teamId: 1,
    stats: { season: { passYd: 4000, passTD: 30, interceptions: 10, rushYd: 200, rushTD: 2 } },
    ...overrides,
  };
}

function makeRB(overrides = {}) {
  return {
    id: 'rb1',
    name: 'Test RB',
    pos: 'RB',
    ovr: 82,
    teamId: 1,
    stats: { season: { rushYd: 1200, rushTD: 12, recYd: 300, recTD: 2, receptions: 40 } },
    ...overrides,
  };
}

function makeWR(overrides = {}) {
  return {
    id: 'wr1',
    name: 'Test WR',
    pos: 'WR',
    ovr: 80,
    teamId: 2,
    stats: { season: { recYd: 1300, recTD: 10, receptions: 100, rushYd: 0, rushTD: 0 } },
    ...overrides,
  };
}

function makeDL(overrides = {}) {
  return {
    id: 'dl1',
    name: 'Test DL',
    pos: 'DL',
    ovr: 88,
    teamId: 1,
    stats: { season: { sacks: 15, tackles: 40, interceptions: 2 } },
    ...overrides,
  };
}

function makeTeam(id, conf) {
  return { id, conf, name: `Team ${id}`, abbr: `T${id}` };
}

// ── mapPlayerToPrestigePosition ───────────────────────────────────────────────

describe('mapPlayerToPrestigePosition', () => {
  it('maps QB correctly', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'QB' })).toBe('QB');
  });

  it('maps RB correctly', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'RB' })).toBe('RB');
  });

  it('maps FB to RB', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'FB' })).toBe('RB');
  });

  it('maps WR correctly', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'WR' })).toBe('WR');
  });

  it('maps DL correctly', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'DL' })).toBe('DL');
  });

  it('maps DE to DL', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'DE' })).toBe('DL');
  });

  it('maps DT to DL', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'DT' })).toBe('DL');
  });

  it('maps EDGE to DL', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'EDGE' })).toBe('DL');
  });

  it('returns null for unsupported positions', () => {
    expect(mapPlayerToPrestigePosition({ pos: 'LB' })).toBeNull();
    expect(mapPlayerToPrestigePosition({ pos: 'CB' })).toBeNull();
    expect(mapPlayerToPrestigePosition({ pos: 'OL' })).toBeNull();
    expect(mapPlayerToPrestigePosition({ pos: 'TE' })).toBeNull();
    expect(mapPlayerToPrestigePosition({ pos: 'K' })).toBeNull();
  });

  it('handles null/undefined player gracefully', () => {
    expect(mapPlayerToPrestigePosition(null)).toBeNull();
    expect(mapPlayerToPrestigePosition({})).toBeNull();
    expect(mapPlayerToPrestigePosition({ pos: null })).toBeNull();
  });
});

// ── computePrestigeScore ──────────────────────────────────────────────────────

describe('computePrestigeScore — QB formula', () => {
  it('computes QB score correctly using stats.season', () => {
    const qb = makeQB();
    // (4000*0.1) + (30*4) - (10*2) + (200*0.1) + (2*4)
    // = 400 + 120 - 20 + 20 + 8 = 528
    expect(computePrestigeScore(qb)).toBe(528);
  });

  it('subtracts interceptions from QB score', () => {
    const low = makeQB({ stats: { season: { passYd: 0, passTD: 0, interceptions: 5, rushYd: 0, rushTD: 0 } } });
    expect(computePrestigeScore(low)).toBe(-10);
  });

  it('uses careerStats over stats.season when available', () => {
    const qb = {
      pos: 'QB',
      careerStats: [
        { season: 2025, passYds: 3000, passTDs: 20, ints: 5, rushYds: 100, rushTDs: 1 },
      ],
      stats: { season: { passYd: 9999, passTD: 99 } },
    };
    // careerStats: (3000*0.1) + (20*4) - (5*2) + (100*0.1) + (1*4)
    // = 300 + 80 - 10 + 10 + 4 = 384
    expect(computePrestigeScore(qb)).toBe(384);
  });
});

describe('computePrestigeScore — RB formula', () => {
  it('computes RB score correctly', () => {
    const rb = makeRB();
    // scrimmageYds = 1200+300 = 1500; tds = 12+2 = 14; recs = 40
    // (1500*0.1) + (14*6) + (40*0.5) = 150 + 84 + 20 = 254
    expect(computePrestigeScore(rb)).toBe(254);
  });
});

describe('computePrestigeScore — WR formula', () => {
  it('computes WR score correctly', () => {
    const wr = makeWR();
    // scrimmageYds = 0+1300 = 1300; tds = 0+10 = 10; recs = 100
    // (1300*0.1) + (10*6) + (100*0.5) = 130 + 60 + 50 = 240
    expect(computePrestigeScore(wr)).toBe(240);
  });
});

describe('computePrestigeScore — DL formula', () => {
  it('computes DL score correctly', () => {
    const dl = makeDL();
    // (15*8) + (40*0.5) + (2*6) = 120 + 20 + 12 = 152
    expect(computePrestigeScore(dl)).toBe(152);
  });
});

describe('computePrestigeScore — edge cases', () => {
  it('returns null for unsupported positions', () => {
    expect(computePrestigeScore({ pos: 'LB', stats: { season: {} } })).toBeNull();
    expect(computePrestigeScore({ pos: 'TE', stats: { season: {} } })).toBeNull();
  });

  it('missing stats do not produce NaN — returns 0 for all-zero stats', () => {
    const qb = makeQB({ stats: { season: {} } });
    const score = computePrestigeScore(qb);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(0);
  });

  it('null/undefined stat fields treated as 0, no NaN', () => {
    const dl = { pos: 'DL', stats: { season: { sacks: null, tackles: undefined } } };
    const score = computePrestigeScore(dl);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  it('missing stats.season falls back to 0 score', () => {
    const rb = { pos: 'RB' };
    const score = computePrestigeScore(rb);
    expect(Number.isFinite(score)).toBe(true);
  });

  it('careerStats plural keys (passYds/passTDs/ints) are used correctly', () => {
    const qb = {
      pos: 'QB',
      careerStats: [{ passYds: 5000, passTDs: 40, ints: 8, rushYds: 0, rushTDs: 0 }],
    };
    // (5000*0.1)+(40*4)-(8*2) = 500+160-16 = 644
    expect(computePrestigeScore(qb)).toBe(644);
  });
});

// ── rankPrestigeCandidates ────────────────────────────────────────────────────

describe('rankPrestigeCandidates', () => {
  it('sorts by score descending', () => {
    const qb1 = makeQB({ id: 'qb1', stats: { season: { passYd: 4000, passTD: 30, interceptions: 10, rushYd: 200, rushTD: 2 } } });
    const qb2 = makeQB({ id: 'qb2', stats: { season: { passYd: 5000, passTD: 40, interceptions: 5, rushYd: 0, rushTD: 0 } } });

    const ranked = rankPrestigeCandidates([qb1, qb2], () => null);
    expect(ranked.QB[0].player.id).toBe('qb2');
    expect(ranked.QB[1].player.id).toBe('qb1');
  });

  it('breaks score ties by OVR desc', () => {
    const qb1 = makeQB({ id: 'qb_low', ovr: 80, stats: { season: { passYd: 0, passTD: 0, interceptions: 0, rushYd: 0, rushTD: 0 } } });
    const qb2 = makeQB({ id: 'qb_hi', ovr: 90, stats: { season: { passYd: 0, passTD: 0, interceptions: 0, rushYd: 0, rushTD: 0 } } });

    const ranked = rankPrestigeCandidates([qb1, qb2], () => null);
    expect(ranked.QB[0].player.id).toBe('qb_hi');
    expect(ranked.QB[1].player.id).toBe('qb_low');
  });

  it('breaks OVR ties by id asc (deterministic)', () => {
    const qb1 = makeQB({ id: 'b', ovr: 85, stats: { season: { passYd: 0, passTD: 0, interceptions: 0, rushYd: 0, rushTD: 0 } } });
    const qb2 = makeQB({ id: 'a', ovr: 85, stats: { season: { passYd: 0, passTD: 0, interceptions: 0, rushYd: 0, rushTD: 0 } } });

    const ranked = rankPrestigeCandidates([qb1, qb2], () => null);
    // 'a' < 'b' alphabetically → id 'a' first
    expect(ranked.QB[0].player.id).toBe('a');
    expect(ranked.QB[1].player.id).toBe('b');
  });

  it('groups by position correctly', () => {
    const players = [makeQB(), makeRB(), makeWR(), makeDL()];
    const ranked = rankPrestigeCandidates(players, () => null);
    expect(ranked.QB).toHaveLength(1);
    expect(ranked.RB).toHaveLength(1);
    expect(ranked.WR).toHaveLength(1);
    expect(ranked.DL).toHaveLength(1);
  });

  it('excludes unsupported positions', () => {
    const lb = { id: 'lb1', pos: 'LB', stats: { season: {} } };
    const ranked = rankPrestigeCandidates([lb], () => null);
    expect(ranked.QB).toHaveLength(0);
    expect(ranked.DL).toHaveLength(0);
  });

  it('is immutable — original array not mutated', () => {
    const players = [makeQB(), makeQB({ id: 'qb2' })];
    const before = [...players];
    rankPrestigeCandidates(players, () => null);
    expect(players[0]).toBe(before[0]);
  });

  it('attaches conf from teamResolver', () => {
    const qb = makeQB({ teamId: 5 });
    const resolver = (id) => makeTeam(id, 'AFC');
    const ranked = rankPrestigeCandidates([qb], resolver);
    expect(ranked.QB[0].conf).toBe(0);
  });
});

// ── selectAllProTeams ─────────────────────────────────────────────────────────

describe('selectAllProTeams', () => {
  function makeRanked(players) {
    return rankPrestigeCandidates(players, () => null);
  }

  it('picks correct first and second team by quota', () => {
    const qbs = Array.from({ length: 5 }, (_, i) =>
      makeQB({ id: `qb${i}`, stats: { season: { passYd: (5 - i) * 1000, passTD: (5 - i) * 5, interceptions: 0, rushYd: 0, rushTD: 0 } } }),
    );
    const ranked = makeRanked(qbs);
    const assignments = selectAllProTeams(ranked, 2025);

    const firstTeam = assignments.filter(a => a.type === 'FIRST_TEAM_ALL_PRO' && a.prestigePos === 'QB');
    const secondTeam = assignments.filter(a => a.type === 'SECOND_TEAM_ALL_PRO' && a.prestigePos === 'QB');

    // PRESTIGE_QUOTAS.allPro.QB = 2 → 2 on first team, 2 on second team
    expect(firstTeam).toHaveLength(PRESTIGE_QUOTAS.allPro.QB);
    expect(secondTeam).toHaveLength(PRESTIGE_QUOTAS.allPro.QB);
  });

  it('first team has higher score than second team', () => {
    const qbs = [
      makeQB({ id: 'top1', stats: { season: { passYd: 5000, passTD: 40, interceptions: 5, rushYd: 0, rushTD: 0 } } }),
      makeQB({ id: 'top2', stats: { season: { passYd: 4000, passTD: 30, interceptions: 5, rushYd: 0, rushTD: 0 } } }),
      makeQB({ id: 'sec1', stats: { season: { passYd: 3000, passTD: 20, interceptions: 5, rushYd: 0, rushTD: 0 } } }),
      makeQB({ id: 'sec2', stats: { season: { passYd: 2000, passTD: 10, interceptions: 5, rushYd: 0, rushTD: 0 } } }),
    ];
    const ranked = makeRanked(qbs);
    const assignments = selectAllProTeams(ranked, 2025);
    const firstIds = assignments.filter(a => a.type === 'FIRST_TEAM_ALL_PRO').map(a => a.playerId);
    expect(firstIds).toContain('top1');
    expect(firstIds).toContain('top2');
  });

  it('returns empty for position with no candidates', () => {
    const ranked = { QB: [], RB: [], WR: [], DL: [] };
    const assignments = selectAllProTeams(ranked, 2025);
    expect(assignments).toHaveLength(0);
  });

  it('stamps year on each assignment', () => {
    const ranked = makeRanked([makeQB(), makeWR()]);
    const assignments = selectAllProTeams(ranked, 2026);
    assignments.forEach(a => expect(a.year).toBe(2026));
  });
});

// ── selectProBowlTeams ────────────────────────────────────────────────────────

describe('selectProBowlTeams', () => {
  function makeRankedWithConf(confMap) {
    const byPos = { QB: [], RB: [], WR: [], DL: [] };
    for (const [id, { pos, conf, score }] of Object.entries(confMap)) {
      const pPos = mapPlayerToPrestigePosition({ pos });
      if (!pPos) continue;
      byPos[pPos].push({
        player: { id, name: `P${id}`, pos, ovr: 80 },
        score,
        conf,
        teamId: null,
        teamName: null,
        teamAbbr: null,
      });
    }
    for (const pos of Object.keys(byPos)) {
      byPos[pos].sort((a, b) => b.score - a.score);
    }
    return byPos;
  }

  it('respects per-conference quota for QB (4 per conf)', () => {
    const ranked = makeRankedWithConf({
      qb1: { pos: 'QB', conf: 0, score: 100 },
      qb2: { pos: 'QB', conf: 0, score: 90 },
      qb3: { pos: 'QB', conf: 0, score: 80 },
      qb4: { pos: 'QB', conf: 0, score: 70 },
      qb5: { pos: 'QB', conf: 0, score: 60 },
      qb6: { pos: 'QB', conf: 1, score: 100 },
      qb7: { pos: 'QB', conf: 1, score: 90 },
      qb8: { pos: 'QB', conf: 1, score: 80 },
      qb9: { pos: 'QB', conf: 1, score: 70 },
      qb10: { pos: 'QB', conf: 1, score: 60 },
    });
    const assignments = selectProBowlTeams(ranked, 2025);
    const afcQBs = assignments.filter(a => a.prestigePos === 'QB' && a.conf === 0);
    const nfcQBs = assignments.filter(a => a.prestigePos === 'QB' && a.conf === 1);
    expect(afcQBs).toHaveLength(PRESTIGE_QUOTAS.proBowlPerConference.QB);
    expect(nfcQBs).toHaveLength(PRESTIGE_QUOTAS.proBowlPerConference.QB);
  });

  it('skips players with unknown conference (-1)', () => {
    const ranked = makeRankedWithConf({
      qb1: { pos: 'QB', conf: -1, score: 100 },
    });
    const assignments = selectProBowlTeams(ranked, 2025);
    expect(assignments.filter(a => a.prestigePos === 'QB')).toHaveLength(0);
  });

  it('does not exceed conference quota even with many candidates', () => {
    const qbs = {};
    for (let i = 0; i < 20; i++) qbs[`qb${i}`] = { pos: 'QB', conf: 0, score: 100 - i };
    const ranked = makeRankedWithConf(qbs);
    const afcQBs = selectProBowlTeams(ranked, 2025).filter(a => a.prestigePos === 'QB' && a.conf === 0);
    expect(afcQBs).toHaveLength(PRESTIGE_QUOTAS.proBowlPerConference.QB);
  });

  it('stamps PRO_BOWL type on all assignments', () => {
    const ranked = makeRankedWithConf({ qb1: { pos: 'QB', conf: 0, score: 100 } });
    const assignments = selectProBowlTeams(ranked, 2025);
    assignments.forEach(a => expect(a.type).toBe('PRO_BOWL'));
  });
});

// ── mergeHonorsIntoPlayers ────────────────────────────────────────────────────

describe('mergeHonorsIntoPlayers', () => {
  const SEASON = 2025;

  const assignment = {
    playerId: 'qb1',
    playerName: 'Test QB',
    pos: 'QB',
    prestigePos: 'QB',
    teamId: 1,
    teamName: 'Team 1',
    type: 'FIRST_TEAM_ALL_PRO',
    year: SEASON,
    score: 500,
  };

  it('appends to honorsHistory', () => {
    const player = makeQB({ id: 'qb1' });
    const [updated] = mergeHonorsIntoPlayers([player], [assignment], SEASON);
    expect(updated.honorsHistory).toHaveLength(1);
    expect(updated.honorsHistory[0].type).toBe('FIRST_TEAM_ALL_PRO');
    expect(updated.honorsHistory[0].year).toBe(SEASON);
  });

  it('appends accolade object', () => {
    const player = makeQB({ id: 'qb1' });
    const [updated] = mergeHonorsIntoPlayers([player], [assignment], SEASON);
    const hasAccolade = (updated.accolades ?? []).some(a => a.type === 'FIRST_TEAM_ALL_PRO' && a.year === SEASON);
    expect(hasAccolade).toBe(true);
  });

  it('is rerun-safe — no duplicate honors on second merge', () => {
    const player = makeQB({ id: 'qb1' });
    const firstPass = mergeHonorsIntoPlayers([player], [assignment], SEASON)[0];
    const secondPass = mergeHonorsIntoPlayers([firstPass], [assignment], SEASON)[0];
    expect(secondPass.honorsHistory).toHaveLength(1);
    expect((secondPass.accolades ?? []).filter(a => a.type === 'FIRST_TEAM_ALL_PRO' && a.year === SEASON)).toHaveLength(1);
  });

  it('preserves existing honorsHistory entries', () => {
    const player = makeQB({
      id: 'qb1',
      honorsHistory: [{ year: 2024, type: 'PRO_BOWL', teamId: 1 }],
    });
    const [updated] = mergeHonorsIntoPlayers([player], [assignment], SEASON);
    expect(updated.honorsHistory).toHaveLength(2);
    expect(updated.honorsHistory[0].year).toBe(2024);
    expect(updated.honorsHistory[1].year).toBe(SEASON);
  });

  it('returns same reference for unchanged player', () => {
    const player = makeQB({ id: 'other' });
    const [unchanged] = mergeHonorsIntoPlayers([player], [assignment], SEASON);
    expect(unchanged).toBe(player);
  });

  it('initializes honorsHistory: [] for old save without the field', () => {
    const oldPlayer = { id: 'qb1', name: 'Old QB', pos: 'QB', ovr: 80, teamId: 1 };
    const [updated] = mergeHonorsIntoPlayers([oldPlayer], [assignment], SEASON);
    expect(Array.isArray(updated.honorsHistory)).toBe(true);
    expect(updated.honorsHistory).toHaveLength(1);
  });

  it('does not mutate input player objects', () => {
    const player = makeQB({ id: 'qb1' });
    mergeHonorsIntoPlayers([player], [assignment], SEASON);
    expect(player.honorsHistory).toBeUndefined();
  });

  it('preserves existing accolades from other systems', () => {
    const player = makeQB({
      id: 'qb1',
      accolades: [{ type: 'MVP', year: 2025, seasonId: 2025 }],
    });
    const [updated] = mergeHonorsIntoPlayers([player], [assignment], SEASON);
    const mvp = (updated.accolades ?? []).find(a => a.type === 'MVP');
    expect(mvp).toBeTruthy();
  });
});

// ── getPriorSeasonPrestigePremium ─────────────────────────────────────────────

describe('getPriorSeasonPrestigePremium', () => {
  it('returns First-Team All-Pro premium (1.12)', () => {
    const player = {
      honorsHistory: [{ year: 2024, type: 'FIRST_TEAM_ALL_PRO', teamId: 1 }],
    };
    const result = getPriorSeasonPrestigePremium(player, 2025);
    expect(result.hasPremium).toBe(true);
    expect(result.multiplier).toBe(1.12);
    expect(result.type).toBe('FIRST_TEAM_ALL_PRO');
  });

  it('returns Second-Team All-Pro premium (1.06)', () => {
    const player = {
      honorsHistory: [{ year: 2024, type: 'SECOND_TEAM_ALL_PRO', teamId: 1 }],
    };
    const result = getPriorSeasonPrestigePremium(player, 2025);
    expect(result.multiplier).toBe(1.06);
    expect(result.type).toBe('SECOND_TEAM_ALL_PRO');
  });

  it('returns Pro Bowl premium (1.04)', () => {
    const player = {
      honorsHistory: [{ year: 2024, type: 'PRO_BOWL', teamId: 1 }],
    };
    const result = getPriorSeasonPrestigePremium(player, 2025);
    expect(result.multiplier).toBe(1.04);
    expect(result.type).toBe('PRO_BOWL');
  });

  it('returns no premium when no prior-season honors', () => {
    const player = { honorsHistory: [] };
    const result = getPriorSeasonPrestigePremium(player, 2025);
    expect(result.hasPremium).toBe(false);
    expect(result.multiplier).toBe(1.0);
    expect(result.type).toBeNull();
  });

  it('ignores honors from seasons other than priorSeason', () => {
    const player = {
      honorsHistory: [{ year: 2022, type: 'FIRST_TEAM_ALL_PRO', teamId: 1 }],
    };
    const result = getPriorSeasonPrestigePremium(player, 2025);
    expect(result.hasPremium).toBe(false);
  });

  it('handles missing honorsHistory gracefully', () => {
    const player = {};
    const result = getPriorSeasonPrestigePremium(player, 2025);
    expect(result.hasPremium).toBe(false);
    expect(result.multiplier).toBe(1.0);
  });

  it('prefers First-Team over Second-Team when both present', () => {
    const player = {
      honorsHistory: [
        { year: 2024, type: 'SECOND_TEAM_ALL_PRO', teamId: 1 },
        { year: 2024, type: 'FIRST_TEAM_ALL_PRO', teamId: 1 },
      ],
    };
    const result = getPriorSeasonPrestigePremium(player, 2025);
    expect(result.type).toBe('FIRST_TEAM_ALL_PRO');
    expect(result.multiplier).toBe(1.12);
  });

  it('sets priorSeason to currentSeason - 1', () => {
    const player = { honorsHistory: [] };
    const result = getPriorSeasonPrestigePremium(player, 2026);
    expect(result.priorSeason).toBe(2025);
  });
});

// ── No Math.random ────────────────────────────────────────────────────────────

describe('prestige engine determinism', () => {
  it('same inputs always produce same output for computePrestigeScore', () => {
    const qb = makeQB();
    expect(computePrestigeScore(qb)).toBe(computePrestigeScore(qb));
  });

  it('same inputs always produce same output for rankPrestigeCandidates', () => {
    const players = [makeQB(), makeQB({ id: 'qb2', ovr: 90 })];
    const r1 = rankPrestigeCandidates(players, () => null);
    const r2 = rankPrestigeCandidates(players, () => null);
    expect(r1.QB.map(c => c.player.id)).toEqual(r2.QB.map(c => c.player.id));
  });

  it('selectAllProTeams is deterministic', () => {
    const qbs = Array.from({ length: 6 }, (_, i) =>
      makeQB({ id: `qb${i}`, stats: { season: { passYd: (6 - i) * 1000, passTD: 20, interceptions: 5, rushYd: 0, rushTD: 0 } } }),
    );
    const ranked = rankPrestigeCandidates(qbs, () => null);
    const a1 = selectAllProTeams(ranked, 2025);
    const a2 = selectAllProTeams(ranked, 2025);
    expect(a1.map(a => a.playerId)).toEqual(a2.map(a => a.playerId));
  });
});
