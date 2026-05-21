/**
 * leagueRecordsViewModel.js
 * Normalizes V1 record book data into flat, filterable view-model rows.
 * Pure helpers; safe on null/partial/legacy record books.
 */
import { RECORD_BOOK_PLAYER_KEYS, RECORD_KEYS } from '../../core/recordBookV1.js';

export const RECORD_KEY_CATEGORY = {
  [RECORD_KEYS.passingYards]: 'passing',
  [RECORD_KEYS.passingTD]: 'passing',
  [RECORD_KEYS.rushingYards]: 'rushing',
  [RECORD_KEYS.rushingTD]: 'rushing',
  [RECORD_KEYS.receivingYards]: 'receiving',
  [RECORD_KEYS.receivingTD]: 'receiving',
  [RECORD_KEYS.tackles]: 'defense',
  [RECORD_KEYS.sacks]: 'defense',
  [RECORD_KEYS.interceptions]: 'defense',
  [RECORD_KEYS.fieldGoalsMade]: 'kicking',
};

const TEAM_RECORD_KEYS = [
  'wins',
  'winPct',
  'pointsFor',
  'pointsAllowed',
  'pointDifferential',
  'pointsPerGame',
  'pointsAllowedPerGame',
];

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatValue(value, recordKey) {
  const n = num(value);
  if (recordKey === 'winPct') return n.toFixed(3);
  if (recordKey === 'pointsPerGame' || recordKey === 'pointsAllowedPerGame') return n.toFixed(1);
  return n.toLocaleString();
}

function buildSingleSeasonRows(singleSeasonV1) {
  const rows = [];
  for (const key of RECORD_BOOK_PLAYER_KEYS) {
    const row = singleSeasonV1?.[key];
    if (!row || num(row.value) <= 0) continue;
    rows.push({
      id: `ss-${key}`,
      scope: 'singleSeason',
      category: RECORD_KEY_CATEGORY[key] ?? 'other',
      recordKey: key,
      label: row.label ?? key,
      value: num(row.value),
      displayValue: formatValue(row.value, key),
      rank: null,
      playerId: row.playerId ?? null,
      playerName: row.playerName ?? null,
      position: row.position ?? null,
      teamId: row.teamId ?? null,
      teamName: row.teamName ?? null,
      teamAbbr: row.teamAbbr ?? null,
      year: row.year ?? null,
      source: row.source ?? 'archivedSeason',
    });
  }
  return rows;
}

function buildCareerRows(careerLeadersV1) {
  const rows = [];
  for (const key of RECORD_BOOK_PLAYER_KEYS) {
    const list = careerLeadersV1?.[key];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row || num(row.value) <= 0) continue;
      rows.push({
        id: `career-${key}-${i}`,
        scope: 'career',
        category: RECORD_KEY_CATEGORY[key] ?? 'other',
        recordKey: key,
        label: row.label ?? key,
        value: num(row.value),
        displayValue: formatValue(row.value, key),
        rank: i + 1,
        playerId: row.playerId ?? null,
        playerName: row.playerName ?? null,
        position: row.position ?? null,
        teamId: row.teamId ?? null,
        teamName: row.teamName ?? null,
        teamAbbr: row.teamAbbr ?? null,
        year: row.year ?? null,
        source: row.source ?? 'careerStats',
      });
    }
  }
  return rows;
}

function buildTeamRows(teamSeasonV1) {
  const rows = [];
  for (const key of TEAM_RECORD_KEYS) {
    const row = teamSeasonV1?.[key];
    if (!row || num(row.value) <= 0) continue;
    rows.push({
      id: `team-${key}`,
      scope: 'team',
      category: 'team',
      recordKey: key,
      label: row.label ?? key,
      value: num(row.value),
      displayValue: formatValue(row.value, key),
      rank: null,
      playerId: null,
      playerName: null,
      position: null,
      teamId: row.teamId ?? null,
      teamName: row.teamName ?? null,
      teamAbbr: row.teamAbbr ?? null,
      year: row.year ?? null,
      source: row.source ?? 'archivedSeason',
    });
  }
  return rows;
}

/** Normalize a V1 record book into a flat list of filterable rows. */
export function buildLeagueRecordsRows(recordBook) {
  return [
    ...buildSingleSeasonRows(recordBook?.singleSeasonV1),
    ...buildCareerRows(recordBook?.careerLeadersV1),
    ...buildTeamRows(recordBook?.teamSeasonV1),
  ];
}

export const SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'singleSeason', label: 'Single-season' },
  { value: 'career', label: 'Career' },
  { value: 'team', label: 'Team' },
];

export const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  { value: 'passing', label: 'Passing' },
  { value: 'rushing', label: 'Rushing' },
  { value: 'receiving', label: 'Receiving' },
  { value: 'defense', label: 'Defense' },
  { value: 'kicking', label: 'Kicking' },
  { value: 'team', label: 'Team' },
];

/** Filter rows by scope, category, and free-text search. */
export function filterRecordRows(rows, { scope = 'all', category = 'all', search = '' } = {}) {
  const q = String(search ?? '').trim().toLowerCase();
  return (rows ?? []).filter((row) => {
    if (scope !== 'all' && row.scope !== scope) return false;
    if (category !== 'all' && row.category !== category) return false;
    if (q) {
      const haystack = [
        row.playerName,
        row.teamName,
        row.teamAbbr,
        row.label,
        row.category,
        row.position,
        row.year != null ? String(row.year) : null,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
