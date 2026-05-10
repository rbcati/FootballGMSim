/**
 * Pure transaction / activity timeline normalization (no DB, no React).
 * Normalizes rows from IndexedDB `transactions` store and enriched worker payloads.
 */

export const TRANSACTION_TIMELINE_SCHEMA_VERSION = 1;

/** @typedef {'signing'|'release'|'trade'|'extension'|'restructure'|'franchise_tag'|'draft'|'retirement'|'other'} TransactionBucket */

const INTERNAL_TO_BUCKET = {
  SIGN: 'signing',
  RELEASE: 'release',
  TRADE: 'trade',
  EXTEND: 'extension',
  RESTRUCTURE: 'restructure',
  FRANCHISE_TAG: 'franchise_tag',
  DRAFT: 'draft',
  RETIREMENT: 'retirement',
};

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Resolve team abbr from ctx.teamsById (Map id->team) or teams array.
 * @param {number|string|null} teamId
 * @param {{ teamsById?: Map<number,any>, teams?: any[] }} ctx
 */
function teamAbbrFor(teamId, ctx = {}) {
  if (teamId == null) return '';
  const id = Number(teamId);
  if (ctx.teamsById instanceof Map) {
    const t = ctx.teamsById.get(id);
    return t?.abbr != null ? str(t.abbr) : '';
  }
  const teams = ctx.teams || [];
  const t = teams.find((x) => Number(x?.id) === id);
  return t?.abbr != null ? str(t.abbr) : '';
}

function playerLookup(playerId, ctx = {}) {
  if (playerId == null) return null;
  const id = Number(playerId);
  if (ctx.playersById instanceof Map) return ctx.playersById.get(id) ?? null;
  const players = ctx.players || [];
  return players.find((p) => Number(p?.id) === id) ?? null;
}

/**
 * Collect player IDs involved in a raw transaction (for filtering).
 * @param {object} tx
 * @returns {number[]}
 */
export function collectPlayerIdsFromRaw(tx) {
  const d = tx?.details && typeof tx.details === 'object' ? tx.details : {};
  const ids = new Set();
  const add = (v) => {
    if (v == null) return;
    const n = Number(v);
    if (Number.isFinite(n)) ids.add(n);
  };
  add(d.playerId);
  add(d.receivedPlayerId);
  const offP = d.offering?.playerIds;
  const recP = d.receiving?.playerIds;
  if (Array.isArray(offP)) offP.forEach(add);
  if (Array.isArray(recP)) recP.forEach(add);
  return [...ids];
}

/**
 * Build stable trade fingerprint for deduping mirrored AI trade rows (same week, same two players).
 */
export function tradeDedupeFingerprint(tx) {
  const type = str(tx?.type).toUpperCase();
  if (type !== 'TRADE') return null;
  const d = tx?.details || {};
  const fromTeamId = num(d.fromTeamId);
  const toTeamId = num(d.toTeamId ?? d.toTeam);
  const off = d.offering?.playerIds;
  const rec = d.receiving?.playerIds;
  if (Array.isArray(off) && off.length + (Array.isArray(rec) ? rec.length : 0) > 0) {
    const all = [...(off || []), ...(rec || [])].map((x) => num(x)).filter((n) => n > 0).sort((a, b) => a - b);
    return `pkg|${str(tx?.seasonId)}|${num(tx?.week)}|${fromTeamId}|${toTeamId}|${all.join(',')}`;
  }
  const a = num(d.playerId);
  const b = num(d.receivedPlayerId);
  if (a && b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return `ai|${str(tx?.seasonId)}|${num(tx?.week)}|${lo}|${hi}`;
  }
  return `misc|${str(tx?.id)}`;
}

/**
 * Map raw DB / worker row to canonical bucket.
 * @param {string} internalType
 * @returns {TransactionBucket}
 */
export function rawTypeToBucket(internalType) {
  const u = str(internalType).toUpperCase();
  return INTERNAL_TO_BUCKET[u] || 'other';
}

function summarizeContract(contract) {
  if (!contract || typeof contract !== 'object') return '';
  const years = num(contract.yearsTotal ?? contract.years ?? 0);
  const base = num(contract.baseAnnual);
  const bonus = num(contract.signingBonus);
  if (years <= 0 && base <= 0 && bonus <= 0) return '';
  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (base > 0) parts.push(`$${base.toFixed(1)}M/yr`);
  if (bonus > 0) parts.push(`$${bonus.toFixed(1)}M bonus`);
  return parts.join(' · ');
}

