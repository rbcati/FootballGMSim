const POSITION_HOF_BASELINE = {
  QB: 12000,
  RB: 8000,
  WR: 9000,
  TE: 7000,
  DL: 220,
  LB: 260,
  CB: 180,
  S: 160,
};

function blankRecord() {
  return { holderId: null, holderName: null, teamId: null, teamAbbr: null, season: null, value: 0, detail: null };
}

const RECORD_CATEGORIES = [
  { key: 'passYd', label: 'Passing Yards', stat: 'passYd' },
  { key: 'passTD', label: 'Passing TD', stat: 'passTD' },
  { key: 'rushYd', label: 'Rushing Yards', stat: 'rushYd' },
  { key: 'rushTD', label: 'Rushing TD', stat: 'rushTD' },
  { key: 'recYd', label: 'Receiving Yards', stat: 'recYd' },
  { key: 'recTD', label: 'Receiving TD', stat: 'recTD' },
  { key: 'tackles', label: 'Tackles', stat: 'tackles' },
  { key: 'sacks', label: 'Sacks', stat: 'sacks' },
  { key: 'interceptions', label: 'Interceptions', stat: 'interceptions' },
];

export function createLeagueMemoryDefaults() {
  return {
    leagueHistory: [],
    seasonStorylines: [],
    hallOfFame: { classes: [], index: {} },
    franchiseHistoryByTeam: {},
    recordBook: {
      singleGame: Object.fromEntries(RECORD_CATEGORIES.map((c) => [c.key, blankRecord()])),
      singleSeason: Object.fromEntries(RECORD_CATEGORIES.map((c) => [c.key, blankRecord()])),
      career: Object.fromEntries(RECORD_CATEGORIES.map((c) => [c.key, blankRecord()])),
      team: {
        winsSeason: blankRecord(),
        championships: blankRecord(),
        playoffStreak: blankRecord(),
      },
      franchiseByTeam: {},
      history: [],
    },
  };
}

export function ensureLeagueMemoryMeta(meta = {}) {
  const defaults = createLeagueMemoryDefaults();
  return {
    ...meta,
    leagueHistory: Array.isArray(meta.leagueHistory) ? meta.leagueHistory : defaults.leagueHistory,
    seasonStorylines: Array.isArray(meta.seasonStorylines) ? meta.seasonStorylines : defaults.seasonStorylines,
    hallOfFame: {
      classes: Array.isArray(meta?.hallOfFame?.classes) ? meta.hallOfFame.classes : defaults.hallOfFame.classes,
      index: meta?.hallOfFame?.index && typeof meta.hallOfFame.index === 'object' ? meta.hallOfFame.index : defaults.hallOfFame.index,
    },
    franchiseHistoryByTeam: meta?.franchiseHistoryByTeam && typeof meta.franchiseHistoryByTeam === 'object' ? meta.franchiseHistoryByTeam : defaults.franchiseHistoryByTeam,
    recordBook: {
      ...defaults.recordBook,
      ...(meta.recordBook || {}),
      singleGame: { ...defaults.recordBook.singleGame, ...(meta?.recordBook?.singleGame || {}) },
      singleSeason: { ...defaults.recordBook.singleSeason, ...(meta?.recordBook?.singleSeason || {}) },
      career: { ...defaults.recordBook.career, ...(meta?.recordBook?.career || {}) },
      team: { ...defaults.recordBook.team, ...(meta?.recordBook?.team || {}) },
      franchiseByTeam: meta?.recordBook?.franchiseByTeam && typeof meta.recordBook.franchiseByTeam === 'object' ? meta.recordBook.franchiseByTeam : {},
      history: Array.isArray(meta?.recordBook?.history) ? meta.recordBook.history : [],
    },
  };
}

