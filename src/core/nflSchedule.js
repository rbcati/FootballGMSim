import { buildCanonicalGameId } from './gameIdentity.js';
import { sortStandingsRows } from '../views/standingsView.js';

// Simulator rotation epoch; these are structurally NFL schedules, not official fixtures.
const EPOCH = 2026;
const mod = (n, d) => ((n % d) + d) % d;
const identity = (t) => t.id ?? t.tid;
const conf = (t) => t.conf ?? t.cid ?? t.conferenceId ?? t.conference;
const div = (t) => t.div ?? t.did ?? t.divisionId ?? t.division;
const compare = (a, b) =>
  String(a).localeCompare(String(b), 'en', { numeric: true });

export function nflStructure(teams) {
  if (!Array.isArray(teams) || teams.length !== 32)
    throw new Error('NFL mode requires 32 teams');
  const ids = new Set();
  const conferences = new Map();
  for (const t of teams) {
    if (!t || typeof t !== 'object') throw new Error('Invalid team record');
    const id = identity(t);
    if (!Number.isSafeInteger(id) || id < 0 || ids.has(id))
      throw new Error(`Invalid or duplicate numeric team ID: ${id}`);
    ids.add(id);
    if (conf(t) == null || div(t) == null)
      throw new Error(`Team ${id} lacks conference/division identity`);
    const c = String(conf(t)),
      d = String(div(t));
    if (!conferences.has(c)) conferences.set(c, new Map());
    const ds = conferences.get(c);
    if (!ds.has(d)) ds.set(d, []);
    ds.get(d).push(t);
  }
  if (conferences.size !== 2)
    throw new Error('NFL mode requires two conferences');
  return [...conferences]
    .sort(([a], [b]) => compare(a, b))
    .map(([cid, ds]) => {
      if (ds.size !== 4 || [...ds.values()].some((ts) => ts.length !== 4)) {
        throw new Error(
          `Conference ${cid} must have four divisions of four teams`
        );
      }
      return [...ds]
        .sort(([a], [b]) => compare(a, b))
        .map(([did, ts]) => ({
          cid,
          did,
          teams: [...ts].sort((a, b) => identity(a) - identity(b)),
        }));
    });
}

export function isNflStructure(teams) {
  try {
    nflStructure(teams);
    return true;
  } catch {
    return false;
  }
}

export function scheduleOptions(input = {}) {
  const opts =
    typeof input === 'object' && input !== null ? input : { season: input };
  // Season IDs remain opaque; never Number('s2'). Explicit year/ordinal drives rotation.
  const season = Number.isSafeInteger(opts.season) ? opts.season : 1;
  const year = Number.isSafeInteger(opts.year)
    ? opts.year
    : season >= 1900
      ? season
      : EPOCH + Math.max(0, season - 1);
  return {
    ...opts,
    year,
    seasonId:
      opts.seasonId ??
      `s${season >= 1900 ? year - EPOCH + 1 : Math.max(1, season)}`,
    rotation: year - EPOCH,
    seed: String(opts.seed ?? 0),
  };
}

/** Freeze before resetting records. Uses the existing standings comparator within each division. */
export function previousDivisionRanks(teams, schedule, seed = 0) {
  const structure = nflStructure(teams);
  const rows = [...teams]
    .sort((a, b) => identity(a) - identity(b))
    .map((t) => {
      const games = (t.wins ?? 0) + (t.losses ?? 0) + (t.ties ?? 0);
      const pct = games ? ((t.wins ?? 0) + (t.ties ?? 0) / 2) / games : 0;
      return {
        ...t,
        id: identity(t),
        conf: conf(t),
        div: div(t),
        pct,
        winPct: pct,
      };
    });
  // Match the worker's standings authority with all opponents present in the
  // tiebreak context. Filtering before this call loses conference/common games
  // and strength of schedule, changing divisional finishes on tied records.
  const ordered = sortStandingsRows(rows, schedule, seed);
  const ranks = {};
  for (const divisions of structure)
    for (const division of divisions) {
      const members = new Set(division.teams.map(identity));
      ordered
        .filter((t) => members.has(t.id))
        .forEach((t, i) => {
          ranks[t.id] = i + 1;
        });
    }
  return ranks;
}

