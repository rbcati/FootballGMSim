// validation.js - Data Validation Utilities

export function validateLeagueData(league) {
  if (!league) {
    throw new Error('League data is null or undefined');
  }

  if (!league.teams || !Array.isArray(league.teams)) {
    throw new Error('Invalid teams data');
  }

  if (!league.schedule) {
    throw new Error('Invalid schedule data');
  }

  if (typeof league.week !== 'number' && typeof league.currentWeek !== 'number') {
    throw new Error('Invalid current week');
  }

  return true;
}

export function validateGame(game) {
  if (!game) return false;
  if (!game.homeTeam && !game.home) return false;
  if (!game.awayTeam && !game.away) return false;
  if (typeof game.week !== 'number') return false;
  return true;
}

export function validateTeam(team) {
  if (!team) return false;
  if (!team.id && team.id !== 0) return false;
  if (!team.name && !team.abbr) return false;
  return true;
}
