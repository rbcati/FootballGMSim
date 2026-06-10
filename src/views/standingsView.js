/*
 * Standings View (data-preparation layer)
 * ───────────────────────────────────────
 * Shapes raw league/team state into division + conference standings and a
 * simple playoff picture. Pure: no React, no JSX, no hooks. Returns a plain
 * serializable object.
 */

function winPct(wins, losses, ties) {
  const games = wins + losses + ties;
  if (games <= 0) return 0;
  return (wins + ties * 0.5) / games;
}

function normalizeTeam(team, userTeamId) {
  const wins = Number(team?.wins ?? 0);
  const losses = Number(team?.losses ?? 0);
  const ties = Number(team?.ties ?? 0);
  const ptsFor = Number(team?.ptsFor ?? team?.pf ?? 0);
  const ptsAgainst = Number(team?.ptsAgainst ?? team?.pa ?? 0);
  return {
    id: team?.id ?? null,
    name: team?.name ?? 'Unknown Team',
    abbr: team?.abbr ?? '---',
    conf: team?.conf ?? 0,
    div: team?.div ?? 0,
    wins,
    losses,
    ties,
    ptsFor,
    ptsAgainst,
    pointDiff: ptsFor - ptsAgainst,
    winPct: winPct(wins, losses, ties),
    isUser: userTeamId != null && Number(team?.id) === Number(userTeamId),
  };
}

function pctOf(w, l, t) {
  const g = w + l + t;
  return g > 0 ? (w + t * 0.5) / g : 0;
}

