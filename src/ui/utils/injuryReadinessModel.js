import { DEPTH_CHART_ROWS, autoBuildDepthChart } from '../../core/depthChart.js';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(status) {
  return String(status ?? '').toLowerCase();
}

export function getInjuryWeeksRemaining(player) {
  const fromObject = player?.injury?.weeksRemaining;
  const fromFlat = player?.injuryWeeksRemaining;
  const fromGames = player?.injury?.gamesRemaining;
  const values = [fromObject, fromFlat, fromGames]
    .map((value) => toNumber(value, 0))
    .filter((value) => value > 0);
  return values.length ? Math.max(...values) : 0;
}

export function isPlayerInjured(player) {
  if (!player || typeof player !== 'object') return false;
  if (player.injured === true) return true;
  if (player.onIR || player?.injury?.ir) return true;
  if (['injured', 'ir'].includes(normalizeStatus(player.status))) return true;
  return getInjuryWeeksRemaining(player) > 0;
}

function getPlayerId(player) {
  return Number(player?.id ?? player?.pid);
}

function buildExistingAssignments(players = []) {
  const assignments = {};
  for (const row of DEPTH_CHART_ROWS) assignments[row.key] = [];
  for (const player of players) {
    const rowKey = player?.depthChart?.rowKey;
    if (!rowKey || !assignments[rowKey]) continue;
    assignments[rowKey].push(getPlayerId(player));
  }
  for (const row of DEPTH_CHART_ROWS) {
    assignments[row.key] = assignments[row.key]
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => {
        const playerA = players.find((player) => getPlayerId(player) === a);
        const playerB = players.find((player) => getPlayerId(player) === b);
        const orderA = toNumber(playerA?.depthChart?.order ?? playerA?.depthOrder, 999);
        const orderB = toNumber(playerB?.depthChart?.order ?? playerB?.depthOrder, 999);
        return orderA - orderB;
      });
  }
  return assignments;
}

function mapPositionGroup(player) {
  const explicit = String(player?.depthChart?.rowKey ?? '').toUpperCase();
  if (explicit && DEPTH_CHART_ROWS.some((row) => row.key === explicit)) return explicit;
  const normalizedPos = String(player?.pos ?? player?.position ?? '').toUpperCase();
  const row = DEPTH_CHART_ROWS.find((entry) => entry.match.includes(normalizedPos));
  return row?.key ?? (normalizedPos || 'UNK');
}

function collectLeagueInjuredPlayers(league) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const injured = [];

  for (const team of teams) {
    const roster = Array.isArray(team?.roster) ? team.roster : Array.isArray(team?.players) ? team.players : [];
    for (const player of roster) {
      if (!isPlayerInjured(player)) continue;
      injured.push({
        ...player,
        teamId: team?.id ?? team?.tid,
        teamAbbr: team?.abbr ?? team?.name?.slice(0, 3)?.toUpperCase() ?? 'UNK',
        teamName: team?.name ?? team?.abbr ?? 'Unknown Team',
      });
    }
  }

  const seen = new Set(injured.map((player) => getPlayerId(player)).filter(Number.isFinite));
  if (Array.isArray(league?.roster)) {
    for (const player of league.roster) {
      if (!isPlayerInjured(player)) continue;
      const id = getPlayerId(player);
      if (Number.isFinite(id) && seen.has(id)) continue;
      seen.add(id);
      injured.push({
        ...player,
        teamId: league?.userTeamId,
        teamAbbr: 'USR',
        teamName: 'My Team',
      });
    }
  }

  return injured;
}

function sortByImpact(players = []) {
  return [...players].sort((a, b) => {
    if (Number(Boolean(b.isStarter)) !== Number(Boolean(a.isStarter))) return Number(Boolean(b.isStarter)) - Number(Boolean(a.isStarter));
    if (Number(Boolean(b.isKeyContributor)) !== Number(Boolean(a.isKeyContributor))) return Number(Boolean(b.isKeyContributor)) - Number(Boolean(a.isKeyContributor));
    const ovrGap = toNumber(b.ovr, 0) - toNumber(a.ovr, 0);
    if (ovrGap !== 0) return ovrGap;
    return getInjuryWeeksRemaining(b) - getInjuryWeeksRemaining(a);
  });
}

function inferAvailabilityStatus({ injuredCount, starterCount, replacementRiskCount }) {
  if (injuredCount <= 0) return { key: 'full_strength', label: 'Full Strength', tone: 'ok' };
  if (starterCount >= 3 || replacementRiskCount >= 3) return { key: 'critical', label: 'Critical', tone: 'danger' };
  if (starterCount >= 1 || replacementRiskCount >= 2 || injuredCount >= 5) return { key: 'needs_attention', label: 'Needs Attention', tone: 'warning' };
  return { key: 'manageable', label: 'Manageable', tone: 'info' };
}

function inferNextAction(status, affectedGroups = []) {
  if (status.key === 'full_strength') return 'No immediate replacement action required. Keep monitoring practice injuries.';
  if (status.key === 'critical') return `Open Roster / Depth now and stabilize ${affectedGroups[0]?.label ?? 'your top position group'}.`;
  if (status.key === 'needs_attention') return 'Review depth order and promote healthy backups for injured contributors.';
  return 'Monitor injuries and prepare contingency substitutions for next kickoff.';
}

