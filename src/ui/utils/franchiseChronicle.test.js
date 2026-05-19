import { describe, it, expect } from 'vitest';
import {
  logChronicleEvent,
  logContractOutcome,
  logDraftOutcome,
  logInjuryEvent,
  logMilestoneEvent,
  logTradeOutcome,
  resolveChronicleEventType,
  syncFranchiseChronicle,
} from './franchiseChronicle.js';

function buildLeague(overrides = {}) {
  return {
    year: 2026,
    week: 3,
    userTeamId: 1,
    phase: 'regular',
    teams: [
      {
        id: 1,
        conf: 0,
        div: 1,
        abbr: 'PIT',
        wins: 2,
        losses: 1,
        ties: 0,
        capRoom: 15,
        roster: [
          { id: 10, firstName: 'Jay', lastName: 'Stone', pos: 'WR', ovr: 84, yearsPro: 1, draft: { round: 3 }, contract: { yearsRemaining: 1 }, stats: { recYd: 410 } },
          { id: 11, firstName: 'Ty', lastName: 'Cole', pos: 'CB', ovr: 80, yearsPro: 5, contract: { yearsRemaining: 1 } },
          { id: 12, firstName: 'Sam', lastName: 'Roe', pos: 'LT', ovr: 79, yearsPro: 4, contract: { yearsRemaining: 1 } },
        ],
      },
      { id: 2, conf: 0, div: 1, abbr: 'BAL', wins: 1, losses: 2, ties: 0 },
    ],
    schedule: {
      weeks: [
        {
          week: 1,
          games: [{
            id: 'g1',
            played: true,
            home: { id: 1, abbr: 'PIT' },
            away: { id: 2, abbr: 'BAL' },
            homeScore: 24,
            awayScore: 17,
            summary: { playerOfGame: { name: 'Jay Stone', statLine: '7 rec, 121 yds, 1 TD' } },
            boxScore: { playLogs: ['Q4 01:20 Jay Stone 32-yard TD catch for the lead.'] },
          }],
        },
      ],
    },
    newsItems: [{ week: 1, headline: 'PIT extends veteran LT through 2028.' }],
    ...overrides,
  };
}

describe('syncFranchiseChronicle', () => {
  it('builds chronicle entries and keeps backward compatibility for missing saves', () => {
    const league = buildLeague({ franchiseChronicle: undefined });
    const story = syncFranchiseChronicle(league);
    expect(Array.isArray(league.franchiseChronicle)).toBe(true);
    expect(story.entries).toHaveLength(1);
    expect(story.entries[0].week).toBe(1);
    expect(story.entries[0].result).toBe('W');
    expect(story.entries[0].type).toBe('game');
    expect(story.entries[0].meta.type).toBe('game');
    expect(story.entries[0].events[0]).toContain('extends veteran LT');
  });

  it('does not duplicate entries when called repeatedly', () => {
    const league = buildLeague();
    syncFranchiseChronicle(league);
    const second = syncFranchiseChronicle(league);
    expect(second.entries).toHaveLength(1);
  });

  it('generates season review once regular season is complete', () => {
    const league = buildLeague({
      phase: 'offseason',
      teams: [{ ...buildLeague().teams[0], wins: 10, losses: 7 }, buildLeague().teams[1]],
    });
    const story = syncFranchiseChronicle(league);
    expect(story.seasonReview?.text).toContain('2026 Season: 10-7');
  });

  it('normalizes old game-only entries without duplicating synced games', () => {
    const league = buildLeague({
      franchiseChronicle: [{
        id: 'old-game',
        season: 2026,
        week: 2,
        result: 'L',
        score: { away: 21, home: 17 },
        headline: 'Legacy loss',
        summary: 'L 21-17',
      }],
    });
    const story = syncFranchiseChronicle(league);
    expect(resolveChronicleEventType(story.entries[0])).toBe('game');
    expect(story.entries.find((entry) => entry.id === 'old-game')?.meta.type).toBe('game');

    const second = syncFranchiseChronicle(league);
    expect(second.entries.map((entry) => entry.id).filter((id) => id === '2026-wk1-g1')).toHaveLength(1);
  });
});

