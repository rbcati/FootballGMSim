// src/core/teamCulture.js
// V1 narrative-only team culture system.
// Does NOT affect game performance, injuries, player development, FA, or contracts.

export const TEAM_CULTURE_DEFAULT = 70;
export const TEAM_CULTURE_MIN = 0;
export const TEAM_CULTURE_MAX = 100;
export const WEEKLY_SHIFT_CAP = 1.25;
export const GAME_SHIFT_CAP = 0.75;
export const TRAIT_SHIFT_CAP = 0.5;

// Ordered highest-to-lowest so first match wins.
const CULTURE_BANDS = [
  { min: 85, label: 'United' },
  { min: 70, label: 'Focused' },
  { min: 55, label: 'Uneasy' },
  { min: 40, label: 'Fractured' },
  { min: 0,  label: 'Toxic' },
];

function clamp(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return TEAM_CULTURE_DEFAULT;
  return Math.max(TEAM_CULTURE_MIN, Math.min(TEAM_CULTURE_MAX, n));
}

function makeCultureEntry(score = TEAM_CULTURE_DEFAULT) {
  return {
    score,
    lastShift: 0,
    trend: 'flat',
    reasons: [],
    updatedWeek: 0,
    updatedSeason: 0,
  };
}

/**
 * Ensure every team in `teams` has an entry in `existingCulture`.
 * Missing entries are seeded at the neutral default (70).
 * Existing entries are preserved unchanged.
 */
export function initializeTeamCulture(teams = [], existingCulture = {}) {
  const result = { ...(existingCulture ?? {}) };
  for (const team of teams) {
    const id = String(team?.id ?? team);
    if (!result[id]) {
      result[id] = makeCultureEntry();
    }
  }
  return result;
}

export function getTeamCultureScore(teamCulture, teamId) {
  const entry = teamCulture?.[String(teamId)];
  return Number.isFinite(entry?.score) ? entry.score : TEAM_CULTURE_DEFAULT;
}

export function classifyTeamCulture(score) {
  const s = clamp(score);
  for (const band of CULTURE_BANDS) {
    if (s >= band.min) return band.label;
  }
  return 'Focused';
}

/**
 * Derive leadership signals from the roster using existing trait and personality data.
 * Reads player.traits (MENTOR trait id) and player.personalityProfile (leadership, diva).
 */
export function calculateLeadershipProfile(roster = []) {
  let leaderCount = 0;
  let disruptiveCount = 0;
  let mentorCount = 0;
  let youngPlayerCount = 0;

  for (const player of roster) {
    if (!player) continue;
    const traits = Array.isArray(player.traits) ? player.traits : [];
    const pp = player.personalityProfile ?? player.personality?.profile ?? {};
    const leadership = Number(pp.leadership ?? 55);
    const diva = Number(pp.diva ?? 35);
    const age = Number(player.age ?? 25);

    // High personality.leadership counts as a leader voice
    if (leadership >= 70) leaderCount++;
    // High diva is a disruptive influence
    if (diva >= 72) disruptiveCount++;
    // MENTOR trait + vet age + enough leadership = active mentorship benefit
    if (traits.includes('MENTOR') && age >= 28 && leadership >= 60) mentorCount++;
    // Young players benefit most from mentorship
    if (age <= 23) youngPlayerCount++;
  }

  return { leaderCount, disruptiveCount, mentorCount, youngPlayerCount };
}

/**
 * Calculate one week's culture shift for a single team.
 * Pure function — no side effects, no randomness.
 *
 * @param {object} opts
 * @param {object} opts.team           - team object with .id
 * @param {Array}  opts.roster         - array of player objects for this team
 * @param {object} opts.recentGame     - game result object (or null if bye week)
 * @param {object} opts.advancedAttribution - optional advanced stats object
 * @param {number} opts.previousScore  - current culture score before this week
 * @param {object} opts.context        - { week, seasonId }
 */
