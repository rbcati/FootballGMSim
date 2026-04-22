import { Utils as U } from '../../core/utils.js';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(team) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  const games = wins + losses + ties;
  return games > 0 ? (wins + ties * 0.5) / games : 0;
}

function getUserTeam(league) {
  return (league?.teams ?? []).find((team) => Number(team?.id) === Number(league?.userTeamId)) ?? null;
}

function getLosingStreak(team) {
  const reversed = Array.isArray(team?.recentResults) ? [...team.recentResults].reverse() : [];
  let streak = 0;
  for (const entry of reversed) {
    if (String(entry ?? '').toUpperCase() !== 'L') break;
    streak += 1;
  }
  return streak;
}

function hasEliteExpiringPlayer(team) {
  return (team?.roster ?? []).some((player) => safeNum(player?.ovr) >= 88 && safeNum(player?.contract?.yearsRemaining ?? player?.contract?.years) <= 1);
}

function hasAgingStarter(team) {
  return (team?.roster ?? []).some((player) => safeNum(player?.ovr) >= 75 && safeNum(player?.age, 26) >= 30);
}

function isPredraftPhase(league) {
  const phase = String(league?.phase ?? '').toLowerCase();
  return phase.includes('draft') || phase.includes('offseason');
}

function buildWeeklyEventPool({ league, team }) {
  const trainingRank = safeNum(team?.facilities?.trainingRank ?? team?.trainingFacilityRank, 16);
  const streak = getLosingStreak(team);
  const losing = pct(team) < 0.45;
  const nextGame = league?.nextGame ?? null;
  const isDivisionGame = Boolean(nextGame?.isDivision || nextGame?.opp?.isDivisionRival);

  return [
    {
      id: 'star_extension_demand',
      weight: hasEliteExpiringPlayer(team) ? 16 : 0,
      headline: 'Your star player\'s agent requests immediate extension talks',
      choices: [
        { id: 'open_talks', label: 'Open talks now', preview: 'Owner +4 · Morale +6 · Cap -2.5M', effects: { ownerApproval: 4, morale: 6, capImpact: -2.5, fanSentiment: 3 } },
        { id: 'delay', label: 'Ask for two weeks', preview: 'Owner -2 · Morale -5', effects: { ownerApproval: -2, morale: -5, fanSentiment: -3 } },
      ],
    },
    {
      id: 'veteran_trade_request',
      weight: losing && hasAgingStarter(team) ? 14 : 0,
      headline: 'A veteran starter privately requests a trade to a contender',
      choices: [
        { id: 'grant', label: 'Honor request', preview: 'Owner +2 · Fans -5 · Locker room +4', effects: { ownerApproval: 2, morale: 4, fanSentiment: -5 } },
        { id: 'deny', label: 'Deny request', preview: 'Morale -8 · Fans +2', effects: { morale: -8, fanSentiment: 2 } },
      ],
    },
    {
      id: 'injury_bug',
      weight: trainingRank >= 20 ? 18 : trainingRank >= 14 ? 10 : 2,
      headline: 'Training staff flags a soft-tissue injury spike risk this week',
      choices: [
        { id: 'light_practice', label: 'Reduce practice intensity', preview: 'Morale +2 · Sim prep -small', effects: { morale: 2, prepPenalty: 0.04 } },
        { id: 'stay_course', label: 'Keep full speed', preview: 'Injury risk ↑ · Owner +1', effects: { ownerApproval: 1, injuryRiskDelta: 0.08 } },
      ],
    },
    {
      id: 'scandal',
      weight: 2,
      headline: 'A late-night off-field scandal breaks before media day',
      choices: [
        { id: 'support_player', label: 'Back player publicly', preview: 'Morale +5 · Fans -4', effects: { morale: 5, fanSentiment: -4 } },
        { id: 'discipline', label: 'Issue team discipline', preview: 'Owner +5 · Morale -4', effects: { ownerApproval: 5, morale: -4, fanSentiment: 1 } },
      ],
      rare: true,
    },
    {
      id: 'rivalry_bonus',
      weight: isDivisionGame ? 12 : 0,
      headline: 'Rivalry week buzz surges ticket demand and locker-room intensity',
      choices: [
        { id: 'embrace', label: 'Lean into rivalry', preview: 'Fans +7 · Turnover volatility +small', effects: { fanSentiment: 7, volatilityDelta: 0.05 } },
        { id: 'steady', label: 'Keep it business-as-usual', preview: 'Owner +1 · Fans +1', effects: { ownerApproval: 1, fanSentiment: 1 } },
      ],
    },
    {
      id: 'coach_hot_seat',
      weight: streak >= 3 ? 16 : 0,
      headline: 'Ownership hints your staff could be on the hot seat',
      choices: [
        { id: 'fire_coordinator', label: 'Shake up staff', preview: 'Owner +6 · Morale -3', effects: { ownerApproval: 6, morale: -3 } },
        { id: 'keep_staff', label: 'Back current staff', preview: 'Owner -5 · Morale +2', effects: { ownerApproval: -5, morale: 2 } },
      ],
      autoResolveChoiceId: 'keep_staff',
    },
    {
      id: 'prospect_workout',
      weight: isPredraftPhase(league) ? 10 : 0,
      headline: 'A local top prospect asks for a private workout',
      choices: [
        { id: 'host_workout', label: 'Host private workout', preview: 'Scouting +8 · Budget -0.4M', effects: { scoutingBoost: 8, capImpact: -0.4 } },
        { id: 'decline', label: 'Decline request', preview: 'Scouting -4 · Budget +0.2M', effects: { scoutingBoost: -4, capImpact: 0.2 } },
      ],
      autoResolveChoiceId: 'decline',
    },
  ].filter((item) => item.weight > 0);
}

