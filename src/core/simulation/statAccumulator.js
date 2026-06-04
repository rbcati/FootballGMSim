/*
 * Stat Accumulation Domain Module
 * ───────────────────────────────
 * Owns per-player stat generation and season/career stat accumulation,
 * plus the roster-grouping helpers the orchestrator uses to build active
 * depth charts. Pure: every function either returns a fresh stat object or
 * mutates only objects passed in by reference with explicit intent.
 *
 * Extracted verbatim from game-simulator.js (no math changes). The position
 * stat generators accept the seeded Utils PRNG (`U`) as a parameter so the
 * caller controls the RNG stream and determinism is preserved.
 */

import { Utils as U } from '../utils.js';
import { TRAITS } from '../traits.js';
import { getZeroStats } from '../player.js';
import { canPlayerPlay } from '../injury-core.js';

// Stat keys that are derived/calculated and must NOT be accumulated.
const DERIVED_STAT_KEYS = new Set([
  'completionPct', 'yardsPerCarry', 'yardsPerReception', 'avgPuntYards',
  'avgKickYards', 'successPct', 'passerRating', 'sackPct',
  'dropRate', 'separationRate', 'pressureRate',
  'coverageRating', 'pressureRating', 'protectionGrade',
  'ratingWhenTargeted',
]);

function computePasserRating({ comp = 0, att = 0, yds = 0, td = 0, ints = 0 } = {}) {
  if (att <= 0) return null;
  const a = U.clamp(((comp / att) - 0.3) * 5, 0, 2.375);
  const b = U.clamp(((yds / att) - 3) * 0.25, 0, 2.375);
  const c = U.clamp((td / att) * 20, 0, 2.375);
  const d = U.clamp(2.375 - ((ints / att) * 25), 0, 2.375);
  return U.round(((a + b + c + d) / 6) * 100, 1);
}

export function calculateQuarterbackRating({ completions = 0, attempts = 0, yards = 0, touchdowns = 0, interceptions = 0 } = {}) {
  return computePasserRating({
    comp: completions,
    att: attempts,
    yds: yards,
    td: touchdowns,
    ints: interceptions,
  }) ?? 0;
}

/**
 * Helper to group players by position and sort by depthOrder then OVR desc.
 * @param {Array} roster - Team roster array
 * @returns {Object} Map of position -> sorted array of players
 */
