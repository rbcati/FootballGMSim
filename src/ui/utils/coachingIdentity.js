import { OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES, computeTeamSchemeFits } from '../../core/scheme-core.js';

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePosition(pos) {
  const p = String(pos ?? '').toUpperCase();
  if (['HB', 'FB'].includes(p)) return 'RB';
  if (['OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'].includes(p)) return 'OL';
  if (['DE', 'DT', 'NT', 'EDGE', 'IDL'].includes(p)) return 'DL';
  if (['MLB', 'OLB', 'ILB'].includes(p)) return 'LB';
  if (['FS', 'SS', 'DB'].includes(p)) return 'S';
  return p;
}

function offenseLabel(id) {
  const scheme = OFFENSIVE_SCHEMES[id] ?? OFFENSIVE_SCHEMES.WEST_COAST;
  if (scheme.id === 'VERTICAL') return 'Pass-heavy explosive offense';
  if (scheme.id === 'SMASHMOUTH') return 'Run-first / ball-control offense';
  return 'Timing-and-efficiency offense';
}

function defenseLabel(id) {
  const scheme = DEFENSIVE_SCHEMES[id] ?? DEFENSIVE_SCHEMES.COVER_2;
  if (scheme.id === 'BLITZ_34') return 'Aggressive pressure defense';
  if (scheme.id === 'MAN_COVERAGE') return 'Press-man disruption defense';
  return 'Bend-don’t-break zone defense';
}

function deriveSeatStatus({ pressure, winPct, direction }) {
  const ownerScore = safeNum(pressure?.owner?.score, 60);
  const mediaScore = safeNum(pressure?.media?.score, 45);
  if (ownerScore < 36 || mediaScore >= 78) return { level: 'hot', label: 'Hot seat' };
  if (ownerScore < 52 || (direction === 'contender' && winPct < 0.45)) return { level: 'uneasy', label: 'Under review' };
  if (ownerScore >= 70 && winPct >= 0.55) return { level: 'secure', label: 'Secure' };
  return { level: 'steady', label: 'Steady' };
}

function toTenureYears(staffMember) {
  const fromYears = safeNum(staffMember?.yearsWithTeam ?? staffMember?.tenure ?? staffMember?.teamYears, 0);
  if (fromYears > 0) return fromYears;
  const teamHistory = staffMember?.stats?.teamHistory;
  if (Array.isArray(teamHistory) && teamHistory.length > 0) return teamHistory.length;
  const contractYears = safeNum(staffMember?.years ?? staffMember?.contractYears, 0);
  return contractYears > 0 ? 1 : 0;
}

function buildStaffRows(team, seat) {
  const staff = team?.staff ?? {};
  const strategies = team?.strategies ?? {};
  const hc = staff?.headCoach ?? null;
  const oc = staff?.offCoordinator ?? staff?.offCoord ?? null;
  const dc = staff?.defCoordinator ?? staff?.defCoord ?? null;

  const offSchemeId = strategies?.offSchemeId ?? hc?.offScheme ?? 'WEST_COAST';
  const defSchemeId = strategies?.defSchemeId ?? hc?.defScheme ?? 'COVER_2';

  const rows = [
    {
      role: 'Head Coach',
      person: hc,
      philosophy: `${offenseLabel(offSchemeId)} · ${defenseLabel(defSchemeId)}`,
      leaning: hc?.offenseMind > hc?.defenseMind ? 'Offense-leaning' : hc?.defenseMind > hc?.offenseMind ? 'Defense-leaning' : 'Balanced',
      seat: seat.label,
    },
    {
      role: 'Offensive Coordinator',
      person: oc,
      philosophy: offenseLabel(offSchemeId),
      leaning: 'Offense',
      seat: seat.level === 'hot' ? 'Poachable / volatile' : 'Aligned',
    },
    {
      role: 'Defensive Coordinator',
      person: dc,
      philosophy: defenseLabel(defSchemeId),
      leaning: 'Defense',
      seat: seat.level === 'hot' ? 'Poachable / volatile' : 'Aligned',
    },
  ];

  return rows.map((row) => {
    const tenure = row.person ? toTenureYears(row.person) : 0;
    return {
      ...row,
      name: row.person?.name ?? 'Vacant / interim',
      rating: safeNum(row.person?.rating, null),
      tenure,
      tenureLabel: tenure > 0 ? `${tenure}y in current regime` : 'New / interim',
      style: row.person?.archetype ?? row.person?.perk ?? null,
    };
  });
}

