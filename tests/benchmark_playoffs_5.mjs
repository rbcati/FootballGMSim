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

const winnersFlat = [1, 2, 3, 4, 5, 6]; // realistically 6 games in wild card

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

function newWay3() {
  let sum = 0;
  const winnersByConf = {};
  for (let i = 0; i < confs.length; i++) {
    winnersByConf[confs[i]] = [];
  }
  for (let i = 0; i < winnersFlat.length; i++) {
    const tid = winnersFlat[i];
    const cid = getConf(tid);
    if (winnersByConf[cid]) {
      winnersByConf[cid].push({ teamId: tid, seed: getSeed(tid), conf: cid });
    }
  }
  for (const confId of confs) {
    const wcSurvivors = winnersByConf[confId];
    sum += wcSurvivors.length;
  }
  return sum;
}

const ITERATIONS = 1000000;

const startOld = performance.now();
for (let i = 0; i < ITERATIONS; i++) oldWay();
const endOld = performance.now();

const startNew3 = performance.now();
for (let i = 0; i < ITERATIONS; i++) newWay3();
const endNew3 = performance.now();

console.log(`Baseline: ${endOld - startOld} ms`);
console.log(`Optimized 3: ${endNew3 - startNew3} ms`);
