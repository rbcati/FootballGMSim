function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getUserTeam(league) {
  return league?.teams?.find((t) => t.id === league?.userTeamId) ?? null;
}

function computeStreak(recentResults) {
  if (!Array.isArray(recentResults) || recentResults.length === 0) return null;
  let type = null;
  let count = 0;
  for (let i = recentResults.length - 1; i >= 0; i -= 1) {
    const result = recentResults[i];
    if (result !== 'W' && result !== 'L') continue;
    if (type == null) {
      type = result;
      count = 1;
      continue;
    }
    if (result === type) count += 1;
    else break;
  }
  return type ? { type, count } : null;
}

function expectedWinPctByDirection(direction) {
  if (direction === 'contender') return 0.62;
  if (direction === 'rebuilding' || direction === 'retool') return 0.39;
  if (direction === 'desperate') return 0.46;
  return 0.5;
}

function mapOwnerState(score) {
  if (score < 32) return 'Critical';
  if (score < 50) return 'Hot Seat';
  if (score < 68) return 'Uneasy';
  return 'Stable';
}

function mapFanState(score) {
  if (score < 35) return 'Frustrated';
  if (score < 57) return 'Hopeful';
  if (score < 78) return 'Energized';
  return 'Euphoric';
}

function mapMediaState(score) {
  if (score < 35) return 'Quiet';
  if (score < 58) return 'Watching';
  if (score < 76) return 'Heated';
  return 'Frenzied';
}

function detectTransactionNarrative(league, userTeamId) {
  const items = Array.isArray(league?.newsItems) ? league.newsItems : [];
  const relevant = items.find((item) => {
    const teamId = item?.teamId ?? item?.meta?.teamId;
    return Number(teamId) === Number(userTeamId) && (item?.category || item?.type);
  });
  if (!relevant) return null;
  const key = String(relevant.category ?? relevant.type ?? '').toLowerCase();
  if (key.includes('trade') && key.includes('fallout')) return { fan: 'Trade backlash after moving a popular veteran', media: 'Media questions the long-term return on the trade' };
  if (key.includes('trade')) return { fan: 'Fan optimism up after major signing', media: 'Media frames the move as a franchise pivot' };
  if (key.includes('injury')) return { fan: 'Supporters are bracing for injury fallout', media: 'Media scrutiny rose after a major injury' };
  if (key.includes('free_agent')) return { fan: 'Fans loved the major free-agent move', media: 'Media moved your team into the spotlight' };
  return null;
}

function deriveOwnerDirectives({ league, userTeam, direction, week, winPct, ownerGoals, capRoom, intel }) {
  const directives = [];
  const projectedWins = Math.round(winPct * 17);

  if (Array.isArray(ownerGoals) && ownerGoals.length > 0) {
    const mapped = ownerGoals.map((goal) => {
      const target = Math.max(1, safeNum(goal?.target, 1));
      const current = safeNum(goal?.current, 0);
      const progress = clamp(Math.round((current / target) * 100));
      const lower = String(goal?.type ?? '').toLowerCase();
      if (lower.includes('playoff') || lower.includes('win_division')) {
        return { theme: lower.includes('division') ? 'Win division' : 'Make playoffs', progress, detail: goal?.description ?? 'Reach the postseason.' };
      }
      if (lower.includes('stay_under_cap')) {
        return { theme: 'Fix cap health', progress: capRoom >= 0 ? 100 : Math.max(0, 100 - Math.round(Math.abs(capRoom) * 5)), detail: goal?.description ?? 'Protect cap health.' };
      }
      if (lower.includes('develop') || lower.includes('draft')) {
        return { theme: 'Develop youth', progress, detail: goal?.description ?? 'Grow your young core.' };
      }
      if (lower.includes('win_games')) {
        return { theme: 'Contend now', progress: clamp(Math.round((projectedWins / target) * 100)), detail: goal?.description ?? `Target ${target} wins.` };
      }
      return { theme: 'Improve approval', progress, detail: goal?.description ?? 'Meet owner targets.' };
    });
    directives.push(...mapped);
  }

  if (directives.length === 0) {
    directives.push(
      direction === 'contender'
        ? { theme: 'Contend now', progress: clamp(Math.round(((winPct - 0.45) / 0.25) * 100)), detail: 'Stay aggressive while the window is open.' }
        : direction === 'rebuilding'
          ? { theme: 'Develop youth', progress: Math.min(95, 25 + ((intel?.upsideGroups?.length ?? 0) * 20)), detail: 'Build around young upside and draft value.' }
          : { theme: 'Improve approval', progress: clamp(Math.round(safeNum(league?.ownerApproval ?? league?.ownerMood, 55))), detail: 'Stabilize results and clarify direction.' },
    );

    if (capRoom < 0) {
      directives.push({ theme: 'Fix cap health', progress: Math.max(0, 100 - Math.round(Math.abs(capRoom) * 6)), detail: 'Clear salary stress before it limits options.' });
    }
    if (week >= 11 && winPct >= 0.48 && winPct <= 0.62) {
      directives.push({ theme: 'Make playoffs', progress: clamp(Math.round((projectedWins / 10) * 100)), detail: 'Stay in contention down the stretch.' });
    }
  }

  const seen = new Set();
  return directives.filter((d) => {
    if (seen.has(d.theme)) return false;
    seen.add(d.theme);
    return true;
  }).slice(0, 3);
}

