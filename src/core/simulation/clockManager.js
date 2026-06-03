/*
 * Clock Manager Domain Module
 * ───────────────────────────
 * Owns quarter/clock derivation, momentum swing math, late-game decisioning,
 * and overtime end-of-game / end-of-half logic. All functions are pure and
 * RNG-free (any random draws stay with the orchestrator), so they can be wired
 * into the seeded simulation without disturbing the PRNG stream.
 */

import { Utils as U } from '../utils.js';

const SIM_SPEED_TO_MS = {
  slow: 1400,
  medium: 800,
  instant: 0,
};

const MINUTES_PER_QUARTER = 15;

export function getSimulationSpeedDelay(speed = 'medium') {
  return SIM_SPEED_TO_MS[speed] ?? SIM_SPEED_TO_MS.medium;
}

/**
 * Which quarter (1-4) a given drive index falls in.
 * @param {number} driveIndex - zero-based drive number
 * @param {number} totalDrives - total drives in the game
 */
export function computeQuarter(driveIndex, totalDrives) {
  if (!totalDrives) return 1;
  return Math.min(4, Math.floor((driveIndex / totalDrives) * 4) + 1);
}

/**
 * Drives that make up a single quarter for a game with `totalDrives` drives.
 */
export function drivesPerQuarter(totalDrives) {
  return Math.ceil(totalDrives / 4);
}

/**
 * Remaining minutes on the quarter clock for a drive within its quarter.
 * Returns 0 once the quarter (and thus the half, at quarter 2/4) has expired.
 */
export function getQuarterClockMinutes(driveInQuarter, drivesInQuarter) {
  if (!drivesInQuarter) return MINUTES_PER_QUARTER;
  return Math.max(0, MINUTES_PER_QUARTER - Math.floor((driveInQuarter / drivesInQuarter) * MINUTES_PER_QUARTER));
}

/**
 * True when the given drive is the final drive of a half — i.e. the last drive
 * of quarter 2 or quarter 4, when the quarter clock has wound down to its
 * minimum. (Per-drive clock derivation reaches its low on the last in-quarter
 * drive; it hits exactly 0 only at the quarter boundary.)
 */
export function isHalfExpired(driveIndex, totalDrives) {
  const quarter = computeQuarter(driveIndex, totalDrives);
  if (quarter !== 2 && quarter !== 4) return false;
  const perQtr = drivesPerQuarter(totalDrives);
  return (driveIndex % perQtr) === perQtr - 1;
}

export function calculateMomentumSwing({
  yards = 0,
  isScoringPlay = false,
  turnover = false,
  isExplosive = false,
  offenseIsHome = true,
}) {
  let swing = Math.max(-12, Math.min(12, yards * 0.45));
  if (isExplosive) swing += 6;
  if (isScoringPlay) swing += 10;
  if (turnover) swing -= 16;
  if (!offenseIsHome) swing *= -1;
  return U.clamp(Math.round(swing), -24, 24);
}

export function decideLateGameSequence({
  quarter = 1,
  clockSeconds = 900,
  scoreDiff = 0,
  down = 1,
  distance = 10,
  yardLine = 50,
  timeouts = 3,
}) {
  const inLateGame = quarter >= 4;
  const insideTwoMinutes = quarter >= 4 && clockSeconds <= 120;
  const trailing = scoreDiff < 0;
  const leading = scoreDiff > 0;

  const goForTwo = inLateGame && ((scoreDiff === -2 && clockSeconds < 120) || (insideTwoMinutes && Math.abs(scoreDiff) === 1));
  const conservativeTimeout = timeouts > 0 && leading && quarter >= 4 && clockSeconds < 80;
  const aggressiveTimeout = timeouts > 0 && trailing && quarter >= 4 && clockSeconds < 180;

  let fourthDownChoice = 'normal';
  if (down === 4) {
    const short = distance <= 2;
    const inFgRange = yardLine >= 65;
    if (trailing && (insideTwoMinutes || scoreDiff <= -9) && (short || yardLine >= 55)) fourthDownChoice = 'go';
    else if (leading && inFgRange && clockSeconds < 240) fourthDownChoice = 'field_goal';
    else if (!inFgRange && yardLine < 60) fourthDownChoice = 'punt';
    else fourthDownChoice = short ? 'go' : 'field_goal';
  }

  return {
    goForTwo,
    useTimeout: conservativeTimeout || aggressiveTimeout,
    fourthDownChoice,
  };
}

/**
 * End-of-game decision for the overtime loop. Pure: given the format, the
 * number of possessions played, the current scores and whether ties are
 * allowed, returns whether the game is over. Mirrors the legacy NFL (2024+)
 * and college-inspired rules exactly.
 */
export function isOvertimeGameOver({
  overtimeFormat = 'nfl',
  possessions = 0,
  homeScore = 0,
  awayScore = 0,
  allowTies = false,
}) {
  const isCompletePair = (possessions % 2 === 0);
  if (overtimeFormat === 'college') {
    return isCompletePair && homeScore !== awayScore;
  }
  const pairsCompleted = Math.floor(possessions / 2);
  if (isCompletePair) {
    if (homeScore !== awayScore) return true;
    if (allowTies && pairsCompleted >= 2) return true;
  }
  return false;
}
