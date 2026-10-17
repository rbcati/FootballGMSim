import { describe, it, expect } from 'vitest';
import {
  generateNflSchedule,
  buildNflOpponentMatrix,
  validateNflSchedule,
  previousDivisionRanks,
  completedRegularDivisionRanks,
  isNflStructure,
} from '../../src/core/nflSchedule.js';
import { DEFAULT_TEAMS as teams } from '../../src/data/default-teams.js';
import { buildCanonicalGameId } from '../../src/core/gameIdentity.js';
import { makeAccurateSchedule, Scheduler } from '../../src/core/schedule.js';

const obligations = (games) => games.map((g) => `${g.home}/${g.away}`).sort();
const clone = (x) => JSON.parse(JSON.stringify(x));
const ranksFor = (shift) =>
  Object.fromEntries(
    teams.map((t) => [t.id, ((t.id + shift * (t.div + 1)) % 4) + 1])
  );

// Independent formula assertions: do not use generator category labels or expected-game builder.
function checkFormula(schedule, year, ranks) {
  const y = year - 2026,
    mask = [1, 2, 3][y % 3];
  for (const t of teams) {
    const games = schedule.weeks
      .flatMap((w) => w.games)
      .filter((g) => g.home === t.id || g.away === t.id);
    const opponents = games.map(
      (g) => teams[g.home === t.id ? g.away : g.home]
    );
    const counts = new Map();
    for (const o of opponents) counts.set(o.id, (counts.get(o.id) ?? 0) + 1);
    expect(games).toHaveLength(17);
    expect(counts.size).toBe(14);
    for (const o of teams.filter(
      (o) => o.conf === t.conf && o.div === t.div && o.id !== t.id
    )) {
      expect(counts.get(o.id)).toBe(2);
      expect(
        games.filter((g) => g.home === t.id && g.away === o.id)
      ).toHaveLength(1);
    }
    expect(
      opponents.filter((o) => o.conf === t.conf && o.div === (t.div ^ mask))
    ).toHaveLength(4);
    const otherSame = opponents.filter(
      (o) => o.conf === t.conf && o.div !== t.div && o.div !== (t.div ^ mask)
    );
    expect(otherSame).toHaveLength(2);
    expect(new Set(otherSame.map((o) => o.div)).size).toBe(2);
    for (const o of otherSame) expect(ranks[o.id]).toBe(ranks[t.id]);
    const mainDiv = (t.div + (t.conf === 0 ? y : -y) + 400) % 4;
    expect(
      opponents.filter((o) => o.conf !== t.conf && o.div === mainDiv)
    ).toHaveLength(4);
    const offset = ((y % 4) + [1, 2, 3, 2, 1, 2][Math.floor(y / 4) % 6]) % 4;
    const extraDiv = (t.div + (t.conf === 0 ? offset : -offset) + 4) % 4;
    const extra = opponents.filter(
      (o) => o.conf !== t.conf && o.div === extraDiv
    );
    expect(extra).toHaveLength(1);
    expect(ranks[extra[0].id]).toBe(ranks[t.id]);
    const home = games.filter((g) => g.home === t.id).length;
    expect(home).toBe(t.conf === y % 2 ? 9 : 8);
  }
}

