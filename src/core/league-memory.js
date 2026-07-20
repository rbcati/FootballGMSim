import { buildPlayoffBracketSnapshot } from './playoffBracketSnapshot.js';
import {
  rebuildRecordBookV1,
  mirrorRecordBookForLegacyUi,
  defensiveInterceptionsSeasonValue,
} from './recordBookV1.js';
import {
  buildLegacyScoreReport,
  HOF_LEGACY_INDUCT_THRESHOLD,
  HOF_MIN_SEASONS,
} from './legacyScore.js';
import { getMostPlayedTeam } from './records.js';
import { resolveTeamRefId } from './referenceIntegrity.js';

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
  { key: 'fgMade', label: 'Field Goals Made', stat: 'fgMade' },
];

export function createLeagueMemoryDefaults() {
  return {
    leagueHistory: [],
    seasonStorylines: [],
    awardHistory: [],
    hallOfFame: { schemaVersion: 1, classes: [], index: {} },
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
      schemaVersion: 0,
      singleSeasonV1: {},
      careerLeadersV1: {},
      teamSeasonV1: {},
      meta: {},
    },
  };
}

export function ensureLeagueMemoryMeta(meta = {}) {
  const defaults = createLeagueMemoryDefaults();
  return {
    ...meta,
    leagueHistory: Array.isArray(meta.leagueHistory) ? meta.leagueHistory : defaults.leagueHistory,
    seasonStorylines: Array.isArray(meta.seasonStorylines) ? meta.seasonStorylines : defaults.seasonStorylines,
    awardHistory: Array.isArray(meta.awardHistory) ? meta.awardHistory : defaults.awardHistory,
    hallOfFame: {
      schemaVersion: meta?.hallOfFame?.schemaVersion ?? defaults.hallOfFame.schemaVersion,
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
      schemaVersion: meta?.recordBook?.schemaVersion ?? defaults.recordBook.schemaVersion,
      singleSeasonV1: meta?.recordBook?.singleSeasonV1 && typeof meta.recordBook.singleSeasonV1 === 'object'
        ? { ...defaults.recordBook.singleSeasonV1, ...meta.recordBook.singleSeasonV1 }
        : (meta?.recordBook?.singleSeasonV1 ?? defaults.recordBook.singleSeasonV1),
      careerLeadersV1: meta?.recordBook?.careerLeadersV1 && typeof meta.recordBook.careerLeadersV1 === 'object'
        ? meta.recordBook.careerLeadersV1
        : (meta?.recordBook?.careerLeadersV1 ?? defaults.recordBook.careerLeadersV1),
      teamSeasonV1: meta?.recordBook?.teamSeasonV1 && typeof meta.recordBook.teamSeasonV1 === 'object'
        ? { ...defaults.recordBook.teamSeasonV1, ...meta.recordBook.teamSeasonV1 }
        : (meta?.recordBook?.teamSeasonV1 ?? defaults.recordBook.teamSeasonV1),
      meta: meta?.recordBook?.meta && typeof meta.recordBook.meta === 'object' ? meta.recordBook.meta : (meta?.recordBook?.meta ?? defaults.recordBook.meta),
    },
  };
}

