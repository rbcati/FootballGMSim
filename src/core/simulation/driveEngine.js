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

/**
 * Deterministic, seeded drive-level game summary. The authoritative source of
 * homeScore / awayScore for a simulated game. Same seed + inputs → same result.
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
}) {
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
