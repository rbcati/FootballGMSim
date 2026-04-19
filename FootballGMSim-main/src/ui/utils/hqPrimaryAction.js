import { findLatestUserCompletedGame } from './completedGameSelectors.js';

export function getHQPrimaryAction(league) {
  const latest = findLatestUserCompletedGame(league);
  const userTeam = (league?.teams ?? []).find((team) => Number(team?.id) === Number(league?.userTeamId));
  const injuries = Number(userTeam?.roster?.filter?.((p) => p?.injury?.gamesRemaining > 0)?.length ?? 0);
  const expiring = Number(userTeam?.roster?.filter?.((p) => Number(p?.contract?.yearsRemaining ?? p?.contract?.years ?? 0) <= 1)?.length ?? 0);

  if (latest?.gameId) {
    return {
      key: 'review_box_score',
      label: 'Review last box score',
      detail: latest?.story?.headline ?? 'Break down your most recent game before setting this week.',
      action: { type: 'box_score', gameId: latest.gameId },
    };
  }

  if (injuries > 0) {
    return {
      key: 'fix_injuries',
      label: 'Address injury depth',
      detail: `${injuries} injured player${injuries === 1 ? '' : 's'} need depth chart coverage.`,
      action: { type: 'navigate', tab: 'Injuries' },
    };
  }

  if (expiring > 0) {
    return {
      key: 'expiring_contracts',
      label: 'Handle expiring contracts',
      detail: `${expiring} expiring deal${expiring === 1 ? '' : 's'} could impact this offseason.`,
      action: { type: 'navigate', tab: 'Roster' },
    };
  }

  return {
    key: 'prepare_next_opponent',
    label: 'Prepare next opponent',
    detail: 'Set your plan and review the next matchup slate.',
    action: { type: 'navigate', tab: 'Schedule' },
  };
}