// Deterministic, seed-based coin-flip key (no Math.random). Derived from the
// league seed and team id so the final tiebreak is reproducible across runs.
function seededCoinKey(seed, teamId) {
  let h = (Number(seed) || 0) >>> 0;
  const idStr = String(teamId ?? '');
  for (let i = 0; i < idStr.length; i += 1) {
    h ^= idStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Build the NFL tiebreaker context from played games. Returns per-team:
 *   h2h           Map<oppId,{w,l,t}>  head-to-head records
 *   opponents     Map<oppId,{w,l,t}>  record vs each opponent (for common games)
 *   divRecord     win% within division
 *   confRecord    win% within conference
 *   sos           average opponent win%
 * Falls back to empty context (every step ties) when no game data is present,
 * which preserves the simple win% ordering for minimal/preseason states.
 */
export function buildTiebreakContext(teams, schedule) {
  const teamById = new Map(teams.map((t) => [Number(t.id), t]));
  const winPctById = new Map(teams.map((t) => [Number(t.id), t.winPct]));
  const ctx = new Map();
  for (const t of teams) {
    ctx.set(Number(t.id), {
      h2h: new Map(), opponents: new Map(),
      divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0,
      sos: 0.5,
    });
  }

  const readId = (side) => Number(side?.id ?? side);
  const bump = (rec, key, outcome) => {
    const cur = rec.get(key) ?? { w: 0, l: 0, t: 0 };
    cur[outcome] += 1;
    rec.set(key, cur);
  };

  for (const week of (schedule?.weeks ?? [])) {
    for (const game of (week?.games ?? [])) {
      const homeId = readId(game?.home ?? game?.homeId);
      const awayId = readId(game?.away ?? game?.awayId);
      const hs = Number(game?.homeScore ?? game?.scoreHome);
      const as = Number(game?.awayScore ?? game?.scoreAway);
      if (!ctx.has(homeId) || !ctx.has(awayId)) continue;
      if (!Number.isFinite(hs) || !Number.isFinite(as)) continue; // unplayed
      const home = teamById.get(homeId);
      const away = teamById.get(awayId);
      const homeOutcome = hs > as ? 'w' : hs < as ? 'l' : 't';
      const awayOutcome = hs > as ? 'l' : hs < as ? 'w' : 't';
      const hctx = ctx.get(homeId);
      const actx = ctx.get(awayId);
      bump(hctx.h2h, awayId, homeOutcome);
      bump(actx.h2h, homeId, awayOutcome);
      bump(hctx.opponents, awayId, homeOutcome);
      bump(actx.opponents, homeId, awayOutcome);
      if (Number(home.conf) === Number(away.conf)) {
        if (homeOutcome === 'w') hctx.confW++; else if (homeOutcome === 'l') hctx.confL++; else hctx.confT++;
        if (awayOutcome === 'w') actx.confW++; else if (awayOutcome === 'l') actx.confL++; else actx.confT++;
        if (Number(home.div) === Number(away.div)) {
          if (homeOutcome === 'w') hctx.divW++; else if (homeOutcome === 'l') hctx.divL++; else hctx.divT++;
          if (awayOutcome === 'w') actx.divW++; else if (awayOutcome === 'l') actx.divL++; else actx.divT++;
        }
      }
    }
  }

  for (const [id, c] of ctx) {
    const opps = [...c.opponents.keys()];
    c.sos = opps.length
      ? opps.reduce((acc, oid) => acc + (winPctById.get(oid) ?? 0.5), 0) / opps.length
      : 0.5;
  }
  return ctx;
}

// Pairwise NFL tiebreaker comparator. For teams tied on win%, walks the chain:
// head-to-head → division record → common games (min 4) → conference record →
// SOS → point diff/points (deterministic fallbacks) → seeded coin-flip.
// Note: 3+-way ties are resolved pairwise rather than via full mini-leagues — a
// pragmatic approximation that still honours the documented chain order.
export function makeStandingsComparator(ctx, seed) {
  return (a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    const ca = ctx.get(Number(a.id));
    const cb = ctx.get(Number(b.id));
    if (ca && cb) {
      // 1. Head-to-head.
      const ah = ca.h2h.get(Number(b.id));
      const bh = cb.h2h.get(Number(a.id));
      if (ah || bh) {
        const aPct = pctOf(ah?.w ?? 0, ah?.l ?? 0, ah?.t ?? 0);
        const bPct = pctOf(bh?.w ?? 0, bh?.l ?? 0, bh?.t ?? 0);
        if (aPct !== bPct) return bPct - aPct;
      }
      // 2. Division record (only meaningful within the same division).
      if (Number(a.div) === Number(b.div) && Number(a.conf) === Number(b.conf)) {
        const aDiv = pctOf(ca.divW, ca.divL, ca.divT);
        const bDiv = pctOf(cb.divW, cb.divL, cb.divT);
        if (aDiv !== bDiv) return bDiv - aDiv;
      }
      // 3. Common games (min 4 shared opponents).
      const common = [...ca.opponents.keys()].filter((oid) => cb.opponents.has(oid));
      if (common.length >= 4) {
        const tally = (c) => common.reduce((acc, oid) => {
          const r = c.opponents.get(oid) ?? { w: 0, l: 0, t: 0 };
          acc.w += r.w; acc.l += r.l; acc.t += r.t; return acc;
        }, { w: 0, l: 0, t: 0 });
        const at = tally(ca); const bt = tally(cb);
        const aPct = pctOf(at.w, at.l, at.t);
        const bPct = pctOf(bt.w, bt.l, bt.t);
        if (aPct !== bPct) return bPct - aPct;
      }
      // 4. Conference record.
      const aConf = pctOf(ca.confW, ca.confL, ca.confT);
      const bConf = pctOf(cb.confW, cb.confL, cb.confT);
      if (aConf !== bConf) return bConf - aConf;
      // 5. Strength of schedule.
      if (ca.sos !== cb.sos) return cb.sos - ca.sos;
    }
    // Deterministic fallbacks, then a seeded coin-flip.
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.ptsFor !== a.ptsFor) return b.ptsFor - a.ptsFor;
    return seededCoinKey(seed, a.id) - seededCoinKey(seed, b.id);
  };
}

/**
 * Sort flat standings rows with the full NFL tiebreaker chain. This is the
 * worker's entry point (its rows use `pct`/`pf`/`pa`): rows are enriched with
 * the comparator's field names, the tiebreak context is derived from the
 * played games in the slim schedule, and ordering is fully deterministic for
 * a given save (seeded coin-flip is the only post-SOS step).
 *
 * @param {Array<object>} rows - standings rows ({ id, conf, div, wins, losses,
 *   ties } plus `pct`/`pf`/`pa` or `winPct`/`ptsFor`/`ptsAgainst`)
 * @param {object|null} schedule - slim schedule ({ weeks: [{ games }] }) with
 *   homeScore/awayScore written on played games
 * @param {number} seed - per-save seed for the final deterministic coin-flip
 */
export function sortStandingsRows(rows = [], schedule = null, seed = 0) {
  const enriched = rows.map((row) => {
    const ptsFor = Number(row?.ptsFor ?? row?.pf ?? 0);
    const ptsAgainst = Number(row?.ptsAgainst ?? row?.pa ?? 0);
    return {
      ...row,
      winPct: Number(row?.winPct ?? row?.pct ?? 0),
      ptsFor,
      ptsAgainst,
      pointDiff: ptsFor - ptsAgainst,
    };
  });
  const ctx = buildTiebreakContext(enriched, schedule);
  return [...enriched].sort(makeStandingsComparator(ctx, Number(seed) || 0));
}

/**
 * @param {object} state - the raw league state (uses `standings` if present,
 *   otherwise `teams`)
 * @returns {{
 *   userTeamId: any,
 *   divisions: Array<{ conf:any, div:any, teams:Array<object> }>,     // sorted by win% → pointDiff → ptsFor
 *   conferences: Array<{ conf:any, teams:Array<object> }>,           // full conference standings
 *   playoffPicture: Array<{ conf:any, seeds:Array<object> }>,        // up to 7 seeds per conf, division winners first
 * }}
 */
export function prepareStandingsView(state) {
  const league = state ?? {};
  const userTeamId = league.userTeamId ?? null;
  const source = Array.isArray(league.standings) && league.standings.length > 0
    ? league.standings
    : (Array.isArray(league.teams) ? league.teams : []);
  const teams = source.map((t) => normalizeTeam(t, userTeamId));

  // NFL tiebreaker chain (head-to-head → division → common → conference → SOS →
  // seeded coin-flip), derived from played games when a schedule is present.
  const tiebreakCtx = buildTiebreakContext(teams, league.schedule);
  const seed = Number(league.globalSeed ?? league.seed ?? 0) || 0;
  const byRecord = makeStandingsComparator(tiebreakCtx, seed);

  // Group into divisions keyed by conf|div.
  const divMap = new Map();
  const confMap = new Map();
  for (const team of teams) {
    const divKey = `${team.conf}|${team.div}`;
    if (!divMap.has(divKey)) divMap.set(divKey, []);
    divMap.get(divKey).push(team);
    if (!confMap.has(team.conf)) confMap.set(team.conf, []);
    confMap.get(team.conf).push(team);
  }

  const divisions = [...divMap.entries()]
    .map(([key, list]) => {
      const [conf, div] = key.split('|');
      return { conf: list[0]?.conf ?? conf, div: list[0]?.div ?? div, teams: [...list].sort(byRecord) };
    })
    .sort((a, b) => (a.conf - b.conf) || (a.div - b.div));

  const conferences = [...confMap.entries()]
    .map(([conf, list]) => ({ conf, teams: [...list].sort(byRecord) }))
    .sort((a, b) => a.conf - b.conf);

  // Playoff picture: division winners seeded first, then best remaining (wild cards).
  const playoffPicture = conferences.map(({ conf, teams: confTeams }) => {
    const confDivisions = divisions.filter((d) => Number(d.conf) === Number(conf));
    const divisionWinners = confDivisions
      .map((d) => d.teams[0])
      .filter(Boolean)
      .sort(byRecord);
    const winnerIds = new Set(divisionWinners.map((t) => t.id));
    const wildCards = confTeams.filter((t) => !winnerIds.has(t.id)).sort(byRecord);
    const seeds = [...divisionWinners, ...wildCards].slice(0, 7).map((team, i) => ({
      seed: i + 1,
      ...team,
      clinchedDivision: winnerIds.has(team.id),
    }));
    return { conf, seeds };
  });

  return { userTeamId, divisions, conferences, playoffPicture };
}
