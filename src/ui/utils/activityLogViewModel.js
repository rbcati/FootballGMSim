const TYPE_LABELS = {
  all: 'All',
  trade: 'Trade',
  signing: 'Signing',
  contract: 'Contract',
  draft: 'Draft',
  release: 'Release',
  retirement: 'Retirement',
  other: 'Activity',
};

const ACTIVITY_TYPES = new Set(['trade', 'signing', 'contract', 'draft', 'release', 'retirement', 'other']);
const CONTRACT_TYPES = new Set(['contract', 'extension', 'franchise_tag', 'restructure']);
const SIGNING_SOURCES = new Set(['free_agent_signing', 'signing', 'completed_contract', 'free agency']);
const TRANSACTION_TYPE_MAP = {
  sign: 'signing',
  signing: 'signing',
  free_agent_signing: 'signing',
  release: 'release',
  released: 'release',
  trade: 'trade',
  traded: 'trade',
  draft: 'draft',
  draft_pick: 'draft',
  drafted: 'draft',
  retirement: 'retirement',
  retire: 'retirement',
  extend: 'contract',
  extension: 'contract',
  resigning: 'contract',
  re_signing: 'contract',
  re_sign: 'contract',
  contract: 'contract',
  restructure: 'contract',
  franchise_tag: 'contract',
};

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function slug(value, fallback = 'row') {
  const s = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || fallback;
}

function teamForId(league, teamId) {
  const id = num(teamId);
  if (id == null) return null;
  return (league?.teams ?? []).find((team) => Number(team?.id) === id) ?? null;
}

function normalizeType(value, meta = {}) {
  const raw = text(value).toLowerCase().replaceAll('-', '_').replace(/\s+/g, '_');
  if (raw === 'contract' && SIGNING_SOURCES.has(text(meta?.source).toLowerCase())) return 'signing';
  if (CONTRACT_TYPES.has(raw)) return 'contract';
  const mapped = TRANSACTION_TYPE_MAP[raw] ?? raw;
  return ACTIVITY_TYPES.has(mapped) ? mapped : 'other';
}

function typeLabel(type) {
  return TYPE_LABELS[type] ?? TYPE_LABELS.other;
}

