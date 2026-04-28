import { deriveWeeklyPrepState } from './weeklyPrep.js';
import { buildTeamIntelligence } from './teamIntelligence.js';
import { classifyDevelopmentTrend, getSchemeFitSignal } from './playerDevelopmentSignals.js';

const POSITION_GROUPS = [
  { id: 'qb', label: 'QB Room', positions: ['QB'] },
  { id: 'rb', label: 'RB Room', positions: ['RB', 'HB', 'FB'] },
  { id: 'wr', label: 'WR Corps', positions: ['WR', 'FL', 'SE'] },
  { id: 'te', label: 'TE Room', positions: ['TE'] },
  { id: 'ol', label: 'O-Line', positions: ['OL', 'C', 'G', 'T', 'OT', 'OG', 'LT', 'RT', 'LG', 'RG'] },
  { id: 'dl', label: 'D-Line', positions: ['DL', 'DE', 'DT', 'NT', 'EDGE', 'IDL'] },
  { id: 'lb', label: 'Linebackers', positions: ['LB', 'MLB', 'OLB', 'ILB'] },
  { id: 'db', label: 'Secondary', positions: ['CB', 'S', 'FS', 'SS', 'DB', 'NCB'] },
  { id: 'st', label: 'Special Teams', positions: ['K', 'P'] },
];

const GROUP_BY_POS = new Map(POSITION_GROUPS.flatMap((group) => group.positions.map((pos) => [pos, group.id])));
const NEED_POS_MAP = { QB: 'qb', RB: 'rb', WR: 'wr', TE: 'te', OL: 'ol', DL: 'dl', LB: 'lb', CB: 'db', S: 'db' };
const INTENSITY_RISK = {
  light: { score: 1, label: 'Low', note: 'Light load keeps injury exposure down.' },
  normal: { score: 2, label: 'Moderate', note: 'Balanced load with moderate injury exposure.' },
  hard: { score: 3, label: 'High', note: 'Hard sessions can create short-term injury risk.' },
};

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePos(player) {
  return String(player?.pos ?? player?.position ?? '').toUpperCase();
}

function getGroupIdForPlayer(player) {
  return GROUP_BY_POS.get(normalizePos(player)) ?? null;
}

function getUserTeam(league) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  return teams.find((team) => Number(team?.id) === Number(league?.userTeamId)) ?? null;
}

function deriveRoster(league, userTeam) {
  const leagueRoster = Array.isArray(league?.roster)
    ? league.roster.filter((player) => Number(player?.teamId) === Number(league?.userTeamId))
    : [];
  if (leagueRoster.length > 0) return leagueRoster;
  return Array.isArray(userTeam?.roster) ? userTeam.roster : [];
}

function isInjured(player) {
  return safeNum(player?.injuryWeeksRemaining ?? player?.injury?.weeksRemaining ?? player?.injuredWeeks ?? 0) > 0
    || String(player?.status ?? '').toLowerCase() === 'injured';
}

function summarizeRisk(intensity, injuredCount) {
  const base = INTENSITY_RISK[intensity] ?? INTENSITY_RISK.normal;
  const riskScore = base.score + (injuredCount >= 4 ? 2 : injuredCount >= 2 ? 1 : 0);
  if (riskScore >= 4) return { level: 'high', label: 'High Risk', note: `${base.note} Existing injuries increase replacement volatility.` };
  if (riskScore >= 3) return { level: 'medium', label: 'Manage Risk', note: base.note };
  return { level: 'low', label: 'Low Risk', note: base.note };
}

function buildMatchupNote(prep, focusLabel) {
  if (!prep?.nextGame) return 'No locked opponent yet — keep base install balanced.';
  const weakness = prep?.opponentWeaknesses?.[0];
  const threat = prep?.opponentStrengths?.[0];
  if (weakness && focusLabel) return `${focusLabel} emphasis can help exploit: ${weakness}`;
  if (threat && focusLabel) return `${focusLabel} prep helps answer: ${threat}`;
  return prep?.keyMatchupNote ?? 'Matchup is balanced; execution details will decide this week.';
}

