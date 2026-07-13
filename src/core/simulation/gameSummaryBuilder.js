/*
 * Game Summary Builder Domain Module
 * ──────────────────────────────────
 * Owns the assembly of presentation-shaped game data: per-player box scores,
 * canonical team-side stat totals, the box-score stat normalizer (alias
 * resolution + derived fields), and post-game narrative callbacks.
 * All functions are pure (return new objects).
 */

import { Utils as U } from '../utils.js';
import { passerRating } from './mathHelpers.js';

/**
 * Generates post-game narrative callbacks from pre-game context + actual stats.
 */
export function generatePostGameCallbacks(context, stats, homeScore, awayScore) {
  if (!context) return [];
  const callbacks = [];
  const { matchup, offPlanId, defPlanId, riskId, stakes, userIsHome } = context;

  const userStats = userIsHome ? stats.home : stats.away;
  const oppStats = userIsHome ? stats.away : stats.home;
  const userScore = userIsHome ? homeScore : awayScore;
  const oppScore = userIsHome ? awayScore : homeScore;
  const won = userScore > oppScore;

  const sumStat = (teamStats, statName) => {
    if (!teamStats || !teamStats.players) return 0;
    return Object.values(teamStats.players).reduce((sum, p) => sum + (p[statName] || 0), 0);
  };

  const hasBigPlay = (teamStats) => {
    if (!teamStats || !teamStats.players) return false;
    return Object.values(teamStats.players).some((p) => (p.longestPass > 45) || (p.longestRun > 35));
  };

  const getTopPlayer = (teamStats, posFilter, statName) => {
    if (!teamStats || !teamStats.players) return null;
    let best = null;
    let bestVal = 0;
    for (const p of Object.values(teamStats.players)) {
      const passes = posFilter ? posFilter(p.pos) : true;
      if (passes && (p[statName] || 0) > bestVal) {
        bestVal = p[statName];
        best = p;
      }
    }
    return best;
  };

  const isQB = (pos) => pos === 'QB';
  const isRB = (pos) => pos === 'RB';
  const isWRTE = (pos) => pos === 'WR' || pos === 'TE';
  const isDef = (pos) => pos === 'DL' || pos === 'LB' || pos === 'CB' || pos === 'S';

  const userRushYds = sumStat(userStats, 'rushYd');
  const userPassYds = sumStat(userStats, 'passYd');
  const userTurnovers = sumStat(userStats, 'interceptions') + sumStat(userStats, 'fumbles');
  const userSacks = sumStat(userStats, 'sacksAllowed');
  const userDefSacks = sumStat(userStats, 'sacks');
  const userBigPlays = hasBigPlay(userStats);
  const userTotalYds = userPassYds + userRushYds;
  const userPassTDs = sumStat(userStats, 'passTD');
  const userDefInts = sumStat(userStats, 'interceptions');

  const oppRushYds = sumStat(oppStats, 'rushYd');
  const oppPassYds = sumStat(oppStats, 'passYd');
  const oppTurnovers = sumStat(oppStats, 'interceptions') + sumStat(oppStats, 'fumbles');

  const scoreDiff = Math.abs(userScore - oppScore);
  const isBlowout = scoreDiff >= 21;
  const isClose = scoreDiff <= 7;

  const topPasser = getTopPlayer(userStats, isQB, 'passYd');
  const topRusher = getTopPlayer(userStats, isRB, 'rushYd');
  const topReceiver = getTopPlayer(userStats, isWRTE, 'recYd');
  const topDefender = getTopPlayer(userStats, isDef, 'sacks')
    || getTopPlayer(userStats, isDef, 'tackles');
  const userAbbr = context.userTeamAbbr || 'your team';
  const oppAbbr = context.oppTeamAbbr || 'the opponent';

  if (matchup) {
    if (matchup.toLowerCase().includes('passing') && userPassYds > 275) {
      const name = topPasser ? topPasser.name.split(' ').pop() : 'the QB';
      callbacks.push(`${name} exploited the favorable passing matchup with ${userPassYds} yards through the air.`);
    } else if (matchup.toLowerCase().includes('passing') && userPassYds < 175) {
      callbacks.push(`Despite a favorable passing matchup, ${userAbbr}'s air attack never got going (${userPassYds} yds).`);
    } else if (matchup.toLowerCase().includes('rushing') && userRushYds > 160) {
      const name = topRusher ? topRusher.name.split(' ').pop() : 'the run game';
      callbacks.push(`${name} ran all over their weak run defense — ${userRushYds} rushing yards.`);
    } else if (matchup.toLowerCase().includes('rushing') && userRushYds < 60) {
      callbacks.push(`The run game failed to capitalize despite the favorable matchup (${userRushYds} rushing yds).`);
    }
  }

  if (offPlanId === 'AGGRESSIVE_PASSING') {
    if (userPassYds > 300) {
      const name = topPasser ? topPasser.name.split(' ').pop() : 'the QB';
      callbacks.push(`Aggressive passing paid off — ${name} carved them up for ${userPassYds} yards.`);
    } else if (userTurnovers >= 3) {
      callbacks.push(`Going aggressive through the air backfired with ${userTurnovers} costly turnovers.`);
    } else if (userPassTDs >= 3) {
      callbacks.push(`The aggressive air attack found paydirt ${userPassTDs} times today.`);
    }
  } else if (offPlanId === 'BALL_CONTROL') {
    if (userRushYds > 150 && won) {
      const name = topRusher ? topRusher.name.split(' ').pop() : 'the backfield';
      callbacks.push(`${name} wore them down — ${userRushYds} rushing yards made ball control the perfect call.`);
    } else if (userScore < 14) {
      callbacks.push('Ball-control backfired — the conservative offense couldn\'t generate points.');
    } else if (userRushYds > 120) {
      callbacks.push(`Ground-and-pound kept the chains moving with ${userRushYds} rushing yards.`);
    }
  } else if (offPlanId === 'PROTECT_QB') {
    if (userSacks === 0) {
      callbacks.push('Protection schemes worked flawlessly — the QB was never sacked.');
    } else if (userSacks >= 4) {
      callbacks.push(`The pocket collapsed despite prioritizing QB protection (${userSacks} sacks allowed).`);
    } else if (userSacks <= 1 && userPassYds > 250) {
      callbacks.push(`Clean pocket led to a sharp passing performance with ${userPassYds} yards.`);
    }
  } else if (offPlanId === 'FEED_STAR') {
    const starId = context.starTargetId;
    const starName = context.starPlayerName;
    let starStats = null;
    if (starId && userStats && userStats.players) {
      starStats = userStats.players[String(starId)];
    }
    if (starStats) {
      const totalStarYds = (starStats.recYd || 0) + (starStats.rushYd || 0);
      const starTDs = (starStats.recTD || 0) + (starStats.rushTD || 0);
      const displayName = (starName || (starStats.name || 'the star')).split(' ').pop();
      if (totalStarYds > 120 || starTDs >= 2) {
        callbacks.push(`Feeding ${displayName} paid dividends — ${totalStarYds} yards${starTDs > 0 ? ` and ${starTDs} TD${starTDs > 1 ? 's' : ''}` : ''} today.`);
      } else if (totalStarYds < 50) {
        callbacks.push(`${displayName} was well-covered and couldn't get untracked (${totalStarYds} yds).`);
      } else {
        callbacks.push(`${displayName} was a steady presence with ${totalStarYds} yards.`);
      }
    } else if (starName) {
      callbacks.push(`The game plan revolved around ${starName.split(' ').pop()}, with mixed results.`);
    }
  }

  if (defPlanId === 'BLITZ_HEAVY') {
    if (userDefSacks >= 4) {
      callbacks.push(`The blitz was relentless — ${userDefSacks} sacks left their QB rattled.`);
    } else if (oppScore > 28) {
      callbacks.push(`Blitzing backfired badly; ${oppAbbr} found the open receivers for ${oppScore} points.`);
    } else if (userDefSacks >= 2 && oppTurnovers >= 2) {
      callbacks.push(`Pressure and takeaways: the blitz scheme created chaos in ${oppAbbr}'s backfield.`);
    }
  } else if (defPlanId === 'SELL_OUT_RUN') {
    if (oppPassYds > 280) {
      callbacks.push(`Stacking the box opened up the air — ${oppAbbr} threw for ${oppPassYds} yards over the top.`);
    } else if (oppRushYds < 60) {
      callbacks.push(`Selling out to stop the run worked: ${oppAbbr} held to ${oppRushYds} rushing yards.`);
    } else if (oppRushYds < 100 && oppPassYds < 200) {
      callbacks.push(`Run-stop focus kept ${oppAbbr} one-dimensional all afternoon.`);
    }
  } else if (defPlanId === 'DISGUISE_COVERAGE') {
    if (userDefInts >= 2) {
      callbacks.push(`Mixed coverages paid off — the defense forced ${userDefInts} interceptions.`);
    } else if (oppPassYds > 280) {
      callbacks.push(`${oppAbbr}'s QB solved the disguised looks and threw for ${oppPassYds} yards.`);
    } else if (oppTurnovers >= 2) {
      callbacks.push(`Confusing looks created ${oppTurnovers} turnovers and kept the offense off-balance.`);
    }
  } else if (defPlanId === 'ZONE_COVERAGE') {
    if (oppPassYds < 180) {
      callbacks.push(`Zone coverage smothered ${oppAbbr}'s passing attack (${oppPassYds} yds allowed).`);
    } else if (oppPassYds > 300) {
      callbacks.push(`Zone had too many holes today — ${oppAbbr} found space for ${oppPassYds} passing yards.`);
    }
  }

  if (riskId === 'AGGRESSIVE') {
    if (userBigPlays && won) {
      callbacks.push('High-risk football paid off — explosive plays were the difference.');
    } else if (userTurnovers >= 3) {
      callbacks.push(`Gambling backfired: ${userTurnovers} turnovers handed ${oppAbbr} momentum they never gave back.`);
    } else if (userBigPlays && !won) {
      callbacks.push(`Big plays were there, but too many mistakes allowed ${oppAbbr} to hang around.`);
    }
  } else if (riskId === 'CONSERVATIVE') {
    if (won && userTurnovers === 0) {
      callbacks.push('Mistake-free football — zero turnovers and steady execution sealed the win.');
    } else if (!won && userScore < 17) {
      callbacks.push(`Playing it safe stalled the offense; ${userAbbr} couldn't generate enough firepower.`);
    } else if (won && scoreDiff <= 6) {
      callbacks.push('Conservative execution was enough to grind out a close one.');
    }
  }

  if (isBlowout && won) {
    if (userTotalYds > 400) {
      callbacks.push(`Dominant from start to finish — ${userTotalYds} total yards in a ${userScore}-${oppScore} blowout.`);
    } else {
      callbacks.push(`${userAbbr} was in full control all day, winning by ${scoreDiff} points.`);
    }
  } else if (isBlowout && !won) {
    callbacks.push(`A forgettable day — ${oppAbbr} dominated and won by ${scoreDiff} points.`);
  } else if (isClose && won) {
    if (topPasser && (topPasser.passYd || 0) > 250) {
      callbacks.push(`${topPasser.name.split(' ').pop()} came through when it mattered — ${topPasser.passYd} yards in a ${userScore}-${oppScore} nail-biter.`);
    } else {
      callbacks.push(`A gutsy ${userScore}-${oppScore} win — ${userAbbr} found a way to close it out.`);
    }
  } else if (isClose && !won) {
    callbacks.push(`Heartbreaker — ${userAbbr} fell by just ${scoreDiff} points.`);
  }

  if (callbacks.length < 2) {
    if (topReceiver && (topReceiver.recYd || 0) > 130) {
      const tds = topReceiver.recTD || 0;
      callbacks.push(`${topReceiver.name.split(' ').pop()} was impossible to stop: ${topReceiver.recYd} yards${tds > 0 ? `, ${tds} TD` : ''}.`);
    } else if (topRusher && (topRusher.rushYd || 0) > 120) {
      const tds = topRusher.rushTD || 0;
      callbacks.push(`${topRusher.name.split(' ').pop()} carried the load with ${topRusher.rushYd} rushing yards${tds > 0 ? ` and ${tds} TD${tds > 1 ? 's' : ''}` : ''}.`);
    } else if (topDefender && (topDefender.sacks || 0) >= 2) {
      callbacks.push(`${topDefender.name.split(' ').pop()} wrecked the game plan — ${topDefender.sacks} sacks.`);
    }
  }

  if (stakes && stakes > 50) {
    if (won) {
      if (isBlowout) {
        callbacks.push(`${stakes >= 90 ? 'A legendary, season-defining' : 'An emphatic'} performance under immense pressure. ${userAbbr} completely dismantled their opponent in a statement ${userScore}-${oppScore} blowout with everything on the line!`);
      } else if (isClose) {
        callbacks.push(`${stakes >= 90 ? 'A legendary, season-defining' : 'An incredibly clutch'} performance under immense playoff-caliber pressure. ${userAbbr} survived an absolute thriller to secure a massive ${userScore}-${oppScore} victory!`);
      } else {
        callbacks.push(`${stakes >= 90 ? 'A legendary, season-defining' : 'An incredibly clutch'} performance under immense pressure. ${userAbbr} answered the bell and secured a critical ${userScore}-${oppScore} victory to keep their goals alive!`);
      }
    } else {
      if (isBlowout) {
        callbacks.push(`A devastating, humiliating ${scoreDiff}-point blowout defeat when the stakes couldn't have been higher. The locker room is completely stunned, and the owner will demand answers.`);
      } else if (isClose) {
        callbacks.push(`An agonizing, heart-breaking ${scoreDiff}-point loss in a thriller with their backs against the wall. The locker room is dead silent.`);
      } else {
        callbacks.push(`A devastating, crushing ${scoreDiff}-point defeat when the stakes couldn't have been higher. A massive missed opportunity for ${userAbbr}.`);
      }
    }
  }

  if (context.weather) {
    const w = context.weather;
    if (w === 'snow' && won) {
      callbacks.push(`${userAbbr} embraced the snow and ice to grind out a win in the elements.`);
    } else if (w === 'snow' && !won) {
      callbacks.push(`The blizzard conditions neutralized ${userAbbr}'s offense in a tough loss.`);
    } else if (w === 'rain' && userTurnovers >= 2) {
      callbacks.push(`Slippery conditions contributed to ${userTurnovers} turnovers in the rain.`);
    } else if (w === 'wind' && userPassYds < 150) {
      callbacks.push(`Heavy winds grounded ${userAbbr}'s passing attack (${userPassYds} yards).`);
    }
  }

  return [...new Set(callbacks)].slice(0, 3);
}

