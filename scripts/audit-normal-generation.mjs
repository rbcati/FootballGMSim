// Run: node --import tsx scripts/audit-normal-generation.mjs
import { makeLeague } from '../src/core/league.js';
import { Utils } from '../src/core/utils.js';
import { DEFAULT_TEAMS } from '../src/data/default-teams.js';
import { makeAccurateSchedule } from '../src/core/schedule.js';
import { getPlayableLeagueValidation } from '../src/state/leagueInit.ts';
const counts = (rows, key) => rows.reduce((out, row) => { out[row[key]] = (out[row[key]] ?? 0) + 1; return out; }, {});
const summaries = [2025, 2026, 2031].map(year => {
  const seed = 1806 + year;
  Utils.setSeed(seed);
  const league = makeLeague(DEFAULT_TEAMS, { year, rngSeed: seed }, { makeSchedule: makeAccurateSchedule });
  const players = league.teams.flatMap(t => t.roster);
  const salaries = players.map(p => p.baseAnnual).sort((a,b) => a-b);
  return { year, seed, phase: league.phase, season: league.season, week: league.week,
    validation: getPlayableLeagueValidation(league), teams: league.teams.length, players: players.length,
    positionsPerTeam: counts(league.teams[0].roster, 'pos'), contractLengths: counts(players, 'years'),
    salaryMillions: { min: salaries[0], median: salaries[Math.floor(salaries.length/2)], max: salaries.at(-1), mean: salaries.reduce((a,b) => a+b,0)/salaries.length, distinct: new Set(salaries).size },
    unsigned: players.filter(p => p.teamId == null || p.status === 'free_agent').length,
    scheduleWeeks: league.schedule.weeks.length, scheduleGames: league.schedule.weeks.flatMap(w => w.games).length,
    picks: league.teams.flatMap(t => t.picks).length, pickSeasons: [...new Set(league.teams.flatMap(t => t.picks).map(p => p.season))] };
});
console.log(JSON.stringify(summaries, null, 2));
