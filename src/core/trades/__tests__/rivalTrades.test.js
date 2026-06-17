import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { isRival, applyAIToAITrade } from '../aiToAiTradeEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeTeam(id, conf, div) {
  return { id, conf, div, name: `Team${id}`, abbr: `T${id}`, capSpace: 0, picks: [] };
}

function makeTrade(overrides = {}) {
  return {
    offerId: 'offer-1',
    teamAId: 2, teamAName: 'Team2',
    teamBId: 3, teamBName: 'Team3',
    playerId: 99, playerName: 'Star Player', playerPos: 'WR', playerOvr: 85,
    offeredPlayers: [],
    offeredPicks: [],
    contenderAsset: { player: { contract: { baseAnnual: 0 } } },
    rebuilderAsset: { player: { contract: { baseAnnual: 0 } }, value: 100 },
    week: 9, season: 2025,
    ...overrides,
  };
}

function makeState(teams = [], extraMeta = {}) {
  return {
    teams,
    rosters: [{ id: 99, teamId: 3, name: 'Star Player', pos: 'WR', ovr: 85 }],
    picks: [],
    meta: { tradeOffers: [], ...extraMeta },
  };
}

// ── isRival ────────────────────────────────────────────────────────────────────

describe('isRival', () => {
  const teams = [
    makeTeam(1, 0, 0), // user: conf 0, div 0
    makeTeam(2, 0, 0), // same conf, same div → division rival
    makeTeam(3, 0, 1), // same conf, diff div → conference rival
    makeTeam(4, 1, 0), // diff conf → not rival
  ];

  it('returns division rival for same-division teams', () => {
    const result = isRival(1, 2, teams);
    expect(result.isRival).toBe(true);
    expect(result.rivalType).toBe('division');
  });

  it('returns conference rival for same-conference different-division teams', () => {
    const result = isRival(1, 3, teams);
    expect(result.isRival).toBe(true);
    expect(result.rivalType).toBe('conference');
  });

  it('returns false for teams in different conferences', () => {
    const result = isRival(1, 4, teams);
    expect(result.isRival).toBe(false);
  });

  it('returns false when team not found', () => {
    const result = isRival(1, 999, teams);
    expect(result.isRival).toBe(false);
  });

  it('returns false when both teams not found', () => {
    const result = isRival(998, 999, teams);
    expect(result.isRival).toBe(false);
  });

  it('is symmetric: div rival A→B matches B→A', () => {
    const ab = isRival(1, 2, teams);
    const ba = isRival(2, 1, teams);
    expect(ab.rivalType).toBe(ba.rivalType);
  });
});

// ── applyAIToAITrade — rivalAlert ──────────────────────────────────────────────

