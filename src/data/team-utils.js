/**
 * team-utils.js
 *
 * Shared utilities for resolving team identity (name, abbreviation, colour)
 * from a team ID.  Used by BoxScore, PlayerProfile, Roster, and any other
 * component that needs to display team info without having to duplicate the
 * hash-colour logic or the DEFAULT_TEAMS fallback.
 *
 * API
 * ───
 *  getTeamIdentity(teamId, teams?)  → { id, name, abbr, conf, div, color }
 *  teamColor(abbr)                  → hex colour string
 */

import { DEFAULT_TEAMS } from './default-teams.js';

// ── Colour palette ────────────────────────────────────────────────────────────
// 12 distinct colours that look good on both light and dark backgrounds.
// The same palette is used everywhere so team colours are visually consistent
// across BoxScore, the standings table, and the schedule cards.

const PALETTE = [
  '#0A84FF', '#34C759', '#FF9F0A', '#FF453A',
  '#5E5CE6', '#64D2FF', '#FFD60A', '#30D158',
  '#FF6961', '#AEC6CF', '#FF6B35', '#B4A0E5',
];

/**
 * Deterministic colour derived from the team abbreviation string.
 * The hash function is identical to the one previously duplicated in
 * BoxScore.jsx and LeagueDashboard.jsx, so colours remain consistent after
 * the refactor.
 *
 * @param {string} abbr  Team abbreviation (e.g. "BUF", "KC").
 * @returns {string}     Hex colour string from PALETTE.
 */
export function teamColor(abbr = '') {
  let hash = 0;
  for (let i = 0; i < abbr.length; i++) {
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/**
 * Resolve a team's full identity from its numeric (or string) ID.
 *
 * Resolution order:
 *  1. Live `teams` array passed in from `league.teams`  (has current season data)
 *  2. Static DEFAULT_TEAMS fallback                     (works without a loaded league)
 *  3. Synthetic stub                                    (unknown team, never crashes)
 *
 * @param {number|string|null} teamId  The team ID to look up.
 * @param {Array}              [teams] Live teams from `league.teams` (optional).
 * @returns {{ id, name, abbr, conf, div, color }}
 */
export function getTeamIdentity(teamId, teams = []) {
  if (teamId == null) {
    return { id: null, name: 'Free Agent', abbr: 'FA', conf: null, div: null, color: '#888888' };
  }

  // 1. Search live teams first (most current data, includes custom team names)
  if (Array.isArray(teams) && teams.length > 0) {
    const live = teams.find(t => String(t.id) === String(teamId));
    if (live) {
      return { ...live, color: teamColor(live.abbr ?? '') };
    }
  }

  // 2. Fall back to static DEFAULT_TEAMS (works at startup before league loads)
  const def = DEFAULT_TEAMS.find(t => t.id === Number(teamId));
  if (def) {
    return { ...def, color: teamColor(def.abbr) };
  }

  // 3. Unknown team — return a safe stub so the UI never crashes
  const stub = `T${teamId}`;
  return {
    id:    teamId,
    name:  `Team ${teamId}`,
    abbr:  stub,
    conf:  null,
    div:   null,
    color: teamColor(stub),
  };
}
