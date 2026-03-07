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

function onePassFilter() {
  let sum = 0;
  // Map once
  const mappedWinners = winnersFlat.map(tid => ({ teamId: tid, seed: getSeed(tid), conf: getConf(tid) }));

  for (const confId of confs) {
    const wcSurvivors = mappedWinners.filter(w => w.conf === confId);
    sum += wcSurvivors.length;
  }
  return sum;
}


function groupByMapLoop() {
  let sum = 0;
  const winnersByConf = new Map();
  for (let i = 0; i < winnersFlat.length; i++) {
    const tid = winnersFlat[i];
    const cid = getConf(tid);
    let confList = winnersByConf.get(cid);
    if (confList === undefined) {
      confList = [];
      winnersByConf.set(cid, confList);
    }
    confList.push({ teamId: tid, seed: getSeed(tid), conf: cid });
  }

  for (const confId of confs) {
    const survivors = winnersByConf.get(confId);
    if (survivors !== undefined) {
       sum += survivors.length;
    }
  }
  return sum;
}


const ITERATIONS = 100000;

let startOld = performance.now();
for (let i = 0; i < ITERATIONS; i++) oldWay();
let endOld = performance.now();

let startNew4 = performance.now();
for (let i = 0; i < ITERATIONS; i++) onePassFilter();
let endNew4 = performance.now();

let startGroupMapLoop = performance.now();
for (let i = 0; i < ITERATIONS; i++) groupByMapLoop();
let endGroupMapLoop = performance.now();

console.log(`Baseline: ${endOld - startOld} ms`);
console.log(`Optimized (map once, filter N): ${endNew4 - startNew4} ms`);
console.log(`Optimized (groupBy Map loop): ${endGroupMapLoop - startGroupMapLoop} ms`);
