import { aggregateTeamUnitsFromRoster } from '../../core/sim/weekSimulationBridge.ts';
import { ensureAttributesV2 } from '../../core/migration/attributeMigrator.ts';
import { getEffectivePlayerForRole } from '../../core/sim/positionalMultipliers.js';
import { DEPTH_CHART_ROWS, getCanonicalDepthRow, getCanonicalScrimmageAssignment, getPlayerScrimmageUnitRow, getScrimmageDepthRow, isPlayerEligibleForDepthRow } from '../../core/depthChart.js';
import { calculateOverallFromAttributesV2 } from '../../worker/playerDerivedRatings.js';
import { OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES, calculatePlayerSchemeFit } from '../../core/scheme-core.js';

const average = (values, fallback = 0) => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  : fallback;

function resolveScheme(collection, value, fallback) {
  const normalized = String(value ?? '').toUpperCase().replace(/[\s/-]+/g, '_');
  return collection[normalized]
    ?? Object.values(collection).find((scheme) => scheme.id === value || scheme.name.toUpperCase() === String(value ?? '').toUpperCase())
    ?? collection[fallback];
}

export function getTeamSchemes(team = {}) {
  const coach = team?.staff?.headCoach ?? {};
  return {
    offense: resolveScheme(OFFENSIVE_SCHEMES, team?.strategies?.offSchemeId ?? coach.offScheme, 'WEST_COAST'),
    defense: resolveScheme(DEFENSIVE_SCHEMES, team?.strategies?.defSchemeId ?? coach.defScheme, 'COVER_2'),
  };
}

function effectiveOverall(player, group) {
  const attributesV2 = ensureAttributesV2(player).attributesV2;
  const row = getScrimmageDepthRow(player, group);
  const effective = getEffectivePlayerForRole({ ...player, ...attributesV2 }, row?.key ?? player.pos);
  const effectiveAttributes = Object.fromEntries(Object.keys(attributesV2).map((key) => [key, effective[key] ?? attributesV2[key]]));
  return calculateOverallFromAttributesV2(player, effectiveAttributes) ?? Number(player.ovr ?? 50);
}

function comparison(players, collection) {
  return Object.values(collection).map((scheme) => ({
    id: scheme.id,
    name: scheme.name,
    fit: average(players.map((player) => calculatePlayerSchemeFit(player, scheme)), 50),
  })).sort((a, b) => b.fit - a.fit);
}

export function deriveLineupRatingSnapshot({ team = {}, roster = [] } = {}) {
  const canonical = aggregateTeamUnitsFromRoster(roster, team.id);
  const byId = new Map(roster.map((player) => [String(player.id), player]));
  const offense = canonical.selectedUnitPlayerIds.offense.map((id) => byId.get(String(id))).filter(Boolean);
  const defense = canonical.selectedUnitPlayerIds.defense.map((id) => byId.get(String(id))).filter(Boolean);
  const schemes = getTeamSchemes(team);
  const offenseRating = average(offense.map((player) => effectiveOverall(player, 'OFFENSE')));
  const defenseRating = average(defense.map((player) => effectiveOverall(player, 'DEFENSE')));
  const offenseComparison = comparison(offense, OFFENSIVE_SCHEMES);
  const defenseComparison = comparison(defense, DEFENSIVE_SCHEMES);
  return {
    overall: average([offenseRating, defenseRating]), offense: offenseRating, defense: defenseRating,
    offensePlayers: offense, defensePlayers: defense,
    offenseStarterIds: canonical.selectedUnitPlayerIds.offense,
    defenseStarterIds: canonical.selectedUnitPlayerIds.defense,
    offensiveSchemeFit: offenseComparison.find((item) => item.id === schemes.offense.id)?.fit ?? 50,
    defensiveSchemeFit: defenseComparison.find((item) => item.id === schemes.defense.id)?.fit ?? 50,
    offenseComparison, defenseComparison, schemes,
  };
}

