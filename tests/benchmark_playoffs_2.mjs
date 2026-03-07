import { performance } from 'perf_hooks';

const seedMap = {
  1: { conf: 1, seed: 2 },
  2: { conf: 1, seed: 3 },
  3: { conf: 2, seed: 2 },
  4: { conf: 2, seed: 3 },
};

const getConf = (tid) => seedMap[tid]?.conf ?? 1;
const getSeed = (tid) => seedMap[tid]?.seed ?? 99;

const winnersFlat = [1, 2, 3, 4]; // realistically only 4 games in wild card

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

function newWay() {
  let sum = 0;
  const winnersByConf = new Map();
  for (const tid of winnersFlat) {
    const cid = getConf(tid);
    if (!winnersByConf.has(cid)) winnersByConf.set(cid, []);
    winnersByConf.get(cid).push(tid);
  }

  for (const confId of confs) {
    const survivors = winnersByConf.get(confId) || [];
    const wcSurvivors = survivors.map(tid => ({ teamId: tid, seed: getSeed(tid), conf: confId }));
    sum += wcSurvivors.length;
  }
  return sum;
}

const ITERATIONS = 100000;

const startOld = performance.now();
for (let i = 0; i < ITERATIONS; i++) oldWay();
const endOld = performance.now();

const startNew = performance.now();
for (let i = 0; i < ITERATIONS; i++) newWay();
const endNew = performance.now();

console.log(`Baseline: ${endOld - startOld} ms`);
console.log(`Optimized: ${endNew - startNew} ms`);
