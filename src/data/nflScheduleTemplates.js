// Compatibility adapter. The defective four-template pack has been retired.
// Opponent and weekly placement policy lives exclusively in core/nflSchedule.js.
import {
  generateNflSchedule,
  assertNflSchedule,
  isNflStructure,
  nflStructure,
} from '../core/nflSchedule.js';
export const canUseNfl32Templates = isNflStructure;

export function buildTemplateSlotToTidMap(teams) {
  const map = new Map();
  nflStructure(teams)
    .flat()
    .forEach((d, i) =>
      d.teams.forEach((t, j) => map.set(i * 4 + j, t.id ?? t.tid))
    );
  return map;
}

export function materializeTemplateSchedule(teams, season = 1) {
  const schedule = generateNflSchedule(teams, season);
  return schedule.weeks.map((w) => ({
    ...w,
    games: w.games.map((g) => ({ ...g, homeTid: g.home, awayTid: g.away })),
  }));
}

export function validateMaterializedTemplateSchedule(
  weeks,
  teams,
  options = {}
) {
  if (!Array.isArray(teams))
    throw new Error(
      'Strict NFL validation requires canonical teams and season options'
    );
  return assertNflSchedule(
    {
      weeks: weeks.map((w) => ({
        ...w,
        games: w.games.map((g) => ({ ...g, home: g.homeTid, away: g.awayTid })),
      })),
    },
    teams,
    options
  );
}
