import { LEGACY_TO_CANONICAL_RATING_KEY } from './footballRatings';
import { PLAYER_STATS_TABLES, PRIMARY_POSITIONS } from './footballMeta';
import type { RatingKey } from './footballTypes';

export type FootballFilterCategory = 'bio' | 'ratings' | 'stats';
export type FootballFilterValueType = 'numeric' | 'string';
export type FootballFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';

export type FootballAdvancedFilterField = {
  category: FootballFilterCategory;
  key: string;
  label: string;
  colKey: string;
  valueType: FootballFilterValueType;
  statGroup?: string;
  workerFieldOverride?: 'attrs' | 'ratings' | 'stats';
  getter: (player: any) => string | number | null;
};

export type FootballAdvancedFilter = {
  id: string;
  fieldKey: string;
  operator: FootballFilterOperator;
  value: string | number;
};

const RATING_LABELS: Record<string, string> = {
  ovr: 'OVR',
  potential: 'Potential',
  tha: 'Throw Accuracy',
  thp: 'Throw Power',
  spd: 'Speed',
  acc: 'Acceleration',
  awr: 'Awareness',
  cth: 'Catching',
  cit: 'Catch In Traffic',
  rbk: 'Run Blocking',
  pbk: 'Pass Blocking',
  prs: 'Pass Rush Speed',
  prp: 'Pass Rush Power',
  rns: 'Run Stop',
  cov: 'Coverage',
  kpw: 'Kick Power',
  kac: 'Kick Accuracy',
  trk: 'Trucking',
  jkm: 'Juking',
};

const numericGetter = (path: (string | number)[]) => (player: any) => {
  let value = player;
  for (const key of path) {
    value = value?.[key];
  }
  return typeof value === 'number' ? value : value == null ? null : Number(value);
};

const stringGetter = (fn: (player: any) => unknown) => (player: any) => {
  const raw = fn(player);
  if (raw == null) return null;
  return String(raw);
};

const bioFields: FootballAdvancedFilterField[] = [
  { category: 'bio', key: 'name', label: 'Name', colKey: 'name', valueType: 'string', workerFieldOverride: 'attrs', getter: stringGetter((p) => p?.name) },
  { category: 'bio', key: 'pos', label: 'Position', colKey: 'pos', valueType: 'string', workerFieldOverride: 'attrs', getter: stringGetter((p) => p?.pos) },
  { category: 'bio', key: 'teamAbbrev', label: 'Team', colKey: 'abbrev', valueType: 'string', workerFieldOverride: 'attrs', getter: stringGetter((p) => p?.teamAbbrev ?? p?.team?.abbr ?? p?.team?.abbrev) },
  { category: 'bio', key: 'age', label: 'Age', colKey: 'age', valueType: 'numeric', workerFieldOverride: 'attrs', getter: numericGetter(['age']) },
  { category: 'bio', key: 'contractAmount', label: 'Contract Amount', colKey: 'contractAmount', valueType: 'numeric', workerFieldOverride: 'attrs', getter: (p) => Number(p?.contract?.baseAnnual ?? p?.contractAmount ?? p?.askingPrice ?? p?.ask ?? 0) },
  { category: 'bio', key: 'contractExp', label: 'Contract Exp Year', colKey: 'contractExp', valueType: 'numeric', workerFieldOverride: 'attrs', getter: (p) => Number(p?.contract?.exp ?? p?.contract?.expYear ?? 0) || null },
  { category: 'bio', key: 'college', label: 'College', colKey: 'college', valueType: 'string', workerFieldOverride: 'attrs', getter: stringGetter((p) => p?.college) },
  { category: 'bio', key: 'draftYear', label: 'Draft Year', colKey: 'draftYear', valueType: 'numeric', workerFieldOverride: 'attrs', getter: (p) => Number(p?.draft?.year ?? p?.draftYear ?? 0) || null },
  { category: 'bio', key: 'draftRound', label: 'Draft Round', colKey: 'draftRound', valueType: 'numeric', workerFieldOverride: 'attrs', getter: (p) => Number(p?.draft?.round ?? p?.draftRound ?? 0) || null },
  { category: 'bio', key: 'draftPick', label: 'Draft Pick', colKey: 'draftPick', valueType: 'numeric', workerFieldOverride: 'attrs', getter: (p) => Number(p?.draft?.pick ?? p?.draftPick ?? 0) || null },
  { category: 'bio', key: 'experience', label: 'Experience', colKey: 'experience', valueType: 'numeric', workerFieldOverride: 'attrs', getter: (p) => Number(p?.experience ?? p?.exp ?? 0) || null },
];