export function calculateCultureShift({ team, roster = [], recentGame, advancedAttribution, previousScore, context = {} }) {
  const { week = 0, seasonId = 0 } = context;
  const reasons = [];
  let shift = 0;

  // ── Game result base shift ───────────────────────────────────────────────
  if (recentGame) {
    const teamId = String(team?.id ?? team);
    const homeId = String(recentGame.home ?? recentGame.homeTeamId ?? recentGame.homeId ?? '');
    const awayId = String(recentGame.away ?? recentGame.awayTeamId ?? recentGame.awayId ?? '');
    const isHome = homeId === teamId;
    const teamScore = isHome
      ? (recentGame.scoreHome ?? recentGame.homeScore ?? 0)
      : (recentGame.scoreAway ?? recentGame.awayScore ?? 0);
    const oppScore = isHome
      ? (recentGame.scoreAway ?? recentGame.awayScore ?? 0)
      : (recentGame.scoreHome ?? recentGame.homeScore ?? 0);
    const margin = Number(teamScore) - Number(oppScore);
    const absMargin = Math.abs(margin);
    const won = margin > 0;

    if (won) {
      if (absMargin >= 21) {
        shift += 0.65;
        reasons.push('Blowout win lifted morale');
      } else if (absMargin <= 7) {
        shift += 0.35;
        reasons.push('Hard-fought win');
      } else {
        shift += 0.5;
        reasons.push('Win builds team confidence');
      }
    } else {
      if (absMargin >= 21) {
        shift -= 0.65;
        reasons.push('Blowout loss hurt locker room');
      } else if (absMargin <= 7) {
        shift -= 0.25;
        reasons.push('Close loss stings');
      } else {
        shift -= 0.45;
        reasons.push('Loss dampens team spirit');
      }
    }
  }

  // ── Advanced attribution (tiny secondary influence) ──────────────────────
  if (advancedAttribution && typeof advancedAttribution === 'object') {
    const drops = Number(advancedAttribution.drops ?? 0);
    const sacksAllowed = Number(advancedAttribution.sacksAllowed ?? 0);
    const sacksMade = Number(advancedAttribution.sacksMade ?? 0);
    const battedPasses = Number(advancedAttribution.battedPasses ?? 0);

    if (drops >= 4) {
      shift -= 0.12;
      reasons.push('Passing game execution struggles');
    }
    if (sacksAllowed >= 5) {
      shift -= 0.12;
      reasons.push('Offensive line struggles affected morale');
    }
    if (sacksMade >= 4 || battedPasses >= 3) {
      shift += 0.1;
      reasons.push('Defensive effort lifted the group');
    }
  }

  // Clamp game + attribution contribution before trait layer
  shift = Math.max(-GAME_SHIFT_CAP, Math.min(GAME_SHIFT_CAP, shift));

  // ── Trait & personality layer ────────────────────────────────────────────
  const profile = calculateLeadershipProfile(roster);
  let traitShift = 0;

  if (profile.leaderCount > 0) {
    // Leaders soften negative drift and slightly amplify positive drift
    const leaderEffect = Math.min(profile.leaderCount, 3) * 0.06;
    if (shift < 0) {
      traitShift += leaderEffect;
      reasons.push('Leadership steadied the group');
    } else if (shift > 0) {
      traitShift += leaderEffect * 0.5;
    }
  }

  // Disruptive personalities amplify negative drift only during losses/poor results
  if (profile.disruptiveCount > 0 && shift < 0) {
    const disruptEffect = Math.min(profile.disruptiveCount, 2) * 0.08;
    traitShift -= disruptEffect;
    reasons.push('Locker room friction compounded the loss');
  }

  // Active mentors with young players provide a small culture floor
  if (profile.mentorCount > 0 && profile.youngPlayerCount > 0) {
    traitShift += 0.07;
    reasons.push('Veteran mentorship maintains culture floor');
  }

  traitShift = Math.max(-TRAIT_SHIFT_CAP, Math.min(TRAIT_SHIFT_CAP, traitShift));
  shift += traitShift;

  // Final weekly cap
  shift = Math.max(-WEEKLY_SHIFT_CAP, Math.min(WEEKLY_SHIFT_CAP, shift));

  const newScore = clamp(previousScore + shift);
  const trend = shift > 0.05 ? 'up' : shift < -0.05 ? 'down' : 'flat';

  return {
    newScore,
    shift,
    trend,
    reasons: reasons.slice(0, 3),
    updatedWeek: week,
    updatedSeason: seasonId,
  };
}

/**
 * Apply one week of culture drift to all teams.
 * Skips teams whose entry already reflects this season+week (dedupe guard).
 *
 * @param {object} opts
 * @param {Array}  opts.teams           - all league team objects
 * @param {object} opts.rostersByTeam   - { [teamId]: player[] }
 * @param {Array}  opts.games           - this week's game result objects
 * @param {object} opts.previousCulture - current teamCulture meta object
 * @param {object} opts.context         - { week, seasonId }
 * @returns {object} updated teamCulture object
 */
export function applyTeamCultureWeek({ teams = [], rostersByTeam = {}, games = [], previousCulture = {}, context = {} }) {
  const nextCulture = { ...(previousCulture ?? {}) };

  for (const team of teams) {
    const teamId = String(team?.id ?? team);
    const existing = nextCulture[teamId] ?? makeCultureEntry();

    // Dedupe: this team already processed for this season+week
    if (
      context.week > 0 &&
      existing.updatedWeek === context.week &&
      existing.updatedSeason === context.seasonId
    ) {
      continue;
    }

    const teamGame = games.find((g) => {
      const h = String(g.home ?? g.homeTeamId ?? g.homeId ?? '');
      const a = String(g.away ?? g.awayTeamId ?? g.awayId ?? '');
      return h === teamId || a === teamId;
    }) ?? null;

    const roster = Array.isArray(rostersByTeam[teamId]) ? rostersByTeam[teamId] : [];

    const result = calculateCultureShift({
      team,
      roster,
      recentGame: teamGame,
      advancedAttribution: teamGame?.advancedAttribution ?? null,
      previousScore: existing.score,
      context,
    });

    nextCulture[teamId] = {
      score: result.newScore,
      lastShift: result.shift,
      trend: result.trend,
      reasons: result.reasons,
      updatedWeek: result.updatedWeek,
      updatedSeason: result.updatedSeason,
    };
  }

  return nextCulture;
}

/**
 * Build a single-sentence narrative string for display.
 * @param {number} score
 * @param {number} shift
 * @param {string[]} reasons
 */
export function buildTeamCultureNarrative(score, shift, reasons = []) {
  const label = classifyTeamCulture(score);
  const trendText = shift > 0.1 ? 'trending up' : shift < -0.1 ? 'under pressure' : 'holding steady';
  const reason = Array.isArray(reasons) && reasons.length > 0 ? reasons[0] : 'No recent change';
  return `${label} culture, ${trendText}. ${reason}.`;
}