export function deriveInjuryReadinessModel({ league = null, source = 'injury-report' } = {}) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const userTeamId = Number(league?.userTeamId);
  const userTeam = teams.find((team) => Number(team?.id ?? team?.tid) === userTeamId) ?? null;

  const teamRoster = userTeam
    ? (Array.isArray(userTeam?.roster) ? userTeam.roster : Array.isArray(userTeam?.players) ? userTeam.players : [])
    : [];
  const fallbackUserRoster = Array.isArray(league?.roster) ? league.roster : [];
  const roster = teamRoster.length > 0 ? teamRoster : fallbackUserRoster;
  const safeRoster = Array.isArray(roster) ? roster.filter(Boolean) : [];

  const allLeagueInjured = collectLeagueInjuredPlayers(league);

  if (!league || !userTeam || safeRoster.length === 0) {
    return {
      status: { key: 'manageable', label: 'Manageable', tone: 'info' },
      myTeamInjured: [],
      leagueInjuredPlayers: allLeagueInjured,
      leagueInjuredCount: allLeagueInjured.length,
      injuredStarterCount: 0,
      keyContributorInjuries: 0,
      replacementRiskCount: 0,
      affectedPositionGroups: [],
      recommendedNextAction: 'Open Roster / Depth to verify assignments before advance week.',
      routeHints: {
        rosterDepth: 'Team:Roster / Depth',
        weeklyPrep: 'Weekly Prep',
        hq: 'HQ',
        source,
      },
      context: {
        season: league?.season ?? league?.year ?? null,
        week: league?.week ?? null,
      },
    };
  }

  const assignments = autoBuildDepthChart(safeRoster, buildExistingAssignments(safeRoster));
  const byId = new Map(safeRoster.map((player) => [getPlayerId(player), player]));
  const starterIds = new Set(
    Object.values(assignments)
      .map((ids) => (Array.isArray(ids) ? ids[0] : null))
      .filter((id) => Number.isFinite(Number(id)))
      .map((id) => Number(id)),
  );

  const depthByGroup = DEPTH_CHART_ROWS.reduce((acc, row) => {
    acc[row.key] = (assignments[row.key] ?? [])
      .map((id) => byId.get(Number(id)))
      .filter(Boolean);
    return acc;
  }, {});

  const decoratedTeamInjured = safeRoster
    .filter((player) => isPlayerInjured(player))
    .map((player) => {
      const playerId = getPlayerId(player);
      const groupKey = mapPositionGroup(player);
      const depthGroup = depthByGroup[groupKey] ?? [];
      const healthyBackups = depthGroup.slice(1).filter((depthPlayer) => !isPlayerInjured(depthPlayer));
      const isStarter = starterIds.has(playerId) || toNumber(player?.depthChart?.order ?? player?.depthOrder, 99) === 1;
      const isKeyContributor = isStarter || toNumber(player?.ovr, 0) >= 80 || toNumber(player?.depthChart?.order ?? player?.depthOrder, 99) <= 2;
      const weeksRemaining = getInjuryWeeksRemaining(player);
      const replacementRisk = isStarter || (isKeyContributor && weeksRemaining >= 2) || healthyBackups.length === 0 || weeksRemaining >= 4;

      return {
        ...player,
        injury: { ...(player?.injury ?? {}), weeksRemaining },
        positionGroup: groupKey,
        isStarter,
        isKeyContributor,
        replacementRisk,
      };
    });

  const myTeamInjured = sortByImpact(decoratedTeamInjured);
  const injuredStarterCount = myTeamInjured.filter((player) => player.isStarter).length;
  const keyContributorInjuries = myTeamInjured.filter((player) => player.isKeyContributor).length;
  const replacementRiskCount = myTeamInjured.filter((player) => player.replacementRisk).length;

  const affectedPositionGroups = DEPTH_CHART_ROWS
    .map((row) => {
      const injuries = myTeamInjured.filter((player) => player.positionGroup === row.key);
      return {
        key: row.key,
        label: row.label,
        injuredCount: injuries.length,
        starterInjuries: injuries.filter((player) => player.isStarter).length,
        replacementRiskCount: injuries.filter((player) => player.replacementRisk).length,
      };
    })
    .filter((entry) => entry.injuredCount > 0)
    .sort((a, b) => b.replacementRiskCount - a.replacementRiskCount || b.starterInjuries - a.starterInjuries || b.injuredCount - a.injuredCount)
    .slice(0, 4);

  const status = inferAvailabilityStatus({
    injuredCount: myTeamInjured.length,
    starterCount: injuredStarterCount,
    replacementRiskCount,
  });

  return {
    status,
    myTeamInjured,
    leagueInjuredPlayers: allLeagueInjured,
    leagueInjuredCount: allLeagueInjured.length,
    injuredStarterCount,
    keyContributorInjuries,
    replacementRiskCount,
    affectedPositionGroups,
    recommendedNextAction: inferNextAction(status, affectedPositionGroups),
    routeHints: {
      rosterDepth: 'Team:Roster / Depth',
      weeklyPrep: 'Weekly Prep',
      hq: 'HQ',
      source,
    },
    context: {
      season: league?.season ?? league?.year ?? null,
      week: league?.week ?? null,
    },
  };
}