/** Recover regular-season finishes from played scores, including legacy saves.
 * Playoff results are excluded even when legacy team records include them.
 * No historical results are invented when there are no played games.
 */
export function completedRegularDivisionRanks(
  teams,
  schedule,
  seed = 0,
  archivedGames = []
) {
  const rows = teams.map((t) => ({
    ...t,
    id: identity(t),
    wins: 0,
    losses: 0,
    ties: 0,
    ptsFor: 0,
    ptsAgainst: 0,
  }));
  const byId = new Map(rows.map((t) => [t.id, t]));
  const archivedById = new Map(archivedGames.map((g) => [g.id ?? g.gameId, g]));
  let played = 0;
  const regular = {
    weeks: (schedule?.weeks ?? [])
      .filter((w) => w.week >= 1 && w.week <= 18)
      .map((w) => ({
        ...w,
        games: (w.games ?? []).map((g) => {
          const archived = archivedById.get(g.id ?? g.gameId);
          return archived
            ? {
                ...g,
                played: true,
                homeScore: g.homeScore ?? archived.homeScore,
                awayScore: g.awayScore ?? archived.awayScore,
              }
            : g;
        }),
      })),
  };
  for (const w of regular.weeks)
    for (const g of w.games ?? []) {
      const h = byId.get(g.home?.id ?? g.home),
        a = byId.get(g.away?.id ?? g.away);
      const archived = archivedById.get(g.id ?? g.gameId);
      if (!h || !a || (g.played === false && !archived)) continue;
      const hs = g.homeScore ?? g.scoreHome ?? archived?.homeScore,
        as = g.awayScore ?? g.scoreAway ?? archived?.awayScore;
      if (!Number.isFinite(hs) || !Number.isFinite(as)) {
        if (g.played === true || archived)
          throw new Error(
            `Cannot recover previous-season ranks: missing regular-season scores for ${g.id ?? g.gameId}`
          );
        continue;
      }
      played++;
      h.ptsFor += hs;
      h.ptsAgainst += as;
      a.ptsFor += as;
      a.ptsAgainst += hs;
      if (hs === as) {
        h.ties++;
        a.ties++;
      } else if (hs > as) {
        h.wins++;
        a.losses++;
      } else {
        a.wins++;
        h.losses++;
      }
    }
  if (!played) {
    const ranks = {};
    for (const ds of nflStructure(teams))
      for (const d of ds)
        d.teams.forEach((t, i) => {
          ranks[identity(t)] = i + 1;
        });
    return ranks;
  }
  return previousDivisionRanks(rows, regular, seed);
}

