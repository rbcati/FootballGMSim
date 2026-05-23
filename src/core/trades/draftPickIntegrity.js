/**
 * Draft pick ownership integrity helpers.
 * Pure/stateless — no I/O, no cache access, no mutations.
 *
 * Pick data shape (canonical):
 *   { id, round, season (or year), originalOwner, currentOwner, isCompensatory?, projectedRange? }
 */

// ── Accessor helpers ──────────────────────────────────────────────────────────

/** Canonical identity fields from any pick object. */
export function getPickIdentity(pick) {
  return {
    id: pick?.id ?? null,
    round: pick?.round ?? null,
    season: pick?.season ?? pick?.year ?? null,
    originalOwner: pick?.originalOwner != null ? Number(pick.originalOwner) : null,
    currentOwner: pick?.currentOwner != null ? Number(pick.currentOwner) : null,
  };
}

/** Current owner team ID (number) or null. */
export function getPickOwnerId(pick) {
  const v = pick?.currentOwner;
  return v != null ? Number(v) : null;
}

/** Original team ID (number) or null. */
export function getPickOriginalTeamId(pick) {
  const v = pick?.originalOwner;
  return v != null ? Number(v) : null;
}

/** Season year (number) or null. Handles both `season` and legacy `year` field. */
export function getPickSeason(pick) {
  const v = pick?.season ?? pick?.year;
  return v != null ? Number(v) : null;
}

/** Round number or null. */
export function getPickRound(pick) {
  const v = pick?.round;
  return v != null ? Number(v) : null;
}

/**
 * Semantic deduplication key: "season-round-originalOwner".
 * Identifies a specific selection slot independent of current ownership.
 */
export function getPickValueKey(pick) {
  const season = getPickSeason(pick) ?? 'x';
  const round = getPickRound(pick) ?? 'x';
  const orig = getPickOriginalTeamId(pick) ?? 'x';
  return `${season}-${round}-${orig}`;
}

// ── Ownership index ───────────────────────────────────────────────────────────

/**
 * Build a Map<pickId, { pick, teamId }> from all picks across all teams.
 *
 * @param {{ teams?: Array<{ id: number, picks?: object[] }> }} leagueState
 * @returns {Map<string, { pick: object, teamId: number | null }>}
 */
export function buildPickOwnershipIndex(leagueState) {
  const index = new Map();
  const teams = Array.isArray(leagueState?.teams) ? leagueState.teams : [];
  for (const team of teams) {
    const teamId = team?.id != null ? Number(team.id) : null;
    const picks = Array.isArray(team?.picks) ? team.picks : [];
    for (const pick of picks) {
      const pickId = pick?.id ?? pick?.pickId ?? null;
      if (pickId == null) continue;
      index.set(String(pickId), { pick, teamId });
    }
  }
  return index;
}

// ── Ownership validation ──────────────────────────────────────────────────────

/**
 * Validate draft pick ownership invariants across all teams.
 *
 * Checks:
 *  - No pick ID appears in more than one team's inventory.
 *  - pick.currentOwner matches the team whose inventory contains it.
 *  - Each pick has a round, season, and originalOwner field.
 *  - No two picks share the same semantic slot (season+round+originalOwner).
 *
 * @param {{ teams?: Array<{ id: number, picks?: object[] }> }} leagueState
 * @returns {{ valid: boolean, errors: Array<{ code: string, message: string, context: object }> }}
 */
