const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const toNum = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const avg = (rows = []) => (rows.length ? rows.reduce((sum, n) => sum + n, 0) / rows.length : 0);

const POSITION_GROUPS = Object.freeze([
  'QB',
  'RB',
  'WR',
  'TE',
  'OL',
  'DL_EDGE',
  'LB',
  'CB',
  'S',
  'KP',
]);

const GROUP_TO_POS = Object.freeze({
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  OL: ['OL', 'OT', 'OG', 'C', 'G', 'T'],
  DL_EDGE: ['DL', 'DE', 'DT', 'EDGE', 'NT'],
  LB: ['LB', 'MLB', 'OLB'],
  CB: ['CB'],
  S: ['S', 'SS', 'FS'],
  KP: ['K', 'P'],
});

const STARTER_TARGET = Object.freeze({
  QB: 1,
  RB: 1,
  WR: 3,
  TE: 1,
  OL: 5,
  DL_EDGE: 4,
  LB: 3,
  CB: 3,
  S: 2,
  KP: 2,
});

const DEPTH_TARGET = Object.freeze({
  QB: 2,
  RB: 3,
  WR: 5,
  TE: 2,
  OL: 7,
  DL_EDGE: 6,
  LB: 5,
  CB: 5,
  S: 4,
  KP: 2,
});

function calculateWinPct(team = {}) {
  const wins = toNum(team?.wins, 0);
  const losses = toNum(team?.losses, 0);
  const ties = toNum(team?.ties, 0);
  const games = wins + losses + ties;
  if (games <= 0) return 0.5;
  return (wins + ties * 0.5) / games;
}

function normalizeRoster(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(Boolean).map((p) => ({
    id: p.id,
    pos: String(p?.pos ?? '').toUpperCase(),
    age: toNum(p?.age, 27),
    ovr: toNum(p?.ovr, 60),
    potential: toNum(p?.potential, toNum(p?.ovr, 60)),
    yearsLeft: toNum(p?.contract?.yearsRemaining ?? p?.contract?.years ?? p?.years, 2),
    baseAnnual: toNum(p?.contract?.baseAnnual ?? p?.baseAnnual, 0),
  }));
}

function getPlayersForGroup(roster, group) {
  const accepted = new Set(GROUP_TO_POS[group] ?? []);
  return roster.filter((p) => accepted.has(p.pos)).sort((a, b) => b.ovr - a.ovr);
}

function getNeedSeverity(priority) {
  if (priority >= 78) return 'critical';
  if (priority >= 62) return 'high';
  if (priority >= 42) return 'medium';
  return 'low';
}

function buildPositionalNeed(group, roster, archetype = 'middle') {
  const players = getPlayersForGroup(roster, group);
  const starterTarget = STARTER_TARGET[group] ?? 1;
  const depthTarget = DEPTH_TARGET[group] ?? starterTarget + 1;
  const starters = players.slice(0, starterTarget);
  const depth = players.slice(0, depthTarget);
  const starterQuality = Math.round(avg(starters.map((p) => p.ovr)));
  const depthQuality = Math.round(avg(depth.map((p) => p.ovr)));
  const missingStarters = Math.max(0, starterTarget - starters.length);
  const missingDepth = Math.max(0, depthTarget - depth.length);
  const ageRisk = Math.round(avg(depth.map((p) => clamp((p.age - 27) * 9, 0, 100))));
  const contractRisk = Math.round(avg(depth.map((p) => (p.yearsLeft <= 1 ? 70 : p.yearsLeft <= 2 ? 40 : 16))));

  const starterGap = clamp(78 - starterQuality, 0, 100);
  const depthGap = clamp(72 - depthQuality, 0, 100);
  let priority = Math.round(
    starterGap * 0.48 +
    depthGap * 0.24 +
    ageRisk * 0.16 +
    contractRisk * 0.12 +
    missingStarters * 18 +
    missingDepth * 6,
  );

  if (group === 'QB') priority = Math.round(priority * 1.35);
  if (group === 'KP') priority = Math.round(priority * 0.7);
  if (archetype === 'contender' && ['OL', 'DL_EDGE', 'CB', 'S', 'QB'].includes(group)) priority += 8;
  if (['rebuild', 'development'].includes(archetype) && ['QB', 'WR', 'CB', 'DL_EDGE', 'OL'].includes(group)) priority += 10;

  priority = clamp(priority, 0, 100);
  const severity = getNeedSeverity(priority);
  const reason = missingStarters > 0
    ? `${group} has missing starter slots.`
    : `${group} starter ${starterQuality || 0} OVR, depth ${depthQuality || 0} OVR.`;

  return {
    positionGroup: group,
    severity,
    starterQuality,
    depthQuality,
    ageRisk,
    contractRisk,
    priority,
    reason,
  };
}

function classifyArchetype({ winPct, rosterStrength, capHealth, qbNeedPriority }) {
  if (winPct >= 0.67 && rosterStrength >= 74 && qbNeedPriority < 62) return 'contender';
  if (winPct >= 0.55 && rosterStrength >= 70) return 'playoff_hunt';
  if (winPct <= 0.32 && (capHealth <= 45 || qbNeedPriority >= 70)) return 'rebuild';
  if (winPct <= 0.4 && rosterStrength < 66) return 'development';
  if (winPct <= 0.45 || capHealth <= 35) return 'retool';
  return 'middle';
}