const canonicalRatings = Object.values(LEGACY_TO_CANONICAL_RATING_KEY);

const ratingFields: FootballAdvancedFilterField[] = [
  { category: 'ratings', key: 'ovr', label: RATING_LABELS.ovr, colKey: 'ovr', valueType: 'numeric', workerFieldOverride: 'attrs', getter: numericGetter(['ovr']) },
  { category: 'ratings', key: 'potential', label: RATING_LABELS.potential, colKey: 'pot', valueType: 'numeric', workerFieldOverride: 'attrs', getter: (p) => Number(p?.potential ?? p?.pot ?? 0) || null },
  ...canonicalRatings.map((key) => ({
    category: 'ratings' as const,
    key,
    label: RATING_LABELS[key] ?? key.toUpperCase(),
    colKey: key,
    valueType: 'numeric' as const,
    workerFieldOverride: 'ratings' as const,
    getter: (p: any) => {
      const canonical = p?.ratings?.[key as RatingKey];
      if (typeof canonical === 'number') return canonical;
      const legacyKey = Object.keys(LEGACY_TO_CANONICAL_RATING_KEY).find((legacy) => LEGACY_TO_CANONICAL_RATING_KEY[legacy as keyof typeof LEGACY_TO_CANONICAL_RATING_KEY] === key);
      const legacy = legacyKey ? p?.ratings?.[legacyKey] : undefined;
      return typeof legacy === 'number' ? legacy : null;
    },
  })),
];

export function getStatsTableByType(statType: string) {
  return PLAYER_STATS_TABLES[statType] ?? null;
}

export function getStats(statType: string): string[] {
  const table = getStatsTableByType(statType);
  if (!table) return [];
  return table.columns.map((column) => column.key);
}

const statFields: FootballAdvancedFilterField[] = Object.entries(PLAYER_STATS_TABLES).flatMap(([groupKey, table]) =>
  table.columns.map((column) => ({
    category: 'stats' as const,
    key: `${groupKey}:${column.key}`,
    label: `${table.title.replace(/ leaders$/i, '')} ${column.label}`,
    colKey: column.key,
    statGroup: groupKey,
    valueType: 'numeric' as const,
    workerFieldOverride: 'stats' as const,
    getter: (p: any) => {
      const direct = p?.stats?.[column.key] ?? p?.[column.key];
      if (typeof direct === 'number') return direct;
      const season = p?.stats?.season?.[column.key];
      if (typeof season === 'number') return season;
      return null;
    },
  })),
);

export const allFilters: FootballAdvancedFilterField[] = [...bioFields, ...ratingFields, ...statFields];

export const filtersByCategory: Record<FootballFilterCategory, FootballAdvancedFilterField[]> = {
  bio: allFilters.filter((f) => f.category === 'bio'),
  ratings: allFilters.filter((f) => f.category === 'ratings'),
  stats: allFilters.filter((f) => f.category === 'stats'),
};

export function addPrefixForStat(field: FootballAdvancedFilterField) {
  if (field.category === 'bio') return `Bio: ${field.label}`;
  if (field.category === 'ratings') return `Ratings: ${field.label}`;
  return `Stats: ${field.label}`;
}

export function getExtraStatTypeKeys(filters: FootballAdvancedFilter[] = []) {
  const attrs = new Set<string>();
  const ratings = new Set<string>();
  const stats = new Set<string>();

  for (const filter of filters) {
    const field = allFilters.find((f) => f.key === filter.fieldKey);
    if (!field) continue;
    if (field.workerFieldOverride === 'ratings') ratings.add(field.colKey);
    else if (field.workerFieldOverride === 'stats') stats.add(field.colKey);
    else attrs.add(field.colKey);
  }

  if (attrs.has('pos')) {
    PRIMARY_POSITIONS.forEach((pos) => attrs.add(`pos:${pos}`));
  }

  return {
    attrs: Array.from(attrs),
    ratings: Array.from(ratings),
    stats: Array.from(stats),
  };
}

