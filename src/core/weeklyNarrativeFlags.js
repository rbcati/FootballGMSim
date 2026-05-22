/**
 * weeklyNarrativeFlags.js
 *
 * Pure, stateless derivation of narrative flags from a single completed game.
 * No storage, no side effects. Returns a flat flags object for downstream use.
 */

function num(v, fallback = 0) {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function toId(raw) {
  if (raw == null) return NaN;
  if (typeof raw === 'object') return num(raw.id, NaN);
  return num(raw, NaN);
}

function winStreak(recentResults = []) {
  if (!Array.isArray(recentResults) || recentResults.length === 0) return 0;
  const rev = [...recentResults].reverse();
  let streak = 0;
  for (const r of rev) {
    if (String(r).toUpperCase() === 'W') streak++;
    else break;
  }
  return streak;
}

/**
 * Derive narrative flags for a single completed game.
 *
 * @param {object} game  - Completed game object (homeScore/awayScore, home/away team IDs, etc.)
 * @param {Array}  teams - Full teams array from league state (for record/division lookups)
 * @param {object} [opts]
 * @param {number|string} [opts.userTeamId]
 * @param {string}        [opts.phase]       - 'regular' | 'playoffs' | 'preseason'
 * @param {number}        [opts.totalWeeks]  - Total regular-season weeks (default 18)
 * @param {number}        [opts.week]        - Current week number
 * @returns {{
 *   upsetWin: boolean,
 *   divisionGame: boolean,
 *   overtimeGame: boolean,
 *   comebackWin: boolean,
 *   blowoutLoss: boolean,
 *   starPlayerInjury: boolean,
 *   playoffClinched: boolean,
 *   playoffEliminated: boolean
 * }}
 */
export function deriveNarrativeFlags(game, teams = [], opts = {}) {
  const { userTeamId, phase = 'regular', totalWeeks = 18, week = 1 } = opts;

  const homeScore = num(game?.homeScore ?? game?.scoreHome, 0);
  const awayScore = num(game?.awayScore ?? game?.scoreAway, 0);
  const diff = Math.abs(homeScore - awayScore);
  const total = homeScore + awayScore;
  const homeId = toId(game?.home ?? game?.homeId ?? game?.homeTeamId);
  const awayId = toId(game?.away ?? game?.awayId ?? game?.awayTeamId);
  const homeWon = homeScore > awayScore;

  // ── overtimeGame ─────────────────────────────────────────────────────────
  const overtimeGame = !!(
    num(game?.ot, 0) > 0 ||
    num(game?.overtimePeriods, 0) > 0 ||
    (Array.isArray(game?.quarterScores) && Array.isArray(game.quarterScores[0]) && game.quarterScores[0].length > 4)
  );

  // ── blowoutLoss (from user perspective, or general blowout if no user) ───
  const blowoutThreshold = 21;
  let blowoutLoss = false;
  if (total > 0 && diff >= blowoutThreshold) {
    if (userTeamId != null) {
      const userIsHome = homeId === num(userTeamId);
      const userIsAway = awayId === num(userTeamId);
      if ((userIsHome && !homeWon) || (userIsAway && homeWon)) blowoutLoss = true;
    } else {
      blowoutLoss = true;
    }
  }

  // ── comebackWin ───────────────────────────────────────────────────────────
  let comebackWin = false;
  if (total > 0 && diff <= 10 && Array.isArray(game?.quarterScores) && game.quarterScores.length >= 2) {
    const homeThrough3 = (game.quarterScores[0] ?? []).slice(0, 3).reduce((s, q) => s + num(q), 0);
    const awayThrough3 = (game.quarterScores[1] ?? []).slice(0, 3).reduce((s, q) => s + num(q), 0);
    const deficit = homeWon ? awayThrough3 - homeThrough3 : homeThrough3 - awayThrough3;
    if (deficit >= 10) {
      if (userTeamId != null) {
        const userIsHome = homeId === num(userTeamId);
        const userIsAway = awayId === num(userTeamId);
        const userWon = (userIsHome && homeWon) || (userIsAway && !homeWon);
        comebackWin = userWon;
      } else {
        comebackWin = true;
      }
    }
  }

  // ── divisionGame ──────────────────────────────────────────────────────────
  let divisionGame = false;
  if (Array.isArray(teams) && teams.length > 0 && !isNaN(homeId) && !isNaN(awayId)) {
    const homeTeam = teams.find((t) => num(t?.id, -1) === homeId);
    const awayTeam = teams.find((t) => num(t?.id, -1) === awayId);
    if (homeTeam && awayTeam) {
      divisionGame =
        num(homeTeam.conf, -1) === num(awayTeam.conf, -2) &&
        num(homeTeam.div, -1) === num(awayTeam.div, -2);
    }
  }

  // ── upsetWin ──────────────────────────────────────────────────────────────
  let upsetWin = false;
  if (total > 0 && Array.isArray(teams) && teams.length > 0) {
    const winnerId = homeWon ? homeId : awayId;
    const loserId = homeWon ? awayId : homeId;
    const winnerTeam = teams.find((t) => num(t?.id, -1) === winnerId);
    const loserTeam = teams.find((t) => num(t?.id, -1) === loserId);
    if (winnerTeam && loserTeam) {
      const winnerWins = num(winnerTeam.wins, 0);
      const loserWins = num(loserTeam.wins, 0);
      const gap = loserWins - winnerWins;
      if (gap >= 3 && loserWins >= 4) upsetWin = true;
    }
    // Also flag when a user team wins as underdog
    if (!upsetWin && userTeamId != null) {
      const userTeam = teams.find((t) => num(t?.id, -1) === num(userTeamId));
      const oppId = num(userTeamId) === homeId ? awayId : homeId;
      const oppTeam = teams.find((t) => num(t?.id, -1) === oppId);
      const userWon = (num(userTeamId) === homeId && homeWon) || (num(userTeamId) === awayId && !homeWon);
      if (userTeam && oppTeam && userWon) {
        const gap = num(oppTeam.wins) - num(userTeam.wins);
        if (gap >= 2) upsetWin = true;
      }
    }
  }

  // ── starPlayerInjury ─────────────────────────────────────────────────────
  const injuries = Array.isArray(game?.injuries) ? game.injuries : [];
  const starPlayerInjury = injuries.some(
    (inj) => (num(inj?.duration, 0) >= 4 || inj?.seasonEnding) && num(inj?.playerOvr ?? inj?.ovr, 0) >= 78,
  );

  // ── playoffClinched / playoffEliminated (week 12+ regular season) ────────
  let playoffClinched = false;
  let playoffEliminated = false;
  if (phase === 'regular' && week >= 12 && Array.isArray(teams) && teams.length > 0) {
    const weeksLeft = Math.max(0, totalWeeks - week);
    const teamIds = [homeId, awayId].filter((id) => !isNaN(id));
    for (const tid of teamIds) {
      const team = teams.find((t) => num(t?.id, -1) === tid);
      if (!team) continue;
      const wins = num(team.wins, 0);
      const losses = num(team.losses, 0);
      const maxWins = wins + weeksLeft;
      // Playoff clinched proxy: 10+ wins with ≤ 3 losses late season
      if (wins >= 10 && losses <= 3 && weeksLeft <= 4) playoffClinched = true;
      // Playoff eliminated proxy: can't reach 9 wins (typical bubble)
      if (maxWins < 9 && weeksLeft <= 4) playoffEliminated = true;
    }
  }

  return {
    upsetWin,
    divisionGame,
    overtimeGame,
    comebackWin,
    blowoutLoss,
    starPlayerInjury,
    playoffClinched,
    playoffEliminated,
  };
}

/**
 * Summarise narrative flags as a short human-readable label array.
 * Used for headline tagging.
 */
export function narrativeFlagLabels(flags) {
  const labels = [];
  if (flags.overtimeGame) labels.push('OT');
  if (flags.comebackWin) labels.push('Comeback');
  if (flags.upsetWin) labels.push('Upset');
  if (flags.blowoutLoss) labels.push('Blowout');
  if (flags.divisionGame) labels.push('Division');
  if (flags.starPlayerInjury) labels.push('Key Injury');
  if (flags.playoffClinched) labels.push('Clinched');
  if (flags.playoffEliminated) labels.push('Eliminated');
  return labels;
}
