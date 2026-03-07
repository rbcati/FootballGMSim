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

function newWay1() {
  let sum = 0;
  const winnersByConf = {};
  for (const tid of winnersFlat) {
    const cid = getConf(tid);
    if (!winnersByConf[cid]) winnersByConf[cid] = [];
    winnersByConf[cid].push({ teamId: tid, seed: getSeed(tid), conf: cid });
  }

  for (const confId of confs) {
    const wcSurvivors = winnersByConf[confId] || [];
    sum += wcSurvivors.length;
  }
  return sum;
}


const ITERATIONS = 100000;

const startOld = performance.now();
for (let i = 0; i < ITERATIONS; i++) oldWay();
const endOld = performance.now();

const startNew1 = performance.now();
for (let i = 0; i < ITERATIONS; i++) newWay1();
const endNew1 = performance.now();

console.log(`Baseline: ${endOld - startOld} ms`);
console.log(`Optimized 1: ${endNew1 - startNew1} ms`);
