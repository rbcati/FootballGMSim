import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capTradeBlockAssets,
  classifyTradeBlockReason,
  generateAITradeBlock,
  generateInboundOffersToUser,
  pruneStaleInboundOffers,
  rankTradeBlockAssets,
} from '../../src/core/trades/tradeBlockGenerator.js';
import { TEAM_STRATEGIC_POSTURE } from '../../src/core/trades/teamStrategicDirection.js';

const p = (id, teamId, pos, ovr, age = 26, baseAnnual = 3, extra = {}) => ({
  id,
  teamId,
  name: `${pos}${id}`,
  pos,
  ovr,
  potential: extra.potential ?? ovr,
  age,
  contract: { baseAnnual, yearsTotal: 2, yearsRemaining: 1 },
  ...extra,
});

const team = (id, abbr, extra = {}) => ({
  id,
  abbr,
  name: `${abbr} Team`,
  wins: 2,
  losses: 8,
  ties: 0,
  capRoom: 10,
  picks: [],
  ...extra,
});

function makeLeague(overrides = {}) {
  const userTeam = team(1, 'USR', {
    wins: 7,
    losses: 3,
    capRoom: 18,
    picks: [{ id: 'u-4', round: 4, season: 2027, currentOwner: 1, originalOwner: 1 }],
  });
  const aiTeam = team(2, 'AI', {
    wins: 2,
    losses: 8,
    capRoom: -2,
    picks: [{ id: 'ai-4', round: 4, season: 2027, currentOwner: 2, originalOwner: 2 }],
  });
  const players = [
    p(101, 1, 'QB', 82, 27, 10),
    p(102, 1, 'RB', 82, 25, 6),
    p(103, 1, 'RB', 78, 26, 5),
    p(104, 1, 'RB', 74, 27, 4),
    p(105, 1, 'WR', 82, 26, 7),
    p(201, 2, 'QB', 74, 29, 8),
    p(202, 2, 'WR', 78, 31, 14),
    p(203, 2, 'WR', 72, 25, 2),
  ];
  return {
    meta: {
      phase: 'regular',
      currentWeek: 4,
      year: 2027,
      season: 2027,
      userTeamId: 1,
      settings: { tradeDeadlineWeek: 9 },
      incomingTradeOffers: [],
      ...overrides.meta,
    },
    teams: overrides.teams ?? [userTeam, aiTeam],
    players: overrides.players ?? players,
  };
}

describe('trade block generation', () => {
  it('rebuilder blocks an aging expensive veteran', () => {
    const roster = [p(1, 2, 'WR', 80, 31, 15), p(2, 2, 'WR', 76, 24, 2), p(3, 2, 'QB', 75, 27, 8)];
    const block = generateAITradeBlock(team(2, 'AI'), roster, {
      userTeamId: 1,
      phase: 'regular',
      currentSeason: 2027,
      teamPosture: TEAM_STRATEGIC_POSTURE.REBUILDER,
    });
    expect(block.map((asset) => asset.playerId)).toContain(1);
    expect(block[0].reasonTags).toContain('rebuilder');
  });

  it('rebuilder protects young upside players', () => {
    const roster = [p(1, 2, 'WR', 78, 23, 2, { potential: 88 }), p(2, 2, 'WR', 74, 31, 13)];
    const block = generateAITradeBlock(team(2, 'AI'), roster, {
      userTeamId: 1,
      phase: 'regular',
      currentSeason: 2027,
      teamPosture: TEAM_STRATEGIC_POSTURE.REBUILDER,
    });
    expect(block.map((asset) => asset.playerId)).not.toContain(1);
  });

  it('contender does not block a key starter', () => {
    const roster = [p(1, 2, 'WR', 84, 27, 9), p(2, 2, 'WR', 82, 27, 8), p(3, 2, 'WR', 80, 26, 7)];
    const reason = classifyTradeBlockReason(roster[0], team(2, 'AI', { wins: 8, losses: 2 }), roster, {
      userTeamId: 1,
      teamPosture: TEAM_STRATEGIC_POSTURE.CONTENDER,
    });
    const block = generateAITradeBlock(team(2, 'AI', { wins: 8, losses: 2 }), roster, {
      userTeamId: 1,
      teamPosture: TEAM_STRATEGIC_POSTURE.CONTENDER,
    });
    expect(reason).toBeNull();
    expect(block.map((asset) => asset.playerId)).not.toContain(1);
  });

  it('cap-restricted team identifies high cap-hit burden', () => {
    const roster = [p(1, 2, 'TE', 77, 29, 15), p(2, 2, 'TE', 74, 24, 2)];
    const block = generateAITradeBlock(team(2, 'AI', { capRoom: -4 }), roster, {
      userTeamId: 1,
      financialPosture: 'INSOLVENT',
      teamPosture: TEAM_STRATEGIC_POSTURE.NEUTRAL,
    });
    expect(block[0]?.playerId).toBe(1);
    expect(block[0]?.reasonTags).toContain('cap_burden');
  });

  it('caps and ranks at three assets', () => {
    const assets = rankTradeBlockAssets([
      { assetType: 'player', player: p(1, 2, 'WR', 74), playerId: 1, score: 20 },
      { assetType: 'player', player: p(2, 2, 'WR', 75), playerId: 2, score: 90 },
      { assetType: 'player', player: p(3, 2, 'WR', 76), playerId: 3, score: 60 },
      { assetType: 'player', player: p(4, 2, 'WR', 77), playerId: 4, score: 50 },
    ]);
    expect(capTradeBlockAssets(assets, 3).map((asset) => asset.playerId)).toEqual([2, 3, 4]);
  });

  it('returns empty safely for missing data and does not mutate inputs', () => {
    const roster = [p(1, 2, 'WR', 80, 31, 15), p(2, 2, 'WR', 76, 24, 2)];
    const teamInput = team(2, 'AI');
    const before = JSON.stringify({ roster, teamInput });
    expect(generateAITradeBlock(null, roster)).toEqual([]);
    generateAITradeBlock(teamInput, roster, { userTeamId: 1, teamPosture: TEAM_STRATEGIC_POSTURE.REBUILDER });
    expect(JSON.stringify({ roster, teamInput })).toBe(before);
  });
});

