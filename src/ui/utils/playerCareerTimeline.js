import { buildActivityLogRows } from './activityLogViewModel.js';

const TYPE_LABELS = {
  draft: 'Draft',
  trade: 'Trade',
  signing: 'Signing',
  contract: 'Contract',
  tag: 'Tag',
  release: 'Release',
  award: 'Award',
  record: 'Record',
  event: 'Event',
};

const SOURCE_PRIORITY = {
  chronicle: 0,
  activity: 1,
  transaction: 2,
  news: 3,
  award: 4,
  record: 5,
  player: 6,
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

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function teamForId(league, teamId) {
  const id = num(teamId);
  if (id == null) return null;
  return (league?.teams ?? []).find((team) => Number(team?.id) === id) ?? null;
}

function teamLabel(team) {
  return text(team?.abbr ?? team?.name);
}

function normalizeTimelineType(type, meta = {}) {
  const raw = text(type).toLowerCase().replaceAll('-', '_').replace(/\s+/g, '_');
  if (raw === 'franchise_tag' || text(meta?.source).toLowerCase() === 'franchise_tag') return 'tag';
  if (raw === 'free_agent_signing' || text(meta?.source).toLowerCase() === 'free_agent_signing') return 'signing';
  if (raw === 'extension' || raw === 'restructure' || raw === 'contract') return 'contract';
  if (raw === 'draft_pick' || raw === 'drafted') return 'draft';
  if (TYPE_LABELS[raw]) return raw;
  return 'event';
}

function seasonScore(row) {
  return (num(row?.season, 0) ?? 0) * 100000 + (num(row?.week, 0) ?? 0) * 1000 + (num(row?.sortDate, 0) ?? 0);
}

function playerNamesFromMeta(meta = {}) {
  const out = [];
  const addPlayer = (player) => {
    if (!player) return;
    if (typeof player === 'string') {
      const name = text(player);
      if (name) out.push({ name });
      return;
    }
    const name = text(player.name ?? player.playerName);
    const id = player.id ?? player.playerId ?? null;
    if (name || id != null) out.push({ id, name });
  };
  addPlayer(meta.player);
  for (const key of ['players', 'incomingPlayers', 'outgoingPlayers', 'acquiredPlayers', 'receivedPlayers', 'sentPlayers', 'tradedPlayers']) {
    const list = Array.isArray(meta[key]) ? meta[key] : [];
    list.forEach(addPlayer);
  }
  return out;
}

function rowInvolvesPlayer(row, player, { assumeTransactionRelevant = false } = {}) {
  if (!row || !player) return false;
  const playerId = player.id ?? player.playerId;
  const playerName = text(player.name);
  if (sameId(row.playerId, playerId)) return true;
  if (playerName && text(row.playerName).toLowerCase() === playerName.toLowerCase()) return true;
  const metaPlayers = playerNamesFromMeta(row.meta);
  if (metaPlayers.some((p) => sameId(p.id, playerId))) return true;
  if (playerName && metaPlayers.some((p) => text(p.name).toLowerCase() === playerName.toLowerCase())) return true;
  if (assumeTransactionRelevant && row.source === 'transaction') return true;
  return false;
}

function normalizeActivityRow(row) {
  const type = normalizeTimelineType(row?.type, row?.meta);
  return {
    id: `activity:${row?.id ?? slug(row?.summary ?? row?.headline)}`,
    type,
    label: TYPE_LABELS[type] ?? TYPE_LABELS.event,
    season: row?.season ?? row?.year ?? null,
    week: row?.week ?? null,
    team: row?.team ?? null,
    teamId: row?.teamId ?? null,
    teamAbbr: row?.teamAbbr ?? row?.team?.abbr ?? null,
    summary: row?.summary ?? row?.headline ?? TYPE_LABELS[type] ?? 'Player event',
    detail: row?.detail ?? null,
    source: row?.source ?? 'activity',
    meta: row?.meta ?? {},
    sortDate: row?.sortDate ?? seasonScore(row),
  };
}

function formatDraftSummary(player, team) {
  const draft = player?.draft && typeof player.draft === 'object' ? player.draft : {};
  const round = player?.draftRound ?? draft.round ?? null;
  const pick = player?.draftPick ?? draft.pick ?? draft.overall ?? null;
  const year = player?.draftYear ?? draft.year ?? draft.season ?? player?.year ?? null;
  if (round == null && pick == null && year == null) return null;
  const parts = [
    year ? `${year}` : null,
    round != null ? `Round ${round}` : null,
    pick != null ? `Pick ${pick}` : null,
  ].filter(Boolean);
  return `Drafted${parts.length ? ` ${parts.join(' ')}` : ''}${team ? ` by ${team}` : ''}`;
}

function buildDraftRowFromPlayer(player, league) {
  const draft = player?.draft && typeof player.draft === 'object' ? player.draft : {};
  const teamId = player?.draftTeamId ?? draft.teamId ?? draft.team ?? null;
  const team = teamForId(league, teamId) ?? null;
  const teamText = teamLabel(team);
  const summary = formatDraftSummary(player, teamText);
  if (!summary) return null;
  const season = player?.draftYear ?? draft.year ?? draft.season ?? player?.year ?? null;
  return {
    id: `player-draft-${player?.id ?? slug(player?.name)}-${season ?? 'unknown'}`,
    type: 'draft',
    label: TYPE_LABELS.draft,
    season,
    week: null,
    team,
    teamId,
    teamAbbr: team?.abbr ?? null,
    summary,
    detail: null,
    source: 'player',
    meta: { draft },
    sortDate: (num(season, 0) ?? 0) * 100000,
  };
}

function normalizeAwardRow(row, player) {
  if (!row || typeof row !== 'object') return null;
  const season = row.year ?? row.season ?? null;
  return {
    id: `award:${player?.id ?? 'player'}:${season ?? 'na'}:${row.canonical ?? slug(row.label)}`,
    type: 'award',
    label: TYPE_LABELS.award,
    season,
    week: null,
    team: row.teamAbbr ? { abbr: row.teamAbbr, id: row.teamId ?? null } : null,
    teamId: row.teamId ?? null,
    teamAbbr: row.teamAbbr ?? null,
    summary: row.label ?? 'Award recorded',
    detail: row.source ? `Source: ${row.source}` : null,
    source: 'award',
    meta: { ...row },
    sortDate: (num(season, 0) ?? 0) * 100000 + 500,
  };
}

function normalizeRecordRow(row, player, index) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: `record:${player?.id ?? 'player'}:${row.kind ?? 'record'}:${row.recordKey ?? index}`,
    type: 'record',
    label: TYPE_LABELS.record,
    season: row.year ?? null,
    week: null,
    team: null,
    teamId: null,
    teamAbbr: null,
    summary: row.text ?? 'Record book mention',
    detail: null,
    source: 'record',
    meta: { ...row },
    sortDate: (num(row.year, 0) ?? 0) * 100000,
  };
}