function buildHeadlineAndDetail(tx, bucket, ctx) {
  const d = tx?.details || {};
  const teamAbbr = str(tx?.teamAbbr) || teamAbbrFor(tx?.teamId, ctx);
  const playerId = d.playerId != null ? num(d.playerId) : num(tx?.playerId);
  const pl = playerLookup(playerId, ctx);
  const playerName = str(tx?.playerName) || pl?.name || '';
  const pos = str(tx?.playerPos) || pl?.pos || '';

  if (bucket === 'signing') {
    return {
      headline: `${teamAbbr || 'Team'} signed ${playerName || 'player'}`,
      detail: summarizeContract(d.contract ?? tx?.contract) || (pos ? `${pos}` : ''),
    };
  }
  if (bucket === 'release') {
    return {
      headline: `${teamAbbr || 'Team'} released ${playerName || 'player'}`,
      detail: pos ? `${pos}` : '',
    };
  }
  if (bucket === 'extension') {
    return {
      headline: `${teamAbbr || 'Team'} extended ${playerName || 'player'}`,
      detail: summarizeContract(d.contract ?? tx?.contract),
    };
  }
  if (bucket === 'restructure') {
    return {
      headline: `${teamAbbr || 'Team'} restructured ${playerName || 'player'}`,
      detail: d.convertAmount != null ? `Converted ~$${num(d.convertAmount).toFixed(1)}M base` : '',
    };
  }
  if (bucket === 'franchise_tag') {
    return {
      headline: `${teamAbbr || 'Team'} franchise tagged ${playerName || 'player'}`,
      detail: summarizeContract(d.contract),
    };
  }
  if (bucket === 'draft') {
    const overall = d.overall != null ? `#${d.overall}` : '';
    return {
      headline: `${teamAbbr || 'Team'} drafted ${playerName || 'prospect'} ${overall}`.trim(),
      detail: d.round != null ? `R${d.round}` + (d.pickInRound != null ? ` · Pick ${d.pickInRound}` : '') : str(pos),
    };
  }
  if (bucket === 'retirement') {
    const hof = Boolean(d.hof);
    return {
      headline: hof
        ? `${playerName || 'Player'} retired — Hall of Fame`
        : `${playerName || 'Player'} announced retirement`,
      detail: str(d.reason || ''),
    };
  }
  if (bucket === 'trade') {
    const fromId = num(d.fromTeamId);
    const toId = num(d.toTeamId ?? d.toTeam);
    const fromAb = str(tx?.fromTeamAbbr) || teamAbbrFor(fromId, ctx);
    const toAb = str(tx?.toTeamAbbr) || teamAbbrFor(toId, ctx);
    const offPlayers = (d.offering?.playerIds || []).length;
    const offPicks = (d.offering?.pickIds || []).length;
    const recPlayers = (d.receiving?.playerIds || []).length;
    const recPicks = (d.receiving?.pickIds || []).length;
    if (offPlayers + offPicks + recPlayers + recPicks > 0) {
      return {
        headline: `Trade: ${fromAb || '?'} ↔ ${toAb || '?'}`,
        detail: `Outgoing ${offPlayers}P/${offPicks}pk · Incoming ${recPlayers}P/${recPicks}pk`,
      };
    }
    const recvId = num(d.receivedPlayerId);
    const recv = playerLookup(recvId, ctx);
    const recvName = recv?.name || '';
    return {
      headline: `${teamAbbr || '?'} traded ${playerName || 'player'}`,
      detail: recvName ? `for ${recvName}` : (toAb ? `to ${toAb}` : ''),
    };
  }
  return {
    headline: str(tx?.typeLabel || tx?.type || 'Move'),
    detail: '',
  };
}

/**
 * Normalize a single raw transaction row.
 * @param {object} tx - raw from DB or partially enriched from worker
 * @param {{ teams?: any[], teamsById?: Map<number,any>, players?: any[], playersById?: Map<number,any>, year?: number|null, phase?: string|null }} ctx
 */
