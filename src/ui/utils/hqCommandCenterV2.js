import { buildTiebreakContext, prepareStandingsView } from '../../views/standingsView.js';
import { DEPTH_CHART_ROWS } from '../../core/depthChart.js';
import { deriveLineupRatingSnapshot, getPersistedDepthAssignment } from './lineupCommandCenter.js';
import { buildPowerRankings } from './franchiseCommandCenter.js';
import { buildOffseasonActionCenter } from './offseasonActionCenter.js';

const CONFERENCES = ['AFC', 'NFC'];
const DIVISIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];
const SEVERITY = { danger: 3, warning: 2, info: 1 };

// Presentation matching only. Standings membership and order remain canonical.
function normalizeGroup(value, names) {
  const token = String(value ?? '').trim().toUpperCase();
  if (/^\d+$/.test(token)) return Number(token);
  const index = names.indexOf(token);
  return index >= 0 ? index : token;
}

function normalizeConference(value) {
  return normalizeGroup(value, CONFERENCES);
}

function normalizeDivision(value) {
  // Legacy/imported identifiers also use AFC_EAST / NFC_NORTH.
  return normalizeGroup(String(value ?? '').replace(/^(AFC|NFC)_/i, ''), DIVISIONS);
}

function groupName(value, configured, defaults, prefix) {
  return String(configured?.[value] ?? defaults[value] ?? `${prefix} ${value}`).toUpperCase();
}

const validRating = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
};

export function formatHqRecord(team = {}) {
  const ties = Number(team?.ties ?? 0);
  return `${Number(team?.wins ?? 0)}-${Number(team?.losses ?? 0)}${ties ? `-${ties}` : ''}`;
}

export function buildHqDivisionSnapshot(league = {}) {
  const user = (league.teams ?? []).find((team) => String(team?.id) === String(league.userTeamId));
  if (!user) return null;
  const teamsById = new Map((league.teams ?? []).map((team) => [String(team.id), team]));
  // Archived preseason rows omit grouping fields. Enrich only the read-only
  // standings input; retain the archive's records and canonical sorter.
  const source = (Array.isArray(league.standings) && league.standings.length ? league.standings : league.teams ?? [])
    .map((team) => ({ ...team, conf: team.conf ?? teamsById.get(String(team.id))?.conf, div: team.div ?? teamsById.get(String(team.id))?.div }));
  const standings = prepareStandingsView({ ...league, standings: source });
  const conf = normalizeConference(user.conf);
  const div = normalizeDivision(user.div);
  const division = standings.divisions.find((row) => normalizeConference(row.conf) === conf && normalizeDivision(row.div) === div);
  const normalized = source
    .map((team) => ({ ...team, conf: normalizeConference(team.conf), div: normalizeDivision(team.div), winPct: (() => { const games = Number(team.wins ?? 0) + Number(team.losses ?? 0) + Number(team.ties ?? 0); return games ? (Number(team.wins ?? 0) + Number(team.ties ?? 0) * .5) / games : 0; })() }));
  // The new preseason schedule belongs to a different season than archive
  // standings. Do not invent or mix division records across those seasons.
  const isArchived = league.standingsContext?.mode === 'archive';
  const context = isArchived ? null : buildTiebreakContext(normalized, league.schedule);
  return {
    isArchived,
    title: `${groupName(conf, league.settings?.conferenceNames, CONFERENCES, 'CONF')} ${groupName(div, league.settings?.divisionNames, DIVISIONS, 'DIV')}`,
    teams: (division?.teams ?? []).map((team) => {
      const record = context?.get(Number(team.id));
      return {
        ...team,
        record: formatHqRecord(team),
        divisionRecord: isArchived ? null : `${record?.divW ?? 0}-${record?.divL ?? 0}${record?.divT ? `-${record.divT}` : ''}`,
      };
    }),
  };
}

function unitRatings(league) {
  return (league?.teams ?? []).map((team) => {
    const snapshot = deriveLineupRatingSnapshot({ team, roster: team?.roster ?? [] });
    return {
      id: team?.id,
      abbr: String(team?.abbr ?? team?.id ?? ''),
      offense: snapshot.offenseStarterIds.length ? validRating(snapshot.offense) : validRating(team?.offenseRating ?? team?.ratings?.offense),
      defense: snapshot.defenseStarterIds.length ? validRating(snapshot.defense) : validRating(team?.defenseRating ?? team?.ratings?.defense),
    };
  });
}

function rankUnit(rows, field, teamId) {
  const ranked = rows.filter((row) => row[field] != null).sort((a, b) => b[field] - a[field] || a.abbr.localeCompare(b.abbr) || String(a.id).localeCompare(String(b.id)));
  const index = ranked.findIndex((row) => String(row.id) === String(teamId));
  return index < 0 ? null : index + 1;
}

