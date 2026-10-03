import { describe, it, expect } from 'vitest';
import {
  buildTiebreakContext,
  makeStandingsComparator,
  prepareStandingsView,
  sortStandingsRows,
} from '../../src/views/standingsView.js';

// Wave 4 Fix 5: standings apply the NFL tiebreaker chain (head-to-head,
// division record, common games, conference record, SOS, seeded coin-flip).

describe('shared standings completion authority', () => {
  const teams = [
    { id: 1, conf: 0, div: 0, winPct: 0.75 },
    { id: 2, conf: 0, div: 0, winPct: 0.25 },
  ];
  const contextFor = (game) => buildTiebreakContext(teams, { weeks: [{ games: [{ home: 1, away: 2, ...game }] }] });

  it.each([false, 0])('ignores explicitly unplayed %s games in every tiebreak record', (played) => {
    const context = contextFor({ played, homeScore: 0, awayScore: 0 });
    for (const record of context.values()) {
      expect(record.h2h.size).toBe(0);
      expect(record.opponents.size).toBe(0);
      expect(record).toMatchObject({ divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0, sos: 0.5 });
    }
  });

  it('counts a completed 0-0 tie in both teams’ records', () => {
    const context = contextFor({ played: true, homeScore: 0, awayScore: 0 });
    for (const [id, opponentId] of [[1, 2], [2, 1]]) {
      const record = context.get(id);
      expect(record.h2h.get(opponentId)).toEqual({ w: 0, l: 0, t: 1 });
      expect(record.opponents.get(opponentId)).toEqual({ w: 0, l: 0, t: 1 });
      expect(record).toMatchObject({ divW: 0, divL: 0, divT: 1, confW: 0, confL: 0, confT: 1 });
    }
    expect(context.get(1).sos).toBe(0.25);
    expect(context.get(2).sos).toBe(0.75);
  });

  it.each([{ homeScore: 24, awayScore: 17 }, { scoreHome: '24', scoreAway: '17' }])('preserves legacy score-only finals: %j', (scores) => {
    const context = contextFor(scores);
    expect(context.get(1).h2h.get(2)).toEqual({ w: 1, l: 0, t: 0 });
    expect(context.get(2).h2h.get(1)).toEqual({ w: 0, l: 1, t: 0 });
    expect(context.get(1).opponents.get(2)).toEqual({ w: 1, l: 0, t: 0 });
    expect(context.get(2).opponents.get(1)).toEqual({ w: 0, l: 1, t: 0 });
    expect(context.get(1)).toMatchObject({ divW: 1, divL: 0, divT: 0, confW: 1, confL: 0, confT: 0 });
    expect(context.get(2)).toMatchObject({ divW: 0, divL: 1, divT: 0, confW: 0, confL: 1, confT: 0 });
  });

  it.each([false, 0])('keeps division order and playoff seeds unchanged by an unplayed %s future tie', (played) => {
    const teams = [
      { id: 1, abbr: 'A', conf: 0, div: 0, wins: 1, losses: 0, ptsFor: 24, ptsAgainst: 17 },
      { id: 2, abbr: 'B', conf: 0, div: 0, wins: 1, losses: 0, ptsFor: 21, ptsAgainst: 17 },
      { id: 3, abbr: 'C', conf: 0, div: 0, wins: 0, losses: 2, ptsFor: 34, ptsAgainst: 45 },
    ];
    const completedWeeks = [
      { games: [{ home: 1, away: 3, played: true, homeScore: 24, awayScore: 17 }] },
      { games: [{ home: 2, away: 3, played: true, homeScore: 21, awayScore: 17 }] },
    ];
    const schedule = { weeks: [...completedWeeks, { games: [{ home: 1, away: 3, played, homeScore: 0, awayScore: 0 }] }] };
    const league = { teams, schedule, globalSeed: 42 };
    const before = JSON.stringify(league);
    const view = prepareStandingsView(league);
    // Both leaders are 1-0 in the division; A wins on point differential.
    // Counting the future tie would lower A to .750 and incorrectly put B first.
    expect(view.divisions[0].teams.map((team) => team.id)).toEqual([1, 2, 3]);
    expect(view.conferences[0].teams.map((team) => team.id)).toEqual([1, 2, 3]);
    expect(view.playoffPicture[0].seeds[0]).toMatchObject({ id: 1, seed: 1, clinchedDivision: true });
    expect(view).toEqual(prepareStandingsView({ ...league, schedule: { weeks: completedWeeks } }));
    const workerRows = teams.map((team) => ({ ...team, pct: team.wins / (team.wins + team.losses) }));
    expect(sortStandingsRows(workerRows, schedule, 42).map((team) => team.id)).toEqual([1, 2, 3]);
    expect(JSON.stringify(league)).toBe(before);
  });
});