export function validatePickOwnership(leagueState) {
  const errors = [];
  const teams = Array.isArray(leagueState?.teams) ? leagueState.teams : [];
  const seenIds = new Map();      // pickId  → first-seen teamId
  const seenValueKeys = new Map(); // valueKey → first-seen pickId

  for (const team of teams) {
    const teamId = team?.id != null ? Number(team.id) : null;
    const picks = Array.isArray(team?.picks) ? team.picks : [];

    for (const pick of picks) {
      const pickId = pick?.id ?? pick?.pickId ?? null;
      if (pickId == null || pickId === '') continue;

      const key = String(pickId);

      // --- Duplicate ID across teams ---
      if (seenIds.has(key)) {
        errors.push({
          code: 'duplicate_pick_id',
          message: `Pick ${key} appears on both team:${seenIds.get(key)} and team:${teamId}`,
          context: { pickId: key, teamId, conflictTeamId: seenIds.get(key) },
        });
      } else {
        seenIds.set(key, teamId);
      }

      // --- currentOwner disagrees with containing team ---
      const currentOwner = pick?.currentOwner;
      if (currentOwner != null && Number(currentOwner) !== teamId) {
        errors.push({
          code: 'pick_owner_mismatch',
          message: `Pick ${key} has currentOwner:${currentOwner} but sits in team:${teamId} picks array`,
          context: { pickId: key, teamId, currentOwner: Number(currentOwner) },
        });
      }

      // --- Missing required metadata ---
      if (pick?.round == null) {
        errors.push({
          code: 'pick_missing_round',
          message: `Pick ${key} on team:${teamId} has no round field`,
          context: { pickId: key, teamId },
        });
      }

      const season = pick?.season ?? pick?.year;
      if (season == null) {
        errors.push({
          code: 'pick_missing_season',
          message: `Pick ${key} on team:${teamId} has no season/year field`,
          context: { pickId: key, teamId },
        });
      }

      if (pick?.originalOwner == null) {
        errors.push({
          code: 'pick_missing_original_owner',
          message: `Pick ${key} on team:${teamId} has no originalOwner field`,
          context: { pickId: key, teamId },
        });
      }

      // --- Semantic duplicate: same slot appears twice ---
      const vk = getPickValueKey(pick);
      if (vk !== 'x-x-x') {
        if (seenValueKeys.has(vk)) {
          errors.push({
            code: 'duplicate_pick_identity',
            message: `Pick slot ${vk} appears more than once (ids: ${seenValueKeys.get(vk)}, ${key})`,
            context: { valueKey: vk, firstPickId: seenValueKeys.get(vk), duplicatePickId: key },
          });
        } else {
          seenValueKeys.set(vk, key);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a specific team owns all picks in a proposed outgoing trade package.
 *
 * @param {{ teams?: Array<{ id: number, picks?: object[] }> }} leagueState
 * @param {string[]} outgoingPickIds  Array of pick IDs the team is offering.
 * @param {number | string} teamId    The team that is offering the picks.
 * @returns {{ valid: boolean, errors: Array<{ code: string, message: string, context: object }> }}
 */
export function validateTradePickAssets(leagueState, outgoingPickIds, teamId) {
  const errors = [];
  const ids = Array.isArray(outgoingPickIds) ? outgoingPickIds : [];
  if (ids.length === 0) return { valid: true, errors: [] };

  const index = buildPickOwnershipIndex(leagueState);
  const ownerTeamId = teamId != null ? Number(teamId) : null;

  for (const rawId of ids) {
    if (rawId == null) {
      errors.push({
        code: 'pick_asset_null_id',
        message: 'Outgoing pick asset has null/undefined id',
        context: { teamId: ownerTeamId },
      });
      continue;
    }

    const key = String(rawId);
    const entry = index.get(key);

    if (!entry) {
      errors.push({
        code: 'pick_asset_not_found',
        message: `Pick ${key} not found in any team inventory (already traded or never existed)`,
        context: { pickId: key, teamId: ownerTeamId },
      });
      continue;
    }

    if (ownerTeamId != null && entry.teamId !== ownerTeamId) {
      errors.push({
        code: 'pick_asset_wrong_owner',
        message: `Pick ${key} is owned by team:${entry.teamId}, not team:${ownerTeamId}`,
        context: { pickId: key, teamId: ownerTeamId, actualOwner: entry.teamId },
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Display label ─────────────────────────────────────────────────────────────

const ORDINAL_ROUND = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

function formatRound(round) {
  const r = Number(round);
  if (Number.isFinite(r) && r >= 1 && r <= 7) return `${ORDINAL_ROUND[r]} Round`;
  return `Round ${round ?? '?'}`;
}

function lookupAbbr(teamId, teamLookup) {
  if (!teamLookup || teamId == null) return null;
  const entry = teamLookup instanceof Map
    ? teamLookup.get(teamId)
    : teamLookup[teamId];
  return entry?.abbr ?? null;
}

/**
 * User-facing pick label with optional "via TEAM" suffix when ownership has changed.
 *
 * @param {object | null} pick       The pick object.
 * @param {Map | object | null} teamLookup  Map<id, { abbr }> or plain object. Optional.
 * @returns {string}
 *
 * Examples:
 *   "2028 1st Round"          — still with original owner
 *   "2028 1st Round via PIT"  — traded; original owner is PIT
 */
export function getPickLabel(pick, teamLookup = null) {
  if (!pick) return 'Future pick';

  const season = pick?.season ?? pick?.year;
  const round = pick?.round;
  const currentOwner = pick?.currentOwner != null ? Number(pick.currentOwner) : null;
  const originalOwner = pick?.originalOwner != null ? Number(pick.originalOwner) : null;

  const seasonPart = season != null ? `${season} ` : '';
  const roundPart = formatRound(round);
  const base = `${seasonPart}${roundPart}`;

  if (originalOwner != null && currentOwner != null && originalOwner !== currentOwner) {
    const abbr = lookupAbbr(originalOwner, teamLookup);
    const viaPart = abbr ? ` via ${abbr}` : ` via team:${originalOwner}`;
    return `${base}${viaPart}`;
  }

  return base;
}
