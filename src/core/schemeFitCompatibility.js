/**
 * Frozen pre-1801 evaluation for legacy game strength and offer valuation.
 * These callers are balance-sensitive. Do not use this for GM readouts.
 * Scheme collections are supplied by scheme-core to avoid a dependency cycle.
 */
function legacyPosition(pos) {
  const value = String(pos ?? '').toUpperCase();
  if (['LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG'].includes(value)) return 'OL';
  if (['DE', 'DT', 'NT', 'IDL', 'EDGE'].includes(value)) return 'DL';
  if (['OLB', 'MLB', 'ILB'].includes(value)) return 'LB';
  if (['FS', 'SS'].includes(value)) return 'S';
  return value;
}

export function calculateLegacySchemeFit(player, scheme) {
  if (!player || !scheme) return 50;
  const weights = scheme.weights?.[legacyPosition(player.pos)];
  if (!weights) return 50;
  const ratings = player.ratings || player;
  let sum = 0, total = 0;
  for (const [attr, weight] of Object.entries(weights)) {
    const value = ratings[attr];
    if (typeof value === 'number' && value > 0) {
      sum += value * weight;
      total += weight;
    }
  }
  return total === 0 ? 50 : Math.max(0, Math.min(100, Math.round(sum / total)));
}

const OFFENSE = {
  'West Coast': 'WEST_COAST', Vertical: 'VERTICAL', 'Pass Heavy': 'VERTICAL',
  'Air Raid': 'VERTICAL', Smashmouth: 'SMASHMOUTH', 'Run Heavy': 'SMASHMOUTH', Balanced: 'WEST_COAST',
};
const DEFENSE = {
  '4-3 Cover 2': 'COVER_2', '4-3': 'COVER_2', 'Cover 2': 'COVER_2',
  '3-4 Blitz': 'BLITZ_34', '3-4': 'BLITZ_34', Aggressive: 'BLITZ_34',
  'Man Coverage': 'MAN_COVERAGE', Nickel: 'MAN_COVERAGE', Conservative: 'COVER_2',
};

export function calculateLegacyFamilyFit(player, value, collection, defense = false) {
  const aliases = defense ? DEFENSE : OFFENSE;
  const fallback = defense ? 'COVER_2' : 'WEST_COAST';
  return calculateLegacySchemeFit(player, collection[aliases[value] || fallback]);
}
