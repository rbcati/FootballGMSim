// utils.js
'use strict';

// =============================================================================
// SEEDED PRNG - Mulberry32 (fast, high-quality 32-bit PRNG)
// =============================================================================
let _seed = Date.now() | 0;

/**
 * Set the global RNG seed for reproducible randomness.
 * @param {number} seed - Integer seed value
 */
function setSeed(seed) {
  _seed = seed | 0;
}

/**
 * Get the current seed (for saving/restoring state)
 */
function getSeed() {
  return _seed;
}

/**
 * Mulberry32 PRNG - returns float in [0, 1)
 * Replaces Math.random() throughout the game for reproducibility.
 */
function random() {
  _seed |= 0;
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// =============================================================================
// CORE UTILITY FUNCTIONS (using seeded RNG)
// =============================================================================

/**
 * Random integer in [n, m] inclusive
 */
function rand(n, m) {
  return Math.floor(random() * (m - n + 1)) + n;
}

/**
 * Random float in [n, m]
 */
function randFloat(n, m) {
  return n + random() * (m - n);
}

/**
 * Pick a random element from an array
 */
function choice(a) {
  return a[Math.floor(random() * a.length)];
}

/**
 * Shuffle an array in place (Fisher-Yates)
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Weighted random selection - picks an index based on weights
 * @param {number[]} weights - Array of weights (higher = more likely)
 * @returns {number} Selected index
 */
function weightedChoice(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Gaussian (normal) random using Box-Muller transform.
 * Returns value centered on mean with given stddev.
 * @param {number} mean - Center of distribution
 * @param {number} stddev - Standard deviation
 * @returns {number}
 */
function gaussian(mean = 0, stddev = 1) {
  let u1, u2;
  do { u1 = random(); } while (u1 === 0);
  u2 = random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stddev;
}

/**
 * Gaussian random clamped to [min, max]
 */
function gaussianClamped(mean, stddev, min, max) {
  return clamp(gaussian(mean, stddev), min, max);
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function id() { return random().toString(36).slice(2, 10) + random().toString(36).slice(2, 6); }
function avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function pct(rec) { var w = +rec.w || 0, l = +rec.l || 0, t = +rec.t || 0; var g = w + l + t; return g ? (w + 0.5 * t) / g : 0; }
function round(num, decimals = 1) { return Math.round(num * 10 ** decimals) / 10 ** decimals; }

const Utils = { rand, randFloat, choice, shuffle, weightedChoice, gaussian, gaussianClamped, clamp, id, avg, pct, round, random, setSeed, getSeed };

// Export Utils
export { Utils };

// Make available globally
if (typeof window !== 'undefined') {
  window.Utils = Utils;
}

export function generateChecksum(obj) {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return hash.toString(36);
}

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;
    return function (...args) {
        const currentTime = Date.now();
        if (currentTime - lastExecTime > delay) {
            func.apply(this, args);
            lastExecTime = currentTime;
        }
    };
}

// Make helper functions available globally
if (typeof window !== 'undefined') {
  window.generateChecksum = generateChecksum;
  window.deepClone = deepClone;
  window.throttle = throttle;
}
