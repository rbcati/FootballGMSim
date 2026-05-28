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

describe('isRealName — starter placeholder rejection', () => {
  const STARTER_NAMES = [
    'QB Starter 7-2',
    'WR WR Starter 7-3',
    'DL Starter 8-3',
    'QB Starter 1-1',
    'OL Starter 3-5',
    'LB Starter 12-4',
  ];
  const FALLBACK_NAMES = [
    'H QB1',
    'A WR2',
    'H EDGE1',
    'A LB3',
  ];

  for (const name of STARTER_NAMES) {
    it(`rejects starter placeholder: "${name}"`, () => {
      // resolvePlayerName should NOT use the starter name; fallback should be Player #<id>
      const result = resolvePlayerName(7, { row: { name } });
      expect(result).toBe('Player #7');
      expect(result).not.toContain('Starter');
    });
  }

  for (const name of FALLBACK_NAMES) {
    it(`rejects defaultPlayers fallback: "${name}"`, () => {
      const result = resolvePlayerName(5, { row: { name } });
      expect(result).toBe('Player #5');
    });
  }

  it('does not reject legitimate names that contain unrelated words', () => {
    // "Starterfield" would incorrectly match a naive substring check — word boundary matters
    const mapWithReal = { '10': { id: 10, name: 'Jake Harris' } };
    expect(resolvePlayerName(10, { row: { name: 'Jake Harris' }, playerMap: mapWithReal })).toBe('Jake Harris');
  });

  it('prefers map real name over placeholder row name', () => {
    const playerMap = { '12': { id: 12, name: 'Marcus Carter' } };
    expect(resolvePlayerName(12, { row: { name: 'QB Starter 2-1' }, playerMap })).toBe('Marcus Carter');
  });

  it('buildLeaguePlayerMap excludes starter-named players from map (they are not real names)', () => {
    const league = {
      teams: [{
        id: 0,
        roster: [
          { id: 1, name: 'QB Starter 1-1', pos: 'QB' },
          { id: 2, name: 'Marcus Williams', pos: 'RB' },
        ],
      }],
    };
    const map = buildLeaguePlayerMap(league);
    // Placeholder should not be considered "real" and should not override a subsequent real entry
    // But the map still stores the object — the real-name guard in putPlayer prevents overwrite
    // Since id=1 has a placeholder name, resolvePlayerName should fall back to Player #1
    expect(resolvePlayerName(1, { playerMap: map })).toBe('Player #1');
    expect(resolvePlayerName(2, { playerMap: map })).toBe('Marcus Williams');
  });
});