function dedupeKey(row) {
  const season = row?.season ?? '';
  const week = row?.week ?? '';
  const team = row?.teamId ?? row?.teamAbbr ?? '';
  const summary = slug(row?.summary, '');
  if (['draft', 'trade', 'signing', 'contract', 'tag', 'release'].includes(row?.type)) {
    return [row?.type ?? 'event', season, week, team].join('|');
  }
  return [row?.type ?? 'event', season, week, team, summary].join('|');
}

function chooseAcquisition(rows) {
  const candidates = rows.filter((row) => ['draft', 'signing', 'trade', 'contract', 'tag'].includes(row.type));
  if (!candidates.length) {
    return {
      label: 'How acquired',
      summary: 'Unknown / legacy player',
      detail: 'No acquisition event is recorded for this save.',
      source: 'fallback',
      type: 'event',
    };
  }
  const oldest = [...candidates].sort((a, b) => {
    const d = seasonScore(a) - seasonScore(b);
    if (d !== 0) return d;
    return String(a.id).localeCompare(String(b.id));
  })[0];
  const verb = {
    draft: 'Drafted',
    signing: 'Signed in free agency',
    trade: 'Acquired via trade',
    contract: 'Re-signed / extended',
    tag: 'Franchise tagged',
  }[oldest.type] ?? 'Recorded';
  const when = [
    oldest.season ? `Season ${oldest.season}` : null,
    oldest.week != null ? `Week ${oldest.week}` : null,
    oldest.teamAbbr ?? teamLabel(oldest.team) ?? null,
  ].filter(Boolean).join(' - ');
  return {
    label: 'How acquired',
    summary: oldest.type === 'draft' ? oldest.summary : verb,
    detail: when || oldest.summary,
    source: oldest.source,
    type: oldest.type,
  };
}

export function buildPlayerCareerTimeline({
  player = null,
  league = {},
  activityRows = null,
  transactions = [],
  chronicleRows = null,
  newsRows = null,
  awardRows = [],
  recordRows = [],
  assumeTransactionsRelevant = false,
} = {}) {
  if (!player) {
    return { rows: [], acquisition: chooseAcquisition([]), counts: { total: 0 } };
  }

  const normalizedActivityRows = Array.isArray(activityRows)
    ? activityRows
    : [
        ...buildActivityLogRows({ league, transactions, chronicleRows: [], newsRows: [] }),
        ...buildActivityLogRows({ league, transactions: [], chronicleRows: chronicleRows ?? league?.franchiseChronicle, newsRows: [] }),
        ...buildActivityLogRows({ league, transactions: [], chronicleRows: [], newsRows: newsRows ?? league?.newsItems }),
      ];

  const playerActivityRows = normalizedActivityRows
    .filter((row) => rowInvolvesPlayer(row, player, { assumeTransactionRelevant: assumeTransactionsRelevant }))
    .map(normalizeActivityRow);

  const draftRow = buildDraftRowFromPlayer(player, league);
  const awardTimelineRows = (Array.isArray(awardRows) ? awardRows : [])
    .map((row) => normalizeAwardRow(row, player))
    .filter(Boolean);
  const recordTimelineRows = (Array.isArray(recordRows) ? recordRows : [])
    .map((row, index) => normalizeRecordRow(row, player, index))
    .filter(Boolean);

  const allRows = [
    ...playerActivityRows,
    draftRow,
    ...awardTimelineRows,
    ...recordTimelineRows,
  ].filter(Boolean);

  const byKey = new Map();
  for (const row of allRows) {
    const key = dedupeKey(row);
    const current = byKey.get(key);
    if (!current || (SOURCE_PRIORITY[row.source] ?? 99) < (SOURCE_PRIORITY[current.source] ?? 99)) {
      byKey.set(key, row);
    }
  }

  const rows = [...byKey.values()].sort((a, b) => {
    const d = seasonScore(b) - seasonScore(a);
    if (d !== 0) return d;
    const source = (SOURCE_PRIORITY[a.source] ?? 99) - (SOURCE_PRIORITY[b.source] ?? 99);
    if (source !== 0) return source;
    return String(a.id).localeCompare(String(b.id));
  });

  return {
    rows,
    acquisition: chooseAcquisition(rows),
    counts: { total: rows.length },
  };
}
