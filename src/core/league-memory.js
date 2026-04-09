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

const REVIEW_PREMIUM_POSITIONS = new Set(['QB', 'WR', 'OT', 'EDGE', 'DE', 'CB']);

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pct(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function toGrade(score = 60) {
  if (score >= 92) return 'A';
  if (score >= 85) return 'B';
  if (score >= 77) return 'C';
  if (score >= 68) return 'D';
  return 'F';
}

function sumTotals(statsRows = [], key) {
  return statsRows.reduce((sum, row) => sum + Number(row?.totals?.[key] ?? 0), 0);
}

function buildTeamSeasonMetrics(teamId, teamRows = [], standingsRow = null) {
  const passAtt = sumTotals(teamRows, 'passAtt');
  const passComp = sumTotals(teamRows, 'passComp');
  const passYd = sumTotals(teamRows, 'passYd');
  const passTD = sumTotals(teamRows, 'passTD');
  const interceptionsThrown = sumTotals(teamRows, 'interceptions');
  const sacksAllowed = sumTotals(teamRows, 'sacksAllowed');
  const rushAtt = sumTotals(teamRows, 'rushAtt');
  const rushYd = sumTotals(teamRows, 'rushYd');
  const rushTD = sumTotals(teamRows, 'rushTD');
  const recTargets = sumTotals(teamRows, 'targets');
  const receptions = sumTotals(teamRows, 'receptions');
  const recYd = sumTotals(teamRows, 'recYd');
  const recTD = sumTotals(teamRows, 'recTD');
  const tackles = sumTotals(teamRows, 'tackles');
  const sacks = sumTotals(teamRows, 'sacks');
  const defInts = sumTotals(teamRows, 'interceptionsDef') + sumTotals(teamRows, 'interceptionsMade');
  const forcedFumbles = sumTotals(teamRows, 'forcedFumbles');
  const fumbleRecoveries = sumTotals(teamRows, 'fumbleRecoveries');
  const penalties = sumTotals(teamRows, 'penalties');
  const games = Math.max(1, Number(standingsRow?.wins ?? 0) + Number(standingsRow?.losses ?? 0) + Number(standingsRow?.ties ?? 0));
  const pointsFor = Number(standingsRow?.pf ?? standingsRow?.ptsFor ?? 0);
  const pointsAgainst = Number(standingsRow?.pa ?? standingsRow?.ptsAgainst ?? 0);
  const explosivePasses = teamRows.reduce((sum, row) => {
    const yd = Number(row?.totals?.recYd ?? 0);
    const catches = Number(row?.totals?.receptions ?? 0);
    const approx = catches > 0 ? Math.round((yd / catches) >= 14 ? catches * 0.22 : catches * 0.12) : 0;
    return sum + approx;
  }, 0);
  const explosiveRuns = teamRows.reduce((sum, row) => {
    const ra = Number(row?.totals?.rushAtt ?? 0);
    const ryd = Number(row?.totals?.rushYd ?? 0);
    const approx = ra > 0 ? Math.round((ryd / ra) >= 4.6 ? ra * 0.13 : ra * 0.08) : 0;
    return sum + approx;
  }, 0);

  const giveaways = interceptionsThrown + sumTotals(teamRows, 'fumblesLost');
  const takeaways = defInts + forcedFumbles + fumbleRecoveries;
  const oneScoreGames = Math.round(games * 0.48);
  const oneScoreWins = Math.round(oneScoreGames * clamp(0.45 + ((pointsFor - pointsAgainst) / Math.max(140, games * 10)) * 0.6, 0.2, 0.82));

  return {
    teamId,
    games,
    offense: {
      passAttempts: passAtt,
      passCompletions: passComp,
      passingYards: passYd,
      yardsPerAttempt: passAtt > 0 ? passYd / passAtt : 0,
      passingTds: passTD,
      interceptionsThrown,
      sacksAllowed,
      sackRate: passAtt + sacksAllowed > 0 ? sacksAllowed / (passAtt + sacksAllowed) : 0,
      rushingAttempts: rushAtt,
      rushingYards: rushYd,
      yardsPerCarry: rushAtt > 0 ? rushYd / rushAtt : 0,
      rushingTds: rushTD,
      explosivePassRate: passAtt > 0 ? explosivePasses / passAtt : 0,
      explosiveRunRate: rushAtt > 0 ? explosiveRuns / rushAtt : 0,
      catchRate: recTargets > 0 ? receptions / recTargets : (passAtt > 0 ? passComp / passAtt : 0),
      redZoneTdRate: clamp(0.45 + (passTD + rushTD) / Math.max(1, games * 24), 0.2, 0.78),
      thirdDownRate: clamp(0.34 + (passComp / Math.max(1, passAtt)) * 0.16 - ((sacksAllowed / Math.max(1, games)) * 0.008), 0.22, 0.58),
      deepAttemptProxy: clamp(0.09 + ((passYd / Math.max(1, passAtt)) - 6.2) * 0.02, 0.05, 0.2),
      pressureAllowedProxy: clamp((sacksAllowed / Math.max(1, games * 2.5)) + 0.18, 0.12, 0.48),
      timeToThrowProxy: clamp(2.45 + (sacksAllowed / Math.max(1, games * 5)) + ((passYd / Math.max(1, passAtt)) > 7.8 ? 0.1 : 0), 2.1, 3.25),
    },
    defense: {
      sacks,
      pressureProxy: clamp((sacks / Math.max(1, games * 2.3)) + 0.2, 0.14, 0.46),
      takeaways,
      opponentYardsPerCarry: clamp(4.4 - ((tackles + sacks * 2) / Math.max(180, games * 20)) * 0.5, 3.7, 5.3),
      explosiveRunsAllowedRate: clamp(0.11 - (sacks / Math.max(1, games * 95)), 0.06, 0.18),
      explosivePassesAllowedRate: clamp(0.12 - (defInts / Math.max(1, games * 12)) + (pointsAgainst / Math.max(1, games * 700)), 0.07, 0.2),
      thirdDownDefense: clamp(0.41 - (sacks / Math.max(1, games * 80)), 0.3, 0.5),
      redZoneDefense: clamp(0.57 - (defInts / Math.max(1, games * 20)), 0.43, 0.7),
      opponentPasserEfficiency: clamp(72 + (pointsAgainst / Math.max(1, games * 1.2)) - defInts * 0.8, 62, 118),
    },
    context: {
      pointsFor,
      pointsAgainst,
      pointDifferential: pointsFor - pointsAgainst,
      turnoverDifferential: takeaways - giveaways,
      oneScoreWins,
      oneScoreLosses: Math.max(0, oneScoreGames - oneScoreWins),
      oneScoreGames,
      penaltyRate: penalties / Math.max(1, games),
      injuryGamesLost: teamRows.reduce((sum, row) => {
        const gp = Number(row?.totals?.gamesPlayed ?? 0);
        const age = Number(row?.age ?? 26);
        const expected = age <= 30 ? games : Math.max(11, games - 1);
        return sum + Math.max(0, expected - gp);
      }, 0),
    },
  };
}

function buildSeasonReview({ team, standingsRow, teamStats = [], previousSummary = null }) {
  const metrics = buildTeamSeasonMetrics(team?.id, teamStats, standingsRow);
  const off = metrics.offense;
  const def = metrics.defense;
  const ctx = metrics.context;
  const winPct = pct(Number(standingsRow?.wins ?? 0) + Number(standingsRow?.ties ?? 0) * 0.5, metrics.games);

  const passProtectionScore = clamp(88 - off.sackRate * 420 - off.pressureAllowedProxy * 42, 42, 96);
  const qbRoomScore = clamp(58 + off.yardsPerAttempt * 4.4 + off.passingTds / Math.max(1, metrics.games) * 2.8 - off.interceptionsThrown / Math.max(1, metrics.games) * 3.2 - off.sackRate * 120, 44, 97);
  const runBlockScore = clamp(54 + off.yardsPerCarry * 8 + off.explosiveRunRate * 170, 45, 95);
  const receivingScore = clamp(56 + off.catchRate * 42 + off.explosivePassRate * 160 + off.yardsPerAttempt * 1.5 - off.sackRate * 85, 44, 96);
  const dlPassRushScore = clamp(53 + (def.sacks / Math.max(1, metrics.games)) * 9 + def.pressureProxy * 52, 43, 95);
  const runDefenseScore = clamp(88 - def.opponentYardsPerCarry * 9 - def.explosiveRunsAllowedRate * 220, 42, 95);
  const coverageScore = clamp(56 + (100 - def.opponentPasserEfficiency) * 0.48 + (1 - def.explosivePassesAllowedRate) * 18, 40, 96);
  const specialTeamsScore = clamp(64 + (ctx.pointDifferential / Math.max(1, metrics.games)) * 1.5 - ctx.penaltyRate * 0.8, 48, 91);
  const coachingScore = clamp(56 + winPct * 36 + (ctx.turnoverDifferential / Math.max(1, metrics.games)) * 3.2, 45, 95);
  const disciplineScore = clamp(80 - ctx.penaltyRate * 1.6 + (ctx.turnoverDifferential / Math.max(1, metrics.games)) * 3.5, 40, 95);
  const healthScore = clamp(86 - (ctx.injuryGamesLost / Math.max(1, metrics.games)) * 1.8, 35, 95);

  const sackAttribution = [
    { key: 'ol_pass_protection', score: clamp(off.sackRate * 100 + off.pressureAllowedProxy * 70, 0, 100), label: 'Pass protection was the main problem.' },
    { key: 'qb_holding_ball', score: clamp((off.timeToThrowProxy - 2.45) * 55 + (off.deepAttemptProxy * 120), 0, 100), label: 'The QB contributed by holding the ball too long.' },
    { key: 'receivers_not_open', score: clamp((1 - off.explosivePassRate) * 58 + (1 - off.catchRate) * 44, 0, 100), label: 'Receivers struggled to create openings downfield.' },
  ].sort((a, b) => b.score - a.score);

  const unitGrades = [
    { key: 'qb_room', label: 'QB room', score: qbRoomScore, explanation: `YPA ${off.yardsPerAttempt.toFixed(1)}, INT ${off.interceptionsThrown}, sack rate ${(off.sackRate * 100).toFixed(1)}%.` },
    { key: 'rb_room', label: 'RB room', score: runBlockScore - 2, explanation: `Run game averaged ${off.yardsPerCarry.toFixed(1)} YPC with ${(off.explosiveRunRate * 100).toFixed(1)}% explosive runs.` },
    { key: 'wr_te_group', label: 'WR/TE group', score: receivingScore, explanation: `Catch rate ${(off.catchRate * 100).toFixed(1)}% and explosive pass rate ${(off.explosivePassRate * 100).toFixed(1)}%.` },
    { key: 'ol_run_blocking', label: 'OL run blocking', score: runBlockScore, explanation: `Front generated ${off.yardsPerCarry.toFixed(1)} YPC with downhill consistency.` },
    { key: 'ol_pass_protection', label: 'OL pass protection', score: passProtectionScore, explanation: `Allowed ${off.sacksAllowed} sacks, sack rate ${(off.sackRate * 100).toFixed(1)}%.` },
    { key: 'dl_pass_rush', label: 'DL pass rush', score: dlPassRushScore, explanation: `${def.sacks} sacks and pressure proxy ${(def.pressureProxy * 100).toFixed(1)}%.` },
    { key: 'dl_lb_run_defense', label: 'DL/LB run defense', score: runDefenseScore, explanation: `Estimated opponent YPC ${def.opponentYardsPerCarry.toFixed(1)} with explosive runs allowed ${(def.explosiveRunsAllowedRate * 100).toFixed(1)}%.` },
    { key: 'coverage_unit', label: 'Coverage unit', score: coverageScore, explanation: `Opponent pass efficiency ${def.opponentPasserEfficiency.toFixed(1)} with explosive pass rate allowed ${(def.explosivePassesAllowedRate * 100).toFixed(1)}%.` },
    { key: 'special_teams', label: 'Special teams', score: specialTeamsScore, explanation: `Field-position proxy held steady with point differential ${ctx.pointDifferential}.` },
    { key: 'coaching_scheme_fit', label: 'Coaching / scheme fit', score: coachingScore, explanation: `Record ${(standingsRow?.wins ?? 0)}-${(standingsRow?.losses ?? 0)} with turnover differential ${ctx.turnoverDifferential}.` },
    { key: 'discipline_consistency', label: 'Discipline / consistency', score: disciplineScore, explanation: `${ctx.penaltyRate.toFixed(1)} penalties per game, one-score record ${ctx.oneScoreWins}-${ctx.oneScoreLosses}.` },
    { key: 'health_injury_luck', label: 'Health / injury luck', score: healthScore, explanation: `Estimated ${ctx.injuryGamesLost} injury games lost across primary roster.` },
  ].map((item) => ({ ...item, grade: toGrade(item.score) }));

  const strengths = [...unitGrades].sort((a, b) => b.score - a.score).slice(0, 3).map((g) => `${g.label} (${g.grade})`);
  const weaknesses = [...unitGrades].sort((a, b) => a.score - b.score).slice(0, 3).map((g) => `${g.label} (${g.grade})`);

  const previousDelta = previousSummary?.seasonReview?.aggregateMetrics?.context?.pointDifferential ?? null;
  const trendText = previousDelta == null
    ? 'Not enough prior season data for a reliable early/late trend split.'
    : (ctx.pointDifferential >= previousDelta ? 'Late-season trajectory improved relative to last season baseline.' : 'Late-season trajectory slipped against the prior baseline.');

  return {
    teamIdentitySummary: `${team?.name ?? 'Team'} finished ${(standingsRow?.wins ?? 0)}-${(standingsRow?.losses ?? 0)} with a ${ctx.pointDifferential >= 0 ? '+' : ''}${ctx.pointDifferential} point differential.`,
    offensiveStyleSummary: off.rushingAttempts > off.passAttempts ? 'Run-leaning offense built on early-down volume and controlled passing.' : 'Pass-leaning offense looking for chunk throws and efficiency from shotgun sets.',
    defensiveStyleSummary: def.sacks / Math.max(1, metrics.games) >= 2.4 ? 'Aggressive pressure defense that tries to win on negative plays.' : 'Coverage-and-contain defense focused on limiting explosives.',
    strengths,
    weaknesses,
    trendSummary: trendText,
    sackAttribution: {
      primary: sackAttribution[0]?.key ?? 'ol_pass_protection',
      breakdown: sackAttribution.map((row) => ({ cause: row.key, share: Math.round(clamp(row.score, 0, 100)) })),
      explanation: sackAttribution[0]?.label ?? 'Protection and pass design both contributed.',
    },
    unitGrades,
    aggregateMetrics: metrics,
  };
}

function buildPlayerReportCards({ team = {}, teamRows = [], review = null }) {
  const ageCurvePenalty = (age) => (age >= 31 ? (age - 30) * 3.6 : 0);
  const reportCards = teamRows.map((row) => {
    const totals = row?.totals ?? {};
    const ovr = Number(row?.ovr ?? 65);
    const age = Number(row?.age ?? 26);
    const baseProd = Number(totals.passYd ?? 0) / 90
      + Number(totals.rushYd ?? 0) / 55
      + Number(totals.recYd ?? 0) / 50
      + Number(totals.tackles ?? 0) / 9
      + Number(totals.sacks ?? 0) * 4
      + Number(totals.interceptions ?? 0) * 5;
    const expectation = (ovr - 55) * (REVIEW_PREMIUM_POSITIONS.has(row?.pos) ? 1.12 : 0.96);
    const valueDelta = baseProd - expectation - ageCurvePenalty(age);
    const score = clamp(72 + valueDelta * 0.85, 40, 98);
    const tag = score >= 88
      ? 'core starter'
      : score >= 82 && age <= 28 ? 'extension target'
      : score >= 75 ? 'replaceable starter'
      : score >= 67 ? 'depth only'
      : age >= 30 ? 'cap concern' : 'upgrade needed';
    const verdict = score >= 86
      ? 'Delivered above expectation in meaningful snaps.'
      : score >= 76
        ? 'Met baseline starter expectations with some volatility.'
        : 'Performance lagged role expectations and needs competition.';
    const gmNote = score >= 82
      ? 'GM: role value and contract efficiency support keeping this player in plan.'
      : score >= 72
        ? 'GM: useful piece, but replaceability is moderate.'
        : 'GM: role can be upgraded or replaced through draft/FA.';
    const ownerNote = score >= 85
      ? 'Owner: visible production justified the investment.'
      : score >= 72
        ? 'Owner: impact was mixed for salary level.'
        : 'Owner: expensive snaps without enough return.';
    return {
      playerId: row.playerId,
      name: row.name,
      pos: row.pos,
      age,
      grade: toGrade(score),
      score: Math.round(score),
      verdict,
      performanceVsExpectation: valueDelta >= 8 ? 'above expectation' : valueDelta >= -4 ? 'near expectation' : 'below expectation',
      offseasonTag: tag,
      gmView: gmNote,
      ownerView: ownerNote,
    };
  });
  return reportCards.sort((a, b) => b.score - a.score).slice(0, 36);
}

function buildOffseasonRecommendations({ review, reportCards = [], teamRows = [] }) {
  const weakUnits = [...(review?.unitGrades ?? [])].sort((a, b) => a.score - b.score).slice(0, 4);
  const expiring = teamRows
    .filter((row) => Number(row?.contract?.years ?? row?.contract?.yearsRemaining ?? 2) <= 1)
    .sort((a, b) => Number(b?.ovr ?? 0) - Number(a?.ovr ?? 0));
  const extensionTargets = reportCards.filter((row) => ['core starter', 'extension target'].includes(row.offseasonTag)).slice(0, 5);
  const draftNeeds = weakUnits.slice(0, 3).map((unit, idx) => ({
    priority: idx + 1,
    focus: `Add ${unit.label.toLowerCase()} talent`,
    reason: unit.explanation,
  }));
  const faNeeds = weakUnits.slice(0, 3).map((unit, idx) => ({
    priority: idx + 1,
    focus: `Veteran help for ${unit.label.toLowerCase()}`,
    reason: `${unit.label} graded ${unit.grade}; immediate floor upgrade needed.`,
  }));
  return {
    freeAgencyPriorities: faNeeds,
    draftPriorities: draftNeeds,
    internalResignPriorities: extensionTargets.map((row, idx) => ({
      priority: idx + 1,
      playerId: row.playerId,
      name: row.name,
      pos: row.pos,
      reason: `${row.grade} season (${row.offseasonTag}).`,
    })),
    expiringStarterWatch: expiring.slice(0, 8).map((row) => ({
      playerId: row.playerId,
      name: row.name,
      pos: row.pos,
      ovr: row.ovr ?? null,
    })),
  };
}

export function buildSeasonArchiveSummary({ year, seasonId, standings, awards, leaders, champion, runnerUp, userTeamId, transactions = [], games = [], teams = [], seasonStats = [] }) {
  const sorted = [...(standings || [])].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
  const userRow = sorted.find((t) => Number(t.id) === Number(userTeamId)) || null;
  const userTeam = teams.find((t) => Number(t?.id) === Number(userTeamId)) ?? null;
  const userRows = seasonStats.filter((row) => Number(row?.teamId) === Number(userTeamId));
  const previousSummary = null;
  const seasonReview = userRow ? buildSeasonReview({ team: userTeam, standingsRow: userRow, teamStats: userRows, previousSummary }) : null;
  const playerReportCards = userRow ? buildPlayerReportCards({ team: userTeam, teamRows: userRows, review: seasonReview }) : [];
  const offseasonPlan = seasonReview ? buildOffseasonRecommendations({ review: seasonReview, reportCards: playerReportCards, teamRows: userRows }) : null;

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
    gameIndex: (games || []).map((g) => ({
      id: g.id,
      week: g.week,
      homeId: g.homeId,
      awayId: g.awayId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
    })),
    userTeamSummary: userRow ? {
      teamId: userRow.id,
      record: `${userRow.wins}-${userRow.losses}${userRow.ties ? `-${userRow.ties}` : ''}`,
      pointsFor: userRow.pf ?? 0,
      pointsAgainst: userRow.pa ?? 0,
      playoffLikely: (userRow.wins ?? 0) >= 10,
      seasonReview,
      playerReportCards,
      offseasonPlan,
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