function seasonFromId(seasonId) {
  const n = Number(text(seasonId).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveSeason(row, league) {
  return row?.season ?? row?.year ?? row?.seasonYear ?? seasonFromId(row?.seasonId ?? row?.meta?.seasonId) ?? league?.year ?? null;
}

function resolveSeasonId(row, league) {
  const explicit = row?.seasonId ?? row?.meta?.seasonId ?? null;
  if (explicit != null) return explicit;
  const season = resolveSeason(row, league);
  if (season != null && league?.seasonId != null && Number(season) === Number(league?.year)) return league.seasonId;
  return null;
}

function dateScore(row) {
  const season = num(row?.season, 0) ?? 0;
  const week = num(row?.week, 0) ?? 0;
  const raw = num(row?.rawId ?? row?.meta?.rawId, 0) ?? 0;
  return season * 100000 + week * 1000 + raw;
}

function dateLabel(row) {
  if (row?.dateLabel) return row.dateLabel;
  const season = row?.year ?? row?.season;
  const week = row?.week;
  if (season != null && week != null) return `Y${season} W${week}`;
  if (week != null) return `Week ${week}`;
  if (season != null) return `Season ${season}`;
  return '';
}

function compactTeamIds(...ids) {
  return [...new Set(ids.map((id) => num(id)).filter((id) => id != null))];
}

function playerFromMeta(meta = {}) {
  const player = meta.player && typeof meta.player === 'object' ? meta.player : null;
  if (player) return player;
  return null;
}

function normalizeTransaction(row, league) {
  if (!row || typeof row !== 'object') return null;
  const type = normalizeType(row.type ?? row.legacyType ?? row.typeLabel, row.meta);
  const teamId = row.teamId ?? row.fromTeamId ?? row.toTeamId ?? null;
  const team = row.teamAbbr
    ? { id: teamId, abbr: row.teamAbbr, name: row.teamName }
    : teamForId(league, teamId);
  const fromTeamId = row.fromTeamId ?? row.meta?.fromTeamId ?? null;
  const toTeamId = row.toTeamId ?? row.meta?.toTeamId ?? row.meta?.toTeam ?? null;
  const player = row.playerName || row.playerId != null
    ? { id: row.playerId ?? null, name: row.playerName ?? null, pos: row.pos ?? row.playerPos ?? null }
    : null;
  const summary = row.headline ?? row.summary ?? row.detail ?? typeLabel(type);
  const detail = row.detail ?? row.contractSummary ?? row.assetSummary ?? row.pickSummary ?? null;

  const normalized = {
    id: `transaction:${row.id ?? row.rawId ?? slug(row.headline ?? row.type)}`,
    type,
    label: typeLabel(type),
    season: resolveSeason(row, league),
    seasonId: resolveSeasonId(row, league),
    year: row.year ?? null,
    week: row.week ?? null,
    team,
    teamId,
    teamAbbr: team?.abbr ?? row.teamAbbr ?? null,
    fromTeamId,
    fromTeamAbbr: row.fromTeamAbbr ?? null,
    toTeamId,
    toTeamAbbr: row.toTeamAbbr ?? null,
    participantTeamIds: compactTeamIds(teamId, fromTeamId, toTeamId),
    player,
    playerId: row.playerId ?? null,
    playerName: row.playerName ?? null,
    summary,
    headline: summary,
    detail,
    meta: { ...row },
    source: 'transaction',
    rawId: row.rawId ?? row.id ?? null,
  };
  normalized.typeLabel = normalized.label;
  normalized.dateLabel = dateLabel(normalized);
  normalized.sortDate = dateScore(normalized);
  return normalized;
}

function normalizeChronicle(row, league) {
  if (!row || typeof row !== 'object') return null;
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const type = normalizeType(row.type ?? meta.type, meta);
  if (!['trade', 'signing', 'contract', 'draft', 'release'].includes(type)) return null;
  const player = playerFromMeta(meta);
  const teamId = meta.teamId ?? row.teamId ?? league?.userTeamId ?? null;
  const team = meta.team ? { id: teamId, abbr: meta.team, name: meta.team } : teamForId(league, teamId);
  const playerName = player?.name ?? null;
  const summary = row.headline ?? row.summary ?? typeLabel(type);
  const detail = row.summary ?? meta.description ?? meta.summary ?? null;

  const normalized = {
    id: `chronicle:${row.id ?? slug(row.headline ?? row.summary)}`,
    type,
    label: typeLabel(type),
    season: resolveSeason(row, league),
    seasonId: resolveSeasonId(row, league),
    year: row.year ?? null,
    week: row.week ?? null,
    team,
    teamId,
    teamAbbr: team?.abbr ?? meta.team ?? null,
    participantTeamIds: compactTeamIds(teamId, meta.partnerTeamId, meta.fromTeamId, meta.toTeamId),
    player,
    playerId: player?.id ?? null,
    playerName,
    summary,
    headline: summary,
    detail,
    meta: { ...meta, chronicleId: row.id ?? null },
    source: 'chronicle',
    rawId: row.id ?? null,
  };
  normalized.typeLabel = normalized.label;
  normalized.dateLabel = dateLabel(normalized);
  normalized.sortDate = dateScore(normalized);
  return normalized;
}

function normalizeNews(row, league) {
  if (!row || typeof row !== 'object') return null;
  const type = normalizeType(row.type ?? row.category ?? row.kind, row.meta);
  if (!['trade', 'signing', 'contract', 'draft', 'release'].includes(type)) return null;
  const teamId = row.teamId ?? row.meta?.teamId ?? null;
  const team = teamForId(league, teamId);
  const playerName = row.playerName ?? row.meta?.playerName ?? null;
  const summary = row.headline ?? row.title ?? row.body ?? typeLabel(type);
  const detail = row.body ?? row.summary ?? null;
  const normalized = {
    id: `news:${row.id ?? row.dedupeKey ?? slug(row.headline ?? row.body)}`,
    type,
    label: typeLabel(type),
    season: resolveSeason(row, league),
    seasonId: resolveSeasonId(row, league),
    year: row.year ?? null,
    week: row.week ?? league?.week ?? null,
    team,
    teamId,
    teamAbbr: team?.abbr ?? row.teamAbbr ?? row.meta?.teamAbbr ?? null,
    participantTeamIds: compactTeamIds(teamId),
    player: playerName ? { id: row.playerId ?? row.meta?.playerId ?? null, name: playerName } : null,
    playerId: row.playerId ?? row.meta?.playerId ?? null,
    playerName,
    summary,
    headline: summary,
    detail,
    meta: { ...(row.meta ?? {}), newsId: row.id ?? null },
    source: 'news',
    rawId: row.id ?? row.dedupeKey ?? null,
  };
  normalized.typeLabel = normalized.label;
  normalized.dateLabel = dateLabel(normalized);
  normalized.sortDate = dateScore(normalized);
  return normalized;
}

function dedupeKey(row) {
  const player = row.playerId ?? slug(row.playerName);
  const team = row.teamId ?? row.team?.abbr ?? '';
  const summary = slug(row.summary, '');
  if (row.playerId != null || row.playerName) {
    return [row.type, row.season ?? '', row.seasonId ?? '', row.week ?? '', team, player].join('|');
  }
  return [row.type, row.season ?? '', row.seasonId ?? '', row.week ?? '', team, summary].join('|');
}

const SOURCE_PRIORITY = {
  transaction: 0,
  chronicle: 1,
  news: 2,
};

export const ACTIVITY_LOG_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'trade', label: 'Trades' },
  { value: 'signing', label: 'Signings' },
  { value: 'contract', label: 'Contracts' },
  { value: 'draft', label: 'Draft' },
  { value: 'release', label: 'Releases' },
];