/** Presentation-only rating of the assigned K, P and first RS. */
export function deriveSpecialTeamsPresentationRating(team = {}) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const ratings = ['K', 'P', 'RS'].map((rowKey) => {
    const player = roster
      .filter((candidate) => getPersistedDepthAssignment(candidate)?.rowKey === rowKey)
      .sort((a, b) => Number(getPersistedDepthAssignment(a)?.order ?? 999) - Number(getPersistedDepthAssignment(b)?.order ?? 999))[0];
    return validRating(player?.ovr);
  });
  return ratings.every((rating) => rating != null)
    ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)
    : null;
}

export function buildHqStrengthSnapshot({ league = {}, team = {} } = {}) {
  const ratings = unitRatings(league);
  const userRatings = ratings.find((row) => String(row.id) === String(team.id)) ?? {};
  const canonicalSpecial = validRating(team?.specialTeamsRating ?? team?.ratings?.specialTeams);
  const power = buildPowerRankings(league, { limit: (league.teams ?? []).length });
  return {
    teamOvr: validRating(team?.ovr ?? team?.overallRating ?? team?.ratings?.overall),
    offenseOvr: userRatings.offense ?? null,
    defenseOvr: userRatings.defense ?? null,
    specialTeamsOvr: canonicalSpecial ?? deriveSpecialTeamsPresentationRating(team),
    powerRank: (power.find((row) => String(row.teamId) === String(team.id))?.rank) ?? null,
    offenseRank: rankUnit(ratings, 'offense', team.id),
    defenseRank: rankUnit(ratings, 'defense', team.id),
  };
}

export function buildHqNextAction({ league = {}, gate = {}, gameDayReadiness = {}, nextGame = null } = {}) {
  const phase = String(league.phase ?? 'regular');
  if (phase === 'draft_combine') {
    return { eyebrow: 'NEXT UP', title: 'Draft Combine', cta: 'Open Draft Combine', destination: 'Draft' };
  }
  const center = buildOffseasonActionCenter(phase === 'offseason' ? { ...league, phase: 'offseason_resign' } : league);
  if (['offseason', 'offseason_resign', 'free_agency', 'trades', 'draft', 'post_draft'].includes(phase)) {
    const action = center.actions[0];
    return { eyebrow: 'NEXT UP', title: center.blockers[0] ?? center.phaseLabel, cta: action?.label ?? 'Continue Offseason', destination: action?.tab ?? 'Offseason' };
  }
  if (phase === 'preseason' && center.preseasonRosterAction) {
    const action = center.preseasonRosterAction;
    return { eyebrow: 'NEXT UP', title: action.title, cta: action.label, destination: action.tab };
  }
  if (phase === 'preseason' && center.blockers.length) {
    return { eyebrow: 'NEXT UP', title: center.blockers[0], cta: 'Review Cap Outlook', destination: 'Financials' };
  }
  if (gameDayReadiness.blockingLineupIssue) {
    const count = Math.max(1, Number(gameDayReadiness.unavailableStarterCount ?? 0));
    return { eyebrow: 'NEXT UP', title: `${count} lineup issue${count === 1 ? '' : 's'} need attention`, cta: 'Review Depth Chart', destination: 'Team:Lineup' };
  }
  const risks = (gate.riskItems ?? []).map((risk, index) => ({ ...risk, index }))
    .filter((risk) => risk.severity === 'danger' || risk.severity === 'warning')
    .sort((a, b) => (SEVERITY[b.severity] ?? 0) - (SEVERITY[a.severity] ?? 0) || a.index - b.index);
  const risk = risks[0];
  if (risk) {
    const destination = risk.id === 'depth-blocker' ? 'Team:Lineup' : risk.fixDestination;
    const copy = risk.id === 'depth-blocker' ? [risk.label, 'Review Depth Chart']
      : risk.id === 'plan-not-reviewed' ? ['Game plan not reviewed', 'Review Game Plan']
      : risk.id === 'opponent-not-scouted' ? ['Opponent scouting is incomplete', `Scout ${nextGame?.opp?.abbr ?? 'Opponent'}`]
        : [risk.label, risk.id === 'injuries-pending' ? 'Review Injuries' : 'Review'];
    return { eyebrow: 'NEXT UP', title: copy[0], cta: copy[1], destination };
  }
  return nextGame
    ? { eyebrow: 'READY FOR GAME DAY', title: `${nextGame.isHome ? 'vs' : '@'} ${nextGame.opp?.abbr ?? 'Opponent'}`, cta: 'Play Week', advance: true }
    : { eyebrow: 'READY TO ADVANCE', title: 'No game this week', cta: phase === 'preseason' ? 'Advance Preseason' : 'Advance Week', advance: true };
}

export const HQ_SPECIALIST_ROWS = DEPTH_CHART_ROWS.filter((row) => row.group === 'SPECIAL').map((row) => row.key);
