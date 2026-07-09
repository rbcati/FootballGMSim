/*
 * Score Keeper Domain Module
 * ──────────────────────────
 * Owns all scoring-event resolution (TD, PAT, two-point, field goal, safety,
 * defensive/return TD) plus the league-level consequences of a final score:
 * team standings, head-to-head, and rivalry updates.
 *
 * The scoring-event handlers are pure: they take an already-drawn RNG roll and
 * return the points/flags to apply, so the orchestrator keeps full control of
 * the seeded RNG stream (math is byte-for-byte identical to the monolith).
 */

const SAFETY_POINTS = 2;
const FIELD_GOAL_POINTS = 3;

/**
 * Resolve a touchdown's point total based on the post-TD conversion roll.
 * Mirrors the legacy inline logic: XP make (7), missed XP (6), two-point (8).
 * @param {number} roll - U.random() draw in [0,1)
 * @param {number} kickMod - weather kick modifier
 * @returns {{ points: number, xpMade: number, twoPtMade: number }}
 */
export function resolveTouchdownScore(roll, kickMod = 1.0) {
  if (roll < 0.94 * kickMod) {
    return { points: 7, xpMade: 1, twoPtMade: 0 };
  }
  if (roll < 0.97) {
    return { points: 6, xpMade: 0, twoPtMade: 0 };
  }
  return { points: 8, xpMade: 0, twoPtMade: 1 };
}

/**
 * Resolve a field-goal attempt. A miss (e.g. resulting in a touchback) yields
 * zero points.
 * @param {number} roll - U.random() draw in [0,1)
 * @param {number} kickMod - weather kick modifier
 * @returns {{ made: boolean, points: number }}
 */
export function resolveFieldGoalScore(roll, kickMod = 1.0) {
  const made = roll < 0.85 * kickMod;
  return { made, points: made ? FIELD_GOAL_POINTS : 0 };
}

/**
 * Resolve a defensive-TD extra point (legacy: XP make = 7, else 6).
 * @param {number} roll - U.random() draw in [0,1)
 * @returns {{ points: number, xpMade: number }}
 */
export function resolveDefensiveTouchdownScore(roll) {
  if (roll < 0.95) return { points: 7, xpMade: 1 };
  return { points: 6, xpMade: 0 };
}

/**
 * A safety is always worth 2 points to the defending team.
 * @returns {{ points: number }}
 */
export function resolveSafetyScore() {
  return { points: SAFETY_POINTS };
}

/**
 * Kick/punt return-TD probability from a team's overall strength rating.
 * Bounded to [0.01, 0.15] (NFL average ~2-3 return TDs/team/season, ~0.15/game)
 * regardless of how extreme `str` is.
 * @param {number} str - team overall strength rating
 * @returns {number}
 */
export function calculateReturnTDChance(str) {
  return Math.min(0.15, Math.max(0.01, 0.04 + (str - 70) * 0.001));
}

/**
 * Pure three-way outcome classification for a game's canonical final score.
 * A true tie is never represented as a home win — only a strictly higher
 * score is a win, and `winnerIsHome` is omitted entirely for ties.
 * @param {{homeScore: number, awayScore: number, overtimePlayed?: boolean}} args
 * @returns {{homeWin: boolean, awayWin: boolean, tie: boolean, winner: ('home'|'away'|null), winnerIsHome?: boolean, margin: number, overtimePlayed: boolean}}
 */
export function buildGameOutcomeState({ homeScore, awayScore, overtimePlayed = false }) {
  const homeWin = homeScore > awayScore;
  const awayWin = awayScore > homeScore;
  const tie = homeScore === awayScore;
  const state = {
    homeWin,
    awayWin,
    tie,
    winner: homeWin ? 'home' : (awayWin ? 'away' : null),
    margin: Math.abs(homeScore - awayScore),
    overtimePlayed: !!overtimePlayed,
  };
  if (!tie) state.winnerIsHome = homeWin;
  return state;
}

/**
 * Helper to build/refresh the league's id→team map (cached on the league).
 */
export function ensureTeamsMap(league) {
  if (!league) return;
  if (league.teams && !league._teamsMap) {
    league._teamsMap = {};
    for (let i = 0; i < league.teams.length; i++) {
      const t = league.teams[i];
      if (t && t.id !== undefined) league._teamsMap[t.id] = t;
    }
  }
}

/**
 * Update team standings in the league object (incrementing existing values).
 */
export function updateTeamStandings(league, teamId, stats) {
  let team = null;

  if (league) {
    ensureTeamsMap(league);
    if (league._teamsMap) {
      team = league._teamsMap[teamId];
    } else if (league.teams) {
      team = league.teams.find((t) => t.id === teamId);
    }
  }

  if (!team) {
    return null;
  }

  if (stats.wins !== undefined) team.wins = (team.wins || 0) + stats.wins;
  if (stats.losses !== undefined) team.losses = (team.losses || 0) + stats.losses;
  if (stats.ties !== undefined) team.ties = (team.ties || 0) + stats.ties;

  if (stats.pf !== undefined) {
    team.ptsFor = (team.ptsFor || 0) + stats.pf;
    team.pointsFor = team.ptsFor;
  }
  if (stats.pa !== undefined) {
    team.ptsAgainst = (team.ptsAgainst || 0) + stats.pa;
    team.pointsAgainst = team.ptsAgainst;
  }

  if (stats.draws) {
    team.draws = (team.draws || 0) + stats.draws;
  } else if (stats.ties) {
    team.draws = (team.draws || 0) + stats.ties;
  }

  if (!team.record) team.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  team.record.w = team.wins;
  team.record.l = team.losses;
  team.record.t = team.ties;
  team.record.pf = team.ptsFor;
  team.record.pa = team.ptsAgainst;

  return team;
}