function pickWeightedEvent(pool, rng = U.random) {
  if (!pool.length) return null;
  const total = pool.reduce((sum, item) => sum + safeNum(item.weight, 0), 0);
  if (total <= 0) return null;
  let cursor = rng() * total;
  for (const candidate of pool) {
    cursor -= safeNum(candidate.weight, 0);
    if (cursor <= 0) return candidate;
  }
  return pool[pool.length - 1] ?? null;
}

export function resolveWeeklyEvent({ league, rng = U.random } = {}) {
  const team = getUserTeam(league);
  if (!team) return null;
  const pool = buildWeeklyEventPool({ league, team });
  if (!pool.length) return null;

  const baseChance = 0.32;
  const urgencyBonus = getLosingStreak(team) >= 3 ? 0.12 : 0;
  if (rng() > baseChance + urgencyBonus) return null;

  const chosen = pickWeightedEvent(pool, rng);
  if (!chosen) return null;

  return {
    ...chosen,
    id: `${safeNum(league?.year, 0)}-wk${safeNum(league?.week, 1)}-${chosen.id}`,
    week: safeNum(league?.week, 1),
    season: safeNum(league?.year, 0),
    state: 'pending',
    ignoredWeeks: 0,
  };
}

export function applyEventDecision(event, choiceId) {
  const choice = (event?.choices ?? []).find((entry) => entry?.id === choiceId);
  if (!event || !choice) return null;
  return {
    ...event,
    state: 'resolved',
    choiceId,
    choiceLabel: choice.label,
    outcome: choice.preview,
    effects: { ...(choice.effects ?? {}) },
  };
}

export function updateRelationshipScore(currentValue, delta) {
  return Math.max(-100, Math.min(100, safeNum(currentValue, 0) + safeNum(delta, 0)));
}

export function evaluateTradeFairness({ offerValue = 0, askValue = 0, relationship = 0, deadlineWeek = false } = {}) {
  const demand = Math.max(1, safeNum(askValue, 1));
  const baseRatio = safeNum(offerValue, 0) / demand;
  const relBonus = safeNum(relationship, 0) / 500;
  const deadlineBonus = deadlineWeek ? 0.04 : 0;
  const adjustedRatio = baseRatio + relBonus + deadlineBonus;
  const gap = adjustedRatio - 1;
  const meter = adjustedRatio >= 1.02 ? 'green' : adjustedRatio >= 0.9 ? 'yellow' : 'red';
  return {
    adjustedRatio,
    meter,
    verdict: adjustedRatio >= 1.0 ? 'Accept' : adjustedRatio >= 0.88 ? 'Counter' : 'Decline',
    reasoning: adjustedRatio >= 1.0
      ? 'This offer meets our current roster and value goals.'
      : adjustedRatio >= 0.88
        ? 'Close, but we need one more quality asset.'
        : 'This package falls short of our valuation.',
    counterDelta: gap >= -0.12 ? Math.max(0, Math.round((1 - adjustedRatio) * demand)) : null,
  };
}

export function buildContractCounterOffer({
  demandYears = 3,
  demandAav = 12,
  demandGuarantee = 55,
  offerYears = 3,
  offerAav = 12,
  offerGuarantee = 55,
  teamWinPct = 0.5,
  morale = 65,
  marketHeat = 1,
} = {}) {
  const winAdj = teamWinPct >= 0.6 ? -0.06 : teamWinPct <= 0.4 ? 0.08 : 0;
  const moraleAdj = morale >= 75 ? -0.03 : morale <= 45 ? 0.06 : 0;
  const marketAdj = (safeNum(marketHeat, 1) - 1) * 0.1;

  const minAav = safeNum(demandAav) * (1 + winAdj + moraleAdj + marketAdj);
  const counterAav = Math.max(minAav, (safeNum(offerAav) + safeNum(demandAav)) / 2);
  const counterGuarantee = Math.max(
    safeNum(demandGuarantee) * (1 + marketAdj * 0.5),
    (safeNum(offerGuarantee) + safeNum(demandGuarantee)) / 2,
  );
  const counterYears = Math.min(5, Math.max(1, Math.round((safeNum(offerYears) + safeNum(demandYears)) / 2)));

  return {
    years: counterYears,
    aav: Math.round(counterAav * 10) / 10,
    guaranteePct: Math.round(Math.max(15, Math.min(100, counterGuarantee))),
  };
}