/** Complete reciprocal annual obligations, decomposed into 17 perfect matchings. */
export function buildNflOpponentMatrix(teams, input = {}) {
  const options = scheduleOptions(input);
  const structure = nflStructure(teams);
  const ranks = {};
  const rankedGroups = structure.map((ds) =>
    ds.map((d) => {
      const ranked = [...d.teams];
      if (options.priorRanks != null) {
        const values = ranked.map((t) => options.priorRanks[identity(t)]);
        if (
          new Set(values).size !== 4 ||
          values.some((r) => !Number.isInteger(r) || r < 1 || r > 4)
        ) {
          throw new Error(
            `Invalid previous-season ranks for ${d.cid}/${d.did}`
          );
        }
        ranked.sort(
          (a, b) =>
            options.priorRanks[identity(a)] - options.priorRanks[identity(b)]
        );
      }
      ranked.forEach((t, i) => {
        ranks[identity(t)] = i + 1;
      });
      return ranked.map(identity);
    })
  );
  // Full-division venue rotation follows stable team identity, independent of
  // changing standings. Only the three same-place games use rank slots.
  const groups = structure.map((ds) => ds.map((d) => d.teams.map(identity)));
  const y = options.rotation;
  const sameMask = [1, 2, 3][mod(y, 3)];
  const mainOffset = mod(y, 4);
  const extraOffset = mod(
    mainOffset + [1, 2, 3, 2, 1, 2][mod(Math.floor(y / 4), 6)],
    4
  );
  const rounds = Array.from({ length: 17 }, () => []);
  const add = (r, home, away, category) =>
    rounds[r].push({ home, away, category });
  const pairs = [
    [
      [0, 3],
      [1, 2],
    ],
    [
      [0, 2],
      [3, 1],
    ],
    [
      [0, 1],
      [2, 3],
    ],
  ];
  for (let c = 0; c < 2; c++)
    for (let d = 0; d < 4; d++) {
      const a = groups[c][d];
      for (let r = 0; r < 3; r++)
        for (const [i, j] of pairs[r]) {
          add(r, a[i], a[j], 'division');
          add(r + 3, a[j], a[i], 'division');
        }
      const other = d ^ sameMask;
      if (d < other) {
        const b = groups[c][other];
        for (let r = 0; r < 4; r++)
          for (let i = 0; i < 4; i++) {
            const j = mod(i + r, 4),
              homeA = mod(i + j + Math.floor(y / 3), 2) === 0;
            add(
              6 + r,
              homeA ? a[i] : b[j],
              homeA ? b[j] : a[i],
              'same-conference-rotation'
            );
          }
      }
    }
  for (let d = 0; d < 4; d++) {
    const a = groups[0][d],
      b = groups[1][mod(d + mainOffset, 4)];
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 4; i++) {
        const j = mod(i + r, 4),
          homeA = mod(i + j + Math.floor(y / 4), 2) === 0;
        add(
          10 + r,
          homeA ? a[i] : b[j],
          homeA ? b[j] : a[i],
          'opposite-conference-rotation'
        );
      }
    const extra = rankedGroups[1][mod(d + extraOffset, 4)];
    const rankedA = rankedGroups[0][d];
    for (let i = 0; i < 4; i++)
      add(
        16,
        mod(y, 2) === 0 ? rankedA[i] : extra[i],
        mod(y, 2) === 0 ? extra[i] : rankedA[i],
        'seventeenth'
      );
  }
  // The two remaining division matchings form a four-cycle. Orient it cyclically:
  // exactly one home + one away standings game per team, reversed next cycle.
  const masks = [1, 2, 3].filter((m) => m !== sameMask);
  const cycle = [0, masks[0], masks[0] ^ masks[1], masks[1]];
  for (let c = 0; c < 2; c++)
    for (let e = 0; e < 4; e++) {
      const d = cycle[e],
        other = cycle[(e + 1) % 4];
      const homeD = mod(Math.floor(y / 3), 2) === 0 ? d : other;
      const awayD = homeD === d ? other : d;
      for (let i = 0; i < 4; i++)
        add(
          14 + (e % 2),
          rankedGroups[c][homeD][i],
          rankedGroups[c][awayD][i],
          'same-standing'
        );
    }
  const matrix = {
    rounds,
    games: rounds.flat(),
    ranks,
    options,
    rotation: { sameMask, mainOffset, extraOffset },
    rankPolicy:
      options.priorRanks == null
        ? 'initial-division-id-order'
        : 'previous-season-division-finish',
  };
  assertNflOpponentMatrix(matrix, teams);
  return matrix;
}

export function assertNflOpponentMatrix(matrix, teams) {
  const errors = [];
  const byId = new Map(teams.map((t) => [identity(t), t]));
  const counts = new Map(teams.map((t) => [identity(t), new Map()]));
  const homes = new Map(teams.map((t) => [identity(t), 0]));
  for (const g of matrix.games) {
    if (!byId.has(g.home) || !byId.has(g.away) || g.home === g.away) {
      errors.push(`Invalid opponent pair ${g.home}/${g.away}`);
      continue;
    }
    for (const [a, b] of [
      [g.home, g.away],
      [g.away, g.home],
    ])
      counts.get(a).set(b, (counts.get(a).get(b) ?? 0) + 1);
    homes.set(g.home, homes.get(g.home) + 1);
  }
  for (const [id, t] of byId) {
    const opponents = counts.get(id);
    const label = t.abbr ?? id;
    for (const [oid, other] of byId)
      if (oid !== id) {
        const n = opponents.get(oid) ?? 0;
        if (
          String(conf(t)) === String(conf(other)) &&
          String(div(t)) === String(div(other))
        ) {
          if (n !== 2)
            errors.push(
              `${label}: expected 2 games vs ${other.abbr ?? oid}, found ${n}`
            );
          if (
            matrix.games.filter((g) => g.home === id && g.away === oid)
              .length !== 1
          )
            errors.push(
              `${label}: division series vs ${oid} must be home/away`
            );
        } else if (n > 1)
          errors.push(
            `${label}: nondivision opponent ${other.abbr ?? oid} appears ${n} times`
          );
      }
    const n = [...opponents.values()].reduce((a, b) => a + b, 0);
    if (n !== 17) errors.push(`${label}: ${n} games, expected 17`);
    if (opponents.size !== 14)
      errors.push(`${label}: expected eleven distinct nondivisional opponents`);
    if (![8, 9].includes(homes.get(id)))
      errors.push(`${label}: ${homes.get(id)} home games, expected 8 or 9`);
  }
  if (errors.length)
    throw new Error(`NFL opponent matrix invalid:\n${errors.join('\n')}`);
}

