const ADVANCED_STAT_KEYS = [
  'targets',
  'drops',
  'battedPasses',
  'coverageTargets',
  'coverageCompletionsAllowed',
  'receptionsAllowed',
  'sacksAllowed',
  'sacksMade',
];

const INTERNAL_KEYS = new Set(['__meta', 'meta', 'archivedGameIds']);

function emptyStats() {
  return ADVANCED_STAT_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function emptyView() {
  return {
    hasData: false,
    career: null,
    seasons: [],
  };
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStats(row) {
  return ADVANCED_STAT_KEYS.reduce((acc, key) => {
    acc[key] = num(row?.[key]);
    return acc;
  }, {});
}

function addStats(target, source) {
  for (const key of ADVANCED_STAT_KEYS) {
    target[key] += num(source?.[key]);
  }
  return target;
}

function isInternalKey(key) {
  return INTERNAL_KEYS.has(String(key));
}

function normalizeSeasonLabel(seasonKey) {
  const numeric = Number(seasonKey);
  return Number.isFinite(numeric) && String(seasonKey).trim() !== '' ? numeric : String(seasonKey);
}

function seasonSortValue(row) {
  const numeric = Number(row?.season);
  if (Number.isFinite(numeric)) return numeric;
  const fallback = Number(String(row?.season ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(fallback) ? fallback : 0;
}

export function buildPlayerAdvancedStatsView(playerId, archive) {
  if (playerId == null || playerId === '' || !isRecord(archive)) return emptyView();

  const pid = String(playerId);
  if (isInternalKey(pid)) return emptyView();

  const playerYears = archive[pid];
  if (!isRecord(playerYears)) return emptyView();

  const career = emptyStats();
  const seasons = [];

  for (const [seasonKey, rawStats] of Object.entries(playerYears)) {
    if (isInternalKey(seasonKey) || !isRecord(rawStats)) continue;
    const stats = normalizeStats(rawStats);
    addStats(career, stats);
    seasons.push({
      season: normalizeSeasonLabel(seasonKey),
      ...stats,
    });
  }

  if (seasons.length === 0) return emptyView();

  seasons.sort((a, b) => {
    const bySeason = seasonSortValue(b) - seasonSortValue(a);
    if (bySeason !== 0) return bySeason;
    return String(b.season).localeCompare(String(a.season));
  });

  return {
    hasData: true,
    career,
    seasons,
  };
}