describe('standings NFL tiebreaker chain', () => {
  it('still orders strictly by win% when records differ', () => {
    const league = {
      teams: [
        { id: 1, abbr: 'A', conf: 0, div: 0, wins: 12, losses: 5 },
        { id: 2, abbr: 'B', conf: 0, div: 0, wins: 8, losses: 9 },
      ],
    };
    const v = prepareStandingsView(league);
    expect(v.divisions[0].teams[0].abbr).toBe('A');
  });

  it('breaks an equal record by head-to-head result', () => {
    const league = {
      globalSeed: 42,
      teams: [
        { id: 1, abbr: 'A', conf: 0, div: 0, wins: 10, losses: 7 },
        { id: 2, abbr: 'B', conf: 0, div: 0, wins: 10, losses: 7 },
      ],
      // A beat B in both head-to-head meetings.
      schedule: {
        weeks: [
          { games: [{ home: 1, away: 2, homeScore: 24, awayScore: 17 }] },
          { games: [{ home: 2, away: 1, homeScore: 13, awayScore: 20 }] },
        ],
      },
    };
    const div = prepareStandingsView(league).divisions[0];
    expect(div.teams.map((t) => t.abbr)).toEqual(['A', 'B']);
  });

  it('falls back to division record when head-to-head is split', () => {
    const league = {
      globalSeed: 7,
      teams: [
        { id: 1, abbr: 'A', conf: 0, div: 0, wins: 10, losses: 7 },
        { id: 2, abbr: 'B', conf: 0, div: 0, wins: 10, losses: 7 },
        { id: 3, abbr: 'C', conf: 0, div: 0, wins: 4, losses: 13 },
      ],
      schedule: {
        weeks: [
          // Head-to-head split 1-1.
          { games: [{ home: 1, away: 2, homeScore: 21, awayScore: 14 }] },
          { games: [{ home: 2, away: 1, homeScore: 21, awayScore: 14 }] },
          // A sweeps division rival C; B loses to C → A has better division record.
          { games: [{ home: 1, away: 3, homeScore: 30, awayScore: 10 }] },
          { games: [{ home: 3, away: 2, homeScore: 24, awayScore: 20 }] },
        ],
      },
    };
    const div = prepareStandingsView(league).divisions[0];
    const [first, second] = div.teams.filter((t) => t.abbr !== 'C').map((t) => t.abbr);
    expect([first, second]).toEqual(['A', 'B']);
  });

  it('is deterministic (seeded coin-flip) when everything ties', () => {
    const make = () => prepareStandingsView({
      globalSeed: 99,
      teams: [
        { id: 1, abbr: 'A', conf: 0, div: 0, wins: 8, losses: 9 },
        { id: 2, abbr: 'B', conf: 0, div: 0, wins: 8, losses: 9 },
      ],
    });
    expect(make().divisions[0].teams.map((t) => t.id))
      .toEqual(make().divisions[0].teams.map((t) => t.id));
  });
});

// Post-engine-flip stabilization: the worker's buildStandings() previously
// sorted by win% + points-for only. It now routes through sortStandingsRows,
// which must apply the exact ordering of makeStandingsComparator.
describe('sortStandingsRows (worker standings path)', () => {
  // Worker row shape: pct/pf/pa, not winPct/ptsFor/ptsAgainst.
  const workerRows = [
    { id: 1, name: 'Alphas', abbr: 'A', conf: 0, div: 0, wins: 10, losses: 7, ties: 0, pf: 410, pa: 330, pct: 10 / 17 },
    { id: 2, name: 'Bravos', abbr: 'B', conf: 0, div: 0, wins: 10, losses: 7, ties: 0, pf: 380, pa: 300, pct: 10 / 17 },
    { id: 3, name: 'Charlies', abbr: 'C', conf: 0, div: 1, wins: 12, losses: 5, ties: 0, pf: 400, pa: 280, pct: 12 / 17 },
  ];
  // B swept A head-to-head, but A has more points-for: the old win%+PF sort
  // put A first; the NFL chain must put B first.
  const schedule = {
    weeks: [
      { games: [{ home: 2, away: 1, homeScore: 27, awayScore: 13 }] },
      { games: [{ home: 1, away: 2, homeScore: 10, awayScore: 24 }] },
    ],
  };

  it('applies head-to-head ahead of points-for, unlike the old worker sort', () => {
    const sorted = sortStandingsRows(workerRows, schedule, 42);
    expect(sorted.map((r) => r.abbr)).toEqual(['C', 'B', 'A']);
  });

  it('produces exactly the ordering of makeStandingsComparator', () => {
    const enriched = workerRows.map((r) => ({
      ...r, winPct: r.pct, ptsFor: r.pf, ptsAgainst: r.pa, pointDiff: r.pf - r.pa,
    }));
    const expected = [...enriched]
      .sort(makeStandingsComparator(buildTiebreakContext(enriched, schedule), 42))
      .map((r) => r.id);
    expect(sortStandingsRows(workerRows, schedule, 42).map((r) => r.id)).toEqual(expected);
  });

  it('is deterministic for the same rows/schedule/seed', () => {
    const a = sortStandingsRows(workerRows, schedule, 7).map((r) => r.id);
    const b = sortStandingsRows(workerRows, schedule, 7).map((r) => r.id);
    expect(a).toEqual(b);
  });

  it('preserves the worker row fields the UI reads (pf/pa/pct)', () => {
    const sorted = sortStandingsRows(workerRows, schedule, 42);
    for (const row of sorted) {
      expect(row).toEqual(expect.objectContaining({
        pf: expect.any(Number), pa: expect.any(Number), pct: expect.any(Number),
        name: expect.any(String), abbr: expect.any(String),
      }));
    }
  });
});