export function deriveFranchisePressure(league, { intel = null, direction = 'balanced', ownerContext = null } = {}) {
  const userTeam = getUserTeam(league);
  if (!userTeam) return null;

  const wins = safeNum(userTeam?.wins, 0);
  const losses = safeNum(userTeam?.losses, 0);
  const ties = safeNum(userTeam?.ties, 0);
  const games = Math.max(1, wins + losses + ties);
  const week = safeNum(league?.week, 1);
  const winPct = (wins + ties * 0.5) / games;
  const streak = computeStreak(userTeam?.recentResults ?? []);
  const capRoom = safeNum(userTeam?.capRoom ?? userTeam?.capSpace, 0);
  const ownerApprovalBase = safeNum(league?.ownerApproval ?? league?.ownerMood, 60);
  const fanApprovalBase = safeNum(userTeam?.fanApproval ?? league?.fanApproval, Math.round(30 + winPct * 70));
  const expected = expectedWinPctByDirection(direction);
  const performanceDelta = winPct - expected;
  const roster = Array.isArray(userTeam?.roster) ? userTeam.roster : [];
  const starCount = roster.filter((p) => safeNum(p?.ovr, 0) >= 88).length;
  const rookieQb = roster.find((p) => String(p?.pos ?? '').toUpperCase() === 'QB' && safeNum(p?.age, 30) <= 24 && safeNum(p?.ovr, 0) >= 70);
  const transactionNarrative = detectTransactionNarrative(league, league?.userTeamId);
  const ownerGoals = Array.isArray(league?.ownerGoals) ? league.ownerGoals : [];
  const chemistry = intel?.chemistry ?? null;

  let ownerScore = ownerApprovalBase;
  const ownerReasons = [];
  if (performanceDelta <= -0.12) {
    ownerScore -= 12;
    ownerReasons.push('Missed owner win target');
  } else if (performanceDelta >= 0.08) {
    ownerScore += 8;
    ownerReasons.push('Beating ownership expectations');
  }
  if (capRoom >= 28 && direction === 'contender' && week >= 6) {
    ownerScore -= 8;
    ownerReasons.push('Cap room unused during contender window');
  }
  if (capRoom < 0) {
    ownerScore -= 12;
    ownerReasons.push('Cap health is under stress');
  }
  if ((intel?.expiringStarters ?? 0) >= 3 && week >= 8) {
    ownerScore -= 6;
    ownerReasons.push('Core contracts nearing expiry');
  }
  if (ownerContext?.triggerKey === 'missed_owner_goals') {
    ownerReasons.unshift('Owner directives are behind pace');
    ownerScore -= 8;
  }

  let fanScore = fanApprovalBase;
  const fanReasons = [];
  if (streak?.type === 'W' && streak.count >= 3) {
    fanScore += 10;
    fanReasons.push(`Fan momentum up after ${streak.count}-game win streak`);
  }
  if (streak?.type === 'L' && streak.count >= 3) {
    fanScore -= 10;
    fanReasons.push(`Fan confidence slipping after ${streak.count}-game skid`);
  }
  if (starCount >= 2) {
    fanScore += 4;
    fanReasons.push('Star power is keeping supporters engaged');
  }
  if (rookieQb) {
    fanScore += 5;
    fanReasons.push('Rookie QB has energized fan base');
  }
  if (transactionNarrative?.fan) {
    fanReasons.unshift(transactionNarrative.fan);
    fanScore += transactionNarrative.fan.includes('backlash') ? -6 : 6;
  }
  if (chemistry?.state === 'Strong locker room') {
    fanScore += 4;
    fanReasons.push('Strong locker room is visible to fans');
  } else if (chemistry?.state === 'Fragmented') {
    fanScore -= 7;
    fanReasons.push('Fans sense tension inside the locker room');
  }

  let mediaScore = 46;
  const mediaReasons = [];
  if (streak?.type === 'L' && streak.count >= 3) {
    mediaScore += 16;
    mediaReasons.push(`Media heat rising after ${streak.count}-game skid`);
  } else if (streak?.type === 'W' && streak.count >= 4) {
    mediaScore += 8;
    mediaReasons.push(`Media spotlight grew during ${streak.count}-game surge`);
  }
  if (direction === 'contender' && performanceDelta <= -0.1) {
    mediaScore += 10;
    mediaReasons.push('Media questions contender underperformance');
  }
  if (transactionNarrative?.media) {
    mediaReasons.unshift(transactionNarrative.media);
    mediaScore += 8;
  }
  if (league?.phase === 'playoffs') {
    mediaScore += 10;
    mediaReasons.push('Playoff stage amplified the narrative');
  }
  if (chemistry?.state === 'Uneasy' || chemistry?.state === 'Fragmented') {
    mediaScore += chemistry.state === 'Fragmented' ? 11 : 6;
    mediaReasons.push('Media is tracking locker-room chemistry closely');
  }

  ownerScore = clamp(Math.round(ownerScore));
  fanScore = clamp(Math.round(fanScore));
  mediaScore = clamp(Math.round(mediaScore));

  const directives = deriveOwnerDirectives({ league, userTeam, direction, week, winPct, ownerGoals, capRoom, intel });

  const consequence = ownerScore < 40
    ? 'Owner patience is thinning. Job-security warnings are more likely if results do not stabilize.'
    : mediaScore >= 75
      ? 'Media scrutiny is amplifying every loss and major move.'
      : chemistry?.state === 'Fragmented'
        ? 'Locker-room instability is now amplifying every external pressure signal.'
        : fanScore < 45
          ? 'Fan confidence is slipping despite long-term flexibility.'
          : 'Pressure is manageable if weekly results stay aligned with your plan.';

  const fanNote = fanReasons[0] ?? 'Supporters are waiting for a clearer direction signal.';
  const mediaNote = mediaReasons[0] ?? 'Local media is tracking your next inflection point.';

  return {
    owner: {
      score: ownerScore,
      state: mapOwnerState(ownerScore),
      reasons: ownerReasons.slice(0, 3),
    },
    fans: {
      score: fanScore,
      state: mapFanState(fanScore),
      reasons: fanReasons.slice(0, 3),
    },
    media: {
      score: mediaScore,
      state: mapMediaState(mediaScore),
      reasons: mediaReasons.slice(0, 3),
    },
    directives,
    consequence,
    narrativeNotes: {
      fan: fanNote,
      media: mediaNote,
    },
    context: {
      winPct: Number(winPct.toFixed(3)),
      expectedWinPct: expected,
      capRoom: Number(capRoom.toFixed(1)),
      direction,
      week,
      streak,
    },
  };
}