describe('proactive inbound offers', () => {
  it('deterministic RNG gate limits generated attempts', () => {
    const league = makeLeague();
    const closedGate = generateInboundOffersToUser(league, 1, { rngGateChance: 0, maxGeneratedOffersPerWeek: 2 });
    const openGateA = generateInboundOffersToUser(league, 1, { rngGateChance: 1, maxGeneratedOffersPerWeek: 2 });
    const openGateB = generateInboundOffersToUser(league, 1, { rngGateChance: 1, maxGeneratedOffersPerWeek: 2 });
    expect(closedGate).toEqual([]);
    expect(openGateA).toEqual(openGateB);
    expect(openGateA.length).toBeGreaterThan(0);
  });

  it('enforces max generated offers per week', () => {
    const extraTeam = team(3, 'AI3', { capRoom: -3 });
    const league = makeLeague({
      teams: [...makeLeague().teams, extraTeam],
      players: [...makeLeague().players, p(301, 3, 'WR', 78, 31, 14), p(302, 3, 'QB', 74, 29, 8)],
    });
    const offers = generateInboundOffersToUser(league, 1, { rngGateChance: 1, maxGeneratedOffersPerWeek: 1 });
    expect(offers).toHaveLength(1);
  });

  it('does not generate when deadline is closed or inbox is full', () => {
    const deadlineClosed = makeLeague({ meta: { currentWeek: 10 } });
    expect(generateInboundOffersToUser(deadlineClosed, 1, { rngGateChance: 1 })).toEqual([]);

    const fullInboxLeague = makeLeague();
    const existing = generateInboundOffersToUser(fullInboxLeague, 1, { rngGateChance: 1 })[0];
    const withInbox = { ...fullInboxLeague, meta: { ...fullInboxLeague.meta, incomingTradeOffers: [existing] } };
    expect(generateInboundOffersToUser(withInbox, 1, { rngGateChance: 1, maxActiveOffers: 1 })).toEqual([]);
  });

  it('uses the existing incoming-offer shape and correct asset ownership', () => {
    const league = makeLeague();
    const [offer] = generateInboundOffersToUser(league, 1, { rngGateChance: 1 });
    expect(offer).toMatchObject({
      offeringTeamId: 2,
      receivingTeamId: 1,
      userTeamId: 1,
      offerType: 'proactive_ai_offer',
      generatedBy: 'trade_block_v1',
      offering: expect.any(Object),
      receiving: expect.any(Object),
      createdWeek: 4,
      expiresAfterWeek: 6,
    });
    expect(offer.offering.playerIds).toContain(202);
    expect(offer.receiving.playerIds).toContain(104);
    for (const id of offer.offering.playerIds) {
      expect(league.players.find((player) => player.id === id)?.teamId).toBe(2);
    }
    for (const id of offer.receiving.playerIds) {
      expect(league.players.find((player) => player.id === id)?.teamId).toBe(1);
    }
  });

  it('prunes stale invalid asset offers and duplicate ids', () => {
    const league = makeLeague();
    const [offer] = generateInboundOffersToUser(league, 1, { rngGateChance: 1 });
    const invalid = { ...offer, id: 'invalid', offering: { ...offer.offering, playerIds: [999] } };
    const duplicate = { ...offer };
    const pruned = pruneStaleInboundOffers([offer, duplicate, invalid], league, 1);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].id).toBe(offer.id);
  });

  it('does not assign user assets to the AI side', () => {
    const league = makeLeague();
    const [offer] = generateInboundOffersToUser(league, 1, { rngGateChance: 1 });
    expect(offer.offering.playerIds).not.toContain(104);
    expect(offer.receiving.playerIds).not.toContain(202);
  });

  it('appends safely, avoids duplicate regeneration, and clears at deadline or phase transition', () => {
    const league = makeLeague();
    const generated = generateInboundOffersToUser(league, 1, { rngGateChance: 1 });
    const incomingTradeOffers = [...generated, ...league.meta.incomingTradeOffers].slice(0, 6);
    expect(incomingTradeOffers).toHaveLength(1);

    const withExisting = { ...league, meta: { ...league.meta, incomingTradeOffers } };
    expect(generateInboundOffersToUser(withExisting, 1, { rngGateChance: 1 })).toEqual([]);
    expect(pruneStaleInboundOffers(incomingTradeOffers, { ...league, meta: { ...league.meta, currentWeek: 10 } }, 1)).toEqual([]);
    expect(pruneStaleInboundOffers(incomingTradeOffers, { ...league, meta: { ...league.meta, phase: 'offseason' } }, 1)).toEqual([]);
  });

  it('does not use raw Math.random in the new module', () => {
    const modulePath = path.resolve(process.cwd(), 'src/core/trades/tradeBlockGenerator.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).not.toContain('Math.random');
  });
});