function randomSource(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}
function shuffle(array, rng) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Move exactly two games from eight weeks in 5–13 to week 10's extra round.
 * Exact cover: each team is moved once, creating four byes in each source week.
 * Search has a strict node budget; no opponent obligations can change.
 */
function allocateByes(weeks, ids, rng) {
  const sourceWeeks = [4, 5, 6, 7, 8, 10, 11, 12]; // zero-based; week 10 is the destination
  const candidates = sourceWeeks.flatMap((w, c) =>
    shuffle(weeks[w].games, rng).map((g) => ({ g, w, c }))
  );
  const incident = new Map(
    ids.map((id) => [
      id,
      candidates.filter((x) => x.g.home === id || x.g.away === id),
    ])
  );
  const used = new Set(),
    capacity = Array(8).fill(2),
    chosen = [];
  let nodes = 0;
  function visit() {
    if (++nodes > 20000) return false;
    if (used.size === 32) return true;
    let choices = null;
    for (const id of ids)
      if (!used.has(id)) {
        const available = incident
          .get(id)
          .filter(
            (x) =>
              capacity[x.c] > 0 && !used.has(x.g.home) && !used.has(x.g.away)
          );
        if (!available.length) return false;
        if (choices === null || available.length < choices.length)
          choices = available;
      }
    for (const x of choices) {
      used.add(x.g.home);
      used.add(x.g.away);
      capacity[x.c]--;
      chosen.push(x);
      if (visit()) return true;
      chosen.pop();
      capacity[x.c]++;
      used.delete(x.g.home);
      used.delete(x.g.away);
    }
    return false;
  }
  if (!visit()) return null;
  for (const { g, w } of chosen) {
    weeks[w].games = weeks[w].games.filter((x) => x !== g);
    weeks[w].teamsWithBye.push(g.home, g.away);
    weeks[9].games.push(g);
  }
  return nodes;
}

function quality(weeks, ids) {
  let penalty = 0,
    maxStreak = 0,
    minDivisionGap = 18;
  for (const id of ids) {
    let side = null,
      streak = 0;
    const seen = new Map();
    for (const w of weeks) {
      const g = w.games.find((g) => g.home === id || g.away === id);
      // A bye does not end a run of consecutive home or away games.
      if (!g) continue;
      const next = g.home === id ? 'H' : 'A';
      streak = side === next ? streak + 1 : 1;
      side = next;
      maxStreak = Math.max(maxStreak, streak);
      penalty += Math.max(0, streak - 2) ** 2;
      const opp = g.home === id ? g.away : g.home;
      if (seen.has(opp)) {
        const gap = w.week - seen.get(opp);
        minDivisionGap = Math.min(minDivisionGap, gap);
        penalty += Math.max(0, 5 - gap) * 30 + Math.max(0, 3 - gap) * 100000;
      }
      seen.set(opp, w.week);
    }
  }
  return {
    penalty: penalty + 10000 * Math.max(0, maxStreak - 3) ** 2,
    maxHomeAwayStreak: maxStreak,
    minDivisionGap,
  };
}