describe('canonical NFL scheduling authority', () => {
  it('validates 256 schedules over 24 seasons, varied ranks, and seeds with an independent formula oracle', () => {
    for (let n = 0; n < 256; n++) {
      const year = 2026 + (n % 24),
        priorRanks = ranksFor(Math.floor(n / 24));
      const opts = { year, seasonId: `season-${year}`, priorRanks, seed: n };
      const s = generateNflSchedule(teams, opts);
      expect(validateNflSchedule(s, teams, opts)).toEqual({
        valid: true,
        errors: [],
      });
      checkFormula(s, year, priorRanks);
      const venueRuns = teams.map((t) => {
        let last = null,
          run = 0,
          longest = 0;
        for (const week of s.weeks) {
          const g = week.games.find((g) => g.home === t.id || g.away === t.id);
          if (!g) continue;
          const home = g.home === t.id;
          run = home === last ? run + 1 : 1;
          last = home;
          longest = Math.max(longest, run);
        }
        return longest;
      });
      expect(s.metadata.placement.maxHomeAwayStreak).toBe(
        Math.max(...venueRuns)
      );
      const divisionGames = s.weeks[17].games;
      expect(divisionGames).toHaveLength(16);
      expect(
        divisionGames.every(
          (g) =>
            teams[g.home].conf === teams[g.away].conf &&
            teams[g.home].div === teams[g.away].div
        )
      ).toBe(true);
    }
  }, 120000);

  it('covers all three intra and four main interconference divisions and balanced 24-year extra games', () => {
    const same = new Set(),
      main = new Set(),
      extra = new Map();
    const extraHosts = new Map();
    const homeTotals = new Map(teams.map((t) => [t.id, 0]));
    for (let y = 0; y < 24; y++) {
      const m = buildNflOpponentMatrix(teams, { year: 2026 + y });
      if (y < 3) same.add(1 ^ m.rotation.sameMask);
      if (y < 4) main.add((1 + m.rotation.mainOffset) % 4);
      const g = m.games.find(
        (g) => g.category === 'seventeenth' && (g.home === 7 || g.away === 7)
      );
      const opp = teams[g.home === 7 ? g.away : g.home];
      const k = opp.div;
      extra.set(k, (extra.get(k) ?? 0) + 1);
      if (g.home === 7) extraHosts.set(k, (extraHosts.get(k) ?? 0) + 1);
      for (const g of m.games)
        homeTotals.set(g.home, homeTotals.get(g.home) + 1);
    }
    expect([...same].sort()).toEqual([0, 2, 3]);
    expect(main.size).toBe(4);
    expect([...extra.values()]).toEqual([6, 6, 6, 6]);
    expect([...extraHosts.values()]).toEqual([3, 3, 3, 3]);
    expect(new Set(homeTotals.values())).toEqual(new Set([204]));
  });

  it('alternates full-division venues on the next rotation despite changing standings', () => {
    const first = buildNflOpponentMatrix(teams, {
      year: 2026,
      priorRanks: ranksFor(0),
    });
    for (const [category, year] of [
      ['same-conference-rotation', 2029],
      ['opposite-conference-rotation', 2030],
    ]) {
      const next = buildNflOpponentMatrix(teams, {
        year,
        priorRanks: ranksFor(1),
      });
      const reverse = new Set(
        next.games
          .filter((g) => g.category === category)
          .map((g) => `${g.away}/${g.home}`)
      );
      for (const g of first.games.filter((g) => g.category === category))
        expect(reverse.has(`${g.home}/${g.away}`)).toBe(true);
    }
  });

  it('is stable across array order, relocation, numeric IDs, aliases, object identity, and JSON reload', () => {
    const relocated = teams.map((t) => ({
      tid: t.id + 100,
      cid: t.conf,
      did: t.div,
      name: `Relocated ${t.id}`,
    }));
    const opts = { year: 2029, seasonId: 'dynasty-custom-id', seed: 13 };
    const a = generateNflSchedule(relocated, opts);
    expect(
      generateNflSchedule(clone(relocated).reverse(), clone(opts))
    ).toEqual(a);
    expect(validateNflSchedule(clone(a), clone(relocated))).toEqual({
      valid: true,
      errors: [],
    });
    const zero = generateNflSchedule(teams, opts);
    expect(
      zero.weeks
        .flatMap((w) => w.games)
        .filter((g) => g.home === 0 || g.away === 0)
    ).toHaveLength(17);
    expect(
      zero.weeks
        .flatMap((w) => w.games)
        .every(
          (g) =>
            g.id ===
            buildCanonicalGameId({
              seasonId: opts.seasonId,
              week: g.week,
              homeId: g.home,
              awayId: g.away,
            })
        )
    ).toBe(true);
  });

  it('changes placement seeds without changing annual home/away obligations', () => {
    const a = generateNflSchedule(teams, { seed: 1 }),
      b = generateNflSchedule(teams, { seed: 2 });
    expect(a.weeks).not.toEqual(b.weeks);
    expect(obligations(a.weeks.flatMap((w) => w.games))).toEqual(
      obligations(b.weeks.flatMap((w) => w.games))
    );
    expect(a).toEqual(generateNflSchedule(teams, { seed: 1 }));
  });

  it('uses previous regular-season results and the existing tiebreak authority, excluding playoffs', () => {
    const s = generateNflSchedule(teams);
    const records = teams.map((t) => ({
      ...t,
      wins: t.id % 4,
      losses: 17 - (t.id % 4),
      ties: 0,
    }));
    const ranks = previousDivisionRanks(records, s, 1);
    expect([ranks[4], ranks[5], ranks[6], ranks[7]]).toEqual([4, 3, 2, 1]);
    const next = buildNflOpponentMatrix(teams, {
      year: 2027,
      priorRanks: ranks,
    });
    const baseline = buildNflOpponentMatrix(teams, { year: 2027 });
    // Supply different division permutations, so same-place opponents really change.
    const changed = buildNflOpponentMatrix(teams, {
      year: 2027,
      priorRanks: ranksFor(1),
    });
    expect(
      obligations(changed.games.filter((g) => g.category === 'same-standing'))
    ).not.toEqual(
      obligations(baseline.games.filter((g) => g.category === 'same-standing'))
    );
    expect(next.ranks).toEqual(ranks);
    const played = clone(s);
    for (const w of played.weeks)
      for (const g of w.games)
        Object.assign(g, {
          played: true,
          homeScore: (g.home % 4) * 7,
          awayScore: (g.away % 4) * 7,
        });
    const regularRanks = completedRegularDivisionRanks(records, played, 1);
    played.weeks.push({
      week: 19,
      games: [
        { home: 0, away: 7, played: true, homeScore: 1000, awayScore: 0 },
      ],
    });
    expect(completedRegularDivisionRanks(records, played, 1)).toEqual(
      regularRanks
    );
    const archived = played.weeks
      .filter((w) => w.week <= 18)
      .flatMap((w) => w.games)
      .map((g) => ({
        id: g.id,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      }));
    const scoreless = clone(played);
    for (const w of scoreless.weeks)
      for (const g of w.games) {
        delete g.homeScore;
        delete g.awayScore;
      }
    expect(
      completedRegularDivisionRanks(records, scoreless, 1, archived)
    ).toEqual(regularRanks);
    expect(() => completedRegularDivisionRanks(records, scoreless, 1)).toThrow(
      /missing regular-season scores/
    );
    expect(completedRegularDivisionRanks(teams, s, 1)).toEqual(
      buildNflOpponentMatrix(teams).ranks
    );
  });

  it('rejects corruption with useful diagnostics and refuses invalid ranks without a fallback', () => {
    const base = generateNflSchedule(teams);
    const mutations = [
      (s) => {
        s.weeks[0] = null;
      },
      (s) => {
        s.weeks[0].teamsWithBye = {};
      },
      (s) => {
        s.weeks[0].games[0].away = 999;
      },
      (s) => {
        s.weeks[0].games[0].home = '0';
      },
      (s) => {
        s.weeks[0].games.push({ ...s.weeks[0].games[0] });
      },
      (s) => {
        s.weeks[0].teamsWithBye.push(s.weeks[0].games[0].home);
      },
      (s) => {
        s.weeks[0].games[0].id = 'wrong';
      },
      (s) => {
        s.weeks[0].games.push({ bye: [0] });
      },
      (s) => {
        s.weeks[0].games[0].away = s.weeks[0].games[0].home;
      },
      (s) => {
        s.weeks.pop();
      },
      (s) => {
        const w = s.weeks.find((w) => w.teamsWithBye.length);
        w.teamsWithBye = [];
      },
    ];
    for (const mutate of mutations) {
      const s = clone(base);
      mutate(s);
      const v = validateNflSchedule(s, teams);
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    }
    const swapped = clone(base);
    const g = swapped.weeks[0].games[0];
    [g.home, g.away] = [g.away, g.home];
    expect(validateNflSchedule(swapped, teams).errors.join('\n')).toMatch(
      /home\/away|missing expected matchup/
    );
    expect(() => makeAccurateSchedule(teams, { priorRanks: {} })).toThrow(
      /previous-season ranks/
    );
    expect(() =>
      Scheduler.createSimpleSchedule(teams, { priorRanks: {} })
    ).toThrow(/previous-season ranks/);
    expect(
      isNflStructure(teams.map((t, i) => ({ ...t, id: i === 1 ? 0 : t.id })))
    ).toBe(false);
  });
});
