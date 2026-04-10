import { deriveTeamCapSnapshot, formatMoneyM } from './numberFormatting.js';

export function getAppShellContext(league) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const userTeam = teams.find((team) => Number(team?.id) === Number(league?.userTeamId)) ?? teams[0] ?? null;
  const cap = deriveTeamCapSnapshot(userTeam, { fallbackCapTotal: 255 });

  return {
    teamName: userTeam?.name ?? 'No Team',
    teamAbbr: userTeam?.abbr ?? '---',
    year: Number(league?.year ?? 0) || '—',
    week: Number(league?.week ?? 1),
    phase: String(league?.phase ?? 'regular').replaceAll('_', ' '),
    capRoom: cap.capRoom,
    capSummary: `${formatMoneyM(cap.capRoom)} room`,
  };
}