export function generateNflSchedule(teams, input = {}) {
  const matrix = buildNflOpponentMatrix(teams, input);
  const { options } = matrix;
  const ids = [...teams].map(identity).sort((a, b) => a - b);
  const rng = randomSource(
    `${options.year}|${options.seasonId}|${options.seed}`
  );
  let best = null,
    totalNodes = 0,
    attempts = 0;
  for (; attempts < 32; attempts++) {
    const weeks = Array.from({ length: 18 }, (_, i) => ({
      week: i + 1,
      games: [],
      teamsWithBye: [],
    }));
    const divisionRounds = shuffle([0, 1, 2], rng);
    const divisionWeeks = [0, 3, 7, 10, 14, 17];
    divisionWeeks.forEach((w, i) => {
      weeks[w].games = matrix.rounds[
        divisionRounds[i % 3] + (i >= 3 ? 3 : 0)
      ].map((g) => ({ ...g }));
    });
    const rest = shuffle(
      Array.from({ length: 11 }, (_, i) => i + 6),
      rng
    );
    let ri = 0;
    for (let w = 0; w < 18; w++)
      if (w !== 9 && !divisionWeeks.includes(w))
        weeks[w].games = matrix.rounds[rest[ri++]].map((g) => ({ ...g }));
    const nodes = allocateByes(weeks, ids, rng);
    if (nodes === null) {
      totalNodes += 20000;
      continue;
    }
    totalNodes += nodes;
    const q = quality(weeks, ids);
    if (best === null || q.penalty < best.quality.penalty)
      best = { weeks, quality: q };
    if (q.penalty === 0) {
      attempts++;
      break;
    }
  }
  if (!best)
    throw new Error(
      `NFL week placement failed after ${attempts} attempts / ${totalNodes} exact-cover nodes; save unchanged`
    );
  // Bounded local improvement: swap whole weeks, preserving all hard constraints.
  // Week 18 is fixed; bye-bearing rounds must stay inside weeks 5–13.
  for (let step = 0; step < 1024; step++) {
    const a = Math.floor(rng() * 17),
      b = Math.floor(rng() * 17);
    if (a === b) continue;
    const wa = best.weeks[a],
      wb = best.weeks[b];
    if (
      (wa.teamsWithBye.length && (b < 4 || b > 12)) ||
      (wb.teamsWithBye.length && (a < 4 || a > 12))
    )
      continue;
    [wa.games, wb.games] = [wb.games, wa.games];
    [wa.teamsWithBye, wb.teamsWithBye] = [wb.teamsWithBye, wa.teamsWithBye];
    const q = quality(best.weeks, ids);
    if (q.penalty < best.quality.penalty) best.quality = q;
    else {
      [wa.games, wb.games] = [wb.games, wa.games];
      [wa.teamsWithBye, wb.teamsWithBye] = [wb.teamsWithBye, wa.teamsWithBye];
    }
  }
  for (const w of best.weeks) {
    w.teamsWithBye.sort((a, b) => a - b);
    w.games.sort((a, b) => a.home - b.home || a.away - b.away);
    w.games = w.games.map((g) => {
      const id = buildCanonicalGameId({
        seasonId: options.seasonId,
        week: w.week,
        homeId: g.home,
        awayId: g.away,
      });
      return {
        ...g,
        id,
        gameId: id,
        seasonId: options.seasonId,
        week: w.week,
        played: false,
      };
    });
  }
  const schedule = {
    weeks: best.weeks,
    metadata: {
      type: 'nfl-canonical-v1',
      year: options.year,
      seasonId: options.seasonId,
      seed: options.seed,
      priorRanks: matrix.ranks,
      rankPolicy: matrix.rankPolicy,
      rotation: matrix.rotation,
      placement: {
        attempts,
        totalNodes,
        improvementSteps: 1024,
        ...best.quality,
        relaxedPreferences: [
          ...(best.quality.maxHomeAwayStreak > 3
            ? ['home-away-streak-target-3']
            : []),
          ...(best.quality.minDivisionGap < 5
            ? ['division-rematch-gap-target-5']
            : []),
        ],
      },
    },
  };
  assertNflSchedule(schedule, teams, options);
  return schedule;
}

