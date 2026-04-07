const PREMIUM_POSITIONS = new Set(['QB', 'EDGE', 'DE', 'OT', 'CB', 'WR']);

function n(v, d = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
}

export function pickAssetValue(pick = {}, context = {}) {
  const round = n(pick?.round, 4);
  const week = n(context?.week, 1);
  const direction = context?.direction ?? 'balanced';
  const projectedRange = (pick?.projectedRange ?? 'mid').toLowerCase();
  const classStrength = Math.max(0.8, Math.min(1.25, n(context?.classStrength, 1)));

  const byRound = [0, 950, 380, 180, 85, 45, 18, 7];
  const rangeAdj = projectedRange === 'early' ? 1.25 : projectedRange === 'late' ? 0.88 : 1;
  const stageAdj = week >= 12 ? 1.12 : week >= 8 ? 1.06 : 1;
  const directionAdj = direction === 'rebuilding' ? 1.14 : direction === 'contender' ? 0.92 : 1;
  return (byRound[round] ?? 10) * rangeAdj * classStrength * stageAdj * directionAdj;
}

export function playerAssetValue(player = {}, context = {}) {
  const age = n(player.age, 26);
  const ovr = n(player.ovr, 68);
  const pot = n(player.potential, ovr);
  const years = n(player?.contract?.yearsRemaining ?? player?.contract?.years ?? 1, 1);
  const baseAnnual = n(player?.contract?.baseAnnual ?? 0, 0);
  const fit = n(player?.schemeFit, 65);
  const pos = (player?.pos ?? '').toUpperCase();
  const direction = context?.direction ?? 'balanced';

  const youth = age <= 24 ? 1.12 : age <= 27 ? 1.06 : age <= 30 ? 1 : 0.86;
  const upside = 1 + Math.max(-0.08, Math.min(0.18, (pot - ovr) / 100));
  const premium = PREMIUM_POSITIONS.has(pos) ? 1.08 : 1;
  const fitAdj = 0.9 + Math.max(0, Math.min(0.2, fit / 500));
  const contractAdj = Math.max(0.72, 1 - (baseAnnual / 40));
  const controlAdj = years >= 3 ? 1.08 : years === 2 ? 1.02 : 0.94;
  const directionAdj = direction === 'contender'
    ? (age <= 30 ? 1.04 : 0.92)
    : direction === 'rebuilding'
      ? (age <= 27 ? 1.08 : 0.84)
      : 1;

  return ovr * 7.4 * youth * upside * premium * fitAdj * contractAdj * controlAdj * directionAdj;
}

export function rankTradePartners({ teams = [], userTeamId, outgoingPlayers = [], outgoingPicks = [], week = 1 } = {}) {
  const userTeam = teams.find((t) => Number(t?.id) === Number(userTeamId));
  if (!userTeam) return [];
  const outgoingPos = outgoingPlayers.map((p) => p?.pos).filter(Boolean);
  const outgoingValue = outgoingPlayers.reduce((sum, p) => sum + playerAssetValue(p, { direction: 'balanced' }), 0)
    + outgoingPicks.reduce((sum, p) => sum + pickAssetValue(p, { week, direction: 'balanced' }), 0);

  return teams
    .filter((team) => Number(team?.id) !== Number(userTeamId))
    .map((team) => {
      const direction = team?.teamIntel?.direction ?? 'balanced';
      const needs = team?.teamIntel?.needs?.slice(0, 3) ?? [];
      const needHit = outgoingPos.find((pos) => needs.includes(pos));
      const capRoom = n(team?.capRoom, 0);
      const capAbility = capRoom >= 20 ? 'strong' : capRoom >= 8 ? 'workable' : 'tight';
      const preference = direction === 'rebuilding'
        ? 'pick_or_youth'
        : direction === 'contender'
          ? 'starter_now'
          : 'balanced_package';
      const urgency = week >= 10 && direction === 'contender' ? 'high' : needs.length >= 2 ? 'medium' : 'low';
      const needScore = needHit ? 38 : 14;
      const capScore = capRoom >= 0 ? Math.min(22, capRoom * 0.9) : -18;
      const directionScore = direction === 'rebuilding' ? 8 : direction === 'contender' ? 12 : 9;
      const packageScore = Math.min(18, outgoingValue / 120);
      const fitScore = Math.max(5, Math.round(needScore + capScore + directionScore + packageScore));

      const reasons = [];
      if (needHit) reasons.push(`needs ${needHit} starter now`);
      if (direction === 'rebuilding') reasons.push('rebuilding and values young controllable talent');
      if (direction === 'contender') reasons.push('in win-now window for playoff push');
      if (capAbility === 'tight') reasons.push('cap too tight unless salary goes back');
      if (!needHit) reasons.push('would need added incentive to justify fit');

      return {
        teamId: team.id,
        teamName: team.name ?? team.abbr,
        fitScore,
        direction,
        positionNeed: needHit ?? needs[0] ?? 'depth',
        capAbility,
        urgency,
        preference,
        reasons,
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore);
}
