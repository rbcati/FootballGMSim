import { describe, it, expect } from 'vitest';
import { normalizeAwardsRows, normalizeHofRows } from './awardsHallOfFameViewModel.js';

describe('normalizeAwardsRows', () => {
  it('returns empty array for null, undefined, and empty input', () => {
    expect(normalizeAwardsRows(null)).toEqual([]);
    expect(normalizeAwardsRows(undefined)).toEqual([]);
    expect(normalizeAwardsRows([])).toEqual([]);
  });

  it('normalizes an MVP award row with all fields', () => {
    const seasons = [{
      year: 2030,
      awards: { mvp: { playerId: 1, name: 'Star QB', pos: 'QB', teamAbbr: 'DAL' } },
    }];
    const rows = normalizeAwardsRows(seasons);
    const mvp = rows.find((r) => r.awardKey === 'mvp');
    expect(mvp).toBeTruthy();
    expect(mvp.playerName).toBe('Star QB');
    expect(mvp.playerId).toBe(1);
    expect(mvp.year).toBe(2030);
    expect(mvp.awardLabel).toBe('Most Valuable Player');
    expect(mvp.position).toBe('QB');
    expect(mvp.teamAbbr).toBe('DAL');
    expect(mvp.id).toBe('2030-mvp');
  });

  it('includes a champion row when season has a champion', () => {
    const seasons = [{
      year: 2031,
      champion: { name: 'Dallas Cowboys', abbr: 'DAL' },
      awards: {},
    }];
    const rows = normalizeAwardsRows(seasons);
    const champ = rows.find((r) => r.awardKey === 'champion');
    expect(champ).toBeTruthy();
    expect(champ.teamAbbr).toBe('DAL');
    expect(champ.playerId).toBeNull();
  });

  it('skips award entries without a name field', () => {
    const seasons = [{
      year: 2030,
      awards: { mvp: { playerId: 1 } },
    }];
    const rows = normalizeAwardsRows(seasons);
    expect(rows.filter((r) => r.awardKey === 'mvp')).toHaveLength(0);
  });

  it('sorts newest year first within same award key', () => {
    const seasons = [
      { year: 2030, awards: { mvp: { playerId: 1, name: 'A' } } },
      { year: 2032, awards: { mvp: { playerId: 2, name: 'B' } } },
      { year: 2031, awards: { mvp: { playerId: 3, name: 'C' } } },
    ];
    const rows = normalizeAwardsRows(seasons).filter((r) => r.awardKey === 'mvp');
    expect(rows[0].year).toBe(2032);
    expect(rows[1].year).toBe(2031);
    expect(rows[2].year).toBe(2030);
  });

  it('handles sparse legacy data safely without throwing', () => {
    const seasons = [
      { year: 2030, awards: null },
      { year: 2031 },
      { year: 2032, awards: { mvp: null } },
      null,
      undefined,
    ];
    expect(() => normalizeAwardsRows(seasons)).not.toThrow();
  });

  it('normalizes V1 extra awards like bestQB', () => {
    const seasons = [{
      year: 2033,
      awards: { bestQB: { playerId: 5, name: 'Ace', pos: 'QB', teamAbbr: 'PHI' } },
    }];
    const rows = normalizeAwardsRows(seasons);
    const best = rows.find((r) => r.awardKey === 'bestQB');
    expect(best).toBeTruthy();
    expect(best.awardLabel).toBe('Best QB');
    expect(best.playerName).toBe('Ace');
  });

  it('normalizes OPOY, DPOY, ROTY with correct labels', () => {
    const seasons = [{
      year: 2034,
      awards: {
        opoy: { playerId: 10, name: 'OPOY Guy', pos: 'WR' },
        dpoy: { playerId: 11, name: 'DPOY Guy', pos: 'LB' },
        roty: { playerId: 12, name: 'ROTY Kid', pos: 'RB' },
      },
    }];
    const rows = normalizeAwardsRows(seasons);
    expect(rows.find((r) => r.awardKey === 'opoy')?.awardLabel).toBe('Offensive Player of the Year');
    expect(rows.find((r) => r.awardKey === 'dpoy')?.awardLabel).toBe('Defensive Player of the Year');
    expect(rows.find((r) => r.awardKey === 'roty')?.awardLabel).toBe('Rookie of the Year');
  });

  it('normalizes sbMvp to Finals MVP label', () => {
    const seasons = [{
      year: 2035,
      awards: { sbMvp: { playerId: 7, name: 'Finals Hero', pos: 'QB' } },
    }];
    const rows = normalizeAwardsRows(seasons);
    const sbMvp = rows.find((r) => r.awardKey === 'sbMvp');
    expect(sbMvp?.awardLabel).toBe('Finals MVP');
  });
});

