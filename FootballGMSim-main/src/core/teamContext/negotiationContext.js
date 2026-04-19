function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp100(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function getContenderScore(team = {}, league = {}) {
  const wins = safeNum(team?.wins, 0);
  const losses = safeNum(team?.losses, 0);
  const ties = safeNum(team?.ties, 0);
  const games = wins + losses + ties;
  const pct = games > 0 ? (wins + ties * 0.5) / games : 0.5;
  const playoffBoost = safeNum(team?.playoffWins, 0) >= 1 ? 6 : 0;
  return clamp100(35 + pct * 55 + playoffBoost);
}

export function getRoleOpportunityScore(player = {}, team = {}, options = {}) {
  const needs = safeNum(options?.needsAtPosition, 1);
  const roster = Array.isArray(options?.rosterAtPosition) ? options.rosterAtPosition : [];
  const betterAtPos = roster.filter((p) => safeNum(p?.ovr, 0) > safeNum(player?.ovr, 0)).length;
  const depthPressure = Math.max(0, betterAtPos * 12);
  return clamp100(72 + (needs - 1) * 12 - depthPressure);
}

export function getDevelopmentEnvironmentScore(team = {}) {
  const staffDev = safeNum(team?.staffBonuses?.developmentDelta, 0) * 100;
  const trainingLevel = safeNum(team?.franchiseInvestments?.trainingLevel, 1);
  return clamp100(45 + staffDev + trainingLevel * 7);
}

export function getRelationshipScore(player = {}, team = {}) {
  const morale = safeNum(player?.morale, 68);
  const tenure = safeNum(player?.tenureYears, 0);
  const continuity = safeNum(team?.staffContinuity, 0);
  return clamp100(35 + morale * 0.45 + tenure * 4 + continuity * 0.4);
}

export function getMarketAppealScore(team = {}) {
  const fanApproval = safeNum(team?.fanApproval, 50);
  const marketSize = safeNum(team?.marketSize, 50);
  return clamp100(35 + fanApproval * 0.35 + marketSize * 0.35);
}

export function getTeamContextForNegotiation(player = {}, team = {}, league = {}, options = {}) {
  return {
    contenderScore: getContenderScore(team, league),
    roleOpportunityScore: getRoleOpportunityScore(player, team, options),
    developmentScore: getDevelopmentEnvironmentScore(team),
    relationshipScore: getRelationshipScore(player, team),
    marketAppealScore: getMarketAppealScore(team),
    capFlexScore: clamp100(50 + safeNum(team?.capRoom, 0) * 1.4),
    teamDirection: options?.teamDirection ?? 'middling',
  };
}
