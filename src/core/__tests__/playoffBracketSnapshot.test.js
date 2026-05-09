import { describe, it, expect } from 'vitest';
import { buildPlayoffBracketSnapshot, classifyPlayoffRoundBucket } from '../playoffBracketSnapshot.js';

const teams = [
  { id: 1, abbr: 'DAL' },
  { id: 2, abbr: 'NYG' },
];

describe('playoffBracketSnapshot', () => {
  it('does not include regular-season games', () => {
    const games = [
      { week: 5, homeId: 1, awayId: 2, homeScore: 21, awayScore: 20, isPlayoff: false },
      { week: 19, homeId: 1, awayId: 2, homeScore: 30, awayScore: 17, isPlayoff: true, playoffRound: 'wildcard' },
    ];
    const snap = buildPlayoffBracketSnapshot({ games, teams, championshipGameId: null });
    expect(snap.mode).not.toBe('empty');
    const all = (snap.rounds ?? []).flatMap((r) => r.games);
    expect(all).toHaveLength(1);
    expect(all[0].week).toBe(19);
  });

  it('groups by round when metadata is complete', () => {
    const games = [
      { id: 'g-wc', week: 19, homeId: 1, awayId: 2, homeScore: 24, awayScore: 17, isPlayoff: true, playoffRound: 'wildcard' },
      { id: 'g-div', week: 20, homeId: 1, awayId: 2, homeScore: 14, awayScore: 10, isPlayoff: true, playoffRound: 'divisional' },
      { id: 'g-sb', week: 22, homeId: 1, awayId: 2, homeScore: 31, awayScore: 27, isPlayoff: true, playoffRound: 'superbowl' },
    ];
    const snap = buildPlayoffBracketSnapshot({ games, teams, championshipGameId: 'g-sb' });
    expect(snap.mode).toBe('rounds');
    expect(snap.rounds.map((r) => r.label)).toEqual(['Wild Card', 'Divisional', 'Championship']);
    expect(snap.rounds[2].games[0].isChampionshipGame).toBe(true);
  });

  it('uses a single postseason bucket when round metadata is incomplete', () => {
    const games = [
      { id: 'g1', week: 19, homeId: 1, awayId: 2, homeScore: 10, awayScore: 7, isPlayoff: true },
      { id: 'g2', week: 20, homeId: 1, awayId: 2, homeScore: 12, awayScore: 9, isPlayoff: true, playoffRound: 'divisional' },
    ];
    expect(classifyPlayoffRoundBucket(games[0])).toBeNull();
    const snap = buildPlayoffBracketSnapshot({ games, teams, championshipGameId: null });
    expect(snap.mode).toBe('flat');
    expect(snap.rounds).toHaveLength(1);
    expect(snap.rounds[0].label).toBe('Postseason games');
    expect(snap.note).toMatch(/Round labels are unavailable/i);
  });
});
