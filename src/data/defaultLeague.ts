import { DEFAULT_TEAMS } from './default-teams.js';

const TEAM_COUNT = 32;
const ROSTER_SIZE = 53;

function makePlayer(teamId: number, index: number) {
  return {
    id: teamId * 1000 + index,
    name: `Player ${teamId + 1}-${index + 1}`,
    pos: 'UNK',
    age: 24,
    ovr: 60,
    pot: 65,
    contract: { years: 2, amount: 1.2 },
    teamId,
  };
}

export function buildDefaultLeague() {
  const teams = DEFAULT_TEAMS.slice(0, TEAM_COUNT).map((team, idx) => ({
    ...team,
    id: idx,
    wins: 0,
    losses: 0,
    ties: 0,
    roster: Array.from({ length: ROSTER_SIZE }, (_, playerIndex) => makePlayer(idx, playerIndex)),
  }));

  const games = [] as Array<{ home: number; away: number; played: boolean }>;
  for (let i = 0; i < teams.length; i += 2) {
    if (teams[i + 1]) games.push({ away: teams[i].id, home: teams[i + 1].id, played: false });
  }

  return {
    id: 'fallback-league',
    name: 'Fallback League',
    phase: 'regular',
    week: 1,
    year: 2026,
    season: 1,
    userTeamId: 0,
    teams,
    schedule: {
      weeks: [{ week: 1, games }],
    },
  };
}