export function transformStatsForBoxScore(playerStatsMap, roster, teamId = null) {
  if (!playerStatsMap) return {};
  const box = {};
  const pids = Object.keys(playerStatsMap);
  const rosterById = new Map((roster ?? []).map((player) => [String(player?.id), player]));

  for (let i = 0; i < pids.length; i++) {
    const pid = pids[i];
    const p = rosterById.get(String(pid));
    if (!p) continue;

    const row = playerStatsMap[pid];
    let rawStats = {};
    let name = p.name;
    let pos = p.pos;

    if (row && typeof row === 'object' && row.stats && typeof row.stats === 'object' && !Array.isArray(row.stats)) {
      rawStats = row.stats;
      if (row.name != null) name = row.name;
      if (row.pos != null) pos = row.pos;
    } else if (row && typeof row === 'object') {
      const { name: rn, pos: rp, teamId: _tid, playerId: _pid, ...rest } = row;
      rawStats = rest;
      if (rn != null) name = rn;
      if (rp != null) pos = rp;
    }

    const normalizedStats = normalizeGameStatsForBoxScore(rawStats);
    box[pid] = {
      name,
      pos,
      playerId: p.id,
      ...(teamId != null ? { teamId } : {}),
      stats: normalizedStats,
    };
  }
  return box;
}

