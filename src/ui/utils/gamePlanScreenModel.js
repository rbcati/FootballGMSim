import { buildGamePlanImpact } from './gamePlanImpact.js';
import { getNextGame } from './weeklyPrep.js';

function safeNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatRecord(team) {
  if (!team) return '0-0';
  const wins = safeNum(team?.wins, 0);
  const losses = safeNum(team?.losses, 0);
  const ties = safeNum(team?.ties, 0);
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
}

function getTeamRatings(team) {
  return {
    offense: safeNum(team?.offenseRating ?? team?.offRating ?? team?.offense ?? team?.offOvr, null),
    defense: safeNum(team?.defenseRating ?? team?.defRating ?? team?.defense ?? team?.defOvr, null),
  };
}

function summarizeStrategy(strategies = {}) {
  const gamePlan = strategies?.gamePlan ?? {};
  return {
    offSchemeId: strategies?.offSchemeId ?? 'WEST_COAST',
    defSchemeId: strategies?.defSchemeId ?? 'COVER_2',
    runPassBalance: safeNum(gamePlan?.runPassBalance, null),
    aggressionLevel: safeNum(gamePlan?.aggressionLevel, null),
    deepShortBalance: safeNum(gamePlan?.deepShortBalance, null),
    blitzFrequency: safeNum(gamePlan?.blitzFrequency, null),
  };
}

export function buildGamePlanScreenModel({ league, prepProgress } = {}) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const userTeam = teams.find((team) => Number(team?.id) === Number(league?.userTeamId)) ?? null;
  const nextGame = getNextGame(league);
  const opponent = nextGame?.opp ?? null;
  const userRatings = getTeamRatings(userTeam);
  const opponentRatings = getTeamRatings(opponent);
  const week = safeNum(nextGame?.week, safeNum(league?.week, 1) ?? 1);
  const homeAway = nextGame ? (nextGame.isHome ? 'Home' : 'Away') : 'TBD';

  const impact = buildGamePlanImpact({
    league,
    team: userTeam,
    nextGame,
    prep: { completion: prepProgress ?? {} },
  });

  const tacticalBrief = (impact?.recommendedAdjustments ?? []).slice(0, 3).map((item) => ({
    id: item?.id ?? `brief-${item?.title ?? 'item'}`,
    title: item?.title ?? 'Tactical Adjustment',
    explanation: item?.explanation ?? 'Review this area before kickoff.',
    ctaLabel: item?.ctaLabel ?? 'Open Game Plan',
    riskLevel: item?.riskLevel ?? 'medium',
    confidenceLevel: item?.confidenceLevel ?? 'medium',
    tag: item?.tag ?? null,
  }));

  const strategySummary = summarizeStrategy(userTeam?.strategies ?? {});
  const matchupHeadline = opponent
    ? `${homeAway} matchup vs ${opponent?.abbr ?? opponent?.name ?? 'TBD'}`
    : 'No opponent locked yet';

  return {
    week,
    isHome: Boolean(nextGame?.isHome),
    matchupHeadline,
    userTeam,
    opponent,
    homeAway,
    nextGame,
    userRecord: formatRecord(userTeam),
    opponentRecord: formatRecord(opponent),
    userRatings,
    opponentRatings,
    tacticalBrief,
    strategySummary,
    planReviewed: Boolean(prepProgress?.planReviewed),
    hasOpponent: Boolean(opponent),
    impactSummary: impact?.summary ?? 'No matchup lock yet. Build your baseline plan before advancing.',
  };
}