export function buildSeasonStorylineSnapshot(memoryMeta, teams, userTeamId) {
  const history = memoryMeta.leagueHistory;
  const latest = history[history.length - 1] ?? null;
  if (!latest) return [];

  // Create a fast lookup object for O(1) team resolution
  const teamMap = {};
  for (let i = 0, len = teams?.length || 0; i < len; i++) {
    const t = teams[i];
    if (t?.id != null) teamMap[t.id] = t;
  }

  const champId = latest?.champion?.id;
  const teamHistory = memoryMeta.franchiseHistoryByTeam[String(champId)] || null;
  const teamObj = teamMap[champId];
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
        const t = teamMap[r.teamId];
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

function buildPlayerStatLeaders(seasonStats = []) {
  const categories = [
    ['passingYards', 'passYd'],
    ['passingTd', 'passTD'],
    ['rushingYards', 'rushYd'],
    ['rushingTd', 'rushTD'],
    ['receivingYards', 'recYd'],
    ['receivingTd', 'recTD'],
    ['tackles', 'tackles'],
    ['sacks', 'sacks'],
    ['interceptions', null],
    ['fieldGoalsMade', 'fgMade'],
  ];
  const byKey = {};
  for (const [label, key] of categories) {
    if (label === 'interceptions') {
      const top = [...seasonStats]
        .filter((row) => defensiveInterceptionsSeasonValue(row) > 0)
        .sort((a, b) => defensiveInterceptionsSeasonValue(b) - defensiveInterceptionsSeasonValue(a))[0];
      if (top) {
        const value = defensiveInterceptionsSeasonValue(top);
        byKey[label] = {
          playerId: top.playerId,
          playerGuid: top.playerGuid ?? null,
          playerName: top.name,
          teamId: top.teamId,
          teamAbbr: top.teamAbbr ?? null,
          position: top.pos,
          value,
          stat: 'defInterceptions',
        };
      }
      continue;
    }
    const top = [...seasonStats]
      .filter((row) => Number(row?.totals?.[key] ?? 0) > 0)
      .sort((a, b) => Number(b?.totals?.[key] ?? 0) - Number(a?.totals?.[key] ?? 0))[0];
    if (top) {
      byKey[label] = {
        playerId: top.playerId,
        playerGuid: top.playerGuid ?? null,
        playerName: top.name,
        teamId: top.teamId,
        teamAbbr: top.teamAbbr ?? null,
        position: top.pos,
        value: Number(top?.totals?.[key] ?? 0),
        stat: key,
      };
    }
  }
  return byKey;
}

function buildTeamStatLeaders(standings = []) {
  const rows = [...(standings || [])];
  const topBy = (selector, ascending = false) => {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => {
      const va = Number(selector(a) ?? 0);
      const vb = Number(selector(b) ?? 0);
      return ascending ? va - vb : vb - va;
    });
    return sorted[0] ?? null;
  };
  const withGames = rows.map((row) => ({ ...row, games: Number(row.wins ?? 0) + Number(row.losses ?? 0) + Number(row.ties ?? 0) }));
  const teamPpg = topBy((row) => {
    const games = Number(row.wins ?? 0) + Number(row.losses ?? 0) + Number(row.ties ?? 0);
    return games > 0 ? Number(row.pf ?? 0) / games : 0;
  });
  const teamPa = topBy((row) => {
    const games = Number(row.wins ?? 0) + Number(row.losses ?? 0) + Number(row.ties ?? 0);
    return games > 0 ? Number(row.pa ?? 0) / games : 0;
  }, true);
  return {
    pointsPerGame: teamPpg ? {
      teamId: teamPpg.id,
      teamName: teamPpg.name,
      teamAbbr: teamPpg.abbr,
      value: teamPpg.games > 0 ? Math.round((Number(teamPpg.pf ?? 0) / teamPpg.games) * 100) / 100 : 0,
    } : null,
    pointsAllowed: teamPa ? {
      teamId: teamPa.id,
      teamName: teamPa.name,
      teamAbbr: teamPa.abbr,
      value: teamPa.games > 0 ? Math.round((Number(teamPa.pa ?? 0) / teamPa.games) * 100) / 100 : 0,
    } : null,
  };
}