export function buildActivityLogRows({ league = {}, transactions = [], chronicleRows = null, newsRows = null } = {}) {
  const rows = [
    ...(Array.isArray(transactions) ? transactions.map((row) => normalizeTransaction(row, league)) : []),
    ...(Array.isArray(chronicleRows ?? league?.franchiseChronicle) ? (chronicleRows ?? league.franchiseChronicle).map((row) => normalizeChronicle(row, league)) : []),
    ...(Array.isArray(newsRows ?? league?.newsItems) ? (newsRows ?? league.newsItems).map((row) => normalizeNews(row, league)) : []),
  ].filter(Boolean);

  const byKey = new Map();
  for (const row of rows) {
    const key = dedupeKey(row);
    const current = byKey.get(key);
    if (!current || SOURCE_PRIORITY[row.source] < SOURCE_PRIORITY[current.source]) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const d = dateScore(b) - dateScore(a);
    if (d !== 0) return d;
    const source = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    if (source !== 0) return source;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function filterActivityLogRows(rows = [], { type = 'all', teamId = 'all', seasonId = 'all', search = '' } = {}) {
  const q = text(search).toLowerCase();
  const selectedTeamId = teamId === 'all' ? null : num(teamId);
  const selectedSeasonId = seasonId === 'all' ? null : text(seasonId);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (type !== 'all' && row.type !== type) return false;
    if (selectedSeasonId && text(row.seasonId) !== selectedSeasonId && `s${row.season}` !== selectedSeasonId) return false;
    if (selectedTeamId != null) {
      const participantTeamIds = Array.isArray(row.participantTeamIds) ? row.participantTeamIds : [row.teamId];
      if (!participantTeamIds.some((id) => Number(id) === selectedTeamId)) return false;
    }
    if (!q) return true;
    const hay = [
      row.label,
      row.summary,
      row.detail,
      row.playerName,
      row.player?.name,
      row.team?.abbr,
      row.team?.name,
      row.source,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function buildActivityLogViewModel(input = {}, filters = {}) {
  const rows = buildActivityLogRows(input);
  const filteredRows = filterActivityLogRows(rows, filters);
  return {
    rows: filteredRows,
    allRows: rows,
    filters: ACTIVITY_LOG_FILTERS,
    counts: {
      total: rows.length,
      shown: filteredRows.length,
    },
  };
}
