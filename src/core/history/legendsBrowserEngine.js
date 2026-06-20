/**
 * legendsBrowserEngine.js — Pure formatting utilities for the Legends Browser UI.
 *
 * Pure module rules:
 *   - no UI imports
 *   - no worker imports
 *   - deterministic only (no random)
 *   - no mutation of inputs
 *
 * ROH member shape (from legacyEngine.js):
 *   { id, name, position, jerseyNumber, yearsPlayedWithTeam, careerGamesWithTeam,
 *     totalPassingYards, totalRushingYards, totalReceivingYards, totalSacks,
 *     accolades, inductionYear }
 */

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Filter ROH members by position.
 * @param {Object[]} ringOfHonor
 * @param {string} positionFilter - 'ALL' or a position string
 * @returns {Object[]}
 */
export function filterLegendsByPosition(ringOfHonor, positionFilter) {
  const roh = Array.isArray(ringOfHonor) ? ringOfHonor : [];
  if (!positionFilter || positionFilter === 'ALL') return [...roh];
  return roh.filter((m) => String(m?.position ?? '') === positionFilter);
}

/**
 * Build top-5 leaderboards from ROH members.
 * @param {Object[]} ringOfHonor
 * @returns {{ passingYards, rushingYards, receivingYards, sacks }} — each is Object[] of up to 5 entries
 */
export function buildLegendLeaderboards(ringOfHonor) {
  const roh = Array.isArray(ringOfHonor) ? ringOfHonor : [];

  const categories = {
    passingYards:   (m) => safeNum(m.totalPassingYards),
    rushingYards:   (m) => safeNum(m.totalRushingYards),
    receivingYards: (m) => safeNum(m.totalReceivingYards),
    sacks:          (m) => safeNum(m.totalSacks),
  };

  const result = {};
  for (const [cat, getter] of Object.entries(categories)) {
    const entries = roh
      .filter((m) => m && getter(m) !== null && getter(m) > 0)
      .map((m) => ({ id: String(m.id ?? ''), name: String(m.name ?? ''), value: getter(m) }))
      .sort((a, b) => {
        const diff = b.value - a.value;
        return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name));
      })
      .slice(0, 5);
    result[cat] = entries;
  }
  return result;
}

/**
 * Find a ROH member by player ID.
 * @param {Object[]} ringOfHonor
 * @param {string} playerId
 * @returns {Object|null}
 */
export function findLegendById(ringOfHonor, playerId) {
  if (!playerId) return null;
  const roh = Array.isArray(ringOfHonor) ? ringOfHonor : [];
  return roh.find((m) => String(m?.id ?? '') === String(playerId)) ?? null;
}

/**
 * Build a chronological display timeline for a legend.
 * @param {Object} legend - ROH member
 * @returns {Array<{ year: number|null, label: string }>}
 */
export function buildLegendTimeline(legend) {
  if (!legend) return [];

  const events = [];

  // Parse yearsPlayedWithTeam string like "2018–2026" or "2018"
  const yearsStr = String(legend.yearsPlayedWithTeam ?? '');
  const rangeMatch = yearsStr.match(/(\d{4})[–\-](\d{4})/);
  const singleMatch = !rangeMatch && yearsStr.match(/(\d{4})/);

  const firstYear = rangeMatch ? Number(rangeMatch[1]) : (singleMatch ? Number(singleMatch[1]) : null);

  if (firstYear !== null) {
    events.push({ year: firstYear, label: `Joined franchise (${firstYear})` });
  }

  // Parse accolades — they may include years in parentheses like "MVP (2022)"
  const accolades = Array.isArray(legend.accolades) ? legend.accolades : [];
  for (const accolade of accolades) {
    const text = String(accolade);
    const yearMatch = text.match(/\((\d{4})\)/);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    events.push({ year, label: text });
  }

  // Induction year as final event
  const inductionYear = safeNum(legend.inductionYear);
  if (inductionYear !== null && inductionYear > 0) {
    events.push({ year: inductionYear, label: `Ring of Honor induction (${inductionYear})` });
  }

  // Sort chronologically: events with a year come first (ascending), then null-year events
  return events.sort((a, b) => {
    if (a.year !== null && b.year !== null) return a.year - b.year;
    if (a.year !== null) return -1;
    if (b.year !== null) return 1;
    return 0;
  });
}

/**
 * Build a display-friendly metric sheet for a legend profile.
 * Omits unavailable stats rather than showing placeholders.
 * @param {Object} legend - ROH member
 * @returns {Object} - available metric fields only
 */
export function buildLegendProfileMetrics(legend) {
  if (!legend) return {};

  const metrics = {};

  const gamesPlayed = safeNum(legend.careerGamesWithTeam);
  if (gamesPlayed !== null && gamesPlayed > 0) metrics.gamesPlayed = gamesPlayed;

  const passYds = safeNum(legend.totalPassingYards);
  if (passYds !== null && passYds > 0) metrics.passingYards = passYds;

  const rushYds = safeNum(legend.totalRushingYards);
  if (rushYds !== null && rushYds > 0) metrics.rushingYards = rushYds;

  const recYds = safeNum(legend.totalReceivingYards);
  if (recYds !== null && recYds > 0) metrics.receivingYards = recYds;

  const sacks = safeNum(legend.totalSacks);
  if (sacks !== null && sacks > 0) metrics.sacks = sacks;

  const jersey = safeNum(legend.jerseyNumber);
  if (jersey !== null) metrics.jerseyNumber = jersey;

  const yearsStr = String(legend.yearsPlayedWithTeam ?? '');
  if (yearsStr) {
    const rangeMatch = yearsStr.match(/(\d{4})[–\-](\d{4})/);
    const singleMatch = !rangeMatch && yearsStr.match(/(\d{4})/);
    if (rangeMatch) {
      metrics.seasonsWithFranchise = Number(rangeMatch[2]) - Number(rangeMatch[1]) + 1;
    } else if (singleMatch) {
      metrics.seasonsWithFranchise = 1;
    }
  }

  return metrics;
}
