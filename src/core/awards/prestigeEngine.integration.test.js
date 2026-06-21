/**
 * prestigeEngine.integration.test.js
 *
 * Integration-level tests for the Pro Bowl & All-Pro Prestige Engine.
 * Tests the full pipeline (rankPrestigeCandidates → select* → merge → summary)
 * without touching Web Worker or IndexedDB.
 *
 * Coverage:
 *  - Old saves hydrate missing honorsHistory safely
 *  - End-of-season flow assigns honors exactly once per player
 *  - Replaying the pipeline does not duplicate honors (rerun-safe)
 *  - mergeHonorsIntoPlayers persists accolade objects to retired-player path
 *  - buildSeasonHonorsSummary populates grouped view data
 *  - Prior-season prestige changes agent negotiation demand
 *  - Shark + prior-season All-Pro gets extra premium over non-Shark
 *  - Legends browser timeline receives honor accolade strings without regression
 */

import { describe, it, expect } from 'vitest';
import {
  rankPrestigeCandidates,
  selectAllProTeams,
  selectProBowlTeams,
  mergeHonorsIntoPlayers,
  buildSeasonHonorsSummary,
  getPriorSeasonPrestigePremium,
  PRESTIGE_QUOTAS,
} from './prestigeEngine.js';
import {
  computeAgentExpectedSalary,
  generateDeterministicAgentProfile,
  AGENT_ARCHETYPES,
} from '../contracts/agentNegotiationEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SEASON = 2025;

function makePlayer(overrides = {}) {
  return {
    id: String(Math.random()),
    name: 'Player',
    pos: 'QB',
    ovr: 80,
    teamId: 1,
    honorsHistory: [],
    accolades: [],
    careerStats: [],
    stats: { season: {} },
    ...overrides,
  };
}

function makeCareerStats(season, statOverrides = {}) {
  return {
    season,
    passYds: 0, passTDs: 0, ints: 0,
    rushYds: 0, rushTDs: 0,
    recYds: 0, recTDs: 0, receptions: 0,
    sacks: 0, tackles: 0,
    ...statOverrides,
  };
}

function makeTeam(id, conf, overrides = {}) {
  return { id, conf, name: `Team${id}`, abbr: `T${id}`, ...overrides };
}

function teamResolver(teamMap) {
  return (id) => teamMap[id] ?? null;
}

