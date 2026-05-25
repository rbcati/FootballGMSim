/**
 * tenderLogic.js
 *
 * Pure functions for Franchise Tag and RFA Tender value calculations.
 * No cache access, no side effects — safe for testing and worker use.
 *
 * Franchise Tag value = average of the top-N cap hits at the position.
 * RFA Tender value    = fixed tier based on the player's original draft round.
 */

// ── Configuration ─────────────────────────────────────────────────────────────

export const TENDER_CONFIG = Object.freeze({
  /** Minimum OVR to be eligible for the AI franchise tag. */
  MIN_OVR_FOR_FRANCHISE_TAG: 76,

  /** Minimum OVR for an RFA tender to be applied. */
  MIN_OVR_FOR_RFA_TENDER: 65,

  /** Number of top salaries averaged to compute the franchise tag value. */
  FRANCHISE_TAG_TOP_N: 5,

  /**
   * Minimum cap buffer ($M) that must remain after applying a tag or tender.
   * Prevents the AI from tagging a player that would make the team insolvent.
   */
  MIN_CAP_BUFFER_AFTER_TAG: 8,

  /**
   * Annual tender values by draft-round tier ($M).
   * Calibrated to a ~$255M salary cap league.
   */
  RFA_TENDER_VALUES: Object.freeze({
    '1st_round':     7.5,
    '2nd_round':     5.0,
    'original_round': 3.5,
  }),

  /**
   * Draft-pick compensation owed when another team signs a tendered RFA.
   * Key = tender tier, value = pick type label.
   */
  RFA_COMPENSATION: Object.freeze({
    '1st_round':     '1st',
    '2nd_round':     '2nd',
    'original_round': 'original',
  }),
});

// ── Positional tag value defaults ─────────────────────────────────────────────
// Used as fallback when fewer than 2 market data points exist for a position.
// Scaled to a ~$255M cap league.

const POSITION_TAG_DEFAULTS = Object.freeze({
  QB:  28.0, EDGE: 22.0, DE: 20.0, OT: 21.0, LT: 21.0,
  OL:  16.0, WR:  18.0, TE: 14.0, CB: 17.0,
  S:   14.0, SS:  14.0, FS: 14.0,
  DL:  16.0, DT:  15.0, NT: 14.0,
  LB:  14.0, MLB: 14.0, OLB: 14.0,
  RB:  10.0,
  K:    6.0, P:    5.0,
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate the franchise tag value for a position.
 *
 * Returns the average of the top-N active cap hits at the given position
 * across all supplied league players.  Falls back to position-tier defaults
 * when fewer than 2 data points are available.
 *
 * @param {string}   position     - e.g. 'QB', 'WR', 'CB'
 * @param {object[]} leaguePlayers - all active players (with contract objects)
 * @returns {number} annual tag value in $M (rounded to 2 decimal places)
 */
export function calculateFranchiseTagValue(position, leaguePlayers = []) {
  const topN = TENDER_CONFIG.FRANCHISE_TAG_TOP_N;
  const pos  = String(position ?? '');

  const salaries = leaguePlayers
    .filter((p) => p?.pos === pos && Number(p?.contract?.baseAnnual) > 0)
    .map((p) => {
      const c     = p.contract;
      const years = Math.max(1, Number(c.yearsTotal ?? c.years ?? 1));
      return Number(c.baseAnnual ?? 0) + (Number(c.signingBonus ?? 0) / years);
    })
    .filter((s) => s > 0)
    .sort((a, b) => b - a);

  const top = salaries.slice(0, topN);
  if (top.length < 2) return POSITION_TAG_DEFAULTS[pos] ?? 12.0;

  const avg = top.reduce((sum, s) => sum + s, 0) / top.length;
  return Math.round(avg * 100) / 100;
}

/**
 * Classify which RFA tender tier applies based on the player's original draft round.
 *
 * @param {number|null} originalDraftRound - 1, 2, 3-7, or null/0 (UDFA)
 * @returns {'1st_round'|'2nd_round'|'original_round'}
 */
export function getRFATenderTier(originalDraftRound) {
  const round = Number(originalDraftRound);
  if (round === 1) return '1st_round';
  if (round === 2) return '2nd_round';
  return 'original_round';
}

/**
 * Calculate the annual value of an RFA tender.
 *
 * @param {number|null} originalDraftRound
 * @returns {number} annual tender value in $M
 */
export function calculateRFATender(originalDraftRound) {
  const tier = getRFATenderTier(originalDraftRound);
  return TENDER_CONFIG.RFA_TENDER_VALUES[tier];
}

/**
 * Return the compensation pick type owed when a tendered RFA is signed away.
 *
 * @param {number|null} originalDraftRound
 * @returns {'1st'|'2nd'|'original'}
 */
export function getRFACompensationPick(originalDraftRound) {
  const tier = getRFATenderTier(originalDraftRound);
  return TENDER_CONFIG.RFA_COMPENSATION[tier];
}

/**
 * Build a franchise tag contract object for a player.
 *
 * The resulting contract carries:
 *   - tag:     'franchise'  → locks the player; prevents FA pool entry
 *   - tagType: 'franchise'  → recognised by normalizeContractDetails
 *   - guaranteedPct: 1.0    → fully guaranteed 1-year deal (per NFL rules)
 *
 * @param {object}   player       - player object (must have pos)
 * @param {object[]} leaguePlayers - all active players for market calculation
 * @param {number}   currentYear  - current league year
 * @returns {object} contract object
 */
export function buildFranchiseTagContract(player, leaguePlayers = [], currentYear = 2025) {
  const tagValue = calculateFranchiseTagValue(player?.pos, leaguePlayers);
  return {
    baseAnnual:    tagValue,
    years:         1,
    yearsTotal:    1,
    signingBonus:  0,
    guaranteedPct: 1.0,
    startYear:     currentYear,
    tag:           'franchise',
    tagType:       'franchise',
  };
}

/**
 * Build an RFA tender contract object for a player.
 *
 * The resulting contract carries:
 *   - tender:            '<tier>'  → marks the player as restricted
 *   - restrictedFreeAgent: true    → recognised by normalizeContractDetails
 *   - compensationPick:  '<pick>'  → pick type owed if another team signs them
 *
 * @param {object} player      - must have draftRound (or contract.draftRound)
 * @param {number} currentYear
 * @returns {object} contract object
 */
export function buildRFATenderContract(player, currentYear = 2025) {
  const draftRound     = Number(player?.draftRound ?? player?.contract?.draftRound ?? 0) || null;
  const tenderValue    = calculateRFATender(draftRound);
  const tier           = getRFATenderTier(draftRound);
  const compensationPick = getRFACompensationPick(draftRound);
  return {
    baseAnnual:          tenderValue,
    years:               1,
    yearsTotal:          1,
    signingBonus:        0,
    guaranteedPct:       1.0,
    startYear:           currentYear,
    tender:              tier,
    restrictedFreeAgent: true,
    compensationPick,
  };
}
