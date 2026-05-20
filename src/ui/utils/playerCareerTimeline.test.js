import { describe, expect, it } from 'vitest';
import { buildPlayerCareerTimeline } from './playerCareerTimeline.js';

const player = {
  id: 11,
  name: 'Avery Fields',
  pos: 'QB',
  draftYear: 2030,
  draftRound: 1,
  draftPick: 7,
  draftTeamId: 1,
};

const league = {
  year: 2033,
  week: 5,
  userTeamId: 1,
  teams: [
    { id: 1, abbr: 'ALP', name: 'Alphas' },
    { id: 2, abbr: 'BRV', name: 'Braves' },
  ],
};

describe('playerCareerTimeline', () => {
  it('filters activity rows to events involving the player', () => {
    const model = buildPlayerCareerTimeline({
      player,
      league,
      activityRows: [
        { id: 'a', type: 'signing', source: 'transaction', season: 2032, week: 1, playerId: 11, playerName: 'Avery Fields', summary: 'ALP signed Avery Fields' },
        { id: 'b', type: 'trade', source: 'transaction', season: 2032, week: 2, playerId: 22, playerName: 'Other Player', summary: 'Other player traded' },
      ],
    });

    expect(model.rows.some((row) => row.summary === 'ALP signed Avery Fields')).toBe(true);
    expect(model.rows.some((row) => row.summary === 'Other player traded')).toBe(false);
  });

  it('normalizes drafted, signed, traded, and contract rows safely', () => {
    const model = buildPlayerCareerTimeline({
      player,
      league,
      activityRows: [
        { id: 'sign', type: 'signing', source: 'transaction', season: 2031, week: 3, playerId: 11, summary: 'Signed in free agency' },
        { id: 'trade', type: 'trade', source: 'chronicle', season: 2032, week: 4, summary: 'Trade completed', meta: { incomingPlayers: [{ id: 11, name: 'Avery Fields' }] } },
        { id: 'contract', type: 'contract', source: 'chronicle', season: 2033, week: 1, playerId: 11, summary: 'Avery Fields extended' },
      ],
    });

    expect(model.rows.map((row) => row.type)).toEqual(expect.arrayContaining(['draft', 'signing', 'trade', 'contract']));
    expect(model.acquisition.summary).toMatch(/Drafted 2030 Round 1 Pick 7/);
  });

  it('dedupes duplicate activity and chronicle rows while preferring chronicle detail', () => {
    const model = buildPlayerCareerTimeline({
      player: { id: 44, name: 'Dana Moss' },
      league,
      activityRows: [
        { id: 'tx-1', type: 'signing', source: 'transaction', season: 2032, week: 6, teamId: 1, playerId: 44, playerName: 'Dana Moss', summary: 'ALP signed Dana Moss' },
        { id: 'chron-1', type: 'contract', source: 'chronicle', season: 2032, week: 6, teamId: 1, summary: 'Dana Moss signs in free agency', meta: { source: 'free_agent_signing', player: { id: 44, name: 'Dana Moss' } } },
      ],
    });

    expect(model.rows.filter((row) => row.type === 'signing')).toHaveLength(1);
    expect(model.rows[0]).toMatchObject({ source: 'chronicle', summary: 'Dana Moss signs in free agency' });
  });

  it('adds award and record rows when supplied', () => {
    const model = buildPlayerCareerTimeline({
      player,
      league,
      activityRows: [],
      awardRows: [{ year: 2032, canonical: 'mvp', label: 'Most Valuable Player', teamId: 1, teamAbbr: 'ALP' }],
      recordRows: [{ kind: 'careerLeader', recordKey: 'passYds', text: 'Career Passing Yards leader (40,000)' }],
    });

    expect(model.rows.map((row) => row.type)).toEqual(expect.arrayContaining(['award', 'record', 'draft']));
  });

  it('does not crash for legacy players with no history', () => {
    const model = buildPlayerCareerTimeline({
      player: { id: 99, name: 'Legacy Player' },
      league,
      activityRows: [],
    });

    expect(model.rows).toEqual([]);
    expect(model.acquisition.summary).toBe('Unknown / legacy player');
  });
});