describe('applyAIToAITrade — rivalAlert', () => {
  // user=1 (conf 0, div 0), teamA=2 (conf 0, div 0 = division rival), teamB=3 (conf 0, div 1 = conf rival), teamC=4 (conf 1 = no rival)
  const teams = [
    makeTeam(1, 0, 0),
    makeTeam(2, 0, 0),
    makeTeam(3, 0, 1),
    makeTeam(4, 1, 0),
  ];

  it('returns rivalAlert when acquiring team is user division rival', () => {
    const trade = makeTrade({ teamAId: 2, teamAName: 'Team2', teamBId: 4, teamBName: 'Team4' });
    const state = makeState(teams);
    state.rosters = [{ id: 99, teamId: 4, name: 'Star Player', pos: 'WR', ovr: 85 }];
    const result = applyAIToAITrade(trade, state, 1);
    expect(result.rivalAlert).not.toBeNull();
    expect(result.rivalAlert.rivalType).toBe('division');
    expect(result.rivalAlert.acquiringTeam).toBe('Team2');
    expect(result.rivalAlert.playerName).toBe('Star Player');
  });

  it('returns rivalAlert when departing team is user division rival', () => {
    const trade = makeTrade({ teamAId: 4, teamAName: 'Team4', teamBId: 2, teamBName: 'Team2' });
    const state = makeState(teams);
    state.rosters = [{ id: 99, teamId: 2, name: 'Star Player', pos: 'WR', ovr: 85 }];
    const result = applyAIToAITrade(trade, state, 1);
    expect(result.rivalAlert).not.toBeNull();
    expect(result.rivalAlert.rivalType).toBe('division');
  });

  it('returns rivalAlert (conference) for conference rival trade', () => {
    const trade = makeTrade({ teamAId: 3, teamAName: 'Team3', teamBId: 4, teamBName: 'Team4' });
    const state = makeState(teams);
    state.rosters = [{ id: 99, teamId: 4, name: 'Star Player', pos: 'WR', ovr: 85 }];
    const result = applyAIToAITrade(trade, state, 1);
    expect(result.rivalAlert).not.toBeNull();
    expect(result.rivalAlert.rivalType).toBe('conference');
  });

  it('returns no rivalAlert when neither team is a rival', () => {
    // teamA=4 (conf 1), teamB=5 (conf 1, div 1) — user is conf 0
    const teamsExt = [...teams, makeTeam(5, 1, 1)];
    const trade = makeTrade({ teamAId: 4, teamAName: 'Team4', teamBId: 5, teamBName: 'Team5' });
    const state = makeState(teamsExt);
    state.rosters = [{ id: 99, teamId: 5, name: 'Star Player', pos: 'WR', ovr: 85 }];
    const result = applyAIToAITrade(trade, state, 1);
    expect(result.rivalAlert).toBeNull();
  });

  it('returns no rivalAlert when userTeamId is null (backward compat)', () => {
    const trade = makeTrade({ teamAId: 2, teamAName: 'Team2', teamBId: 3, teamBName: 'Team3' });
    const state = makeState(teams);
    const result = applyAIToAITrade(trade, state, null);
    expect(result.rivalAlert).toBeNull();
  });

  it('returns no rivalAlert when userTeamId omitted (backward compat)', () => {
    const trade = makeTrade({ teamAId: 2, teamAName: 'Team2', teamBId: 3, teamBName: 'Team3' });
    const state = makeState(teams);
    const result = applyAIToAITrade(trade, state);
    expect(result.rivalAlert).toBeNull();
  });

  it('does not mutate input state', () => {
    const trade = makeTrade({ teamAId: 2, teamAName: 'Team2', teamBId: 4, teamBName: 'Team4' });
    const state = makeState(teams);
    state.rosters = [{ id: 99, teamId: 4, name: 'Star Player', pos: 'WR', ovr: 85 }];
    const originalTeams = JSON.stringify(state.teams);
    const originalRosters = JSON.stringify(state.rosters);
    applyAIToAITrade(trade, state, 1);
    expect(JSON.stringify(state.teams)).toBe(originalTeams);
    expect(JSON.stringify(state.rosters)).toBe(originalRosters);
  });
});

// ── Source-level guardrails ────────────────────────────────────────────────────

describe('Task B — source guardrails', () => {
  const engineSrc = readFileSync(resolve(__dirname, '../aiToAiTradeEngine.js'), 'utf8');
  const workerSrc = readFileSync(resolve(__dirname, '../../../worker/worker.js'), 'utf8');

  it('isRival is defined in aiToAiTradeEngine.js', () => {
    expect(engineSrc).toContain('export function isRival(');
  });

  it('isRival has no Math.random call', () => {
    const rivalStart = engineSrc.indexOf('export function isRival(');
    const rivalEnd   = engineSrc.indexOf('\nexport function', rivalStart + 1);
    const rivalBody  = engineSrc.slice(rivalStart, rivalEnd);
    expect(rivalBody).not.toContain('Math.random');
  });

  it('applyAIToAITrade accepts userTeamId parameter', () => {
    expect(engineSrc).toContain('applyAIToAITrade(trade, state, userTeamId = null)');
  });

  it('rival_trade_division template exists in news-engine.js', () => {
    const newsSrc = readFileSync(resolve(__dirname, '../../news-engine.js'), 'utf8');
    expect(newsSrc).toContain('rival_trade_division');
  });

  it('rival_trade_conference template exists in news-engine.js', () => {
    const newsSrc = readFileSync(resolve(__dirname, '../../news-engine.js'), 'utf8');
    expect(newsSrc).toContain('rival_trade_conference');
  });

  it('isRival is imported and used in worker.js', () => {
    expect(workerSrc).toContain('isRival');
  });

  it('rival_trade_division is emitted in worker.js advance week handler', () => {
    expect(workerSrc).toContain('rival_trade_division');
  });

  it('rival_trade_conference is emitted in worker.js advance week handler', () => {
    expect(workerSrc).toContain('rival_trade_conference');
  });

  it('division rival pulse is emitted in worker.js', () => {
    expect(workerSrc).toContain('rival_division_trade_');
  });
});
