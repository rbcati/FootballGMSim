/**
 * Merge player.accolades with archived season awards for profile / history UI.
 * Pure helpers — no invented honors.
 */

export const ARCHIVE_PLAYER_AWARD_KEYS = [
  'mvp',
  'opoy',
  'dpoy',
  'roty',
  'oroy',
  'droy',
  'sbMvp',
  'bestQB',
  'bestRB',
  'bestWrTe',
  'bestDefensivePlayer',
  'bestKicker',
];

const AWARD_LABEL = {
  mvp: 'Most Valuable Player',
  opoy: 'Offensive Player of the Year',
  dpoy: 'Defensive Player of the Year',
  roty: 'Rookie of the Year',
  oroy: 'Offensive Rookie of the Year',
  droy: 'Defensive Rookie of the Year',
  sbMvp: 'Finals MVP',
  bestQB: 'Best QB',
  bestRB: 'Best RB',
  bestWrTe: 'Best WR/TE',
  bestDefensivePlayer: 'Best Defensive Player',
  bestKicker: 'Best Kicker',
};

const ACCOLADE_TO_CANONICAL = {
  MVP: 'mvp',
  OPOY: 'opoy',
  DPOY: 'dpoy',
  ROTY: 'roty',
  SB_MVP: 'sbMvp',
  SB_RING: 'sb_ring',
};

function teamAbbrFromId(teamId, teams) {
  if (teamId == null) return null;
  const t = (teams || []).find((x) => Number(x?.id) === Number(teamId));
  return t?.abbr ?? null;
}

function dedupeKeyForCanonical(year, canonical) {
  return `${canonical}_${year}`;
}

function collectAllProArchiveRows(awards, year) {
  const ap = awards?.allPro;
  if (!ap || typeof ap !== 'object') return [];
  const off = Array.isArray(ap.firstTeamOffense) ? ap.firstTeamOffense : [];
  const def = Array.isArray(ap.firstTeamDefense) ? ap.firstTeamDefense : [];
  const rows = [];
  for (const row of off) {
    if (row?.playerId == null) continue;
    rows.push({
      playerId: row.playerId,
      year,
      canonical: 'allProOffense',
      label: `First Team All-Pro (${String(row.pos ?? 'Offense')})`,
      teamId: row.teamId ?? null,
    });
  }
  for (const row of def) {
    if (row?.playerId == null) continue;
    rows.push({
      playerId: row.playerId,
      year,
      canonical: 'allProDefense',
      label: `First Team All-Pro (${String(row.pos ?? 'Defense')})`,
      teamId: row.teamId ?? null,
    });
  }
  return rows;
}

/**
 * @param {string|number} playerId
 * @param {any[]} accolades from player object
 * @param {any[]} archivedSeasons newest-first or any order
 * @param {any[]} teams for abbr lookup
 */
export function buildMergedPlayerAwardTimeline(playerId, accolades, archivedSeasons, teams) {
  const pid = playerId != null ? String(playerId) : '';
  if (!pid) return { rows: [], dedupeKeys: new Set() };

  const byKey = new Map();

  const addRow = (year, canonical, label, teamId, source) => {
    const y = Number(year);
    if (!Number.isFinite(y) || y <= 0) return;
    const key = dedupeKeyForCanonical(y, canonical);
    if (byKey.has(key)) return;
    const teamAbbr = teamAbbrFromId(teamId, teams);
    byKey.set(key, { year: y, canonical, label, teamAbbr, teamId: teamId ?? null, source });
  };

  for (const acc of Array.isArray(accolades) ? accolades : []) {
    const type = String(acc?.type ?? '');
    const canonical = ACCOLADE_TO_CANONICAL[type] ?? type.toLowerCase();
    const year = acc?.year ?? acc?.seasonYear;
    if (canonical === 'sb_ring') {
      addRow(year, 'sb_ring', 'Super Bowl champion', acc?.teamId ?? null, 'accolade');
      continue;
    }
    const label = (AWARD_LABEL[canonical] ?? type.replaceAll('_', ' ')) || 'Accolade';
    addRow(year, canonical, label, acc?.teamId ?? null, 'accolade');
  }

  for (const season of Array.isArray(archivedSeasons) ? archivedSeasons : []) {
    const year = Number(season?.year ?? 0);
    if (!Number.isFinite(year)) continue;
    const awards = season?.awards ?? {};
    for (const key of ARCHIVE_PLAYER_AWARD_KEYS) {
      const a = awards[key];
      if (!a || a.playerId == null) continue;
      if (String(a.playerId) !== pid) continue;
      // V1 archives duplicate the same rookie onto both `oroy` and `roty`; show once.
      if (key === 'oroy' && awards?.roty && String(awards.roty.playerId) === String(a.playerId)) continue;
      const canonical = key;
      const label = AWARD_LABEL[key] ?? key;
      addRow(year, canonical, label, a.teamId ?? null, 'archive');
    }
    for (const row of collectAllProArchiveRows(awards, year)) {
      if (String(row.playerId) !== pid) continue;
      const key = dedupeKeyForCanonical(year, `${row.canonical}_${row.playerId}_${row.label}`);
      if (byKey.has(key)) continue;
      const teamAbbr = teamAbbrFromId(row.teamId, teams);
      byKey.set(key, { year, canonical: row.canonical, label: row.label, teamAbbr, teamId: row.teamId, source: 'archive' });
    }
  }

  const rows = [...byKey.values()].sort((a, b) => b.year - a.year);
  return { rows, dedupeKeys: new Set(byKey.keys()) };
}

const SHORT_BADGE = {
  mvp: 'MVP',
  opoy: 'OPOY',
  dpoy: 'DPOY',
  roty: 'ROTY',
  oroy: 'OROY',
  droy: 'DROY',
  sbMvp: 'SB MVP',
  bestQB: 'Best QB',
  bestRB: 'Best RB',
  bestWrTe: 'Best WR/TE',
  bestDefensivePlayer: 'Best DP',
  bestKicker: 'Best K',
  sb_ring: 'Ring',
  allProOffense: 'All-Pro',
  allProDefense: 'All-Pro',
};

/**
 * Compact header chips (e.g. "2x MVP", "2031 OPOY"). Omits noisy per-ring lines; rings stay on existing trophy row.
 * @param {{ rows: any[] }} merged from buildMergedPlayerAwardTimeline
 */
export function buildPlayerAwardHeaderBadges(merged) {
  const rows = merged?.rows ?? [];
  const chips = [];
  const mvps = rows.filter((r) => r.canonical === 'mvp').map((r) => r.year).sort((a, b) => b - a);
  if (mvps.length >= 2) chips.push({ key: 'mvp-count', text: `${mvps.length}x MVP` });
  else if (mvps.length === 1) chips.push({ key: 'mvp-once', text: `${mvps[0]} MVP` });

  const used = new Set(['mvp', 'sb_ring']);
  const extras = rows
    .filter((r) => !used.has(r.canonical) && r.canonical !== 'sb_ring')
    .sort((a, b) => b.year - a.year);

  const seenCanon = new Set();
  for (const r of extras) {
    if (seenCanon.has(r.canonical)) continue;
    seenCanon.add(r.canonical);
    const short = SHORT_BADGE[r.canonical] ?? r.label;
    chips.push({ key: `${r.canonical}-${r.year}`, text: `${r.year} ${short}` });
    if (chips.length >= 6) break;
  }
  return chips;
}