export function validateNflSchedule(
  schedule,
  teams,
  input = schedule?.metadata ?? {}
) {
  const errors = [];
  let expected;
  try {
    expected = buildNflOpponentMatrix(teams, input);
  } catch (e) {
    return { valid: false, errors: [e.message] };
  }
  const { options } = expected;
  const ids = new Set(teams.map(identity));
  const labels = new Map(
    teams.map((t) => [identity(t), t.abbr ?? identity(t)])
  );
  const weeks = Array.isArray(schedule) ? schedule : schedule?.weeks;
  if (!Array.isArray(weeks))
    return { valid: false, errors: ['Schedule has no weeks'] };
  if (weeks.length !== 18)
    errors.push(`Expected 18 weeks, found ${weeks.length}`);
  const actual = [],
    gameIds = new Set(),
    weekIds = new Set(),
    byes = new Map([...ids].map((id) => [id, 0]));
  for (const w of weeks) {
    if (!w || typeof w !== 'object') {
      errors.push('Invalid week record');
      continue;
    }
    const week = w.week ?? w.weekNumber;
    if (!Number.isInteger(week) || week < 1 || week > 18 || weekIds.has(week))
      errors.push(`Invalid/duplicate week ${week}`);
    weekIds.add(week);
    const seen = new Set(),
      bye = new Set(Array.isArray(w.teamsWithBye) ? w.teamsWithBye : []);
    if (!Array.isArray(w.teamsWithBye) || bye.size !== w.teamsWithBye.length)
      errors.push(`Week ${week}: missing or duplicate teamsWithBye`);
    for (const id of bye) {
      if (!ids.has(id)) errors.push(`Week ${week}: invalid bye team ${id}`);
      else byes.set(id, byes.get(id) + 1);
      if (week < 5 || week > 13)
        errors.push(`Week ${week}: bye outside weeks 5–13`);
    }
    if (!Array.isArray(w.games)) {
      errors.push(`Week ${week}: games must be an array`);
      continue;
    }
    for (const g of w.games) {
      if (!g || g.bye != null) {
        errors.push(`Week ${week}: fabricated bye game`);
        continue;
      }
      const h = g.home,
        a = g.away;
      for (const id of [h, a]) {
        if (!ids.has(id))
          errors.push(`Week ${week}: unknown numeric team reference ${id}`);
        if (seen.has(id))
          errors.push(`Week ${week}: ${labels.get(id) ?? id} double-booked`);
        if (bye.has(id))
          errors.push(
            `Week ${week}: ${labels.get(id) ?? id} both playing and on bye`
          );
        seen.add(id);
      }
      const canonical = buildCanonicalGameId({
        seasonId: options.seasonId,
        week,
        homeId: h,
        awayId: a,
      });
      if (
        g.id !== canonical ||
        g.gameId !== canonical ||
        g.seasonId !== options.seasonId ||
        g.week !== week
      )
        errors.push(
          `Week ${week}: invalid canonical game ID/season/week ${g.id}`
        );
      if (gameIds.has(g.id)) errors.push(`Duplicate game ID ${g.id}`);
      gameIds.add(g.id);
      actual.push(g);
    }
    for (const id of ids)
      if (!seen.has(id) && !bye.has(id))
        errors.push(`Week ${week}: ${labels.get(id)} missing game/bye`);
  }
  for (const [id, n] of byes)
    if (n !== 1) errors.push(`${labels.get(id)}: ${n} byes, expected 1`);
  try {
    assertNflOpponentMatrix({ games: actual }, teams);
  } catch (e) {
    errors.push(e.message);
  }
  const obligations = new Map();
  for (const g of expected.games) obligations.set(`${g.home}/${g.away}`, 1);
  for (const g of actual) {
    const key = `${g.home}/${g.away}`;
    if (!obligations.get(key))
      errors.push(
        `Season ${options.seasonId}: unexpected/repeated home-away matchup ${key} (rotation/standings obligation)`
      );
    else obligations.delete(key);
  }
  for (const key of obligations.keys())
    errors.push(`Season ${options.seasonId}: missing expected matchup ${key}`);
  return { valid: errors.length === 0, errors };
}

export function assertNflSchedule(schedule, teams, input) {
  const result = validateNflSchedule(schedule, teams, input);
  if (!result.valid)
    throw new Error(`NFL schedule rejected:\n${result.errors.join('\n')}`);
  return schedule;
}
