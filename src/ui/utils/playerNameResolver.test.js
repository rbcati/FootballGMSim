import { describe, it, expect } from 'vitest';
import { resolvePlayerName, buildLeaguePlayerMap } from './playerNameResolver.js';

describe('resolvePlayerName', () => {
  it('returns name from row.name when present', () => {
    expect(resolvePlayerName(42, { row: { name: 'John Smith' } })).toBe('John Smith');
  });

  it('returns name from row.playerName when row.name is absent', () => {
    expect(resolvePlayerName(42, { row: { playerName: 'Jane Doe' } })).toBe('Jane Doe');
  });

  it('returns name from playerMap when row lacks name', () => {
    const playerMap = { '42': { id: 42, name: 'Marcus Jones' } };
    expect(resolvePlayerName(42, { row: {}, playerMap })).toBe('Marcus Jones');
  });

  it('prefers row.name over playerMap', () => {
    const playerMap = { '42': { id: 42, name: 'Map Name' } };
    expect(resolvePlayerName(42, { row: { name: 'Row Name' }, playerMap })).toBe('Row Name');
  });

  it('falls back to Player #ID when row has no name and no playerMap', () => {
    expect(resolvePlayerName(99, { row: {} })).toBe('Player #99');
  });

  it('falls back to Player #ID when playerMap has no entry for ID', () => {
    const playerMap = { '1': { id: 1, name: 'Other Player' } };
    expect(resolvePlayerName(99, { row: {}, playerMap })).toBe('Player #99');
  });

  it('falls back to generic Player when playerId is null/undefined', () => {
    expect(resolvePlayerName(null, {})).toBe('Player');
    expect(resolvePlayerName(undefined, {})).toBe('Player');
  });

  it('handles no options argument at all', () => {
    expect(resolvePlayerName(7)).toBe('Player #7');
  });

  it('ignores empty string row.name and uses playerMap fallback', () => {
    const playerMap = { '5': { id: 5, name: 'Real Name' } };
    expect(resolvePlayerName(5, { row: { name: '' }, playerMap })).toBe('Real Name');
  });

  it('matches playerId as both numeric and string key', () => {
    const playerMap = { '123': { id: 123, name: 'String Key Player' } };
    expect(resolvePlayerName(123, { row: {}, playerMap })).toBe('String Key Player');
    expect(resolvePlayerName('123', { row: {}, playerMap })).toBe('String Key Player');
  });
});

describe('buildLeaguePlayerMap', () => {
  it('builds a map from league.teams[].roster', () => {
    const league = {
      teams: [
        { id: 1, roster: [{ id: 10, name: 'Player Ten' }, { id: 11, name: 'Player Eleven' }] },
        { id: 2, roster: [{ id: 20, name: 'Player Twenty' }] },
      ],
    };
    const map = buildLeaguePlayerMap(league);
    expect(map['10'].name).toBe('Player Ten');
    expect(map['11'].name).toBe('Player Eleven');
    expect(map['20'].name).toBe('Player Twenty');
  });

  it('falls back to league.teams[].players when roster is absent', () => {
    const league = {
      teams: [{ id: 1, players: [{ id: 5, name: 'Player Five' }] }],
    };
    const map = buildLeaguePlayerMap(league);
    expect(map['5'].name).toBe('Player Five');
  });

  it('returns empty map when league has no teams', () => {
    expect(buildLeaguePlayerMap(null)).toEqual({});
    expect(buildLeaguePlayerMap({ teams: [] })).toEqual({});
  });

  it('skips players without id', () => {
    const league = { teams: [{ roster: [{ name: 'No ID' }, { id: 1, name: 'Has ID' }] }] };
    const map = buildLeaguePlayerMap(league);
    expect(Object.keys(map)).toEqual(['1']);
  });
});