function getPriorityWeights(archetype = 'middle') {
  if (archetype === 'contender') {
    return { immediateStarterNeed: 1.25, upside: 0.65, capFlex: 0.75, pickValue: 0.9 };
  }
  if (archetype === 'playoff_hunt') {
    return { immediateStarterNeed: 1.1, upside: 0.8, capFlex: 0.9, pickValue: 0.95 };
  }
  if (archetype === 'retool') {
    return { immediateStarterNeed: 0.95, upside: 1.0, capFlex: 1.1, pickValue: 1.05 };
  }
  if (archetype === 'rebuild') {
    return { immediateStarterNeed: 0.75, upside: 1.25, capFlex: 1.2, pickValue: 1.2 };
  }
  if (archetype === 'development') {
    return { immediateStarterNeed: 0.7, upside: 1.3, capFlex: 1.15, pickValue: 1.15 };
  }
  return { immediateStarterNeed: 1.0, upside: 1.0, capFlex: 1.0, pickValue: 1.0 };
}

function buildDraftCapital(team = {}, year = null) {
  const picks = Array.isArray(team?.picks) ? team.picks : [];
  const relevant = picks.filter((pk) => (year == null ? true : toNum(pk?.season ?? pk?.year, year) >= year));
  const score = relevant.reduce((sum, pk) => {
    const round = toNum(pk?.round, 7);
    if (round <= 1) return sum + 28;
    if (round <= 2) return sum + 16;
    if (round <= 3) return sum + 10;
    if (round <= 5) return sum + 5;
    return sum + 2;
  }, 0);
  return {
    pickCount: relevant.length,
    score: clamp(score, 0, 100),
    earlyPicks: relevant.filter((pk) => toNum(pk?.round, 7) <= 2).length,
  };
}

export function buildAiTeamStrategy({
  team = {},
  roster = [],
  league = {},
  phase = null,
  year = null,
} = {}) {
  const normalizedRoster = normalizeRoster(roster);
  const winPct = calculateWinPct(team);
  const capRoom = toNum(team?.capRoom, 0);
  const deadCap = toNum(team?.deadCap, 0);
  const capUsed = toNum(team?.capUsed, 0);
  const capHealth = clamp(Math.round(60 + capRoom * 2 - deadCap * 2 - Math.max(0, capUsed - 295) * 1.1), 0, 100);
  const rosterStrength = Math.round(avg(normalizedRoster.map((p) => p.ovr)));
  const ageCurve = {
    avgAge: Number(avg(normalizedRoster.map((p) => p.age)).toFixed(1)),
    youthShare: normalizedRoster.length ? Number((normalizedRoster.filter((p) => p.age <= 24).length / normalizedRoster.length).toFixed(2)) : 0,
    veteranShare: normalizedRoster.length ? Number((normalizedRoster.filter((p) => p.age >= 30).length / normalizedRoster.length).toFixed(2)) : 0,
  };
  const qBPlaceholderNeeds = buildPositionalNeed('QB', normalizedRoster, 'middle').priority;
  const archetype = classifyArchetype({ winPct, rosterStrength, capHealth, qbNeedPriority: qBPlaceholderNeeds });
  const positionalNeeds = POSITION_GROUPS.map((group) => buildPositionalNeed(group, normalizedRoster, archetype)).sort((a, b) => b.priority - a.priority);
  const topNeed = positionalNeeds[0] ?? null;
  const draftCapital = buildDraftCapital(team, year ?? toNum(league?.year, null));
  const priorityWeights = getPriorityWeights(archetype);
  const riskTolerance = archetype === 'contender' ? 'high' : ['rebuild', 'development'].includes(archetype) ? 'low' : 'medium';
  const competitiveWindow = archetype === 'contender'
    ? 'win_now'
    : archetype === 'playoff_hunt'
      ? 'push_now'
      : ['rebuild', 'development'].includes(archetype)
        ? 'future'
        : 'balanced';
  const shouldBuy = ['contender', 'playoff_hunt'].includes(archetype) && capHealth >= 35;
  const shouldSell = ['rebuild', 'development', 'retool'].includes(archetype) && topNeed?.priority >= 52;
  const shouldDevelop = ['rebuild', 'development', 'middle', 'retool'].includes(archetype);

  const reasons = [
    `Record profile ${(winPct * 100).toFixed(1)}% win pace.`,
    `Roster strength ${rosterStrength || 0} OVR with cap health ${capHealth}.`,
    topNeed ? `Top need ${topNeed.positionGroup} (${topNeed.severity}).` : 'No clear top need.',
  ];

  return {
    teamId: team?.id ?? null,
    teamAbbr: team?.abbr ?? null,
    year: year ?? league?.year ?? null,
    phase: phase ?? league?.phase ?? null,
    archetype,
    competitiveWindow,
    rosterStrength,
    positionalNeeds,
    capHealth,
    ageCurve,
    draftCapital,
    priorityWeights,
    riskTolerance,
    shouldBuy,
    shouldSell,
    shouldDevelop,
    summary: `${team?.abbr ?? 'Team'} projects as ${archetype} with ${topNeed?.positionGroup ?? 'balanced'} needs.`,
    reasons,
  };
}

export function buildAiTeamStrategyFromRosterAnalysis({
  team = {},
  analysis = null,
  league = {},
  phase = null,
  year = null,
} = {}) {
  const fallbackRoster = Array.isArray(team?.roster) ? team.roster : [];
  const roster = Array.isArray(analysis?.roster) ? analysis.roster : fallbackRoster;
  return buildAiTeamStrategy({ team, roster, league, phase, year });
}

export const __internal = Object.freeze({
  POSITION_GROUPS,
  GROUP_TO_POS,
  STARTER_TARGET,
  DEPTH_TARGET,
  classifyArchetype,
  buildPositionalNeed,
});