function sumPlayerStat(rows, key, predicate = () => true) {
  return Object.values(rows ?? {}).reduce((acc, row) => {
    const stats = row?.stats ?? row ?? {};
    if (!predicate(stats, row)) return acc;
    return acc + (Number(stats?.[key]) || 0);
  }, 0);
}

function deriveCanonicalTeamSideStats(playerRows = {}, driveStats = {}, rawTeamStats = {}) {
  const rows = playerRows ?? {};
  const raw = rawTeamStats ?? {};
  const drive = driveStats ?? {};
  const offenseRow = (stats) => (
    Number(stats?.passAtt ?? 0) > 0
    || Number(stats?.rushAtt ?? 0) > 0
    || Number(stats?.targets ?? 0) > 0
    || Number(stats?.receptions ?? 0) > 0
  );
  const passYards = Number(drive?.passYards ?? drive?.passYd ?? drive?.passYds)
    || sumPlayerStat(rows, 'passYd', offenseRow);
  const rushYards = Number(drive?.rushYards ?? drive?.rushYd ?? drive?.rushYds)
    || sumPlayerStat(rows, 'rushYd', offenseRow);
  const passAtt = Number(drive?.passAtt) || sumPlayerStat(rows, 'passAtt', offenseRow);
  const passComp = Number(drive?.passComp ?? drive?.comp) || sumPlayerStat(rows, 'passComp', offenseRow);
  const rushAtt = Number(drive?.rushAtt) || sumPlayerStat(rows, 'rushAtt', offenseRow);
  const totalYards = Number(drive?.totalYards) || passYards + rushYards;
  const plays = Number(drive?.plays) || passAtt + rushAtt + Number(drive?.sacksAllowed ?? 0);
  const offensiveInterceptions = sumPlayerStat(rows, 'interceptions', (stats) => Number(stats?.passAtt ?? 0) > 0);
  const fumblesLost = sumPlayerStat(rows, 'fumblesLost', offenseRow)
    || sumPlayerStat(rows, 'fumbles', offenseRow);
  const sacksAllowed = Number(drive?.sacksAllowed)
    || sumPlayerStat(rows, 'sacked', (stats) => Number(stats?.passAtt ?? 0) > 0)
    || sumPlayerStat(rows, 'sacksTaken', (stats) => Number(stats?.passAtt ?? 0) > 0)
    || sumPlayerStat(rows, 'sacks', (stats) => Number(stats?.passAtt ?? 0) > 0);

  return {
    ...raw,
    plays,
    firstDowns: Number(drive?.firstDowns ?? raw?.firstDowns ?? 0),
    passAtt,
    passComp,
    passYards,
    passYd: passYards,
    passTD: Number(drive?.passTD ?? raw?.passTD ?? 0) || sumPlayerStat(rows, 'passTD', offenseRow),
    rushAtt,
    rushYards,
    rushYd: rushYards,
    rushTD: Number(drive?.rushTD ?? raw?.rushTD ?? 0) || sumPlayerStat(rows, 'rushTD', offenseRow),
    totalYards,
    yardsPerPlay: plays > 0 ? U.round(totalYards / plays, 2) : 0,
    turnovers: Number(drive?.turnovers ?? raw?.turnovers ?? 0) || offensiveInterceptions + fumblesLost,
    sacksAllowed,
    sacks: sumPlayerStat(rows, 'sacks', (stats) => Number(stats?.passAtt ?? 0) === 0),
    interceptions: offensiveInterceptions,
    takeaways: sumPlayerStat(rows, 'interceptions', (stats) => Number(stats?.passAtt ?? 0) === 0) + sumPlayerStat(rows, 'fumbleRecoveries'),
    fieldGoalsMade: sumPlayerStat(rows, 'fieldGoalsMade'),
    fieldGoalsAttempted: sumPlayerStat(rows, 'fieldGoalsAttempted'),
    extraPointsMade: sumPlayerStat(rows, 'extraPointsMade'),
    extraPointsAttempted: sumPlayerStat(rows, 'extraPointsAttempted'),
    punts: sumPlayerStat(rows, 'punts'),
    puntYards: sumPlayerStat(rows, 'puntYards'),
    kickReturns: sumPlayerStat(rows, 'kickReturns'),
    kickReturnYards: sumPlayerStat(rows, 'kickReturnYards'),
    puntReturns: sumPlayerStat(rows, 'puntReturns'),
    puntReturnYards: sumPlayerStat(rows, 'puntReturnYards'),
    thirdDownMade: Number(drive?.thirdDownMade ?? raw?.thirdDownMade ?? raw?.thirdDownConversions ?? 0),
    thirdDownAtt: Number(drive?.thirdDownAtt ?? raw?.thirdDownAtt ?? raw?.thirdDownAttempts ?? 0),
    redZoneMade: Number(drive?.redZoneMade ?? raw?.redZoneMade ?? raw?.redZoneTDs ?? 0),
    redZoneAtt: Number(drive?.redZoneAtt ?? raw?.redZoneAtt ?? raw?.redZoneTrips ?? 0),
    penalties: Number(drive?.penalties ?? raw?.penalties ?? 0),
    timePossession: Number(drive?.timePossession ?? raw?.timePossession ?? 0),
  };
}