export function buildSeasonStorylineSnapshot(memoryMeta, teams, userTeamId) {
  const history = memoryMeta.leagueHistory;
  const latest = history[history.length - 1] ?? null;
  if (!latest) return [];
  const champId = latest?.champion?.id;
  const teamHistory = memoryMeta.franchiseHistoryByTeam[String(champId)] || null;
  const teamObj = teams.find((t) => Number(t.id) === Number(champId));
  const championName = latest?.champion?.name || teamObj?.name || 'Unknown';
  const droughtRows = Object.entries(memoryMeta.franchiseHistoryByTeam)
    .map(([teamId, item]) => {
      const lastTitle = item?.lastChampionshipYear ?? null;
      return { teamId: Number(teamId), years: lastTitle == null ? latest.year - 2024 : Math.max(0, latest.year - lastTitle) };
    })
    .sort((a, b) => b.years - a.years)
    .slice(0, 3);

  const userHistory = memoryMeta.franchiseHistoryByTeam[String(userTeamId)] || null;
  return [
    {
      id: `champ-${latest.year}`,
      title: `Defending champion: ${championName}`,
      detail: teamHistory?.totals?.championships > 1
        ? `${championName} now has ${teamHistory.totals.championships} total championships.`
        : `${championName} enters ${latest.year + 1} as the reigning champion.`,
      tone: 'warning',
      category: 'dynasty',
      tab: 'League History',
    },
    {
      id: `drought-${latest.year}`,
      title: 'Longest title droughts',
      detail: droughtRows.map((r) => {
        const t = teams.find((x) => Number(x.id) === Number(r.teamId));
        return `${t?.abbr ?? r.teamId}: ${r.years}y`;
      }).join(' · '),
      tone: 'info',
      category: 'drought',
      tab: 'League History',
    },
    userHistory ? {
      id: `user-arc-${latest.year}`,
      title: 'Your franchise arc',
      detail: `${userHistory.totals.playoffAppearances} playoff trips, ${userHistory.totals.championships} titles, best ${userHistory.bestSeason?.wins ?? 0}-${userHistory.bestSeason?.losses ?? 0}.`,
      tone: 'ok',
      category: 'franchise_arc',
      tab: 'Team',
    } : null,
  ].filter(Boolean);
}

export function buildSeasonArchiveSummary({ year, seasonId, standings, awards, leaders, champion, runnerUp, userTeamId, transactions = [] }) {
  const sorted = [...(standings || [])].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
  const userRow = sorted.find((t) => Number(t.id) === Number(userTeamId)) || null;
  return {
    id: seasonId,
    year,
    champion,
    runnerUp,
    standings: sorted,
    awards,
    leaders,
    playoffSummary: {
      finals: champion && runnerUp ? `${champion.abbr} over ${runnerUp.abbr}` : null,
      wins: champion?.wins ?? null,
    },
    userTeamSummary: userRow ? {
      teamId: userRow.id,
      record: `${userRow.wins}-${userRow.losses}${userRow.ties ? `-${userRow.ties}` : ''}`,
      pointsFor: userRow.pf ?? 0,
      pointsAgainst: userRow.pa ?? 0,
      playoffLikely: (userRow.wins ?? 0) >= 10,
    } : null,
    majorTransactions: (transactions || []).slice(0, 8),
  };
}

export function updateFranchiseHistory(memoryMeta, seasonSummary, teams) {
  const next = { ...memoryMeta.franchiseHistoryByTeam };
  const seasonYear = Number(seasonSummary?.year ?? 0);
  for (const standing of seasonSummary?.standings || []) {
    const key = String(standing.id);
    const existing = next[key] || {
      teamId: standing.id,
      teamName: standing.name,
      totals: { wins: 0, losses: 0, ties: 0, championships: 0, playoffAppearances: 0, seasons: 0 },
      seasons: [],
      milestones: [],
      bestSeason: null,
      worstSeason: null,
      lastChampionshipYear: null,
    };
    const row = {
      year: seasonYear,
      wins: standing.wins ?? 0,
      losses: standing.losses ?? 0,
      ties: standing.ties ?? 0,
      pf: standing.pf ?? 0,
      pa: standing.pa ?? 0,
      madePlayoffs: (standing.wins ?? 0) >= 10,
      champion: Number(seasonSummary?.champion?.id) === Number(standing.id),
    };
    existing.seasons = [...existing.seasons.filter((s) => s.year !== seasonYear), row].sort((a, b) => a.year - b.year).slice(-120);
    existing.totals.wins += row.wins;
    existing.totals.losses += row.losses;
    existing.totals.ties += row.ties;
    existing.totals.seasons += 1;
    if (row.madePlayoffs) existing.totals.playoffAppearances += 1;
    if (row.champion) {
      existing.totals.championships += 1;
      existing.lastChampionshipYear = seasonYear;
      existing.milestones = [...existing.milestones, { year: seasonYear, type: 'title', text: `${standing.name} won the championship` }].slice(-60);
    }
    if (!existing.bestSeason || row.wins > existing.bestSeason.wins) existing.bestSeason = row;
    if (!existing.worstSeason || row.wins < existing.worstSeason.wins) existing.worstSeason = row;
    next[key] = existing;
  }
  return { ...memoryMeta, franchiseHistoryByTeam: next };
}

function sumCareer(players, stat) {
  let best = null;
  for (const p of players) {
    const total = (p.careerStats || []).reduce((s, line) => s + Number(line?.[stat] ?? 0), 0);
    if (!best || total > best.value) best = { p, value: total };
  }
  return best;
}