export function groupPlayersByPosition(roster) {
  const groups = {};
  if (!roster) return groups;
  for (let i = 0; i < roster.length; i++) {
    const player = roster[i];
    const pos = player.pos || 'UNK';
    if (!groups[pos]) groups[pos] = [];
    groups[pos].push(player);
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

/**
 * Cached roster grouping keyed by league week (cache stored on the team).
 */
export function getCachedGroups(team, league) {
  if (!team || !team.roster) return {};

  const currentWeek = league ? league.week : undefined;

  if (league && team._cachedGroups && team._cachedGroupsWeek === currentWeek) {
    return team._cachedGroups;
  }

  const groups = groupPlayersByPosition(team.roster);

  if (league) {
    Object.defineProperty(team, '_cachedGroups', {
      value: groups,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    Object.defineProperty(team, '_cachedGroupsWeek', {
      value: currentWeek,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  return groups;
}

/**
 * Active roster groups + flattened active roster (filtered by injury status).
 */
export function getActiveGroups(team, league) {
  const fullGroups = getCachedGroups(team, league);
  const active = [];
  const groups = {};

  const positions = Object.keys(fullGroups);
  for (let j = 0; j < positions.length; j++) {
    const pos = positions[j];
    const activeInPos = [];
    const fullGroup = fullGroups[pos];
    for (let i = 0; i < fullGroup.length; i++) {
      const p = fullGroup[i];
      if (canPlayerPlay(p)) {
        activeInPos.push(p);
        active.push(p);
      }
    }
    groups[pos] = activeInPos;
  }

  return { active, groups };
}

/**
 * Initialize player stats structure if it doesn't exist.
 */
export function initializePlayerStats(player) {
  if (!player.stats) {
    player.stats = {
      game: getZeroStats(),
      season: getZeroStats(),
      career: getZeroStats(),
    };
    return;
  }
  if (!player.stats.game) player.stats.game = getZeroStats();
  if (!player.stats.season || Object.keys(player.stats.season).length === 0) {
    player.stats.season = getZeroStats();
  }
  if (!player.stats.career) player.stats.career = getZeroStats();
}

/**
 * Roll for a performance modifier that creates variance.
 * Returns a multiplier: 1.0 = normal, >1.0 = hot game, <1.0 = cold game.
 */
export function rollPerformanceVariance(player, Urng) {
  const roll = Urng.random();
  const ovr = player.ovr || 70;
  const consistency = Number(player?.personalityProfile?.consistency ?? 65);
  const riskTaker = Number(player?.personalityProfile?.riskTaker ?? 40);

  const eliteBonus = Math.max(0, (ovr - 80) * 0.003);
  const consistencyBonus = (consistency - 60) * 0.0015;
  const volatility = Math.max(-0.02, Math.min(0.03, (riskTaker - 50) * 0.001));

  if (roll < 0.04 + eliteBonus + volatility) {
    return { multiplier: Urng.randFloat(1.25, 1.55), type: 'career_game' };
  } else if (roll < 0.08 + eliteBonus + volatility) {
    return { multiplier: Urng.randFloat(1.10, 1.25), type: 'hot' };
  } else if (roll > 0.96 - eliteBonus * 0.5 + Math.max(0, -consistencyBonus)) {
    return { multiplier: Urng.randFloat(0.55, 0.78), type: 'dud' };
  } else if (roll > 0.92 - eliteBonus * 0.5 + Math.max(0, -consistencyBonus)) {
    return { multiplier: Urng.randFloat(0.80, 0.92), type: 'cold' };
  }
  return { multiplier: 1.0, type: 'normal' };
}

export function generateQBStats(qb, teamScore, oppScore, defenseStrength, Urng, modifiers = {}, share = 1.0) {
  const ratings = qb.ratings || {};
  const throwPower = ratings.throwPower || 70;
  const throwAccuracy = ratings.throwAccuracy || 70;
  const awareness = ratings.awareness || 70;

  let clutchBonus = 1.0;
  if (qb.personality?.traits?.includes('Clutch') && Math.abs(teamScore - oppScore) <= 8) {
    clutchBonus = 1.05;
  }

  const perfVar = rollPerformanceVariance(qb, Urng);
  const perfMult = perfVar.multiplier * clutchBonus;

  const scoreDiff = oppScore - teamScore;
  const scriptMod = Math.max(-12, Math.min(12, scoreDiff * 0.5));

  const blowoutLead = teamScore - oppScore;
  const blowoutMod = blowoutLead >= 21 ? 0.72 : 1.0;

  let baseAttempts = 32 + scriptMod + Urng.rand(-4, 4);
  if (share < 1.0) baseAttempts *= share;
  if (modifiers.passVolume) baseAttempts *= modifiers.passVolume;
  baseAttempts *= blowoutMod;
  const attempts = Math.max(18, Math.min(50, Math.round(baseAttempts)));

  let baseCompPct = (throwAccuracy + awareness) / 2;
  if (modifiers.passAccuracy) baseCompPct *= modifiers.passAccuracy;
  const defenseFactor = (100 - (defenseStrength || 70)) / 100;

  const meanCompPct = 57 + (baseCompPct - 70) * 0.55 + defenseFactor * 12;
  const compPct = Urng.gaussianClamped(meanCompPct * (perfMult > 1 ? 1 + (perfMult - 1) * 0.3 : 1 - (1 - perfMult) * 0.3), 6.0, 35, 84);

  const completions = Math.round(attempts * (compPct / 100));

  const meanYPC = 9.2 + (throwPower - 75) * 0.08 + defenseFactor * 1.6;
  const avgYPC = Urng.gaussianClamped(meanYPC, 1.8, 5.0, 17.0);

  const yards = Math.max(0, Math.round(completions * avgYPC * perfMult));

  const redZoneEff = (awareness + throwAccuracy) / 200;
  const baseTDs = yards / 150 * (0.8 + redZoneEff * 0.6);
  const touchdowns = Math.max(0, Math.min(6,
    Math.round(baseTDs + Urng.rand(-0.5, 1.0)),
  ));

  const intRate = 0.025 + (70 - throwAccuracy) * 0.0005 + (defenseStrength - 70) * 0.0003;
  const interceptions = Math.max(0, Math.min(4,
    Math.round(attempts * Math.max(0.005, intRate) + Urng.rand(-0.3, 0.7)),
  ));

  let sackCount = 2.4 + (70 - awareness) * 0.04 + Urng.rand(-1, 2);
  if (qb.traits && qb.traits.includes(TRAITS.POCKET_PRESENCE.id)) sackCount *= 0.8;

  const sacks = Math.max(0, Math.min(7, Math.round(sackCount)));

  const longestPass = completions > 0
    ? Math.max(12, Math.round(avgYPC * Urng.rand(2.0, 3.5)))
    : 0;

  const qbSpeed = ratings.speed || 60;
  const mobilityFactor = (qbSpeed - 55) / 45;
  let qbRushAtt = Math.max(1, Math.round(2 + mobilityFactor * 7 + Urng.rand(-2, 2)));
  if (share < 1.0) qbRushAtt = Math.round(qbRushAtt * share);

  qbRushAtt = Math.round(qbRushAtt * blowoutMod);
  qbRushAtt = Math.max(0, Math.min(15, qbRushAtt));

  const qbYPC = Urng.gaussianClamped(3.5 + mobilityFactor * 3.5, 2.0, -2.0, 15.0);
  const qbRushYd = Math.max(0, Math.round(qbRushAtt * qbYPC));

  const qbRushTdChance = 0.03 + mobilityFactor * 0.12;
  const qbRushTD = Urng.random() < qbRushTdChance ? 1 : 0;

  const qbLongestRun = qbRushAtt > 0
    ? Math.max(2, Math.round(qbYPC * Urng.rand(1.5, 3.0)))
    : 0;

  const att = Math.max(1, attempts);
  const _a = Math.max(0, Math.min(2.375, ((completions / att) - 0.3) / 0.2));
  const _b = Math.max(0, Math.min(2.375, ((yards / att) - 3) / 4));
  const _c = Math.max(0, Math.min(2.375, (touchdowns / att) / 0.05));
  const _d = Math.max(0, Math.min(2.375, 2.375 - (interceptions / att) / 0.04));
  const passerRating = Math.round(((_a + _b + _c + _d) / 6) * 100 * 10) / 10;

  return {
    gamesPlayed: 1,
    passAtt: attempts,
    passComp: completions,
    passYd: yards,
    passTD: touchdowns,
    interceptions,
    sacks,
    dropbacks: attempts + sacks,
    longestPass,
    completionPct: Math.round((completions / Math.max(1, attempts)) * 1000) / 10,
    passerRating,
    rushAtt: qbRushAtt,
    rushYd: qbRushYd,
    rushTD: qbRushTD,
    longestRun: qbLongestRun,
    yardsPerCarry: qbRushAtt > 0 ? Math.round((qbRushYd / qbRushAtt) * 10) / 10 : 0,
  };
}

export function generateRBStats(rb, teamScore, oppScore, defenseStrength, Urng, modifiers = {}, share = 1.0) {
  const ratings = rb.ratings || {};
  const speed = ratings.speed || 70;
  const trucking = ratings.trucking || 70;
  const juking = ratings.juking || 70;
  const catching = ratings.catching || 50;

  const perfVar = rollPerformanceVariance(rb, Urng);
  const perfMult = perfVar.multiplier;

  const scoreDiff = teamScore - oppScore;
  const scriptMod = Math.max(-10, Math.min(12, scoreDiff * 0.4));

  const blowoutLead = teamScore - oppScore;
  const blowoutRunBoost = blowoutLead >= 21 ? 1.40 : 1.0;

  let baseTeamCarries = 26 + scriptMod + Urng.rand(-5, 8);
  baseTeamCarries *= blowoutRunBoost;

  if (modifiers.runVolume) baseTeamCarries *= modifiers.runVolume;

  let carries = Math.round(baseTeamCarries * share);
  carries = Math.max(2, Math.min(35, carries));

  const baseYPC = 3.5 + (speed + trucking + juking - 210) / 40;
  const defenseFactor = (100 - (defenseStrength || 70)) / 50;

  const yardsPerCarry = Urng.gaussianClamped(baseYPC + defenseFactor, 1.2, 1.5, 12.0);
  const rushYd = Math.round(carries * yardsPerCarry * perfMult);

  const rushTdRate = rushYd / 80 * (0.4 + (trucking - 50) * 0.005);
  const touchdowns = Math.max(0, Math.min(4,
    Math.round(rushTdRate + Urng.rand(-0.3, 0.8)),
  ));

  let fumbleCount = (100 - (ratings.awareness || 70)) / 150 + Urng.rand(-0.3, 0.5);
  if (rb.traits && rb.traits.includes(TRAITS.WORKHORSE.id)) fumbleCount *= 0.7;
  const fumbles = Math.max(0, Math.min(2, Math.round(fumbleCount)));

  const longestRun = Math.max(5, Math.round(rushYd / Math.max(1, carries) * Urng.rand(1.5, 3.5)));

  const targets = Math.max(0, Math.min(8, Math.round((catching / 20) + Urng.rand(0, 3))));
  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (catching / 100) + Urng.rand(-1, 1))));
  const recYd = Math.max(0, Math.round(receptions * (5 + speed / 20) + Urng.rand(-5, 15)));
  const recTD = receptions > 0 && Urng.rand(1, 100) < 15 ? 1 : 0;
  const drops = Math.max(0, targets - receptions);
  const yardsAfterCatch = Math.max(0, Math.round(recYd * 0.4 + Urng.rand(-5, 10)));

  const routesRun = Math.round(targets * 3 + Urng.rand(5, 15));
  const separationChance = (ratings.agility || 70) / 150;
  const targetsWithSeparation = Math.round(targets * separationChance);

  return {
    gamesPlayed: 1,
    rushAtt: carries,
    rushYd: Math.max(0, rushYd),
    rushTD: touchdowns,
    longestRun,
    yardsPerCarry: Math.round((rushYd / Math.max(1, carries)) * 10) / 10,
    fumbles,
    targets,
    receptions,
    recYd,
    recTD,
    drops,
    yardsAfterCatch,
    longestCatch: receptions > 0 ? Math.max(5, Math.round(recYd / receptions * Urng.rand(1.2, 2.5))) : 0,
    routesRun,
    targetsWithSeparation,
  };
}

export function distributePassingTargets(receivers, totalTargets, Urng, starTargetId) {
  if (!receivers || receivers.length === 0) return [];

  const weights = receivers.map((r) => {
    const ratings = r.ratings || {};
    let w = (r.ovr * 0.5) + ((ratings.awareness || 50) * 0.3) + ((ratings.speed || 50) * 0.2);
    if (starTargetId && (r.id === starTargetId || String(r.id) === String(starTargetId))) {
      w *= 1.25;
    }
    return w;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  return receivers.map((r, i) => {
    const playerShare = weights[i] / totalWeight;
    const playerTargets = Math.round(totalTargets * playerShare);
    return { player: r, targets: playerTargets };
  });
}

export function generateReceiverStats(receiver, targetCount, teamScore, defenseStrength, Urng) {
  const ratings = receiver.ratings || {};
  const catching = ratings.catching || 70;
  const catchInTraffic = ratings.catchInTraffic || 70;
  const speed = ratings.speed || 70;

  const perfVar = rollPerformanceVariance(receiver, Urng);
  const perfMult = perfVar.multiplier;

  const targets = targetCount;

  const catchRate = (catching + catchInTraffic) / 2;
  const defenseFactor = (100 - (defenseStrength || 70)) / 100;
  let receptionPct = Math.max(40, Math.min(90, catchRate - 15 + defenseFactor * 20));
  if (receiver.traits && receiver.traits.includes(TRAITS.ROUTE_RUNNER.id)) receptionPct *= 1.1;

  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (receptionPct / 100) + Urng.rand(-1, 1))));

  let meanYPR = 9.5 + (speed - 70) * 0.12;
  if (receiver.traits && receiver.traits.includes(TRAITS.DEEP_THREAT.id)) meanYPR *= 1.1;

  const avgYardsPerCatch = Urng.gaussianClamped(meanYPR, 2.2, 4.0, 25.0);
  const recYd = Math.round(receptions * avgYardsPerCatch * perfMult);

  const recTdRate = recYd / 100 * (0.4 + (catching - 60) * 0.005);
  const recTD = Math.max(0, Math.min(3, Math.round(recTdRate + Urng.rand(-0.3, 0.8))));

  const dropRate = Math.max(0, (100 - catching) / 200);
  const drops = Math.max(0, Math.min(targets - receptions, Math.round(targets * dropRate + Urng.rand(-0.5, 1.5))));

  const yardsAfterCatch = Math.max(0, Math.round(recYd * (0.3 + speed / 200) + Urng.rand(-10, 20)));

  let longestCatch = receptions > 0 ? Math.max(10, Math.round(recYd / receptions * Urng.rand(1.5, 3.5))) : 0;
  if (receiver.traits && receiver.traits.includes(TRAITS.DEEP_THREAT.id)) longestCatch *= 1.15;

  const routesRun = Math.round(targets * 4 + Urng.rand(10, 20));
  const separationChance = ((ratings.agility || 70) + (ratings.speed || 70)) / 250;
  const targetsWithSeparation = Math.round(targets * separationChance);

  return {
    gamesPlayed: 1,
    targets,
    receptions,
    recYd,
    recTD,
    drops,
    yardsAfterCatch,
    longestCatch,
    routesRun,
    targetsWithSeparation,
  };
}

export function generateDBStats(db, offenseStrength, Urng, modifiers = {}) {
  const ratings = db.ratings || {};
  const coverage = ratings.coverage || 70;
  const speed = ratings.speed || 70;
  const awareness = ratings.awareness || 70;

  const coverageRating = Math.round((coverage + speed + awareness) / 3 + Urng.rand(-5, 5));

  const baseTackles = db.pos === 'S' ? 6 : 4;
  const tackles = Math.max(0, Math.min(15, Math.round(baseTackles + (100 - coverage) / 30 + Urng.rand(-1, 3))));

  let intChance = (coverage + awareness) / 200;
  if (modifiers.intChance) intChance *= modifiers.intChance;
  if (modifiers.defIntChance) intChance *= modifiers.defIntChance;
  if (db.traits && db.traits.includes(TRAITS.BALLHAWK.id)) intChance *= 1.25;

  const interceptions = Math.max(0, Math.min(3, Math.round(intChance * 2 + Urng.rand(-0.5, 1.5))));

  const passesDefended = Math.max(0, Math.min(5, Math.round((coverage / 30) + Urng.rand(-0.5, 1.5))));

  const targetsAllowed = Math.round(5 + (100 - coverage) / 10 + Urng.rand(-1, 2));
  let completionPctAllowed = Math.max(0.4, (100 - coverage) / 100);
  if (db.traits && db.traits.includes(TRAITS.SHUTDOWN.id)) completionPctAllowed *= 0.9;

  const completionsAllowed = Math.round(targetsAllowed * completionPctAllowed);
  const yardsAllowed = Math.round(completionsAllowed * (10 + (100 - speed) / 10));
  const tdsAllowed = Urng.rand(0, 100) < (100 - coverage) ? 1 : 0;

  return {
    gamesPlayed: 1,
    coverageRating: Math.max(0, Math.min(100, coverageRating)),
    tackles,
    interceptions,
    passesDefended,
    targetsAllowed,
    completionsAllowed,
    yardsAllowed,
    tdsAllowed,
  };
}

export function generateDLStats(defender, offenseStrength, Urng, modifiers = {}) {
  const ratings = defender.ratings || {};
  const passRushPower = ratings.passRushPower || 70;
  const passRushSpeed = ratings.passRushSpeed || 70;
  const runStop = Math.min(99, (ratings.runStop || 70) * (modifiers.runStop ?? 1));
  const awareness = ratings.awareness || 70;

  const perfVar = rollPerformanceVariance(defender, Urng);
  const perfMult = perfVar.multiplier;

  const pressureRating = Math.round((passRushPower + passRushSpeed + awareness) / 3 + Urng.rand(-5, 5));

  const rushComposite = (passRushPower + passRushSpeed) / 2;
  const olStrength = Math.max(50, offenseStrength || 70);
  let baseSacks = (rushComposite - 50) / 80;
  baseSacks += Urng.rand(-0.3, 0.6);
  if (modifiers.sackChance) baseSacks *= modifiers.sackChance;
  if (defender.traits && defender.traits.includes(TRAITS.SPEED_RUSHER.id)) baseSacks *= 1.25;
  baseSacks *= (1 - (olStrength - 50) / 200);
  baseSacks *= perfMult;
  const sacks = Math.max(0, Math.min(5, Math.round(baseSacks)));

  const baseTackles = defender.pos === 'LB' ? 8 : 4;
  const tackles = Math.max(0, Math.min(15, Math.round(baseTackles + (runStop / 25) + Urng.rand(-2, 2))));

  let tflCount = (runStop / 60) + Urng.rand(-0.3, 1.0);
  if (defender.traits && defender.traits.includes(TRAITS.RUN_STUFFER.id)) tflCount *= 1.15;
  const tacklesForLoss = Math.max(0, Math.min(3, Math.round(tflCount)));

  const forcedFumbles = Math.max(0, Math.min(2, Math.round((passRushPower / 100) + Urng.rand(-0.4, 0.3))));
  const fumbleRecoveries = Math.max(0, Urng.random() < 0.06 ? 1 : 0);

  const passRushSnaps = Math.round(20 + (passRushPower + passRushSpeed) / 8);
  const pressureRate = Math.max(0, (rushComposite - 40) / 250);
  let pressures = Math.round(passRushSnaps * pressureRate * perfMult + Urng.rand(-1, 1));
  pressures = Math.max(0, Math.min(10, pressures));

  return {
    gamesPlayed: 1,
    pressureRating: Math.max(0, Math.min(100, pressureRating)),
    sacks,
    tackles,
    tacklesForLoss,
    forcedFumbles,
    fumbleRecoveries,
    passRushSnaps,
    pressures,
  };
}

export function generateOLStats(ol, defenseStrength, Urng) {
  const ratings = ol.ratings || {};
  const passBlock = ratings.passBlock || 70;
  const runBlock = ratings.runBlock || 70;
  const awareness = ratings.awareness || 70;

  let sackChance = (100 - passBlock) / 200 + (defenseStrength / 300);
  if (ol.traits && ol.traits.includes(TRAITS.STONE_WALL.id)) sackChance *= 0.75;
  const sacksAllowed = Math.max(0, Math.min(3, Math.round(sackChance * 2 + Urng.rand(-0.5, 1.5))));

  const tflAllowed = Math.max(0, Math.min(2, Math.round((100 - runBlock) / 100 + Urng.rand(-0.3, 0.5))));

  const protectionGrade = Math.round((passBlock + runBlock + awareness) / 3 + Urng.rand(-5, 5));

  const passBlockSnaps = Math.round(30 + (passBlock / 5) + Urng.rand(-5, 5));
  const runBlockSnaps = Math.round(25 + (runBlock / 5) + Urng.rand(-5, 5));
  const blocksWon = Math.max(0, Math.round((passBlockSnaps + runBlockSnaps) * (passBlock + runBlock) / 20000));

  return {
    gamesPlayed: 1,
    sacksAllowed,
    tacklesForLossAllowed: tflAllowed,
    protectionGrade: Math.max(0, Math.min(100, protectionGrade)),
    passBlockSnaps,
    runBlockSnaps,
    blocksWon,
  };
}

/**
 * Generate kicker stats derived directly from actual drive results.
 */
export function generateKickerStats(kicker, actualFGs, actualXPs, Urng) {
  const ratings = kicker.ratings || {};
  const kickPower = ratings.kickPower || 70;
  const kickAccuracy = ratings.kickAccuracy || 70;

  let makeRate = kickAccuracy / 100;
  if (kicker.traits && kicker.traits.includes(TRAITS.CLUTCH_KICKER.id)) makeRate *= 1.1;
  makeRate = Math.min(makeRate, 0.99);

  const fgMissed = actualFGs > 0 ? Math.max(0, Math.round((actualFGs / makeRate) - actualFGs)) : 0;
  const fgAttempts = actualFGs + fgMissed;

  const xpMissed = actualXPs > 0 ? Math.max(0, Math.round((actualXPs / (kickAccuracy / 100)) - actualXPs)) : 0;
  const xpAttempts = actualXPs + xpMissed;

  const longestFG = actualFGs > 0
    ? Math.max(20, Math.min(65, Math.round(30 + (kickPower / 2) + Urng.rand(-5, 10))))
    : 0;

  const successPct = fgAttempts > 0 ? Math.round((actualFGs / fgAttempts) * 1000) / 10 : 0;
  const avgKickYards = Math.round(60 + (kickPower / 3) + Urng.rand(-5, 5));

  return {
    gamesPlayed: 1,
    fgAttempts,
    fgMade: actualFGs,
    fgMissed,
    longestFG,
    xpAttempts,
    xpMade: actualXPs,
    xpMissed,
    successPct,
    avgKickYards,
  };
}

export function generatePunterStats(punter, teamScore, Urng) {
  const ratings = punter.ratings || {};
  const kickPower = ratings.kickPower || 70;

  const punts = Math.max(0, Math.min(8, Math.round((28 - teamScore) / 4 + Urng.rand(-1, 2))));

  const avgPuntYards = Math.round(40 + (kickPower / 3) + Urng.rand(-5, 5));
  const totalPuntYards = punts * avgPuntYards;

  const longestPunt = Math.max(30, Math.min(70, Math.round(avgPuntYards * Urng.rand(1.2, 1.8))));

  return {
    gamesPlayed: 1,
    punts,
    puntYards: totalPuntYards,
    avgPuntYards: punts > 0 ? Math.round((totalPuntYards / punts) * 10) / 10 : 0,
    longestPunt,
  };
}

/**
 * Accumulate game stats into a target stats object (season or career).
 * Ignores calculated fields like averages and percentages.
 *
 * Idempotency guard: when both `gameId` and `processedGameIds` (a Set) are
 * supplied, a game already present in the set is skipped and the function
 * returns `false`. This stops any retry / manual-resim path from double-counting
 * the same game into a player's season totals. Without those args the behaviour
 * is the legacy blind `+=` (returns `true`).
 *
 * @returns {boolean} whether the stats were accumulated (false if skipped).
 */
export function accumulateStats(source, target, gameId = null, processedGameIds = null) {
  if (!source || !target) return false;

  if (gameId != null && processedGameIds && typeof processedGameIds.has === 'function') {
    const key = String(gameId);
    if (processedGameIds.has(key)) return false;
    processedGameIds.add(key);
  }

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'number') continue;
    if (DERIVED_STAT_KEYS.has(key)) continue;
    target[key] = (target[key] || 0) + value;
  }
  return true;
}
