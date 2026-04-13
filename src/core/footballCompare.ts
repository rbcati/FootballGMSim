import { PLAYER_STATS_TABLES } from './footballMeta';
import { LEGACY_TO_CANONICAL_RATING_KEY } from './footballRatings';
import type { RatingKey } from './footballTypes';

export type CompareStatRow = { key: string; label: string; lowerIsBetter?: boolean };
export type CompareSection = { key: string; title: string; rows: CompareStatRow[]; optional?: boolean };

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

const PASS_POS = new Set(['QB']);
const RUSH_POS = new Set(['RB', 'QB']);
const RECEIVE_POS = new Set(['WR', 'TE', 'RB']);
const DEF_POS = new Set(['DL', 'LB', 'CB', 'S']);
const KICK_POS = new Set(['K', 'P']);

const POSITION_GROUP_PRIORITIES: Record<string, string[]> = {
  QB: ['passing', 'rushing', 'receiving'],
  RB: ['rushing', 'receiving', 'passing'],
  WR: ['receiving', 'rushing'],
  TE: ['receiving', 'rushing'],
  OL: [],
  DL: ['defense'],
  LB: ['defense'],
  CB: ['defense'],
  S: ['defense'],
  K: ['kicking'],
  P: ['kicking'],
};

export const COMPARE_RATING_KEYS: Array<'ovr' | 'potential' | RatingKey> = [
  'ovr',
  'potential',
  ...Object.values(LEGACY_TO_CANONICAL_RATING_KEY),
];

export function getCompareRatingLabel(key: string) {
  return RATING_LABELS[key] ?? key.toUpperCase();
}

export function getPlayerRatingValue(player: any, key: string): number | null {
  if (key === 'ovr') return toNumber(player?.ovr);
  if (key === 'potential') return toNumber(player?.potential ?? player?.pot);

  const canonical = toNumber(player?.ratings?.[key]);
  if (canonical != null) return canonical;

  const legacyKey = Object.keys(LEGACY_TO_CANONICAL_RATING_KEY)
    .find((legacy) => LEGACY_TO_CANONICAL_RATING_KEY[legacy as keyof typeof LEGACY_TO_CANONICAL_RATING_KEY] === key);
  return legacyKey ? toNumber(player?.ratings?.[legacyKey]) : null;
}

export function getPlayerStatValue(player: any, key: string): number | null {
  const direct = toNumber(player?.stats?.[key] ?? player?.[key]);
  if (direct != null) return direct;
  return toNumber(player?.stats?.season?.[key]);
}

export function resolveCompareStatSections(playerA: any, playerB: any, showAll = false): CompareSection[] {
  const posA = playerA?.pos;
  const posB = playerB?.pos;
  const ordered = dedupe([
    ...(POSITION_GROUP_PRIORITIES[posA] ?? []),
    ...(POSITION_GROUP_PRIORITIES[posB] ?? []),
    'passing',
    'rushing',
    'receiving',
    'defense',
    'kicking',
  ]);

  const baseSections = ordered.map((groupKey) => {
    if (groupKey === 'kicking') {
      return {
        key: 'kicking',
        title: 'Kicking / Punting',
        rows: [
          { key: 'fgMade', label: 'FG Made' },
          { key: 'fgAttempts', label: 'FG Att' },
          { key: 'xpMade', label: 'XP Made' },
          { key: 'xpAttempts', label: 'XP Att' },
          { key: 'punts', label: 'Punts' },
          { key: 'puntYards', label: 'Punt Yards' },
        ],
        optional: true,
      } as CompareSection;
    }

    const table = PLAYER_STATS_TABLES[groupKey];
    if (!table) return null;
    return {
      key: groupKey,
      title: table.title.replace(/ leaders$/i, ''),
      rows: table.columns.map((column) => ({ key: column.key, label: column.label })),
    } as CompareSection;
  }).filter(Boolean) as CompareSection[];

  const filtered = baseSections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => {
        if (showAll) return true;
        return getPlayerStatValue(playerA, row.key) != null || getPlayerStatValue(playerB, row.key) != null;
      }),
    }))
    .filter((section) => section.rows.length > 0);

  return showAll ? baseSections : filtered;
}

export function compareNumbers(a: number | null, b: number | null, lowerIsBetter = false) {
  if (a == null || b == null) return 'tie';
  if (a === b) return 'tie';
  if (lowerIsBetter) return a < b ? 'a' : 'b';
  return a > b ? 'a' : 'b';
}

export function shouldShowGroupForPosition(group: string, pos?: string) {
  if (!pos) return true;
  if (group === 'passing') return PASS_POS.has(pos);
  if (group === 'rushing') return RUSH_POS.has(pos);
  if (group === 'receiving') return RECEIVE_POS.has(pos);
  if (group === 'defense') return DEF_POS.has(pos);
  if (group === 'kicking') return KICK_POS.has(pos);
  return true;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}