export function updateRecordBook(memoryMeta, { seasonStats = [], allPlayers = [], year, standings = [] }) {
  const next = structuredClone(memoryMeta.recordBook);
  const broken = [];
  for (const cat of RECORD_CATEGORIES) {
    const seasonBest = seasonStats.reduce((best, s) => {
      const val = Number(s?.totals?.[cat.stat] ?? 0);
      if (val > (best?.value ?? -1)) return { s, value: val };
      return best;
    }, null);
    if (seasonBest && seasonBest.value > Number(next.singleSeason?.[cat.key]?.value ?? 0)) {
      next.singleSeason[cat.key] = {
        holderId: seasonBest.s.playerId,
        holderName: seasonBest.s.name,
        teamId: seasonBest.s.teamId,
        season: year,
        value: seasonBest.value,
      };
      broken.push({ category: cat.label, value: seasonBest.value, holder: seasonBest.s.name, scope: 'single-season', year });
    }

    const career = sumCareer(allPlayers, `${cat.stat}${cat.stat.endsWith('TD') ? 's' : cat.stat.endsWith('Yd') ? 's' : ''}`);
    if (career && career.value > Number(next.career?.[cat.key]?.value ?? 0)) {
      next.career[cat.key] = {
        holderId: career.p.id,
        holderName: career.p.name,
        teamId: career.p.teamId,
        season: year,
        value: career.value,
      };
      broken.push({ category: cat.label, value: career.value, holder: career.p.name, scope: 'career', year });
    }
  }

  const bestWins = standings.reduce((best, t) => ((t.wins ?? 0) > (best?.value ?? -1) ? { teamId: t.id, teamAbbr: t.abbr, season: year, value: t.wins } : best), null);
  if (bestWins && bestWins.value > Number(next.team.winsSeason?.value ?? 0)) {
    next.team.winsSeason = { ...blankRecord(), ...bestWins };
  }
  next.history = [...next.history, ...broken].slice(-250);
  return { ...memoryMeta, recordBook: next, recordEvents: broken };
}

export function evaluateHallOfFameCandidate(player, year) {
  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];
  const careerStats = Array.isArray(player?.careerStats) ? player.careerStats : [];
  const seasons = careerStats.length;
  const statTotal = player.pos === 'QB'
    ? careerStats.reduce((s, line) => s + Number(line?.passYds ?? 0), 0)
    : player.pos === 'RB'
      ? careerStats.reduce((s, line) => s + Number(line?.rushYds ?? 0), 0)
      : ['WR', 'TE'].includes(player.pos)
        ? careerStats.reduce((s, line) => s + Number(line?.recYds ?? 0), 0)
        : careerStats.reduce((s, line) => s + Number(line?.tackles ?? 0) + Number(line?.sacks ?? 0) * 8, 0);

  const baseline = POSITION_HOF_BASELINE[player.pos] ?? 9000;
  const mvps = accolades.filter((a) => a.type === 'MVP').length;
  const titles = accolades.filter((a) => a.type === 'SB_RING').length;
  const peak = careerStats.reduce((m, line) => Math.max(m, Number(line?.ovr ?? 0)), Number(player?.ovr ?? 0));
  const score = (statTotal / baseline) * 60 + mvps * 12 + titles * 8 + Math.max(0, seasons - 8) * 1.5 + Math.max(0, peak - 82);
  const inducted = score >= 78;
  const reasons = [];
  if (statTotal >= baseline) reasons.push('Elite career production for position');
  if (mvps > 0) reasons.push(`${mvps} MVP award${mvps > 1 ? 's' : ''}`);
  if (titles > 0) reasons.push(`${titles} championship ring${titles > 1 ? 's' : ''}`);
  if (seasons >= 10) reasons.push(`Long career (${seasons} seasons)`);
  if (peak >= 92) reasons.push(`Peak dominance (OVR ${peak})`);
  return { inducted, score: Math.round(score * 10) / 10, reasons: reasons.slice(0, 4), year };
}

export function addHallOfFameClass(memoryMeta, classYear, inductees) {
  if (!inductees?.length) return memoryMeta;
  const classes = [...memoryMeta.hallOfFame.classes.filter((c) => c.year !== classYear), { year: classYear, inductees }]
    .sort((a, b) => b.year - a.year);
  const index = { ...memoryMeta.hallOfFame.index };
  for (const ind of inductees) index[String(ind.playerId)] = ind;
  return { ...memoryMeta, hallOfFame: { classes, index } };
}