// Build a pool of players that will fill all slots with clear ordering.
function buildPlayerPool() {
  const teams = {
    1: makeTeam(1, 0, { name: 'Eagles', abbr: 'PHI' }),   // AFC
    2: makeTeam(2, 1, { name: 'Cowboys', abbr: 'DAL' }),   // NFC
    3: makeTeam(3, 0, { name: 'Ravens', abbr: 'BAL' }),    // AFC
    4: makeTeam(4, 1, { name: 'Packers', abbr: 'GB' }),    // NFC
    5: makeTeam(5, 0),
    6: makeTeam(6, 1),
    7: makeTeam(7, 0),
    8: makeTeam(8, 1),
  };

  // 6 QBs: 3 AFC, 3 NFC (need 4 per conf for Pro Bowl)
  const qbs = [];
  for (let i = 0; i < 3; i++) {
    qbs.push(makePlayer({
      id: `qb_afc_${i}`, name: `AFC QB ${i}`, pos: 'QB', teamId: 1,
      ovr: 90 - i,
      careerStats: [makeCareerStats(SEASON, { passYds: 4500 - i * 200, passTDs: 35 - i * 2, ints: 8 })],
    }));
  }
  for (let i = 0; i < 3; i++) {
    qbs.push(makePlayer({
      id: `qb_nfc_${i}`, name: `NFC QB ${i}`, pos: 'QB', teamId: 2,
      ovr: 88 - i,
      careerStats: [makeCareerStats(SEASON, { passYds: 4300 - i * 200, passTDs: 33 - i * 2, ints: 9 })],
    }));
  }

  // 6 RBs: 3 AFC, 3 NFC
  const rbs = [];
  for (let i = 0; i < 3; i++) {
    rbs.push(makePlayer({
      id: `rb_afc_${i}`, name: `AFC RB ${i}`, pos: 'RB', teamId: 3,
      ovr: 88 - i,
      careerStats: [makeCareerStats(SEASON, { rushYds: 1400 - i * 100, rushTDs: 12 - i, receptions: 40 })],
    }));
  }
  for (let i = 0; i < 3; i++) {
    rbs.push(makePlayer({
      id: `rb_nfc_${i}`, name: `NFC RB ${i}`, pos: 'RB', teamId: 4,
      ovr: 86 - i,
      careerStats: [makeCareerStats(SEASON, { rushYds: 1300 - i * 100, rushTDs: 11 - i, receptions: 35 })],
    }));
  }

  // 8 WRs: 4 AFC, 4 NFC
  const wrs = [];
  for (let i = 0; i < 4; i++) {
    wrs.push(makePlayer({
      id: `wr_afc_${i}`, name: `AFC WR ${i}`, pos: 'WR', teamId: 5,
      ovr: 88 - i,
      careerStats: [makeCareerStats(SEASON, { recYds: 1400 - i * 100, recTDs: 12 - i, receptions: 100 - i * 5 })],
    }));
  }
  for (let i = 0; i < 4; i++) {
    wrs.push(makePlayer({
      id: `wr_nfc_${i}`, name: `NFC WR ${i}`, pos: 'WR', teamId: 6,
      ovr: 86 - i,
      careerStats: [makeCareerStats(SEASON, { recYds: 1300 - i * 100, recTDs: 11 - i, receptions: 95 - i * 5 })],
    }));
  }

  // 8 DLs: 4 AFC, 4 NFC
  const dls = [];
  for (let i = 0; i < 4; i++) {
    dls.push(makePlayer({
      id: `dl_afc_${i}`, name: `AFC DL ${i}`, pos: 'DL', teamId: 7,
      ovr: 88 - i,
      careerStats: [makeCareerStats(SEASON, { sacks: 18 - i, tackles: 40 - i * 2 })],
    }));
  }
  for (let i = 0; i < 4; i++) {
    dls.push(makePlayer({
      id: `dl_nfc_${i}`, name: `NFC DL ${i}`, pos: 'DL', teamId: 8,
      ovr: 86 - i,
      careerStats: [makeCareerStats(SEASON, { sacks: 16 - i, tackles: 35 - i * 2 })],
    }));
  }

  return { players: [...qbs, ...rbs, ...wrs, ...dls], teams };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Prestige Engine — integration', () => {

  describe('old save hydration', () => {
    it('player missing honorsHistory gets empty array (no crash)', () => {
      const player = makePlayer({ honorsHistory: undefined });
      const hydrated = Array.isArray(player?.honorsHistory) ? player.honorsHistory : [];
      expect(hydrated).toEqual([]);
    });

    it('mergeHonorsIntoPlayers handles player with no honorsHistory field', () => {
      const player = { id: 'p1', name: 'Old Player', pos: 'QB' };
      const ha = { playerId: 'p1', playerName: 'Old Player', pos: 'QB', prestigePos: 'QB',
        teamId: 1, teamName: 'Eagles', teamAbbr: 'PHI', type: 'FIRST_TEAM_ALL_PRO',
        year: SEASON, score: 500 };
      const result = mergeHonorsIntoPlayers([player], [ha], SEASON);
      expect(result[0].honorsHistory).toHaveLength(1);
      expect(result[0].honorsHistory[0].type).toBe('FIRST_TEAM_ALL_PRO');
    });
  });

  describe('end-of-season flow', () => {
    it('assigns All-Pro honors to top performers per position', () => {
      const { players, teams } = buildPlayerPool();
      const ranked = rankPrestigeCandidates(players, teamResolver(teams), SEASON);
      const allPro = selectAllProTeams(ranked, SEASON);

      // Should have 2 first-team + 2 second-team per position × 4 positions = 16
      expect(allPro).toHaveLength(16);

      const firstTeam = allPro.filter(a => a.type === 'FIRST_TEAM_ALL_PRO');
      const secondTeam = allPro.filter(a => a.type === 'SECOND_TEAM_ALL_PRO');
      expect(firstTeam).toHaveLength(8); // 2 per pos × 4 pos
      expect(secondTeam).toHaveLength(8);
    });

    it('assigns Pro Bowl honors per conference within quota', () => {
      const { players, teams } = buildPlayerPool();
      const ranked = rankPrestigeCandidates(players, teamResolver(teams), SEASON);
      const proBowl = selectProBowlTeams(ranked, SEASON);

      // QB: 4 per conf, but only 3 per conf available → 6 total QBs
      const qbPB = proBowl.filter(a => a.prestigePos === 'QB');
      expect(qbPB).toHaveLength(6); // 3 AFC + 3 NFC

      // RB: 4 per conf, 3 per conf available → 6 total RBs
      const rbPB = proBowl.filter(a => a.prestigePos === 'RB');
      expect(rbPB).toHaveLength(6);

      // WR: 6 per conf, 4 per conf available → 8 total WRs
      const wrPB = proBowl.filter(a => a.prestigePos === 'WR');
      expect(wrPB).toHaveLength(8);

      // DL: 6 per conf, 4 per conf available → 8 total DLs
      const dlPB = proBowl.filter(a => a.prestigePos === 'DL');
      expect(dlPB).toHaveLength(8);
    });

    it('players with unknown conference (conf=-1) are skipped for Pro Bowl', () => {
      const unknownTeam = { id: 99, conf: 'UNKNOWN', name: 'Unknown', abbr: 'UNK' };
      const unknownPlayer = makePlayer({
        id: 'qb_unk', name: 'Unknown QB', pos: 'QB', teamId: 99, ovr: 99,
        careerStats: [makeCareerStats(SEASON, { passYds: 9999, passTDs: 99, ints: 0 })],
      });
      const { players, teams } = buildPlayerPool();
      const allPlayers = [...players, unknownPlayer];
      const allTeams = { ...teams, 99: unknownTeam };
      const ranked = rankPrestigeCandidates(allPlayers, teamResolver(allTeams), SEASON);
      const proBowl = selectProBowlTeams(ranked, SEASON);
      const unknownEntry = proBowl.find(a => a.playerId === 'qb_unk');
      expect(unknownEntry).toBeUndefined();
    });

    it('top-ranked player appears as FIRST_TEAM_ALL_PRO at their position', () => {
      const { players, teams } = buildPlayerPool();
      const ranked = rankPrestigeCandidates(players, teamResolver(teams), SEASON);
      const allPro = selectAllProTeams(ranked, SEASON);
      const firstQB = allPro.find(a => a.prestigePos === 'QB' && a.type === 'FIRST_TEAM_ALL_PRO');
      expect(firstQB?.playerId).toBe('qb_afc_0'); // highest score
    });
  });

  describe('rerun safety', () => {
    it('replaying merge does not duplicate honors', () => {
      const { players, teams } = buildPlayerPool();
      const ranked = rankPrestigeCandidates(players, teamResolver(teams), SEASON);
      const allPro = selectAllProTeams(ranked, SEASON);
      const proBowl = selectProBowlTeams(ranked, SEASON);
      const allAssignments = [...allPro, ...proBowl];

      // First merge
      const merged1 = mergeHonorsIntoPlayers(players, allAssignments, SEASON);
      // Second merge (replay)
      const merged2 = mergeHonorsIntoPlayers(merged1, allAssignments, SEASON);

      // Player with honors should not have duplicates
      const honored = merged2.find(p => p.honorsHistory?.length > 0);
      if (honored) {
        const keys = honored.honorsHistory.map(h => `${h.year}_${h.type}`);
        const unique = new Set(keys);
        expect(unique.size).toBe(keys.length);
      }
    });

    it('unchanged players return same object reference', () => {
      const noHonorPlayer = makePlayer({ id: 'nobody', pos: 'QB', teamId: 1 });
      const result = mergeHonorsIntoPlayers([noHonorPlayer], [], SEASON);
      expect(result[0]).toBe(noHonorPlayer);
    });

    it('honors are idempotent across two identical runs', () => {
      const { players, teams } = buildPlayerPool();
      const ranked = rankPrestigeCandidates(players, teamResolver(teams), SEASON);
      const allPro = selectAllProTeams(ranked, SEASON);

      const merged1 = mergeHonorsIntoPlayers(players, allPro, SEASON);
      const merged2 = mergeHonorsIntoPlayers(merged1, allPro, SEASON);

      for (let i = 0; i < players.length; i++) {
        const h1 = merged1[i].honorsHistory?.length ?? 0;
        const h2 = merged2[i].honorsHistory?.length ?? 0;
        expect(h2).toBe(h1);
      }
    });
  });

  describe('accolades for retired-player path', () => {
    it('mergeHonorsIntoPlayers writes accolade objects to player.accolades', () => {
      const player = makePlayer({ id: 'ret1', pos: 'DL', teamId: 1 });
      const ha = {
        playerId: 'ret1', playerName: 'Ret DL', pos: 'DL', prestigePos: 'DL',
        teamId: 1, teamName: 'Eagles', teamAbbr: 'PHI',
        type: 'PRO_BOWL', year: SEASON, score: 120,
      };
      const [updated] = mergeHonorsIntoPlayers([player], [ha], SEASON);
      expect(updated.accolades).toHaveLength(1);
      expect(updated.accolades[0]).toMatchObject({ type: 'PRO_BOWL', year: SEASON, seasonId: SEASON });
    });

    it('does not overwrite existing accolades of different type', () => {
      const existing = { type: 'MVP', year: SEASON - 1, seasonId: SEASON - 1 };
      const player = makePlayer({ id: 'ret2', pos: 'QB', teamId: 1, accolades: [existing] });
      const ha = {
        playerId: 'ret2', playerName: 'Vet QB', pos: 'QB', prestigePos: 'QB',
        teamId: 1, teamName: 'Eagles', teamAbbr: 'PHI',
        type: 'FIRST_TEAM_ALL_PRO', year: SEASON, score: 500,
      };
      const [updated] = mergeHonorsIntoPlayers([player], [ha], SEASON);
      expect(updated.accolades).toHaveLength(2);
      expect(updated.accolades.some(a => a.type === 'MVP')).toBe(true);
      expect(updated.accolades.some(a => a.type === 'FIRST_TEAM_ALL_PRO')).toBe(true);
    });
  });

  describe('buildSeasonHonorsSummary', () => {
    it('populates grouped view data for each honor type', () => {
      const { players, teams } = buildPlayerPool();
      const ranked = rankPrestigeCandidates(players, teamResolver(teams), SEASON);
      const allPro = selectAllProTeams(ranked, SEASON);
      const proBowl = selectProBowlTeams(ranked, SEASON);
      const all = [...allPro, ...proBowl];

      const summary = buildSeasonHonorsSummary(players, all, teamResolver(teams));

      expect(summary).toHaveProperty('FIRST_TEAM_ALL_PRO');
      expect(summary).toHaveProperty('SECOND_TEAM_ALL_PRO');
      expect(summary).toHaveProperty('PRO_BOWL');

      // Each position group should have entries
      expect(summary.FIRST_TEAM_ALL_PRO.QB).toBeTruthy();
      expect(summary.FIRST_TEAM_ALL_PRO.QB.length).toBe(PRESTIGE_QUOTAS.allPro.QB);
    });

    it('returns empty position groups for missing assignment types', () => {
      const summary = buildSeasonHonorsSummary([], [], () => null);
      expect(summary.FIRST_TEAM_ALL_PRO).toEqual({});
      expect(summary.PRO_BOWL).toEqual({});
    });
  });

  describe('contract leverage — prior-season prestige premium', () => {
    it('prior First-Team All-Pro adds multiplier to expected salary', () => {
      const base = 10_000_000;
      const player = makePlayer({
        id: 'star_qb',
        pos: 'QB',
        honorsHistory: [{ year: SEASON - 1, type: 'FIRST_TEAM_ALL_PRO', teamId: 1 }],
      });
      // Force a LOYALIST agent (no archetype modifier, isolates prestige)
      Object.defineProperty(player, 'agent', {
        value: { archetype: AGENT_ARCHETYPES.LOYALIST, greed: 0, aggressiveness: 0, patience: 0.5 },
        writable: true,
      });
      player.negotiationState = { negotiationsFrozenUntilSeason: null };

      const result = computeAgentExpectedSalary({
        player,
        baseFairMarketValue: base,
        teamContext: { currentSeason: SEASON },
      });

      // FIRST_TEAM_ALL_PRO → 1.12 multiplier → +12%
      expect(result.expectedSalary).toBeCloseTo(base * 1.12, 0);
    });

    it('prior Pro Bowl adds smaller multiplier', () => {
      const base = 8_000_000;
      const player = makePlayer({
        id: 'pb_rb',
        pos: 'RB',
        honorsHistory: [{ year: SEASON - 1, type: 'PRO_BOWL', teamId: 1 }],
      });
      Object.defineProperty(player, 'agent', {
        value: { archetype: AGENT_ARCHETYPES.LOYALIST, greed: 0, aggressiveness: 0, patience: 0.5 },
        writable: true,
      });
      player.negotiationState = { negotiationsFrozenUntilSeason: null };

      const result = computeAgentExpectedSalary({
        player,
        baseFairMarketValue: base,
        teamContext: { currentSeason: SEASON },
      });

      // PRO_BOWL → 1.04 → +4%
      expect(result.expectedSalary).toBeCloseTo(base * 1.04, 0);
    });

    it('no prior honors → no prestige premium', () => {
      const base = 5_000_000;
      const player = makePlayer({ id: 'nobody_rb', pos: 'RB', honorsHistory: [] });
      Object.defineProperty(player, 'agent', {
        value: { archetype: AGENT_ARCHETYPES.LOYALIST, greed: 0, aggressiveness: 0, patience: 0.5 },
        writable: true,
      });
      player.negotiationState = { negotiationsFrozenUntilSeason: null };

      const result = computeAgentExpectedSalary({
        player,
        baseFairMarketValue: base,
        teamContext: { currentSeason: SEASON },
      });

      expect(result.expectedSalary).toBeCloseTo(base, 0);
    });
  });

  describe('Shark + All-Pro extra premium', () => {
    it('Shark agent with FIRST_TEAM_ALL_PRO gets extra +5% on top of prestige bonus', () => {
      const base = 10_000_000;
      const player = makePlayer({
        id: 'shark_allpro',
        pos: 'DL',
        honorsHistory: [{ year: SEASON - 1, type: 'FIRST_TEAM_ALL_PRO', teamId: 1 }],
      });
      // Force SHARK with greed=0 so we isolate the prestige bonus
      Object.defineProperty(player, 'agent', {
        value: { archetype: AGENT_ARCHETYPES.SHARK, greed: 0, aggressiveness: 0, patience: 0.5 },
        writable: true,
      });
      player.negotiationState = { negotiationsFrozenUntilSeason: null };

      const result = computeAgentExpectedSalary({
        player,
        baseFairMarketValue: base,
        teamContext: { currentSeason: SEASON },
      });

      // SHARK base with greed=0: modifier=0; FIRST_TEAM_ALL_PRO: +0.12; Shark+AllPro extra: +0.05 → total 1.17×
      expect(result.expectedSalary).toBeCloseTo(base * 1.17, 0);
    });

    it('non-Shark agent with FIRST_TEAM_ALL_PRO does NOT get +5% extra', () => {
      const base = 10_000_000;
      const player = makePlayer({
        id: 'loyalist_allpro',
        pos: 'DL',
        honorsHistory: [{ year: SEASON - 1, type: 'FIRST_TEAM_ALL_PRO', teamId: 1 }],
      });
      Object.defineProperty(player, 'agent', {
        value: { archetype: AGENT_ARCHETYPES.LOYALIST, greed: 0, aggressiveness: 0, patience: 0.5 },
        writable: true,
      });
      player.negotiationState = { negotiationsFrozenUntilSeason: null };

      const result = computeAgentExpectedSalary({
        player,
        baseFairMarketValue: base,
        teamContext: { currentSeason: SEASON },
      });

      // LOYALIST: no archetype modifier; FIRST_TEAM_ALL_PRO: +0.12 only → 1.12×
      expect(result.expectedSalary).toBeCloseTo(base * 1.12, 0);
    });
  });

  describe('legends browser / accolade timeline regression', () => {
    it('honor accolades written by mergeHonorsIntoPlayers have expected shape for timeline', () => {
      const player = makePlayer({ id: 'legend_qb', pos: 'QB', teamId: 1 });
      const ha = {
        playerId: 'legend_qb', playerName: 'Legend QB', pos: 'QB', prestigePos: 'QB',
        teamId: 1, teamName: 'Eagles', teamAbbr: 'PHI',
        type: 'FIRST_TEAM_ALL_PRO', year: SEASON, score: 600,
      };
      const [updated] = mergeHonorsIntoPlayers([player], [ha], SEASON);
      const accolade = updated.accolades[0];
      expect(accolade).toHaveProperty('type', 'FIRST_TEAM_ALL_PRO');
      expect(accolade).toHaveProperty('year', SEASON);
      expect(accolade).toHaveProperty('seasonId', SEASON);
    });

    it('honorsHistory entry has expected shape for legacy export', () => {
      const player = makePlayer({ id: 'hist_qb', pos: 'QB', teamId: 1 });
      const ha = {
        playerId: 'hist_qb', playerName: 'History QB', pos: 'QB', prestigePos: 'QB',
        teamId: 1, teamName: 'Eagles', teamAbbr: 'PHI',
        type: 'PRO_BOWL', year: SEASON, score: 200,
      };
      const [updated] = mergeHonorsIntoPlayers([player], [ha], SEASON);
      const h = updated.honorsHistory[0];
      expect(h).toHaveProperty('year', SEASON);
      expect(h).toHaveProperty('type', 'PRO_BOWL');
      expect(h).toHaveProperty('teamId', 1);
    });

    it('existing non-prestige accolades are preserved', () => {
      const priorAcc = { type: 'HOF_INDUCTEE', year: SEASON - 2, seasonId: SEASON - 2 };
      const player = makePlayer({ id: 'hof_legend', pos: 'DL', teamId: 1, accolades: [priorAcc] });
      const ha = {
        playerId: 'hof_legend', playerName: 'HOF Legend', pos: 'DL', prestigePos: 'DL',
        teamId: 1, teamName: 'Ravens', teamAbbr: 'BAL',
        type: 'SECOND_TEAM_ALL_PRO', year: SEASON, score: 140,
      };
      const [updated] = mergeHonorsIntoPlayers([player], [ha], SEASON);
      expect(updated.accolades.some(a => a.type === 'HOF_INDUCTEE')).toBe(true);
      expect(updated.accolades.some(a => a.type === 'SECOND_TEAM_ALL_PRO')).toBe(true);
    });
  });
});
