import { buildPlayerDecisionPresentation } from './playerDecisionPresentation.js';
import { calculatePlayerValue } from './trade-logic.js';
import { getTradeWindowSnapshot } from './tradeWindow.js';
import { prepareStandingsView } from '../views/standingsView.js';

const REVIEWABLE_PHASES = new Set(['preseason', 'regular']);
const RESOLVED_DECISIONS = new Set(['extended', 'tagged', 'let_walk']);
const DEPTH_ROLES = new Set(['Backup', 'Reserve']);
const meaningfulTradeValue = (value) => Number.isFinite(value) && value >= 80;
const canonicalId = (value) => value == null ? null : String(value);
const playerId = (player) => player?.id ?? player?.playerId ?? null;
const finiteNumber = (value) => {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function teamContextFor(league, team) {
  if (!team) return null;
  const wins = finiteNumber(team.wins);
  const losses = finiteNumber(team.losses);
  const ties = finiteNumber(team.ties);
  let divisionPosition = null;
  try {
    const division = prepareStandingsView(league).divisions.find((row) =>
      row.teams.some((entry) => canonicalId(entry.id) === canonicalId(team.id)));
    const index = division?.teams.findIndex((entry) => canonicalId(entry.id) === canonicalId(team.id)) ?? -1;
    if (index >= 0) divisionPosition = index + 1;
  } catch {
    // Partial legacy standings are optional context, not a reason to fail the model.
  }
  const streakRows = Array.isArray(team.streak) ? team.streak : [];
  const last = streakRows.at(-1);
  let streak = null;
  if (last === 'W' || last === 'L') {
    let length = 0;
    for (let index = streakRows.length - 1; index >= 0 && streakRows[index] === last; index -= 1) length += 1;
    if (length > 1) streak = { result: last, length };
  }
  return {
    record: wins != null && losses != null ? { wins, losses, ties: ties ?? 0 } : null,
    divisionPosition,
    streak,
  };
}

function excluded(player, league) {
  const status = String(player?.status ?? '').toLowerCase();
  if (player?.retired || player?.isRetired || status === 'retired') return true;
  if (player?.isProspect || player?.draftEligible || status === 'draft_eligible') return true;
  if (player?.teamId == null || player.teamId === 'FA' || status === 'free_agent' || status === 'practice_squad') return true;
  return Array.isArray(league?.draftClass) && league.draftClass.some((prospect) =>
    canonicalId(playerId(prospect)) === canonicalId(playerId(player)));
}

/** Pure deadline presentation assembled from existing trade, contract and role authorities. */
export function buildTradeDeadlineContext({ league = {}, team = null, roster = team?.roster, userTeamId = league?.userTeamId, week = null, phase = null } = {}) {
  const effectiveLeague = {
    ...league,
    ...(week == null ? {} : { week }),
    ...(phase == null ? {} : { phase }),
  };
  const window = getTradeWindowSnapshot(effectiveLeague);
  const supportedPhase = REVIEWABLE_PHASES.has(window.phase);
  const deadline = {
    phase: window.phase,
    currentWeek: window.currentWeek,
    deadlineWeek: window.deadlineWeek,
    weeksUntilDeadline: Math.max(0, window.weeksRemaining),
    deadlinePassed: window.isLocked,
    deadlineActive: supportedPhase && !window.isLocked,
  };
  const omittedReasons = [];
  if (!supportedPhase) omittedReasons.push('Trade deadline context is not active in the current phase');
  if (!team || canonicalId(team.id) !== canonicalId(userTeamId)) omittedReasons.push('User team unavailable');

  const leaguePlayers = Array.isArray(league?.players) ? league.players : [];
  const byId = new Map(leaguePlayers.map((player) => [canonicalId(playerId(player)), player]));
  const entries = Array.isArray(roster) ? roster : [];
  const seen = new Set();
  const candidates = [];

  if (deadline.deadlineActive && team && canonicalId(team.id) === canonicalId(userTeamId)) {
    for (const entry of entries) {
      const player = entry && typeof entry === 'object' ? entry : byId.get(canonicalId(entry));
      const id = playerId(player);
      const key = canonicalId(id);
      if (!player || key == null || seen.has(key)) continue;
      seen.add(key);
      if (canonicalId(player.teamId) !== canonicalId(team.id) || excluded(player, league)) continue;

      const presentation = buildPlayerDecisionPresentation({ player, team, league });
      if (!['active_roster', 'injured_reserve'].includes(presentation?.identity?.statusKey)) continue;
      const years = presentation?.contract?.yearsRemaining ?? null;
      const age = presentation?.identity?.age ?? null;
      const role = presentation?.role?.label === 'Role unavailable' ? null : presentation?.role?.label ?? null;
      const resolved = RESOLVED_DECISIONS.has(String(player?.extensionDecision ?? '').toLowerCase());
      const tradeValue = finiteNumber(calculatePlayerValue(player));
      const finalYearVeteran = years === 1 && age != null && age >= 27 && !resolved && meaningfulTradeValue(tradeValue);
      const veteranDepth = age != null && age >= 27 && DEPTH_ROLES.has(role) && meaningfulTradeValue(tradeValue);
      if (!finalYearVeteran && !veteranDepth) continue;

      const reasons = [];
      if (finalYearVeteran) reasons.push('Contract expires after this season');
      if (veteranDepth) reasons.push(`Veteran ${role.toLowerCase()} role`);
      reasons.push(`Recorded trade value: ${Math.round(tradeValue)}`);
      candidates.push({
        playerId: id,
        position: presentation.identity.position,
        name: presentation.identity.name,
        age,
        tradeValue: Math.round(tradeValue),
        role,
        contractYearsRemaining: years,
        finalYearContext: finalYearVeteran,
        reasons: [...new Set(reasons)],
        primaryReason: reasons[0],
        destination: { view: 'Transactions', workspace: 'Finder', playerId: id },
      });
    }
  }

  candidates.sort((a, b) => Number(b.finalYearContext) - Number(a.finalYearContext)
    || b.tradeValue - a.tradeValue
    || (DEPTH_ROLES.has(a.role) ? 1 : 0) - (DEPTH_ROLES.has(b.role) ? 1 : 0)
    || (b.age ?? -1) - (a.age ?? -1)
    || String(a.playerId).localeCompare(String(b.playerId), 'en', { numeric: true }));

  return {
    deadline,
    teamContext: teamContextFor(effectiveLeague, team),
    reviewCandidates: candidates.slice(0, 5),
    availableData: {
      deadline: Number.isFinite(window.deadlineWeek) && Number.isFinite(window.currentWeek),
      teamContext: Boolean(team),
      reviewCandidates: candidates.length > 0,
    },
    omittedReasons,
  };
}