export function normalizeRawTransaction(tx, ctx = {}) {
  const d = tx?.details && typeof tx.details === 'object' ? tx.details : {};
  const internalType = str(tx?.type).toUpperCase();
  const bucket = rawTypeToBucket(internalType);
  const playerId = d.playerId != null ? num(d.playerId) : num(tx?.playerId);
  const pl = playerLookup(playerId, ctx);
  const pos = str(tx?.playerPos) || pl?.pos || '';

  let subtype = '';
  if (bucket === 'retirement' && d.hof) subtype = 'hof';

  const fromTeamId = d.fromTeamId != null ? num(d.fromTeamId) : null;
  const toTeamIdRaw = d.toTeamId ?? d.toTeam;
  const toTeamId = toTeamIdRaw != null ? num(toTeamIdRaw) : null;

  const { headline, detail } = buildHeadlineAndDetail(tx, bucket, ctx);

  const contractSummary = summarizeContract(d.contract ?? tx?.contract) || null;
  let assetSummary = '';
  if (bucket === 'trade' && (d.offering || d.receiving)) {
    const op = (d.offering?.playerIds || []).length;
    const ok = (d.offering?.pickIds || []).length;
    const rp = (d.receiving?.playerIds || []).length;
    const rk = (d.receiving?.pickIds || []).length;
    assetSummary = `${op} pl / ${ok} pk out · ${rp} pl / ${rk} pk in`;
  }

  let pickSummary = '';
  if (bucket === 'draft') {
    pickSummary = d.overall != null ? `#${d.overall} R${d.round ?? '?'}` : '';
  }

  const row = {
    id: tx?.id != null ? `tx-${tx.id}` : `tx-${internalType}-${str(tx?.seasonId)}-w${num(tx?.week)}-t${num(tx?.teamId)}-p${num(playerId)}`,
    rawId: tx?.id ?? null,
    type: bucket,
    subtype: subtype || null,
    year: ctx.year != null ? num(ctx.year) : null,
    week: tx?.week != null ? num(tx.week) : null,
    phase: ctx.phase != null ? str(ctx.phase) : null,
    seasonId: tx?.seasonId != null ? str(tx.seasonId) : null,
    dateLabel: tx?.week != null && ctx.year != null ? `Y${ctx.year} W${tx.week}` : (tx?.seasonId != null ? str(tx.seasonId) : ''),
    playerId: Number.isFinite(playerId) && playerId > 0 ? playerId : null,
    playerName: str(tx?.playerName) || pl?.name || null,
    pos: pos || null,
    fromTeamId: Number.isFinite(fromTeamId) && fromTeamId > 0 ? fromTeamId : null,
    fromTeamAbbr: str(tx?.fromTeamAbbr) || teamAbbrFor(fromTeamId, ctx) || null,
    toTeamId: Number.isFinite(toTeamId) && toTeamId > 0 ? toTeamId : null,
    toTeamAbbr: str(tx?.toTeamAbbr) || teamAbbrFor(toTeamId, ctx) || null,
    teamId: tx?.teamId != null ? num(tx.teamId) : null,
    teamAbbr: str(tx?.teamAbbr) || teamAbbrFor(tx?.teamId, ctx) || null,
    assetSummary: assetSummary || null,
    contractSummary,
    pickSummary: pickSummary || null,
    valueSummary: null,
    headline,
    detail: detail || null,
    source: 'transactionsStore',
    _internalType: internalType,
    _playerIds: collectPlayerIdsFromRaw(tx),
    _tradeFp: bucket === 'trade' ? tradeDedupeFingerprint(tx) : null,
  };

  return row;
}

/**
 * Dedupe normalized rows. For trades with same _tradeFp, keep one row (league lens).
 * @param {object[]} rows - normalized rows
 */
export function dedupeNormalizedTransactions(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const fp = r?._tradeFp;
    if (fp) {
      if (seen.has(fp)) continue;
      seen.add(fp);
    }
    out.push(r);
  }
  return out;
}

/**
 * @param {object} filters
 * @param {string} [filters.seasonId]
 * @param {number} [filters.year]
 * @param {number} [filters.teamId]
 * @param {number} [filters.playerId]
 * @param {string} [filters.type] - bucket name
 * @param {string} [filters.search]
 * @param {number} [filters.limit]
 */
