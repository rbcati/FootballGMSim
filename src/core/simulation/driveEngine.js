/*
 * Drive Engine Domain Module
 * ──────────────────────────
 * Owns the down-and-distance state machine and the deterministic, seeded
 * drive-level score generator (`buildDriveBasedSummary`) that produces the
 * authoritative homeScore / awayScore for a game.
 *
 * The seeded RNG (mulberry32) is kept private to this module so no import can
 * disturb the deterministic PRNG stream. passerRating is imported from
 * mathHelpers.js — it is called only after all rng() draws complete, so the
 * stream is unaffected.
 */

import { Utils as U } from '../utils.js';
import { passerRating } from './mathHelpers.js';

function hashStringToSeed(input = '') {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Advance the down-and-distance state by a single play's net gain.
 *
 * Pure: returns a NEW state object plus terminal flags; the caller decides what
 * to do with a turnover-on-downs or touchdown. Mirrors the legacy inline logic
 * (`yardsToGo -= max(0,gain)`; first down resets down/distance) used inside the
 * live play-by-play loop, with the field-position clamp applied identically.
 *
 * @param {{down:number, distance:number, yardLine:number}} state
 * @param {number} gain - net yards on the play
 * @returns {{down:number, distance:number, yardLine:number,
 *            firstDown:boolean, touchdown:boolean, turnoverOnDowns:boolean}}
 */
export function advanceDownDistance(state, gain) {
  const prevDown = state.down ?? 1;
  const prevDistance = state.distance ?? 10;
  const prevYardLine = state.yardLine ?? 20;

  const advance = Math.max(0, gain);
  const yardLine = U.clamp(prevYardLine + advance, 1, 99);
  const touchdown = prevYardLine + advance >= 100;

  let distance = prevDistance - advance;
  let down = prevDown;
  let firstDown = false;
  let turnoverOnDowns = false;

  if (distance <= 0) {
    firstDown = true;
    down = 1;
    distance = 10;
  } else {
    down = prevDown + 1;
    if (down > 4) {
      // Failed to convert on 4th down → possession changes.
      turnoverOnDowns = true;
    }
  }

  return { down, distance, yardLine, firstDown, touchdown, turnoverOnDowns };
}

/* ── Team attribute composites ─────────────────────────────────────────────
 * Pure, deterministic roster → team-rating helpers. They never touch the
 * PRNG stream, so feeding them into buildDriveBasedSummary keeps the same
 * seed → same result guarantee.
 */

const RATING_FLOOR = 55;
const RATING_CEIL = 95;
const DEFAULT_RATING = 70;

function ratingOrFallback(player, key) {
  const granular = player?.ratings?.[key];
  if (Number.isFinite(granular)) return granular;
  if (Number.isFinite(player?.ovr)) return player.ovr;
  return DEFAULT_RATING;
}

/** Weighted blend of a single player's granular ratings (weights sum to 1). */
function playerComposite(player, weightedKeys) {
  let total = 0;
  for (const [key, weight] of weightedKeys) {
    total += ratingOrFallback(player, key) * weight;
  }
  return total;
}

/** Average playerComposite over the top `count` players (OVR-desc within pos). */
function unitComposite(players, count, weightedKeys, fallback) {
  const picked = players.slice(0, count);
  if (picked.length === 0) return fallback;
  let sum = 0;
  for (const p of picked) sum += playerComposite(p, weightedKeys);
  return sum / picked.length;
}

/** Group a roster by position, sorted best-first (depthOrder, then OVR desc). */
function groupRosterByPosition(roster) {
  const groups = {};
  for (const player of roster) {
    const pos = player?.pos || 'UNK';
    (groups[pos] ||= []).push(player);
  }
  for (const pos in groups) {
    groups[pos].sort((a, b) => {
      const aOrder = (a.depthOrder != null && a.depthOrder > 0) ? a.depthOrder : 9999;
      const bOrder = (b.depthOrder != null && b.depthOrder > 0) ? b.depthOrder : 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (b.ovr || 0) - (a.ovr || 0);
    });
  }
  return groups;
}

/** Average OVR of the whole roster — unit fallback when a position is empty. */
function rosterAverageOvr(roster) {
  if (!Array.isArray(roster) || roster.length === 0) return DEFAULT_RATING;
  let sum = 0;
  for (const p of roster) sum += Number.isFinite(p?.ovr) ? p.ovr : DEFAULT_RATING;
  return sum / roster.length;
}

/**
 * Offensive team rating from roster attributes. Deterministic and side-effect
 * free; any missing granular rating falls back to the player's OVR (then 70).
 *
 * Unit weights: QB 35%, OL 30%, WR/TE 20%, RB 15%.
 *
 * @param {Array<Object>} roster - player objects ({ pos, ovr, ratings, ... })
 * @param {string} [scheme='balanced'] - reserved for future scheme-aware weights
 * @returns {number} clamped to [55, 95]
 */
export function computeTeamOffensiveRating(roster, scheme = 'balanced') {
  if (!Array.isArray(roster) || roster.length === 0) return DEFAULT_RATING;
  const groups = groupRosterByPosition(roster);
  const fallback = rosterAverageOvr(roster);

  const qb = unitComposite(groups.QB || [], 1, [
    ['throwAccuracy', 0.45], ['throwPower', 0.25], ['awareness', 0.3],
  ], fallback);
  const ol = unitComposite(groups.OL || [], 5, [
    ['passBlock', 0.4], ['runBlock', 0.4], ['strength', 0.2],
  ], fallback);
  // Top receiving options across WR and TE, best-first by OVR.
  const receivers = [...(groups.WR || []), ...(groups.TE || [])]
    .sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  const rec = unitComposite(receivers, 3, [
    ['catching', 0.4], ['catchInTraffic', 0.3], ['speed', 0.3],
  ], fallback);
  const rb = unitComposite(groups.RB || [], 1, [
    ['speed', 0.35], ['acceleration', 0.3], ['trucking', 0.175], ['juking', 0.175],
  ], fallback);

  const composite = qb * 0.35 + ol * 0.3 + rec * 0.2 + rb * 0.15;
  return U.clamp(composite, RATING_FLOOR, RATING_CEIL);
}

/**
 * Defensive team rating from roster attributes. Deterministic and side-effect
 * free; any missing granular rating falls back to the player's OVR (then 70).
 *
 * Unit weights: DL 25%, LB 25%, CB 30%, S 20%.
 *
 * @param {Array<Object>} roster - player objects ({ pos, ovr, ratings, ... })
 * @param {string} [scheme='balanced'] - reserved for future scheme-aware weights
 * @returns {number} clamped to [55, 95]
 */
export function computeTeamDefensiveRating(roster, scheme = 'balanced') {
  if (!Array.isArray(roster) || roster.length === 0) return DEFAULT_RATING;
  const groups = groupRosterByPosition(roster);
  const fallback = rosterAverageOvr(roster);

  const dl = unitComposite(groups.DL || [], 4, [
    ['passRushPower', 0.4], ['passRushSpeed', 0.35], ['strength', 0.25],
  ], fallback);
  const lb = unitComposite(groups.LB || [], 3, [
    ['tackle', 0.35], ['awareness', 0.3], ['runStop', 0.175], ['coverage', 0.175],
  ], fallback);
  const cb = unitComposite(groups.CB || [], 3, [
    ['coverage', 0.45], ['speed', 0.35], ['awareness', 0.2],
  ], fallback);
  const s = unitComposite(groups.S || [], 2, [
    ['awareness', 0.35], ['coverage', 0.35], ['tackle', 0.3],
  ], fallback);

  const composite = dl * 0.25 + lb * 0.25 + cb * 0.3 + s * 0.2;
  return U.clamp(composite, RATING_FLOOR, RATING_CEIL);
}

/**
 * Deterministic, seeded drive-level game summary. The authoritative source of
 * homeScore / awayScore for a simulated game. Same seed + inputs → same result.
 *
 * When a non-empty homeRoster/awayRoster is provided, that side's offensive
 * and defensive ratings are derived from roster attributes via
 * computeTeamOffensiveRating / computeTeamDefensiveRating, overriding the
 * corresponding flat homeOff/homeDef (or awayOff/awayDef) inputs. Without
 * rosters the flat-number behavior is unchanged.
 */
export function buildDriveBasedSummary({
  season = 0,
  week = 1,
  home,
  away,
  homeOff = 75,
  awayOff = 75,
  homeDef = 75,
  awayDef = 75,
  homeFieldAdv = 0.03,
  homeStrategicEdge = 0,
  awayStrategicEdge = 0,
  globalSeed = 0,
  homeRoster = null,
  awayRoster = null,
}) {
  if (Array.isArray(homeRoster) && homeRoster.length > 0) {
    homeOff = computeTeamOffensiveRating(homeRoster);
    homeDef = computeTeamDefensiveRating(homeRoster);
  }
  if (Array.isArray(awayRoster) && awayRoster.length > 0) {
    awayOff = computeTeamOffensiveRating(awayRoster);
    awayDef = computeTeamDefensiveRating(awayRoster);
  }

  const baseSeed = hashStringToSeed(`${season}|${week}|${home?.id}|${away?.id}`);
  const seed = (baseSeed ^ (globalSeed >>> 0)) >>> 0;
  const rng = mulberry32(seed);
  const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const chance = (p) => rng() < p;

  const homeNetEdge = U.clamp(homeStrategicEdge - awayStrategicEdge, -0.05, 0.05);
  const awayNetEdge = U.clamp(awayStrategicEdge - homeStrategicEdge, -0.05, 0.05);

  const totalDrives = randInt(20, 26);
  const homeDrives = Math.round(totalDrives / 2) + randInt(-1, 1);
  const awayDrives = totalDrives - homeDrives;
  const homeStats = { passYds: 0, passAtt: 0, comp: 0, passTD: 0, INT: 0, rushYds: 0, rushAtt: 0, sacks: 0, turnovers: 0 };
  const awayStats = { passYds: 0, passAtt: 0, comp: 0, passTD: 0, INT: 0, rushYds: 0, rushAtt: 0, sacks: 0, turnovers: 0 };

  const simTeam = (offOvr, defOvr, drives, teamStats, isHome, netEdge = 0) => {
    let score = 0;
    // Scoring-play breakdown — authoritative source for box-score reconciliation.
    // Each touchdown here is scored as 7 (6 + a made extra point), so the
    // identity 7*tds + 3*fgs === score holds exactly.
    let tds = 0;
    let fgs = 0;
    let xps = 0;
    const driveSuccessRaw = 0.4 + (offOvr - defOvr) * 0.005 + (isHome ? homeFieldAdv : 0) + netEdge;
    const driveSuccess = U.clamp(driveSuccessRaw, 0.15, 0.72);
    for (let i = 0; i < drives; i++) {
      const passHeavy = chance(0.56);
      const passAtt = randInt(passHeavy ? 3 : 1, passHeavy ? 7 : 4);
      const comp = Math.min(passAtt, randInt(Math.max(0, passAtt - 3), passAtt));
      const passYds = randInt(comp * 4, comp * 13);
      const rushAtt = randInt(passHeavy ? 1 : 2, passHeavy ? 4 : 6);
      const rushYds = randInt(Math.max(0, rushAtt * 2), rushAtt * 7);
      teamStats.passAtt += passAtt;
      teamStats.comp += comp;
      teamStats.passYds += passYds;
      teamStats.rushAtt += rushAtt;
      teamStats.rushYds += rushYds;
      if (chance(U.clamp(0.17 + (defOvr - offOvr) * 0.0025, 0.08, 0.34))) {
        teamStats.sacks += 1;
      }
      if (chance(U.clamp(0.08 + (defOvr - offOvr) * 0.002, 0.03, 0.2))) {
        teamStats.turnovers += 1;
        if (chance(0.7)) teamStats.INT += 1;
      }
      const convertedDrive = chance(driveSuccess);
      if (convertedDrive) {
        if (chance(0.67)) {
          score += 7;
          tds += 1;
          xps += 1;
          if (chance(0.58)) teamStats.passTD += 1;
        } else {
          score += 3;
          fgs += 1;
        }
      }
    }
    return { score, tds, fgs, xps };
  };

  const homeResult = simTeam(homeOff, awayDef, homeDrives, homeStats, true, homeNetEdge);
  const awayResult = simTeam(awayOff, homeDef, awayDrives, awayStats, false, awayNetEdge);
  const homeScore = homeResult.score;
  const awayScore = awayResult.score;
  const homeQbRating = passerRating({ comp: homeStats.comp, att: homeStats.passAtt, yds: homeStats.passYds, td: homeStats.passTD, ints: homeStats.INT });
  const awayQbRating = passerRating({ comp: awayStats.comp, att: awayStats.passAtt, yds: awayStats.passYds, td: awayStats.passTD, ints: awayStats.INT });
  const homeYpc = homeStats.rushAtt > 0 ? U.round(homeStats.rushYds / homeStats.rushAtt, 2) : null;
  const awayYpc = awayStats.rushAtt > 0 ? U.round(awayStats.rushYds / awayStats.rushAtt, 2) : null;
  return {
    seed,
    homeScore,
    awayScore,
    homeDrives,
    awayDrives,
    // Authoritative scoring-play breakdown (matches homeScore/awayScore exactly).
    homeTDs: homeResult.tds,
    awayTDs: awayResult.tds,
    homeFGs: homeResult.fgs,
    awayFGs: awayResult.fgs,
    homeXPs: homeResult.xps,
    awayXPs: awayResult.xps,
    homeStats: { ...homeStats, qbRating: homeQbRating, rushYPC: homeYpc },
    awayStats: { ...awayStats, qbRating: awayQbRating, rushYPC: awayYpc },
  };
}
