import { describe, expect, it } from 'vitest';
import { buildSpecialTeamsSummary } from './specialTeamsSummary.js';

const row = (summary, key) => summary.rows.find((r) => r.key === key);

describe('buildSpecialTeamsSummary — drive-engine stats (PR #1658 shape)', () => {
  const game = {
    teamDriveStats: {
      home: { punts: 4, fgAttempts: 3, fgMade: 2, twoPointAttempts: 1, twoPointMade: 1 },
      away: { punts: 7, fgAttempts: 1, fgMade: 1, twoPointAttempts: 0, twoPointMade: 0 },
    },
    homeXPs: 3,
    awayXPs: 2,
  };

  it('reports FG made/attempted per side', () => {
    const st = buildSpecialTeamsSummary(game);
    expect(st.hasData).toBe(true);
    expect(st.home.fgMade).toBe(2);
    expect(st.home.fgAttempts).toBe(3);
    expect(st.away.fgMade).toBe(1);
    expect(st.away.fgAttempts).toBe(1);
    expect(row(st, 'fg')).toMatchObject({ home: '2/3', away: '1/1' });
  });

  it('reports punts per side', () => {
    const st = buildSpecialTeamsSummary(game);
    expect(st.home.punts).toBe(4);
    expect(st.away.punts).toBe(7);
    expect(row(st, 'punts')).toMatchObject({ home: '4', away: '7' });
  });

  it('reports 2PT made/attempted per side', () => {
    const st = buildSpecialTeamsSummary(game);
    expect(st.home.twoPointMade).toBe(1);
    expect(st.home.twoPointAttempts).toBe(1);
    expect(row(st, 'twoPoint')).toMatchObject({ home: '1/1', away: '0/0' });
  });

  it('reports XP made from homeXPs/awayXPs', () => {
    const st = buildSpecialTeamsSummary(game);
    expect(st.home.xpMade).toBe(3);
    expect(st.away.xpMade).toBe(2);
    expect(row(st, 'xp')).toMatchObject({ home: '3', away: '2' });
  });

  it('also accepts raw drive-summary homeStats/awayStats fields', () => {
    const st = buildSpecialTeamsSummary({
      homeStats: { punts: 5, fgAttempts: 2, fgMade: 1, twoPointAttempts: 1, twoPointMade: 0 },
      awayStats: { punts: 3, fgAttempts: 0, fgMade: 0, twoPointAttempts: 0, twoPointMade: 0 },
    });
    expect(st.hasData).toBe(true);
    expect(row(st, 'fg')).toMatchObject({ home: '1/2', away: '0/0' });
    expect(row(st, 'punts')).toMatchObject({ home: '5', away: '3' });
    expect(row(st, 'twoPoint')).toMatchObject({ home: '0/1', away: '0/0' });
  });
});

describe('buildSpecialTeamsSummary — legacy fallbacks', () => {
  it('missing special-teams fields default safely to 0', () => {
    const st = buildSpecialTeamsSummary({ teamDriveStats: { home: { sacks: 2 }, away: { sacks: 1 } } });
    for (const side of [st.home, st.away]) {
      expect(side.punts).toBe(0);
      expect(side.fgMade).toBe(0);
      expect(side.fgAttempts).toBe(0);
      expect(side.twoPointMade).toBe(0);
      expect(side.twoPointAttempts).toBe(0);
    }
  });

  it('missing fgMade/fgAttempts fall back to legacy homeFGs/awayFGs', () => {
    const st = buildSpecialTeamsSummary({ homeFGs: 2, awayFGs: 1, homeXPs: 4, awayXPs: 1 });
    expect(st.hasData).toBe(true);
    expect(row(st, 'fg')).toMatchObject({ home: '2/2', away: '1/1' });
    expect(row(st, 'xp')).toMatchObject({ home: '4', away: '1' });
  });

  it('falls back to team totals derived from player rows (fieldGoals*, extraPointsMade, punts)', () => {
    const st = buildSpecialTeamsSummary({
      teamStats: {
        home: { fieldGoalsMade: 3, fieldGoalsAttempted: 4, extraPointsMade: 2, punts: 5 },
        away: { fieldGoalsMade: 0, fieldGoalsAttempted: 1, extraPointsMade: 3, punts: 6 },
      },
    });
    expect(row(st, 'fg')).toMatchObject({ home: '3/4', away: '0/1' });
    expect(row(st, 'xp')).toMatchObject({ home: '2', away: '3' });
    expect(row(st, 'punts')).toMatchObject({ home: '5', away: '6' });
  });

  it('never crashes on null, empty, or score-only legacy games and hides the section', () => {
    for (const game of [null, undefined, {}, { homeScore: 21, awayScore: 17 }, 'bad-input']) {
      const st = buildSpecialTeamsSummary(game);
      expect(st.hasData).toBe(false);
      expect(st.notes).toEqual([]);
    }
  });

  it('shows an em dash for unknown XP counts instead of implying zero', () => {
    const st = buildSpecialTeamsSummary({ teamDriveStats: { home: { punts: 2 }, away: { punts: 3 } } });
    expect(row(st, 'xp')).toMatchObject({ home: '—', away: '—' });
  });
});

describe('buildSpecialTeamsSummary — impact notes', () => {
  it('flags a 2-point attempt', () => {
    const st = buildSpecialTeamsSummary({
      teamDriveStats: { home: { twoPointAttempts: 1, twoPointMade: 1 }, away: {} },
    });
    expect(st.notes).toContainEqual(expect.objectContaining({ side: 'home', text: '2-point attempt changed the scoring math.' }));
  });

  it('flags missed field goals', () => {
    const st = buildSpecialTeamsSummary({
      teamDriveStats: { home: {}, away: { fgAttempts: 3, fgMade: 1 } },
    });
    expect(st.notes).toContainEqual(expect.objectContaining({ side: 'away', text: 'Missed field goal opportunity.' }));
  });

  it('flags a field-position game once when both teams punt heavily', () => {
    const st = buildSpecialTeamsSummary({
      teamDriveStats: { home: { punts: 7 }, away: { punts: 6 } },
    });
    const fieldPositionNotes = st.notes.filter((n) => n.text === 'Field-position game.');
    expect(fieldPositionNotes).toEqual([expect.objectContaining({ side: 'game' })]);
  });

  it('emits no notes for a quiet special-teams game', () => {
    const st = buildSpecialTeamsSummary({
      teamDriveStats: {
        home: { punts: 2, fgAttempts: 1, fgMade: 1, twoPointAttempts: 0, twoPointMade: 0 },
        away: { punts: 3, fgAttempts: 0, fgMade: 0, twoPointAttempts: 0, twoPointMade: 0 },
      },
    });
    expect(st.notes).toEqual([]);
  });
});
