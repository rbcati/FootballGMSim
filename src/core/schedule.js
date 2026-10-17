import {
  generateNflSchedule,
  isNflStructure,
  validateNflSchedule,
} from './nflSchedule.js';
import { buildCanonicalGameId } from './gameIdentity.js';

// Standard NFL leagues have one authority and never catch-and-fallback on failure.
export function makeAccurateSchedule(teams, options = {}) {
  if (isNflStructure(teams)) return generateNflSchedule(teams, options);
  return createSimpleSchedule(teams, options);
}

function createNFLStyleSchedule(teams, options = {}) {
  return generateNflSchedule(teams, options);
}

/** Explicit custom-league policy: deterministic circle round-robin, 18 weeks.
 * Not NFL-valid; odd-sized leagues have a bye per round. No fake bye games.
 * A standard NFL structure may never enter a weaker fallback.
 */
function createSimpleSchedule(teams = [], options = {}) {
  if (isNflStructure(teams)) return generateNflSchedule(teams, options);
  const ids = teams.map((t) => t.id ?? t.tid).sort((a, b) => a - b);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !Number.isSafeInteger(id))
  )
    throw new Error('Custom schedule requires distinct numeric team IDs');
  const seasonId =
    (typeof options === 'object' ? options.seasonId : null) ?? 's1';
  const ring = ids.length % 2 ? [...ids, null] : [...ids];
  const weeks = [];
  for (let week = 1; week <= 18; week++) {
    const games = [],
      teamsWithBye = [];
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i],
        b = ring[ring.length - 1 - i];
      if (a === null || b === null) {
        teamsWithBye.push(a ?? b);
        continue;
      }
      const home = week % 2 ? a : b,
        away = week % 2 ? b : a;
      const id = buildCanonicalGameId({
        seasonId,
        week,
        homeId: home,
        awayId: away,
      });
      games.push({ id, gameId: id, seasonId, week, home, away, played: false });
    }
    weeks.push({ week, games, teamsWithBye });
    if (ring.length > 2) ring.splice(1, 0, ring.pop());
  }
  return { weeks, metadata: { type: 'custom-round-robin', nflValid: false } };
}

export function validateSchedule(schedule, teams, options) {
  return validateNflSchedule(schedule, teams, options);
}

function getWeekGames(schedule, weekNumber) {
  if (!schedule) return null;
  const weeks = schedule.weeks || schedule;
  if (!Array.isArray(weeks)) return null;

  const index = weekNumber - 1;
  if (index < 0 || index >= weeks.length) return null;

  return weeks[index];
}

const Scheduler = {
  makeAccurateSchedule,
  createNFLStyleSchedule,
  createSimpleSchedule,
  getWeekGames,
  validateSchedule,
};
export { Scheduler, getWeekGames };