export function buildSeasonArchiveSummary({ year, seasonId, standings, awards, leaders, champion, runnerUp, userTeamId, transactions = [], games = [], teams = [], seasonStats = [], championshipGameId = null, playerSeasonStatsV1 = null, transactionTimelineV1 = null }) {
  const sorted = [...(standings || [])].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
  const targetId = Number(userTeamId);
  let userRow = null;
  for (let i = 0; i < sorted.length; i++) {
    if (Number(sorted[i].id) === targetId) {
      userRow = sorted[i];
      break;
    }
  }

  const teamMap = new Map();
  let userTeam = null;
  for (let i = 0; i < (teams || []).length; i++) {
    const t = teams[i];
    if (t?.id != null) {
      teamMap.set(Number(t.id), t);
      if (Number(t.id) === targetId) userTeam = t;
    }
  }

  const userRows = [];
  for (let i = 0; i < seasonStats.length; i++) {
    if (Number(seasonStats[i]?.teamId) === targetId) {
      userRows.push(seasonStats[i]);
    }
  }
  const previousSummary = null;
  const seasonReview = userRow ? buildSeasonReview({ team: userTeam, standingsRow: userRow, teamStats: userRows, previousSummary }) : null;
  const playerReportCards = userRow ? buildPlayerReportCards({ team: userTeam, teamRows: userRows, review: seasonReview }) : [];
  const offseasonPlan = seasonReview ? buildOffseasonRecommendations({ review: seasonReview, reportCards: playerReportCards, teamRows: userRows }) : null;

  const playerStatLeaders = buildPlayerStatLeaders(seasonStats);
  const teamStatLeaders = buildTeamStatLeaders(sorted);
  const playoffBracketSnapshot = buildPlayoffBracketSnapshot({
    games,
    teams,
    championshipGameId: championshipGameId ?? null,
  });
  const notableGames = [];
  const championshipGame = (games || []).find((g) => String(g?.id ?? g?.gameId) === String(championshipGameId));
  if (championshipGame) {
    notableGames.push({
      type: 'championship',
      gameId: championshipGame.id ?? championshipGame.gameId,
      week: championshipGame.week ?? null,
      homeId: championshipGame.homeId,
      awayId: championshipGame.awayId,
      homeScore: championshipGame.homeScore,
      awayScore: championshipGame.awayScore,
    });
  }
  const highestScoring = [...(games || [])]
    .filter((g) => Number.isFinite(Number(g?.homeScore)) && Number.isFinite(Number(g?.awayScore)))
    .sort((a, b) => (Number(b?.homeScore ?? 0) + Number(b?.awayScore ?? 0)) - (Number(a?.homeScore ?? 0) + Number(a?.awayScore ?? 0)))[0];
  if (highestScoring) {
    notableGames.push({
      type: 'highest_scoring',
      gameId: highestScoring.id ?? highestScoring.gameId,
      week: highestScoring.week ?? null,
      homeId: highestScoring.homeId,
      awayId: highestScoring.awayId,
      homeScore: highestScoring.homeScore,
      awayScore: highestScoring.awayScore,
      totalPoints: Number(highestScoring.homeScore ?? 0) + Number(highestScoring.awayScore ?? 0),
    });
  }

  // Canonical champion reference: a stable team ID that survives save/reload
  // and any later re-branding of the live team. `champion` is retained purely
  // as an optional display snapshot (name/abbr/wins); consumers that need the
  // identity read `championTeamId`, never the snapshot object.
  const championRefKey = resolveTeamRefId(champion);
  const championTeamId = championRefKey == null
    ? null
    : (Number.isFinite(Number(championRefKey)) && String(Number(championRefKey)) === championRefKey
        ? Number(championRefKey)
        : championRefKey);
  const runnerUpRefKey = resolveTeamRefId(runnerUp);
  const runnerUpTeamId = runnerUpRefKey == null
    ? null
    : (Number.isFinite(Number(runnerUpRefKey)) && String(Number(runnerUpRefKey)) === runnerUpRefKey
        ? Number(runnerUpRefKey)
        : runnerUpRefKey);

  const out = {
    id: seasonId,
    year,
    seasonId,
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    championTeamId,
    runnerUpTeamId,
    champion,
    runnerUp,
    championshipGameId: championshipGameId ?? championshipGame?.id ?? championshipGame?.gameId ?? null,
    standings: sorted,
    awards,
    leaders,
    playerStatLeaders,
    teamStatLeaders,
    notableGames,
    playoffSummary: {
      finals: champion && runnerUp ? `${champion.abbr} over ${runnerUp.abbr}` : null,
      wins: champion?.wins ?? null,
    },
    playoffBracketSnapshot,
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
  if (playerSeasonStatsV1 && Array.isArray(playerSeasonStatsV1.rows) && playerSeasonStatsV1.rows.length > 0) {
    out.playerSeasonStatsV1 = playerSeasonStatsV1;
  }
  if (transactionTimelineV1 && Array.isArray(transactionTimelineV1.rows) && transactionTimelineV1.rows.length > 0) {
    out.transactionTimelineV1 = transactionTimelineV1;
  }
  return out;
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

/**
 * Rebuilds persisted record book from `leagueHistory` archives + roster career stats.
 * `seasonStats` / `year` / `standings` are accepted for call-site compatibility; the
 * authoritative snapshot is the latest `leagueHistory` entry after archiving.
 */
export function updateRecordBook(memoryMeta, { allPlayers = [] } = {}) {
  const prevBook = memoryMeta.recordBook ? structuredClone(memoryMeta.recordBook) : {};
  const v1 = rebuildRecordBookV1({
    leagueHistory: memoryMeta.leagueHistory ?? [],
    players: allPlayers,
    previousRecordBook: prevBook,
  });
  const legacy = mirrorRecordBookForLegacyUi(v1);
  const prevHistory = Array.isArray(prevBook.history) ? prevBook.history : [];
  const next = {
    ...prevBook,
    ...v1,
    ...legacy,
    history: prevHistory,
  };
  return { ...memoryMeta, recordBook: next, recordEvents: [] };
}

/**
 * @param {object} player — usually still active when called from retirement loop
 * @param {number} year — class / evaluation year (league year)
 * @param {{ recordBook?: object, archivedSeasons?: any[], teams?: any[] }} [options]
 */
export function evaluateHallOfFameCandidate(player, year, options = {}) {
  const { recordBook = null, archivedSeasons = [], teams = [] } = options;
  const report = buildLegacyScoreReport(player, { recordBook, archivedSeasons, teams, year });
  const seasons = report.meta?.seasonsPlayed ?? 0;
  const inducted = seasons >= HOF_MIN_SEASONS && report.legacyScore >= HOF_LEGACY_INDUCT_THRESHOLD;
  return {
    inducted,
    score: report.legacyScore,
    reasons: report.reasons.slice(0, 4),
    year,
    report,
  };
}

export function rebuildHallOfFameIndexFromClasses(classes) {
  const index = {};
  for (const c of classes || []) {
    for (const ind of c.inductees || []) {
      if (ind?.playerId != null) index[String(ind.playerId)] = ind;
    }
  }
  return index;
}

/**
 * @param {object} player
 * @param {ReturnType<typeof buildLegacyScoreReport>} report
 * @param {{ teamAbbrMap?: Record<string|number, string>, teams?: any[] }} ctx
 */
export function buildHallOfFameInducteeRow(player, report, ctx = {}) {
  const { teamAbbrMap = {}, teams = [] } = ctx;
  const abbr = getMostPlayedTeam(player, teamAbbrMap) || null;
  const team = (teams || []).find((t) => String(t?.abbr) === String(abbr));
  const legacyScore = report.legacyScore;
  return {
    playerId: player.id,
    name: player.name,
    pos: player.pos,
    primaryTeamId: team?.id ?? null,
    primaryTeamAbbr: abbr,
    legacyScore,
    tier: report.tier,
    reasons: (report.reasons || []).slice(0, 4),
    score: legacyScore,
    careerSummary: report.careerSummary || '',
    awardsSummary: report.awardsSummary || '',
    recordsSummary: report.recordsSummary || '',
    breakdown: report.breakdown ?? null,
  };
}

/**
 * Merge inductees into the class for `classYear` (same playerId overwrites with newer fields).
 */
export function addHallOfFameClass(memoryMeta, classYear, inductees) {
  if (!inductees?.length) return memoryMeta;
  const prev = memoryMeta.hallOfFame?.classes ?? [];
  const y = Number(classYear);
  const existing = prev.find((c) => Number(c.year) === y);
  const byId = new Map();
  for (const x of existing?.inductees ?? []) {
    if (x?.playerId != null) byId.set(String(x.playerId), { ...x });
  }
  for (const x of inductees) {
    if (x?.playerId == null) continue;
    const id = String(x.playerId);
    byId.set(id, { ...(byId.get(id) || {}), ...x });
  }
  const merged = [...byId.values()];
  if (!merged.length) return memoryMeta;
  const classId = existing?.classId ?? `hof-${y}`;
  const nextClass = { year: y, classId, inductees: merged };
  const classes = [...prev.filter((c) => Number(c.year) !== y), nextClass].sort((a, b) => b.year - a.year);
  const index = rebuildHallOfFameIndexFromClasses(classes);
  return {
    ...memoryMeta,
    hallOfFame: {
      schemaVersion: memoryMeta.hallOfFame?.schemaVersion ?? 1,
      classes,
      index,
    },
  };
}

/**
 * After record book refresh, induct any retired greats not yet in the index.
 * @returns {{ memoryMeta: object, newInductees: object[] }}
 */
export function syncHallOfFameAfterRecordBook(memoryMeta, allPlayers, classYear, opts = {}) {
  const { teams = [], teamAbbrMap = {} } = opts;
  const archivedSeasons = memoryMeta.leagueHistory ?? [];
  const book = memoryMeta.recordBook;
  const index = memoryMeta.hallOfFame?.index ?? {};
  const toAdd = [];
  for (const p of allPlayers || []) {
    if (!p || String(p.status) !== 'retired') continue;
    if (index[String(p.id)] != null) continue;
    if (p.hof === true) continue;
    const report = buildLegacyScoreReport(p, { recordBook: book, archivedSeasons, teams });
    if ((report.meta?.seasonsPlayed ?? 0) < HOF_MIN_SEASONS) continue;
    if (report.legacyScore < HOF_LEGACY_INDUCT_THRESHOLD) continue;
    toAdd.push(buildHallOfFameInducteeRow(p, report, { teamAbbrMap, teams }));
  }
  if (!toAdd.length) return { memoryMeta, newInductees: [] };
  const nextMeta = addHallOfFameClass(memoryMeta, classYear, toAdd);
  return { memoryMeta: nextMeta, newInductees: toAdd };
}
