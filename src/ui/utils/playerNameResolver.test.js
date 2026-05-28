import { describe, it, expect } from 'vitest';
import { resolvePlayerName, buildLeaguePlayerMap } from './playerNameResolver.js';

describe('resolvePlayerName', () => {
  it('returns name from row.name when present', () => {
    expect(resolvePlayerName(42, { row: { name: 'John Smith' } })).toBe('John Smith');
  });

  it('skips placeholder row names and falls back to player map', () => {
    const playerMap = { '42': { id: 42, name: 'Marcus Jones' } };
    expect(resolvePlayerName(42, { row: { name: 'Player #42' }, playerMap })).toBe('Marcus Jones');
  });

  it('falls back to Player #ID when no real name source exists', () => {
    expect(resolvePlayerName(99, { row: { name: 'Unknown' } })).toBe('Player #99');
  });
});

describe('buildLeaguePlayerMap', () => {
  it('builds a map from team rosters and free agents', () => {
    const league = {
      teams: [{ id: 1, roster: [{ id: 10, name: 'Player Ten' }] }],
      freeAgents: [{ id: 88, name: 'Free Agent Name' }],
    };
    const map = buildLeaguePlayerMap(league);
    expect(map['10'].name).toBe('Player Ten');
    expect(map['88'].name).toBe('Free Agent Name');
  });

  it('can hydrate missing names from archived player rows', () => {
    const map = buildLeaguePlayerMap({ teams: [] }, { playerStats: { home: { '55': { name: 'Archived Name' } } } });
    expect(map['55'].name).toBe('Archived Name');
  });
});
