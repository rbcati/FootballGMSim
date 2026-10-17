import type { AttributesV2, Player } from '../../types/player.ts';
import { getPlayerScrimmageUnitRow, getScrimmageDepthRow } from '../depthChart.js';
import { getEffectivePlayerForRole } from './positionalMultipliers.js';
import { calculatePlayerSchemeFit, normalizeSchemePosition, OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES, resolveOffensiveScheme, resolveDefensiveScheme } from '../scheme-core.js';

/** Relative personnel specialization, not a permanent rating bonus.
 * See docs/simulation/scheme-fit-v1.md for evidence, neutral roles and calibration.
 */
export const SCHEME_EXECUTION_VERSION = 'selected-personnel-relative-v1';
export const MAX_SCHEME_EXECUTION_DELTA = 0.025;
export interface SchemeExecution {
  version: typeof SCHEME_EXECUTION_VERSION;
  offense: number;
  defense: number;
}
export interface SchemeContext {
  offSchemeId?: unknown;
  defSchemeId?: unknown;
}
type Evidence = Player & { attributesV2: AttributesV2 };
type Bundle = ReadonlyArray<readonly [keyof AttributesV2, number]>;
const DEEP: Bundle = [['throwPower', .5], ['throwAccuracyDeep', .5]];
const QUICK: Bundle = [['throwAccuracyShort', .4], ['release', .3], ['decisionMaking', .3]];
const VERTICAL_RECEIVER: Bundle = [['separation', .5], ['ballTracking', .5]];
const UNDERNEATH_RECEIVER: Bundle = [['routeRunning', .6], ['catchInTraffic', .4]];
const ZONE: Bundle = [['zoneCoverage', 1]];
const PRESS: Bundle = [['pressCoverage', 1]];
const RUSH: Bundle = [['passRush', 1]];

function bundleValue(attributes: AttributesV2, bundle: Bundle): number | null {
  let sum = 0;
  for (const [key, weight] of bundle) {
    const value = attributes?.[key];
    // No coercion or invented replacement for missing evidence.
    if (!Number.isFinite(value) || value < 1 || value > 100) return null;
    sum += value * weight;
  }
  return sum;
}
function relativeEvidence(player: Evidence, preferred: Bundle, alternative: Bundle): number {
  const a = bundleValue(player.attributesV2, preferred);
  const b = bundleValue(player.attributesV2, alternative);
  if (a === null || b === null) return 0;
  const difference = a - b;
  return Math.sign(difference) * Math.min(1, Math.max(0, Math.abs(difference) - 15) / 35);
}
/** Reuse display evaluation only on complete observed legacy evidence. No
 * semantic conversion to V2; choose one evidence branch, never sum both.
 */
function observedRelativeFit(player: Evidence, scheme: string, group: 'OFFENSE' | 'DEFENSE'): number | null {
  const row = getPlayerScrimmageUnitRow(player, group);
  if (!row) return null;
  const position = normalizeSchemePosition(row.key);
  const family = group === 'OFFENSE'
    ? [OFFENSIVE_SCHEMES.WEST_COAST, OFFENSIVE_SCHEMES.VERTICAL]
    : Object.values(DEFENSIVE_SCHEMES);
  const chosen = family.find((item) => item.id === scheme);
  if (!chosen) return null;
  const keys = [...new Set(family.flatMap((item) => Object.keys(item.weights[position] ?? {})))];
  if (keys.length === 0 || keys.some((key) => {
    const value = player.ratings?.[key];
    return !Number.isFinite(value) || Number(value) < 1 || Number(value) > 100;
  })) return null;
  const assignedRole = getScrimmageDepthRow(player, group)?.key ?? player.pos;
  const effective = getEffectivePlayerForRole({ ...player, ...player.ratings }, assignedRole);
  const observed = { pos: row.key, ratings: Object.fromEntries(keys.map((key) => [key, effective[key]])) };
  const fit = calculatePlayerSchemeFit(observed, chosen);
  const alternatives = family.filter((item) => item.id !== scheme);
  const reference = alternatives.reduce((sum, item) => sum + calculatePlayerSchemeFit(observed, item), 0) / alternatives.length;
  return Math.max(-1, Math.min(1, (fit - reference) / 20));
}

function playerEvidence(player: Evidence, scheme: string, group: 'OFFENSE' | 'DEFENSE'): number {
  const observed = observedRelativeFit(player, scheme, group);
  if (observed !== null) return observed;
  // Row identity/eligibility comes from the same canonical helper as aggregation.
  const role = getPlayerScrimmageUnitRow(player, group)?.key;
  if (group === 'OFFENSE' && (scheme === 'VERTICAL' || scheme === 'WEST_COAST')) {
    const bundles = role === 'QB' ? [DEEP, QUICK]
      : role === 'WR' || role === 'TE' ? [VERTICAL_RECEIVER, UNDERNEATH_RECEIVER] : null;
    if (bundles) return relativeEvidence(player, bundles[scheme === 'VERTICAL' ? 0 : 1], bundles[scheme === 'VERTICAL' ? 1 : 0]);
  }
  if (group === 'DEFENSE') {
    if (role === 'CB' || role === 'S') {
      if (scheme === 'COVER_2') return relativeEvidence(player, ZONE, PRESS);
      if (scheme === 'MAN_COVERAGE') return relativeEvidence(player, PRESS, ZONE);
    }
    if (role === 'LB') {
      if (scheme === 'COVER_2') return relativeEvidence(player, ZONE, RUSH);
      if (scheme === 'BLITZ_34') return relativeEvidence(player, RUSH, ZONE);
    }
  }
  return 0;
}

/** Accepts already-selected, role-adjusted units; never selects a roster itself. */
export function projectSchemeExecution(
  offense: Evidence[], defense: Evidence[], schemes: SchemeContext = {},
): SchemeExecution {
  const project = (players: Evidence[], value: unknown, group: 'OFFENSE' | 'DEFENSE') => {
    if (value == null || value === '' || players.length === 0) return 0;
    const scheme = group === 'OFFENSE' ? resolveOffensiveScheme(value).id : resolveDefensiveScheme(value).id;
    return players.reduce((sum, player) => sum + playerEvidence(player, scheme, group), 0)
      / players.length * MAX_SCHEME_EXECUTION_DELTA;
  };
  return {
    version: SCHEME_EXECUTION_VERSION,
    offense: project(offense, schemes.offSchemeId, 'OFFENSE'),
    defense: project(defense, schemes.defSchemeId, 'DEFENSE'),
  };
}

/** One shared cap prevents opposing unit bonuses/penalties compounding. */
export function schemeMatchupDelta(offense?: SchemeExecution, defense?: SchemeExecution): number {
  const valid = (value?: SchemeExecution, side: 'offense' | 'defense' = 'offense') =>
    value?.version === SCHEME_EXECUTION_VERSION && Number.isFinite(value[side])
      ? Math.max(-MAX_SCHEME_EXECUTION_DELTA, Math.min(MAX_SCHEME_EXECUTION_DELTA, value[side])) : 0;
  return Math.max(-MAX_SCHEME_EXECUTION_DELTA, Math.min(MAX_SCHEME_EXECUTION_DELTA, valid(offense) - valid(defense, 'defense')));
}