/**
 * Return the persisted scrimmage assignments that the lineup editor owns.
 * Simulation-selected ids only determine each row's slot count; player choice
 * always follows canonical row/order metadata, including unavailable players.
 */
export function deriveEditableCanonicalLineup({ roster = [], simulationStarterIds = [], group } = {}) {
  const normalizedGroup = String(group ?? '').toUpperCase();
  const byId = new Map(roster.map((player) => [String(player?.id), player]));
  const selectedCounts = new Map();
  for (const id of simulationStarterIds) {
    const assignment = getCanonicalScrimmageAssignment(byId.get(String(id)));
    const row = DEPTH_CHART_ROWS.find((entry) => entry.key === assignment?.rowKey);
    if (row?.group === normalizedGroup) selectedCounts.set(row.key, (selectedCounts.get(row.key) ?? 0) + 1);
  }

  return DEPTH_CHART_ROWS.filter((row) => row.group === normalizedGroup).flatMap((row) => {
    const assigned = roster.filter((player) => getCanonicalScrimmageAssignment(player)?.rowKey === row.key)
      .sort((a, b) => Number(getCanonicalScrimmageAssignment(a)?.order ?? 999) - Number(getCanonicalScrimmageAssignment(b)?.order ?? 999));
    if (!assigned.length) return simulationStarterIds.map((id) => byId.get(String(id)))
      .filter((player) => {
        const persistedRow = DEPTH_CHART_ROWS.find((entry) => entry.key === player?.depthChart?.rowKey);
        return persistedRow?.group !== 'SPECIAL' && getPlayerScrimmageUnitRow(player, normalizedGroup)?.key === row.key;
      });
    const slotCount = Math.max(selectedCounts.get(row.key) ?? 0, assigned[0] && getCanonicalScrimmageAssignment(assigned[0])?.order === 1 ? 1 : 0);
    return assigned.slice(0, slotCount);
  });
}

/** Return only real persisted depth ownership; never infer assignment from position. */
export function getPersistedDepthAssignment(player = {}) {
  const rowKey = String(player?.depthChart?.rowKey ?? player?.depthRowKey ?? '');
  const order = Number(player?.depthChart?.order ?? player?.depthOrder);
  const row = DEPTH_CHART_ROWS.find((entry) => entry.key === rowKey);
  if (!row || !Number.isFinite(order) || order <= 0 || !isPlayerEligibleForDepthRow(player, row)) return null;
  return { rowKey: row.key, order };
}

export function buildReplacementUpdates(roster, starter, replacement, group) {
  const row = group === 'SPECIAL'
    ? getCanonicalDepthRow(starter)
    : getScrimmageDepthRow(starter, group) ?? getPlayerScrimmageUnitRow(starter, group);
  if (!row || !isPlayerEligibleForDepthRow(replacement, row)) return [];
  const ordered = roster.filter((player) => {
    if (group === 'SPECIAL') return getPersistedDepthAssignment(player)?.rowKey === row.key;
    const playerRow = getScrimmageDepthRow(player, group) ?? getPlayerScrimmageUnitRow(player, group);
    return playerRow?.key === row.key && isPlayerEligibleForDepthRow(player, row);
  }).sort((a, b) => group === 'SPECIAL'
    ? Number(getPersistedDepthAssignment(a)?.order ?? 999) - Number(getPersistedDepthAssignment(b)?.order ?? 999)
    : Number(a?.depthChart?.order ?? a.depthOrder ?? 999) - Number(b?.depthChart?.order ?? b.depthOrder ?? 999));
  const next = ordered.filter((player) => String(player.id) !== String(replacement.id));
  const index = Math.max(0, next.findIndex((player) => String(player.id) === String(starter.id)));
  next.splice(index, 0, replacement);
  return next.map((player, order) => ({ playerId: player.id, rowKey: row.key, newOrder: order + 1 }));
}