describe('normalizeHofRows', () => {
  it('returns empty array for null and empty inputs', () => {
    expect(normalizeHofRows([], [])).toEqual([]);
    expect(normalizeHofRows(null, null)).toEqual([]);
    expect(normalizeHofRows(undefined, undefined)).toEqual([]);
  });

  it('normalizes an HOF inductee from classes with all fields', () => {
    const hofClasses = [{
      year: 2035,
      classId: 'hof-2035',
      inductees: [{
        playerId: 'qb1',
        name: 'Legend QB',
        pos: 'QB',
        primaryTeamAbbr: 'DAL',
        legacyScore: 90,
        tier: 'gold',
        careerSummary: '3x MVP, 2 titles',
      }],
    }];
    const rows = normalizeHofRows(hofClasses, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerName).toBe('Legend QB');
    expect(rows[0].inductionYear).toBe(2035);
    expect(rows[0].classLabel).toBe('Class of 2035');
    expect(rows[0].legacyScore).toBe(90);
    expect(rows[0].teamAbbr).toBe('DAL');
    expect(rows[0].tier).toBe('gold');
    expect(rows[0].careerSummary).toBe('3x MVP, 2 titles');
  });

  it('deduplicates a player appearing in both classes and players array', () => {
    const hofClasses = [{
      year: 2035,
      classId: 'hof-2035',
      inductees: [{ playerId: 'p1', name: 'Dual', pos: 'RB', legacyScore: 80 }],
    }];
    const hofPlayers = [{ playerId: 'p1', name: 'Dual', pos: 'RB' }];
    const rows = normalizeHofRows(hofClasses, hofPlayers);
    expect(rows.filter((r) => r.playerId === 'p1')).toHaveLength(1);
  });

  it('picks up players from hofPlayers array not in any class', () => {
    const hofPlayers = [{ playerId: 'solo', name: 'Solo Star', pos: 'S', inductionYear: 2030 }];
    const rows = normalizeHofRows([], hofPlayers);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerName).toBe('Solo Star');
    expect(rows[0].classLabel).toBe('Class of 2030');
  });

  it('sorts newest class first, then by legacyScore descending within same year', () => {
    const hofClasses = [
      { year: 2030, inductees: [{ playerId: 'a', name: 'A', legacyScore: 70 }] },
      {
        year: 2035,
        inductees: [
          { playerId: 'b', name: 'B', legacyScore: 85 },
          { playerId: 'c', name: 'C', legacyScore: 75 },
        ],
      },
    ];
    const rows = normalizeHofRows(hofClasses, []);
    expect(rows[0].inductionYear).toBe(2035);
    expect(rows[0].legacyScore).toBe(85);
    expect(rows[1].legacyScore).toBe(75);
    expect(rows[2].inductionYear).toBe(2030);
  });

  it('handles sparse inductee data without crashing', () => {
    const hofClasses = [{ year: 2030, inductees: [{ playerId: 'x' }] }];
    const rows = normalizeHofRows(hofClasses, []);
    expect(rows[0].playerName).toBeNull();
    expect(rows[0].position).toBeNull();
    expect(rows[0].careerSummary).toBeNull();
    expect(rows[0].classLabel).toBe('Class of 2030');
  });

  it('handles classes with no inductees array', () => {
    const hofClasses = [{ year: 2032 }, { year: 2033, inductees: [] }];
    expect(() => normalizeHofRows(hofClasses, [])).not.toThrow();
    expect(normalizeHofRows(hofClasses, [])).toEqual([]);
  });

  it('uses score as fallback when legacyScore is absent', () => {
    const hofClasses = [{
      year: 2040,
      inductees: [{ playerId: 'y', name: 'Score Fallback', pos: 'DE', score: 77 }],
    }];
    const rows = normalizeHofRows(hofClasses, []);
    expect(rows[0].legacyScore).toBe(77);
  });

  it('produces classLabel Hall of Fame when inductionYear is null', () => {
    const hofPlayers = [{ playerId: 'z', name: 'Ageless', pos: 'QB' }];
    const rows = normalizeHofRows([], hofPlayers);
    expect(rows[0].classLabel).toBe('Hall of Fame');
  });
});