export function applyAdvancedPlayerFilters(players: any[], filters: FootballAdvancedFilter[] = []) {
  if (!Array.isArray(filters) || filters.length === 0) return players;
  return players.filter((player) => filters.every((filter) => matchesFilter(player, filter)));
}

function matchesFilter(player: any, filter: FootballAdvancedFilter) {
  const field = allFilters.find((entry) => entry.key === filter.fieldKey);
  if (!field) return true;

  const left = field.getter(player);
  if (left == null || filter.value == null || filter.value === '') return true;

  if (field.valueType === 'numeric') {
    const leftNum = Number(left);
    const rightNum = Number(filter.value);
    if (!Number.isFinite(leftNum) || !Number.isFinite(rightNum)) return false;
    switch (filter.operator) {
      case 'eq': return leftNum === rightNum;
      case 'neq': return leftNum !== rightNum;
      case 'gt': return leftNum > rightNum;
      case 'gte': return leftNum >= rightNum;
      case 'lt': return leftNum < rightNum;
      case 'lte': return leftNum <= rightNum;
      default: return true;
    }
  }

  const leftStr = String(left).toLowerCase();
  const rightStr = String(filter.value).toLowerCase();
  switch (filter.operator) {
    case 'eq': return leftStr === rightStr;
    case 'neq': return leftStr !== rightStr;
    case 'contains': return leftStr.includes(rightStr);
    default: return true;
  }
}

export const ADVANCED_FILTER_PRESETS: Record<string, FootballAdvancedFilter[]> = {
  youngHighPotential: [
    { id: 'preset-age', fieldKey: 'age', operator: 'lte', value: 24 },
    { id: 'preset-pot', fieldKey: 'potential', operator: 'gte', value: 80 },
  ],
  cheapStarters: [
    { id: 'preset-ovr', fieldKey: 'ovr', operator: 'gte', value: 70 },
    { id: 'preset-contract', fieldKey: 'contractAmount', operator: 'lte', value: 6 },
  ],
  expiringContracts: [
    { id: 'preset-exp', fieldKey: 'contractExp', operator: 'eq', value: 1 },
  ],
  draftSteals: [
    { id: 'preset-draft-round', fieldKey: 'draftRound', operator: 'gte', value: 3 },
    { id: 'preset-draft-ovr', fieldKey: 'ovr', operator: 'gte', value: 70 },
  ],
  day1Starters: [
    { id: 'preset-day1-ovr', fieldKey: 'ovr', operator: 'gte', value: 75 },
    { id: 'preset-day1-pot', fieldKey: 'potential', operator: 'gte', value: 78 },
  ],
  developmentalUpside: [
    { id: 'preset-dev-age', fieldKey: 'age', operator: 'lte', value: 22 },
    { id: 'preset-dev-pot', fieldKey: 'potential', operator: 'gte', value: 82 },
  ],
  bestAthletes: [
    { id: 'preset-ath-spd', fieldKey: 'spd', operator: 'gte', value: 82 },
    { id: 'preset-ath-acc', fieldKey: 'acc', operator: 'gte', value: 80 },
  ],
  valuePicks: [
    { id: 'preset-value-ovr', fieldKey: 'ovr', operator: 'gte', value: 68 },
    { id: 'preset-value-pot', fieldKey: 'potential', operator: 'gte', value: 80 },
  ],
  qbUpside: [
    { id: 'preset-qb-pos', fieldKey: 'pos', operator: 'eq', value: 'QB' },
    { id: 'preset-qb-tha', fieldKey: 'tha', operator: 'gte', value: 74 },
    { id: 'preset-qb-thp', fieldKey: 'thp', operator: 'gte', value: 78 },
  ],
  skillUpside: [
    { id: 'preset-skill-pos-wr', fieldKey: 'pos', operator: 'contains', value: 'W' },
    { id: 'preset-skill-speed', fieldKey: 'spd', operator: 'gte', value: 80 },
    { id: 'preset-skill-pot', fieldKey: 'potential', operator: 'gte', value: 80 },
  ],
};
