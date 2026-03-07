import { performance } from 'perf_hooks';

const seedMap = {
  1: { conf: 1, seed: 2 },
  2: { conf: 1, seed: 3 },
  3: { conf: 2, seed: 2 },
  4: { conf: 2, seed: 3 },
  5: { conf: 1, seed: 4 },
  6: { conf: 1, seed: 5 },
  7: { conf: 2, seed: 4 },
  8: { conf: 2, seed: 5 },
  9: { conf: 1, seed: 6 },
  10: { conf: 1, seed: 7 },
  11: { conf: 2, seed: 6 },
  12: { conf: 2, seed: 7 },
};

const getConf = (tid) => seedMap[tid]?.conf ?? 1;
const getSeed = (tid) => seedMap[tid]?.seed ?? 99;

const winnersFlat = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // realistically 6 games in wild card

const confs = [1, 2];

function oldWay() {
  let sum = 0;
  for (const confId of confs) {
    const wcSurvivors = winnersFlat
      .filter(tid => getConf(tid) === confId)
      .map(tid => ({ teamId: tid, seed: getSeed(tid), conf: confId }));
    sum += wcSurvivors.length;
  }
  return sum;
}

function preMapArray() {
  let sum = 0;
  // This is fundamentally faster when array sizes are small
  // doing `.map` first then filtering avoids re-calling getConf inside filter and getSeed inside map repeatedly.
  // Actually wait, let's just map all winners once, as it avoids executing getConf/getSeed multiple times per element across different loops.
  const mappedWinners = [];
  for (let i = 0; i < winnersFlat.length; i++) {
    const tid = winnersFlat[i];
    mappedWinners.push({ teamId: tid, seed: getSeed(tid), conf: getConf(tid) });
  }

  for (let i = 0; i < confs.length; i++) {
    const confId = confs[i];
    // filter
    const wcSurvivors = [];
    for (let j = 0; j < mappedWinners.length; j++) {
      if (mappedWinners[j].conf === confId) {
        wcSurvivors.push(mappedWinners[j]);
      }
    }
    sum += wcSurvivors.length;
  }
  return sum;
}


const ITERATIONS = 1000000;

let startOld = performance.now();
for (let i = 0; i < ITERATIONS; i++) oldWay();
let endOld = performance.now();

let startPreMapArray = performance.now();
for (let i = 0; i < ITERATIONS; i++) preMapArray();
let endPreMapArray = performance.now();

console.log(`Baseline: ${endOld - startOld} ms`);
console.log(`Optimized (preMapArray): ${endPreMapArray - startPreMapArray} ms`);