function createRecommendedFocus({ roster, intelligence, prep, riskLevel }) {
  const injuryCounts = {};
  const youngUpsideCounts = {};

  for (const player of roster) {
    const groupId = getGroupIdForPlayer(player);
    if (!groupId) continue;
    if (isInjured(player)) injuryCounts[groupId] = (injuryCounts[groupId] ?? 0) + 1;
    const upsideGap = safeNum(player?.potential, safeNum(player?.ovr, 60) + 4) - safeNum(player?.ovr, 60);
    if (safeNum(player?.age, 30) <= 24 && upsideGap >= 6) {
      youngUpsideCounts[groupId] = (youngUpsideCounts[groupId] ?? 0) + 1;
    }
  }

  const needs = Array.isArray(intelligence?.needsNow) ? intelligence.needsNow : [];
  const scoreMap = new Map(POSITION_GROUPS.map((g) => [g.id, 0]));
  const reasonMap = new Map(POSITION_GROUPS.map((g) => [g.id, []]));

  for (const need of needs) {
    const groupId = NEED_POS_MAP[String(need?.pos ?? '').toUpperCase()];
    if (!groupId) continue;
    scoreMap.set(groupId, (scoreMap.get(groupId) ?? 0) + safeNum(need?.severity, 1) + 2);
    reasonMap.get(groupId)?.push(need?.label ?? `${need?.pos} depth need`);
  }

  for (const [groupId, count] of Object.entries(injuryCounts)) {
    scoreMap.set(groupId, (scoreMap.get(groupId) ?? 0) + count + 1);
    reasonMap.get(groupId)?.push(count > 1 ? `${count} injured players in this room` : 'Starter availability needs support');
  }

  for (const [groupId, count] of Object.entries(youngUpsideCounts)) {
    scoreMap.set(groupId, (scoreMap.get(groupId) ?? 0) + count + 1);
    reasonMap.get(groupId)?.push(count > 1 ? `${count} upside prospects can gain from reps` : 'Young upside player available for growth reps');
  }

  const weakness = prep?.opponentWeaknesses?.[0] ?? '';
  if (/defense|secondary|coverage/i.test(weakness)) {
    scoreMap.set('qb', (scoreMap.get('qb') ?? 0) + 1);
    scoreMap.set('wr', (scoreMap.get('wr') ?? 0) + 1);
    reasonMap.get('wr')?.push('Opponent coverage profile is attackable this week');
  }

  const ranked = POSITION_GROUPS
    .map((group) => ({ group, score: scoreMap.get(group.id) ?? 0, reasons: reasonMap.get(group.id) ?? [] }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return ranked.map((entry) => {
    const riskNote = riskLevel === 'high'
      ? 'Consider normal/light intensity if this room is already strained.'
      : riskLevel === 'medium'
        ? 'Monitor availability after each drill.'
        : 'Current roster health supports extra reps.';
    return {
      groupId: entry.group.id,
      groupLabel: entry.group.label,
      reason: entry.reasons[0] ?? 'Weekly operations signal says this group can gain leverage.',
      suggestedDrillType: entry.group.id === 'ol' || entry.group.id === 'dl' || entry.group.id === 'lb' ? 'conditioning' : 'technique',
      suggestedIntensity: riskLevel === 'high' ? 'normal' : 'hard',
      riskNote,
    };
  });
}

function rankDevelopmentCandidates(roster, needsNow) {
  const needSet = new Set((Array.isArray(needsNow) ? needsNow : []).map((need) => NEED_POS_MAP[String(need?.pos ?? '').toUpperCase()]).filter(Boolean));

  return roster
    .map((player) => {
      const age = safeNum(player?.age, 30);
      const ovr = safeNum(player?.ovr, 60);
      const potential = safeNum(player?.potential, ovr + 2);
      const upside = Math.max(0, potential - ovr);
      const trend = classifyDevelopmentTrend(player);
      const fit = getSchemeFitSignal(player);
      const groupId = getGroupIdForPlayer(player);

      let score = upside * 3 + Math.max(0, 27 - age);
      if (age <= 24) score += 4;
      if (needSet.has(groupId)) score += 3;
      if (trend.key === 'breakout_candidate') score += 3;
      if (trend.key === 'trending_up') score += 2;
      if (fit.key === 'strong_fit') score += 1;
      if (isInjured(player)) score -= 2;

      const reasons = [];
      if (age <= 24) reasons.push('Young player development window');
      if (upside >= 6) reasons.push('High upside gap');
      if (needSet.has(groupId)) reasons.push('Depth need this week');
      if (fit.key === 'strong_fit') reasons.push('Scheme fit supports gains');
      if (isInjured(player)) reasons.push('Injury replacement planning');
      if (!reasons.length) reasons.push('Maintain weekly growth cadence');

      return {
        playerId: player?.id,
        name: player?.name ?? 'Unknown Player',
        pos: normalizePos(player) || 'N/A',
        age,
        ovr,
        potential,
        reason: reasons[0],
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function buildTrainingPlanModel({ league, intensity = 'normal', drillType = 'technique', drillsRun = 0, actions } = {}) {
  const userTeam = getUserTeam(league);
  const roster = deriveRoster(league, userTeam).filter((player) => player && typeof player === 'object');
  const prep = deriveWeeklyPrepState(league);
  const intelligence = buildTeamIntelligence(userTeam ?? { roster }, { week: safeNum(league?.week, 1) });

  const isTrainingCamp = String(league?.phase ?? '').toLowerCase() === 'preseason';
  const maxDrills = isTrainingCamp ? 5 : 2;

  const seasonKey = league?.seasonId ?? league?.year ?? 'season';
  const week = safeNum(league?.week, 1);
  const focusStamp = userTeam?.weeklyDevelopmentFocus?.stamp;
  // weeklyDevelopmentFocus.stamp is authoritative for weekly practice usage in regular season.
  // Preseason training camp keeps local per-screen drill limits.
  const usedThisWeek = !isTrainingCamp && Boolean(focusStamp && focusStamp === `${seasonKey}:${week}`);
  const safeDrillsRun = Math.max(0, safeNum(drillsRun, 0));
  const drillsRemaining = usedThisWeek ? 0 : Math.max(0, maxDrills - safeDrillsRun);

  const injuredCount = roster.filter(isInjured).length;
  const risk = summarizeRisk(intensity, injuredCount);
  const recommendedFocus = createRecommendedFocus({ roster, intelligence, prep, riskLevel: risk.level });

  const suggested = recommendedFocus[0] ?? null;
  const recommendedNextAction = suggested
    ? `Set ${suggested.groupLabel} to ${suggested.suggestedDrillType} and run a ${suggested.suggestedIntensity} drill.`
    : 'Select one focus group and run a low-risk install drill.';

  return {
    week,
    phaseLabel: isTrainingCamp ? 'Training Camp' : 'Weekly Practice',
    weekLabel: isTrainingCamp ? `Preseason Week ${week}` : `Week ${week}`,
    isTrainingCamp,
    maxDrills,
    drillsRemaining,
    practiceLocked: usedThisWeek,
    practiceStateLabel: usedThisWeek ? 'Practice already logged this week' : 'Practice available this week',
    usedThisWeek,
    intensity,
    drillType,
    risk,
    recommendedFocus,
    developmentCandidates: rankDevelopmentCandidates(roster, intelligence?.needsNow),
    matchupTrainingNote: buildMatchupNote(prep, suggested?.groupLabel),
    recommendedNextAction,
    persistenceAvailable: typeof actions?.conductDrill === 'function',
    prepSupportLabel: 'Training supports prep quality but does not complete a required Weekly Prep checklist step.',
    roster,
  };
}

export { POSITION_GROUPS };