function getSchemeFitSummary(team) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  if (!roster.length) return null;
  const strategies = team?.strategies ?? {};
  const hc = team?.staff?.headCoach;
  const offSchemeId = strategies?.offSchemeId ?? hc?.offScheme ?? 'WEST_COAST';
  const defSchemeId = strategies?.defSchemeId ?? hc?.defScheme ?? 'COVER_2';
  const fits = computeTeamSchemeFits(roster, offSchemeId, defSchemeId);

  let good = 0;
  let poor = 0;
  const posFit = new Map();
  for (const fit of fits) {
    if (fit.schemeFit >= 72) good += 1;
    if (fit.schemeFit <= 45) poor += 1;
    const p = roster.find((r) => r.id === fit.playerId);
    const pos = normalizePosition(p?.pos);
    if (!pos) continue;
    if (!posFit.has(pos)) posFit.set(pos, []);
    posFit.get(pos).push(fit.schemeFit);
  }

  const avgFor = (pos) => {
    const vals = posFit.get(pos) ?? [];
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const top = [...posFit.entries()]
    .map(([pos, vals]) => ({ pos, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => b.avg - a.avg)[0] ?? null;
  const bottom = [...posFit.entries()]
    .map(([pos, vals]) => ({ pos, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => a.avg - b.avg)[0] ?? null;

  return {
    good,
    poor,
    top,
    bottom,
    qbFit: avgFor('QB'),
    wrFit: avgFor('WR'),
    dlFit: avgFor('DL'),
    cbFit: avgFor('CB'),
  };
}

function computeContinuity({ rows, pressure, winPct, direction }) {
  const staffedCount = rows.filter((r) => r.person).length;
  const avgTenure = staffedCount > 0
    ? rows.filter((r) => r.person).reduce((sum, r) => sum + r.tenure, 0) / staffedCount
    : 0;

  let state = 'transition';
  let label = 'In transition';
  if (staffedCount >= 3 && avgTenure >= 2.5) {
    state = 'stable';
    label = 'Staff continuity';
  } else if (staffedCount >= 2 && avgTenure >= 1.2) {
    state = 'blended';
    label = 'Partial continuity';
  }

  const tags = [];
  if (avgTenure < 1.2) tags.push('New regime');
  if (!rows[1]?.person) tags.push('Offensive reset');
  if (!rows[2]?.person) tags.push('Defensive reset');
  if (winPct < 0.4 && safeNum(pressure?.owner?.score, 60) < 52) tags.push('Coaching heat rising');
  if (direction === 'contender' && winPct >= 0.58 && safeNum(pressure?.owner?.score, 60) >= 65) tags.push('Playoff staff retained');

  const detail = state === 'stable'
    ? 'Core staff has returned enough seasons to establish system continuity.'
    : state === 'blended'
      ? 'Leadership is mostly intact, but one side of the ball is still settling.'
      : 'The staff structure is still changing, and weekly identity may swing with results.';

  return { state, label, detail, avgTenure, tags: tags.slice(0, 3) };
}

export function deriveTeamCoachingIdentity(team, { pressure = null, intel = null, direction = 'balanced' } = {}) {
  if (!team) return null;
  const wins = safeNum(team?.wins, 0);
  const losses = safeNum(team?.losses, 0);
  const ties = safeNum(team?.ties, 0);
  const games = Math.max(1, wins + losses + ties);
  const winPct = (wins + 0.5 * ties) / games;

  const seat = deriveSeatStatus({ pressure, winPct, direction });
  const staffRows = buildStaffRows(team, seat);
  const fit = getSchemeFitSummary(team);
  const continuity = computeContinuity({ rows: staffRows, pressure, winPct, direction });

  const rosterFitNotes = [];
  if (fit?.top?.pos) rosterFitNotes.push(`Strong fit with current ${fit.top.pos} room.`);
  if (fit?.bottom?.pos && fit.bottom.avg <= 56) rosterFitNotes.push(`${fit.bottom.pos} lacks pieces for current fronts/coverages.`);
  if (fit?.qbFit != null) {
    if (fit.qbFit >= 72) rosterFitNotes.push('QB fit supports current coaching timeline.');
    else if (fit.qbFit <= 55) rosterFitNotes.push('QB development timeline may clash with current staff plan.');
  }
  if ((intel?.needsNow ?? []).length > 0) {
    rosterFitNotes.push(`Draft/FA fit priority: ${intel.needsNow.slice(0, 2).map((n) => n.pos).join(', ')}.`);
  }

  const offSchemeId = team?.strategies?.offSchemeId ?? team?.staff?.headCoach?.offScheme ?? 'WEST_COAST';
  const defSchemeId = team?.strategies?.defSchemeId ?? team?.staff?.headCoach?.defScheme ?? 'COVER_2';

  const teamTone = direction === 'contender'
    ? 'Win-now operations tone'
    : direction === 'rebuilding'
      ? 'Youth-development operations tone'
      : 'Direction-setting operations tone';

  return {
    seat,
    staffRows,
    continuity,
    fit,
    teamTone,
    philosophy: {
      offense: offenseLabel(offSchemeId),
      defense: defenseLabel(defSchemeId),
      offSchemeName: OFFENSIVE_SCHEMES[offSchemeId]?.name ?? offSchemeId,
      defSchemeName: DEFENSIVE_SCHEMES[defSchemeId]?.name ?? defSchemeId,
    },
    rosterFitNotes: rosterFitNotes.slice(0, 4),
  };
}

export function buildCoachingNarrativeCards(league, { limit = 4 } = {}) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  if (!teams.length) return [];

  const cards = [];
  for (const team of teams) {
    const wins = safeNum(team?.wins, 0);
    const losses = safeNum(team?.losses, 0);
    const ties = safeNum(team?.ties, 0);
    const games = Math.max(1, wins + losses + ties);
    const winPct = (wins + 0.5 * ties) / games;
    const staff = team?.staff ?? {};
    const hc = staff?.headCoach ?? null;
    const oc = staff?.offCoordinator ?? staff?.offCoord ?? null;
    const dc = staff?.defCoordinator ?? staff?.defCoord ?? null;
    const tenure = toTenureYears(hc);

    if (!hc) {
      cards.push({
        id: `coach-vacant-${team.id}`,
        title: `${team.abbr ?? team.name} still searching for sideline identity`,
        detail: 'Head-coach seat is unsettled and coordinators are operating under interim pressure.',
        priority: 92,
        tone: 'danger',
        category: 'coaching_carousel',
        tab: 'Coaches',
        teamId: team.id,
      });
      continue;
    }

    if (winPct <= 0.32 && safeNum(hc?.rating, 70) <= 72) {
      cards.push({
        id: `coach-hot-${team.id}`,
        title: `${team.abbr ?? team.name} HC ${hc.name} on hot seat`,
        detail: `${team.name} are ${wins}-${losses}${ties ? `-${ties}` : ''} and pressure is mounting around the current regime.`,
        priority: 90,
        tone: 'danger',
        category: 'coaching_carousel',
        tab: 'News',
        teamId: team.id,
      });
    }

    if (winPct >= 0.6 && tenure >= 2) {
      cards.push({
        id: `coach-retained-${team.id}`,
        title: `${team.abbr ?? team.name} staff continuity paying off`,
        detail: `${hc.name}'s regime (year ${tenure}) has kept both sides of the ball aligned in a playoff-caliber push.`,
        priority: 78,
        tone: 'success',
        category: 'coaching_continuity',
        tab: 'Coaches',
        teamId: team.id,
      });
    }

    if (oc && safeNum(oc?.rating, 70) >= 84 && winPct >= 0.55) {
      cards.push({
        id: `coach-poach-${team.id}`,
        title: `${team.abbr ?? team.name} OC drawing HC interest`,
        detail: `${oc.name} is emerging as a likely carousel candidate after this season.`,
        priority: 74,
        tone: 'warning',
        category: 'coaching_carousel',
        tab: 'Coaches',
        teamId: team.id,
      });
    }

    if ((!oc || !dc) && winPct >= 0.45 && winPct <= 0.58) {
      cards.push({
        id: `coach-transition-${team.id}`,
        title: `${team.abbr ?? team.name} balancing results with staff transition`,
        detail: 'Coordinator turnover is shaping weekly identity and game-plan stability.',
        priority: 70,
        tone: 'info',
        category: 'coaching_transition',
        tab: 'Staff',
        teamId: team.id,
      });
    }
  }

  return cards.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, limit);
}