describe('typed chronicle events', () => {
  it('stores typed metadata and avoids duplicate ids for same-week events', () => {
    const league = buildLeague({ franchiseChronicle: [] });
    const first = logChronicleEvent(league, { week: 3, type: 'custom', headline: 'Owner meeting', summary: 'Budget reviewed.' });
    const second = logChronicleEvent(league, { week: 3, type: 'custom', headline: 'Owner meeting', summary: 'Budget reviewed again.' });

    expect(first.type).toBe('custom');
    expect(first.meta.type).toBe('custom');
    expect(second.id).not.toBe(first.id);
    expect(resolveChronicleEventType({ meta: { type: 'trade_completed' } })).toBe('trade');
  });

  it('logs trade outcomes with safe player, pick, and team metadata', () => {
    const league = buildLeague({ franchiseChronicle: [] });
    const entry = logTradeOutcome(league, {
      week: 4,
      headline: 'PIT adds a corner',
      incomingPlayers: [{ id: 33, name: 'Dev Grant', pos: 'CB', ovr: 82 }],
      outgoingPicks: [{ year: 2027, round: 2, pick: 52 }],
      teams: [{ abbr: 'PIT' }, { abbr: 'ARI' }],
    });

    expect(entry.type).toBe('trade');
    expect(entry.meta.incomingPlayers[0]).toMatchObject({ name: 'Dev Grant', pos: 'CB', ovr: 82 });
    expect(entry.meta.outgoingPicks[0]).toBe('2027 Round 2 Pick 52');
    expect(entry.meta.teams).toEqual(['PIT', 'ARI']);
  });

  it('logs contract outcomes with player and money metadata', () => {
    const league = buildLeague({ franchiseChronicle: [] });
    const entry = logContractOutcome(league, {
      player: { id: 10, firstName: 'Jay', lastName: 'Stone', pos: 'WR', ovr: 84 },
      years: 3,
      totalValue: 48,
      aav: 16,
    });

    expect(entry.type).toBe('contract');
    expect(entry.meta.player).toMatchObject({ name: 'Jay Stone', pos: 'WR', ovr: 84 });
    expect(entry.meta.years).toBe(3);
    expect(entry.meta.totalValue).toBe(48);
    expect(entry.meta.aav).toBe(16);
  });

  it('logs draft outcomes safely from sparse payloads', () => {
    const league = buildLeague({ franchiseChronicle: [] });
    const entry = logDraftOutcome(league, {
      playerName: 'Rico Vale',
      round: 3,
      pickNumber: 91,
    });

    expect(entry.type).toBe('draft');
    expect(entry.meta.player.name).toBe('Rico Vale');
    expect(entry.meta.pickLabel).toBe('2026 Round 3 Pick 91');
  });

  it('logs injury events safely from sparse payloads', () => {
    const league = buildLeague({ franchiseChronicle: [] });
    const entry = logInjuryEvent(league, {
      playerName: 'Ty Cole',
      injury: 'Hamstring strain',
      duration: '2 weeks',
    });

    expect(entry.type).toBe('injury');
    expect(entry.meta.player.name).toBe('Ty Cole');
    expect(entry.meta.injury).toBe('Hamstring strain');
    expect(entry.meta.duration).toBe('2 weeks');
  });

  it('logs milestone events safely from sparse payloads', () => {
    const league = buildLeague({ franchiseChronicle: [] });
    const entry = logMilestoneEvent(league, {
      label: 'First playoff berth',
      description: 'Clinched in Week 17',
    });

    expect(entry.type).toBe('milestone');
    expect(entry.meta.label).toBe('First playoff berth');
    expect(entry.meta.description).toBe('Clinched in Week 17');
    expect(entry.meta.unlockedOn).toBe('2026 Week 3');
  });
});