export function buildCanonicalTeamStats({ home = {}, away = {}, teamDriveStats = {}, rawTeamStats = {} } = {}) {
  return {
    home: deriveCanonicalTeamSideStats(home, teamDriveStats?.home, rawTeamStats?.home),
    away: deriveCanonicalTeamSideStats(away, teamDriveStats?.away, rawTeamStats?.away),
  };
}

export function normalizeGameStatsForBoxScore(rawStats = {}) {
  const stats = { ...(rawStats || {}) };

  const alias = (canonicalKey, ...keys) => {
    if (stats[canonicalKey] == null) {
      for (const key of keys) {
        if (stats[key] != null) {
          stats[canonicalKey] = stats[key];
          break;
        }
      }
    }
  };

  alias('passYd', 'passYds');
  alias('passTD', 'passTDs');
  alias('rushYd', 'rushYds');
  alias('rushTD', 'rushTDs');
  alias('recYd', 'recYds');
  alias('recTD', 'recTDs');
  alias('interceptions', 'INT', 'ints');
  alias('fumblesLost', 'fumbles');
  alias('sacked', 'sacksTaken');
  alias('rushLong', 'longestRun');
  alias('recLong', 'longestCatch');
  alias('tfl', 'tacklesForLoss');
  alias('passesDefended', 'passDefls', 'passBreakups');
  alias('fumbleRecoveries', 'fumbleRecs', 'fumblesRecovered');
  alias('defTD', 'defTDs', 'intTDs', 'fumbleReturnTDs');
  alias('fieldGoalsMade', 'fgMade');
  alias('fieldGoalsAttempted', 'fgAttempts');
  alias('extraPointsMade', 'xpMade');
  alias('extraPointsAttempted', 'xpAttempts');
  alias('puntAvg', 'avgPuntYards');
  alias('puntLong', 'longestPunt');
  alias('returnTD', 'returnTDs');

  if (stats.passAtt > 0 && stats.sacked == null && stats.sacks != null) {
    stats.sacked = stats.sacks;
  }

  if (stats.completionPct == null) {
    const att = Number(stats.passAtt ?? 0);
    const comp = Number(stats.passComp ?? 0);
    stats.completionPct = att > 0 ? Math.round((comp / att) * 1000) / 10 : 0;
  }

  if (stats.passerRating == null) {
    stats.passerRating = passerRating({
      comp: Number(stats.passComp ?? 0),
      att: Number(stats.passAtt ?? 0),
      yds: Number(stats.passYd ?? 0),
      td: Number(stats.passTD ?? 0),
      ints: Number(stats.interceptions ?? 0),
    });
  }

  if (stats.ypc == null) {
    const rushAtt = Number(stats.rushAtt ?? 0);
    const rushYd = Number(stats.rushYd ?? 0);
    stats.ypc = rushAtt > 0 ? Math.round((rushYd / rushAtt) * 100) / 100 : 0;
  }

  if (stats.ypr == null) {
    const rec = Number(stats.receptions ?? 0);
    const recYd = Number(stats.recYd ?? 0);
    stats.ypr = rec > 0 ? Math.round((recYd / rec) * 100) / 100 : 0;
  }

  if (stats.fieldGoalPct == null) {
    const fga = Number(stats.fieldGoalsAttempted ?? 0);
    const fgm = Number(stats.fieldGoalsMade ?? 0);
    stats.fieldGoalPct = fga > 0 ? Math.round((fgm / fga) * 1000) / 10 : 0;
  }

  if (stats.points == null) {
    stats.points = (Number(stats.fieldGoalsMade ?? 0) * 3)
      + Number(stats.extraPointsMade ?? 0)
      + (Number(stats.recTD ?? 0) * 6)
      + (Number(stats.rushTD ?? 0) * 6)
      + (Number(stats.returnTD ?? 0) * 6)
      + (Number(stats.defTD ?? 0) * 6);
  }

  return stats;
}