export function filterNormalizedTransactions(rows, filters = {}) {
  if (!Array.isArray(rows)) return [];
  const {
    seasonId = null,
    year = null,
    teamId = null,
    playerId = null,
    type = null,
    search = '',
    limit = 200,
  } = filters;
  const q = str(search).toLowerCase();
  const tid = teamId != null ? num(teamId) : null;
  const pid = playerId != null ? num(playerId) : null;
  const sid = seasonId != null ? str(seasonId) : null;
  const y = year != null ? num(year) : null;
  const typeBucket = type ? str(type).toLowerCase() : '';

  let list = rows.filter((r) => {
    if (sid && str(r.seasonId) !== sid) return false;
    if (y != null && num(r.year) !== y && y > 0) return false;
    if (typeBucket && str(r.type) !== typeBucket) return false;
    if (pid != null && pid > 0) {
      const ids = Array.isArray(r._playerIds) ? r._playerIds : [];
      const primary = num(r.playerId);
      if (!ids.includes(pid) && primary !== pid) return false;
    }
    if (tid != null && tid > 0) {
      const hit = num(r.teamId) === tid
        || num(r.fromTeamId) === tid
        || num(r.toTeamId) === tid;
      if (!hit) return false;
    }
    if (q) {
      const hay = [
        r.headline, r.detail, r.playerName, r.teamAbbr, r.fromTeamAbbr, r.toTeamAbbr, r.type,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const lim = Math.max(1, Math.min(2000, num(limit) || 200));
  return list.slice(0, lim);
}

const MOVE_WEIGHT = {
  trade: 5,
  signing: 4,
  extension: 4,
  draft: 4,
  franchise_tag: 3,
  restructure: 2,
  release: 2,
  retirement: 4,
  other: 1,
};

/**
 * Rank moves relevant to a franchise (newest first after score sort).
 * @param {object[]} rows - normalized
 * @param {number} franchiseTeamId
 * @param {number} [limit=12]
 */
export function rankMajorMovesForTeam(rows, franchiseTeamId, limit = 12) {
  const tid = num(franchiseTeamId);
  if (!Number.isFinite(tid) || tid <= 0 || !Array.isArray(rows)) return [];

  const teamRows = filterNormalizedTransactions(rows, { teamId: tid, limit: 500 });
  const scored = teamRows.map((r, idx) => {
    const w = MOVE_WEIGHT[r.type] ?? 1;
    const weekScore = num(r.week);
    const raw = num(r.rawId);
    return { r, score: w * 10000 + weekScore * 10 + (raw % 1000) * 0.001 - idx * 1e-6 };
  });
  scored.sort((a, b) => b.score - a.score);
  const lim = Math.max(1, Math.min(30, num(limit) || 12));
  return scored.slice(0, lim).map((x) => x.r);
}

/**
 * Strip internal fields for JSON archive / API payload.
 * @param {object[]} rows
 * @param {number} [cap=32]
 */
export function compactRowsForArchive(rows, cap = 32) {
  if (!Array.isArray(rows)) return [];
  const c = Math.max(1, Math.min(64, num(cap) || 32));
  return rows.slice(0, c).map((r) => ({
    id: r.id,
    rawId: r.rawId,
    type: r.type,
    legacyType: r._internalType || null,
    subtype: r.subtype,
    year: r.year,
    week: r.week,
    phase: r.phase,
    seasonId: r.seasonId,
    dateLabel: r.dateLabel,
    playerId: r.playerId,
    playerName: r.playerName,
    pos: r.pos,
    fromTeamId: r.fromTeamId,
    fromTeamAbbr: r.fromTeamAbbr,
    toTeamId: r.toTeamId,
    toTeamAbbr: r.toTeamAbbr,
    teamId: r.teamId,
    teamAbbr: r.teamAbbr,
    assetSummary: r.assetSummary,
    contractSummary: r.contractSummary,
    pickSummary: r.pickSummary,
    valueSummary: r.valueSummary,
    headline: r.headline,
    detail: r.detail,
    source: r.source,
  }));
}

/**
 * Strip internal fields for UI lists (same as compact but optional limit).
 */
export function stripInternalTimelineFields(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: r.id,
    rawId: r.rawId,
    type: r.type,
    /** Uppercase DB type e.g. SIGN, TRADE — for backward-compatible UI checks */
    legacyType: r._internalType || null,
    subtype: r.subtype,
    year: r.year,
    week: r.week,
    phase: r.phase,
    seasonId: r.seasonId,
    dateLabel: r.dateLabel,
    playerId: r.playerId,
    playerName: r.playerName,
    pos: r.pos,
    fromTeamId: r.fromTeamId,
    fromTeamAbbr: r.fromTeamAbbr,
    toTeamId: r.toTeamId,
    toTeamAbbr: r.toTeamAbbr,
    teamId: r.teamId,
    teamAbbr: r.teamAbbr,
    assetSummary: r.assetSummary,
    contractSummary: r.contractSummary,
    pickSummary: r.pickSummary,
    valueSummary: r.valueSummary,
    headline: r.headline,
    detail: r.detail,
    source: r.source,
  }));
}

/**
 * Normalize legacy archived majorTransactions (raw DB shape) for display.
 */
export function normalizeArchivedMajorTransactions(rawRows, ctx = {}) {
  if (!Array.isArray(rawRows) || !rawRows.length) return [];
  const normalized = rawRows.map((tx) => normalizeRawTransaction(tx, ctx));
  return dedupeNormalizedTransactions(normalized);
}