/**
 * Applies the result of a simulated game to the teams' records + head-to-head.
 */
export function applyResult(league, game, homeScore, awayScore, options = {}) {
  if (!game || typeof game !== 'object') return;

  const home = game.home;
  const away = game.away;
  if (!home || !away) {
    console.error('[SIM-DEBUG] applyResult: Invalid home or away team objects', { home: !!home, away: !!away });
    return;
  }

  if (game.hasOwnProperty('played')) {
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.played = true;
  }

  const homeStats = { wins: 0, losses: 0, ties: 0, pf: homeScore, pa: awayScore };
  const awayStats = { wins: 0, losses: 0, ties: 0, pf: awayScore, pa: homeScore };

  if (homeScore > awayScore) {
    homeStats.wins = 1;
    awayStats.losses = 1;
  } else if (awayScore > homeScore) {
    awayStats.wins = 1;
    homeStats.losses = 1;
  } else {
    homeStats.ties = 1;
    awayStats.ties = 1;
  }

  const updateHeadToHead = (team, oppId, stats, win, loss, tie) => {
    if (!team.headToHead) team.headToHead = {};
    if (!team.headToHead[oppId]) {
      team.headToHead[oppId] = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, streak: 0 };
    }
    const h2h = team.headToHead[oppId];
    h2h.pf += stats.pf;
    h2h.pa += stats.pa;

    if (win) {
      h2h.wins++;
      if (h2h.streak > 0) h2h.streak++;
      else h2h.streak = 1;
    } else if (loss) {
      h2h.losses++;
      if (h2h.streak < 0) h2h.streak--;
      else h2h.streak = -1;
    } else {
      h2h.ties++;
      h2h.streak = 0;
    }
  };

  updateHeadToHead(home, away.id, homeStats, homeStats.wins > 0, homeStats.losses > 0, homeStats.ties > 0);
  updateHeadToHead(away, home.id, awayStats, awayStats.wins > 0, awayStats.losses > 0, awayStats.ties > 0);

  const updatedHome = updateTeamStandings(league, home.id, homeStats);
  const updatedAway = updateTeamStandings(league, away.id, awayStats);

  const syncObject = (target, source, stats) => {
    if (source) {
      if (target !== source) {
        target.wins = source.wins;
        target.losses = source.losses;
        target.ties = source.ties;
        target.ptsFor = source.ptsFor;
        target.ptsAgainst = source.ptsAgainst;
        target.pointsFor = source.pointsFor;
        target.pointsAgainst = source.pointsAgainst;

        if (!target.record) target.record = {};
        target.record.w = source.record.w;
        target.record.l = source.record.l;
        target.record.t = source.record.t;
        target.record.pf = source.record.pf;
        target.record.pa = source.record.pa;
      }
    } else {
      target.wins = (target.wins || 0) + stats.wins;
      target.losses = (target.losses || 0) + stats.losses;
      target.ties = (target.ties || 0) + stats.ties;
      target.ptsFor = (target.ptsFor || 0) + stats.pf;
      target.ptsAgainst = (target.ptsAgainst || 0) + stats.pa;
      target.pointsFor = target.ptsFor;
      target.pointsAgainst = target.ptsAgainst;

      if (!target.record) target.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
      target.record.w = target.wins;
      target.record.l = target.losses;
      target.record.t = target.ties;
      target.record.pf = target.ptsFor;
      target.record.pa = target.ptsAgainst;
    }
  };

  syncObject(home, updatedHome, homeStats);
  syncObject(away, updatedAway, awayStats);
}

/**
 * Updates rivalry scores between two teams based on the game result.
 */
export function updateRivalries(home, away, homeScore, awayScore, isPlayoff) {
  if (!home || !away) return;

  if (!home.rivalries) home.rivalries = {};
  if (!away.rivalries) away.rivalries = {};

  if (!home.rivalries[away.id]) home.rivalries[away.id] = { score: 0, events: [] };
  if (!away.rivalries[home.id]) away.rivalries[home.id] = { score: 0, events: [] };

  const homeRiv = home.rivalries[away.id];
  const awayRiv = away.rivalries[home.id];

  const diff = Math.abs(homeScore - awayScore);
  const homeWon = homeScore > awayScore;
  let points = 0;

  if (!isPlayoff && home.conf === away.conf && home.div === away.div) {
    points += 5;
  }

  if (isPlayoff) {
    points += 25;
    if (homeWon) {
      awayRiv.score += 40;
      awayRiv.events.unshift(`Eliminated by ${home.abbr} in Playoffs`);
      homeRiv.score += 15;
    } else {
      homeRiv.score += 40;
      homeRiv.events.unshift(`Eliminated by ${away.abbr} in Playoffs`);
      awayRiv.score += 15;
    }
  }

  if (diff < 8) {
    points += 5;
  }

  if (diff > 24) {
    points += 5;
    if (homeWon) {
      awayRiv.score += 10;
    } else {
      homeRiv.score += 10;
    }
  }

  homeRiv.score += points;
  awayRiv.score += points;

  if (homeRiv.score > 100) homeRiv.score = 100;
  if (awayRiv.score > 100) awayRiv.score = 100;

  if (homeRiv.events.length > 3) homeRiv.events.length = 3;
  if (awayRiv.events.length > 3) awayRiv.events.length = 3;
}
