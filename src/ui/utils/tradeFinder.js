const PREMIUM_POSITIONS = new Set(['QB', 'EDGE', 'DE', 'OT', 'CB', 'WR']);

function n(v, d = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
}

function canonicalPos(pos = '') {
  const raw = String(pos ?? '').toUpperCase();
  if (['HB', 'FB'].includes(raw)) return 'RB';
  if (['OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'].includes(raw)) return 'OL';
  if (['DE', 'DT', 'NT', 'IDL', 'EDGE'].includes(raw)) return 'DL';
  if (['FS', 'SS', 'DB', 'NCB'].includes(raw)) return 'S';
  return raw;
}

function parseNeedList(teamIntel = {}) {
  const fromList = (list = []) => list.map((entry) => (typeof entry === 'string' ? { pos: entry, severity: 1 } : entry)).filter((entry) => entry?.pos);
  const now = fromList(teamIntel?.needsNow ?? teamIntel?.needs ?? []);
  const later = fromList(teamIntel?.needsLater ?? []);
  const surplus = fromList(teamIntel?.surplus ?? []);
  return { now, later, surplus };
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
  const pos = canonicalPos(player?.pos ?? '');
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

function getUrgency({ week, direction, needSeverity = 0 }) {
  if (direction === 'contender' && week >= 10 && needSeverity >= 2) return 'high';
  if (needSeverity >= 2 || week >= 12) return 'medium';
  return 'low';
}

function getPreference(direction, needNowHit, capRoom) {
  if (direction === 'rebuilding') return capRoom < 8 ? 'pick_or_youth' : 'future_control';
  if (direction === 'contender') return needNowHit ? 'starter_now' : 'balanced_package';
  return 'balanced_package';
}

export function buildCounterAdjustment({
  partnerTeam,
  outgoingPlayers = [],
  outgoingPicks = [],
  incomingPlayers = [],
  week = 1,
}) {
  const direction = partnerTeam?.teamIntel?.direction ?? 'balanced';
  const { now, surplus } = parseNeedList(partnerTeam?.teamIntel ?? {});
  const outgoingValue = outgoingPlayers.reduce((sum, p) => sum + playerAssetValue(p, { direction: 'balanced' }), 0)
    + outgoingPicks.reduce((sum, p) => sum + pickAssetValue(p, { week, direction: 'balanced' }), 0);
  const incomingValue = incomingPlayers.reduce((sum, p) => sum + playerAssetValue(p, { direction: 'balanced' }), 0);
  const gap = incomingValue - outgoingValue;

  if (gap > 140) {
    return { type: 'add_pick', explain: 'they need more future value to offset what they are sending' };
  }
  if (gap > 40) {
    return { type: 'balance_salary', explain: 'they need better cap balance on this package' };
  }

  const movable = (partnerTeam?.roster ?? [])
    .filter((p) => !incomingPlayers.some((x) => Number(x?.id) === Number(p?.id)))
    .filter((p) => p?.tradeStatus !== 'untouchable' && p?.tradeStatus !== 'not_available');

  if (direction === 'rebuilding') {
    const younger = movable.find((p) => n(p?.age, 30) <= 26 && n(p?.potential, n(p?.ovr, 60)) >= n(p?.ovr, 60));
    if (younger) return { type: 'swap_younger', playerId: younger.id, explain: 'they prefer younger controllable assets in a rebuild window' };
  }

  const needPos = now[0]?.pos;
  if (needPos) {
    const fitSwap = movable.find((p) => canonicalPos(p?.pos) === needPos && n(p?.ovr, 0) >= 66);
    if (fitSwap) return { type: 'swap_need_fit', playerId: fitSwap.id, explain: `they need help at ${needPos} and prefer fit over raw value` };
  }

  const surplusPos = surplus[0]?.pos;
  if (surplusPos) {
    const surplusSwap = movable.find((p) => canonicalPos(p?.pos) === surplusPos);
    if (surplusSwap) return { type: 'swap_surplus', playerId: surplusSwap.id, explain: `they are more willing to move ${surplusPos} depth` };
  }

  return { type: 'small_add', explain: 'they need a small sweetener to close this' };
}

export function rankTradePartners({ teams = [], userTeamId, outgoingPlayers = [], outgoingPicks = [], week = 1 } = {}) {
  const userTeam = teams.find((t) => Number(t?.id) === Number(userTeamId));
  if (!userTeam) return [];
  const outgoingPos = outgoingPlayers.map((p) => canonicalPos(p?.pos)).filter(Boolean);
  const outgoingValue = outgoingPlayers.reduce((sum, p) => sum + playerAssetValue(p, { direction: 'balanced' }), 0)
    + outgoingPicks.reduce((sum, p) => sum + pickAssetValue(p, { week, direction: 'balanced' }), 0);

  return teams
    .filter((team) => Number(team?.id) !== Number(userTeamId))
    .map((team) => {
      const direction = team?.teamIntel?.direction ?? 'balanced';
      const { now: needsNow, later: needsLater, surplus } = parseNeedList(team?.teamIntel);
      const capRoom = n(team?.capRoom, 0);
      const chemistryScore = n(team?.teamIntel?.chemistry?.score, 65);
      const orgDevScore = n(team?.teamIntel?.organization?.developmentEnvironment?.score, 60);
      const needNowHit = outgoingPos.find((pos) => needsNow.some((need) => canonicalPos(need.pos) === pos));
      const needLaterHit = outgoingPos.find((pos) => needsLater.some((need) => canonicalPos(need.pos) === pos));
      const duplicatePenalty = outgoingPos.filter((pos) => surplus.some((s) => canonicalPos(s.pos) === pos)).length * 8;
      const needSeverity = (needsNow.find((nRow) => canonicalPos(nRow.pos) === needNowHit)?.severity ?? 0)
        || (needsLater.find((nRow) => canonicalPos(nRow.pos) === needLaterHit)?.severity ?? 0)
        || 1;

      const timelineFit = direction === 'rebuilding'
        ? outgoingPlayers.reduce((sum, p) => sum + (n(p?.age, 35) <= 26 ? 8 : -6), 0)
        : direction === 'contender'
          ? outgoingPlayers.reduce((sum, p) => sum + (n(p?.ovr, 0) >= 74 ? 8 : -4), 0)
          : outgoingPlayers.reduce((sum, p) => sum + (n(p?.age, 35) <= 29 ? 3 : 1), 0);

      const capScore = capRoom < 0 ? -25 : capRoom < 6 ? -8 : capRoom < 15 ? 7 : 16;
      const packageScore = Math.min(18, outgoingValue / 130);
      const premiumNeedBonus = needNowHit && PREMIUM_POSITIONS.has(needNowHit) ? 9 : 0;
      const needScore = needNowHit ? 42 + (needSeverity * 3) : needLaterHit ? 22 + (needSeverity * 2) : 8;
      const contenderUrgency = direction === 'contender' && week >= 10 && needNowHit ? 10 : 0;
      const stabilityScore = Math.round((chemistryScore - 60) * 0.2 + (orgDevScore - 60) * 0.12);

      const fitScore = Math.max(4, Math.round(
        needScore
        + timelineFit
        + capScore
        + packageScore
        + contenderUrgency
        + premiumNeedBonus
        + stabilityScore
        - duplicatePenalty
      ));

      const capAbility = capRoom >= 20 ? 'strong' : capRoom >= 8 ? 'workable' : capRoom >= 0 ? 'tight' : 'over';
      const preference = getPreference(direction, Boolean(needNowHit), capRoom);
      const urgency = getUrgency({ week, direction, needSeverity });

      const reasons = [];
      if (needNowHit) reasons.push(`Immediate ${needNowHit} need (${needSeverity}/3 severity).`);
      else if (needLaterHit) reasons.push(`Future ${needLaterHit} need lines up with your package.`);
      if (duplicatePenalty > 0) reasons.push('Their roster already has a surplus at one or more outgoing positions.');
      if (direction === 'rebuilding') reasons.push('Rebuild timeline favors younger control and picks.');
      if (direction === 'contender') reasons.push('Contender window prioritizes immediate starters.');
      if (capAbility === 'over') reasons.push('They are over cap and need salary offset.');
      else if (capAbility === 'tight') reasons.push('Cap is tight; balanced salary is required.');
      if (!reasons.length) reasons.push('No major need match; extra value is likely required.');

      return {
        teamId: team.id,
        teamName: team.name ?? team.abbr,
        fitScore,
        direction,
        positionNeed: needNowHit ?? needLaterHit ?? needsNow[0]?.pos ?? needsLater[0]?.pos ?? 'depth',
        capAbility,
        urgency,
        preference,
        reasons,
        scoring: {
          needScore,
          timelineFit,
          capScore,
          duplicatePenalty,
          premiumNeedBonus,
        },
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore);
}
