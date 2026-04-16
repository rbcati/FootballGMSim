import { resolveMatchup, DEFAULT_NORMALIZATION_CONSTANT } from '../core/sim/matchupEngine.ts';
import type { AttributesV2 } from '../types/player.ts';

export interface Matchup {
  gameId: number | string;
  seed?: number;
  weather?: 'clear' | 'rain' | 'snow' | 'wind';
  normalizationConstant?: number;
  homeTeamId: number;
  awayTeamId: number;
  homeOffense: AttributesV2;
  awayOffense: AttributesV2;
  homeDefense: AttributesV2;
  awayDefense: AttributesV2;
}

export interface GameSummary {
  gameId: number | string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  totalPlays: number;
  homePassYards: number;
  awayPassYards: number;
  homeSuccessRate: number;
  awaySuccessRate: number;
  normalizationConstant: number;
  topReason1: string | null;
  topReason2: string | null;
}

export interface WeekSummary {
  totalGames: number;
  completedGames: number;
  results: GameSummary[];
}

type ProgressListener = (progress: { done: number; total: number; currentGameId?: Matchup['gameId'] }) => void;
type WorkerFactory = () => Worker;

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
}

function makeRng(seed = 1): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function runSingleGameInline(payload: Matchup): GameSummary {
  const rng = makeRng(payload.seed ?? 1);
  let state = {
    homeScore: 0,
    awayScore: 0,
    quarter: 1,
    clockSec: 900,
    down: 1,
    distance: 10,
    yardLine: 25,
    possession: 'home' as 'home' | 'away',
    normalizationConstant: payload.normalizationConstant ?? DEFAULT_NORMALIZATION_CONSTANT,
  };

  const totals = {
    plays: 0,
    homePlays: 0,
    awayPlays: 0,
    homePassYards: 0,
    awayPassYards: 0,
    homeSuccess: 0,
    awaySuccess: 0,
    normalizationConstant: state.normalizationConstant,
  };
  const reasonsMap = new Map<string, number>();

  while (state.quarter <= 4 && totals.plays < 180) {
    const offense = state.possession === 'home' ? payload.homeOffense : payload.awayOffense;
    const defense = state.possession === 'home' ? payload.awayDefense : payload.homeDefense;

    const result = resolveMatchup(
      offense,
      defense,
      {
        down: state.down,
        distance: state.distance,
        yardLine: state.yardLine,
        quarter: state.quarter,
        clockSec: state.clockSec,
        weather: payload.weather,
        playType: 'pass',
        normalizationConstant: state.normalizationConstant,
        fatigueFactor: totals.plays / 220,
      },
      rng,
    );

    totals.plays += 1;
    reasonsMap.set(result.reason, (reasonsMap.get(result.reason) ?? 0) + 1);

    if (state.possession === 'home') {
      totals.homePlays += 1;
      totals.homePassYards += result.yardsGained;
      totals.homeSuccess += result.success ? 1 : 0;
    } else {
      totals.awayPlays += 1;
      totals.awayPassYards += result.yardsGained;
      totals.awaySuccess += result.success ? 1 : 0;
    }

    const nextState = {
      ...state,
      clockSec: Math.max(0, state.clockSec - result.clockElapsedSec),
      down: result.nextDown,
      distance: result.nextDistance,
      yardLine: result.nextYardLine,
    };

    const points = result.nextYardLine >= 99 ? 7 : 0;
    if (state.possession === 'home') nextState.homeScore += points;
    else nextState.awayScore += points;

    if (nextState.down >= 4 && !result.success) {
      nextState.possession = state.possession === 'home' ? 'away' : 'home';
      nextState.down = 1;
      nextState.distance = 10;
      nextState.yardLine = Math.max(20, 100 - nextState.yardLine);
    }

    if (nextState.clockSec <= 0 && nextState.quarter < 4) {
      nextState.quarter += 1;
      nextState.clockSec = 900;
    }

    state = nextState;
  }

  const reasons = [...reasonsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason]) => reason)
    .slice(0, 2);

  return {
    gameId: payload.gameId,
    homeTeamId: payload.homeTeamId,
    awayTeamId: payload.awayTeamId,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    totalPlays: totals.plays,
    homePassYards: totals.homePassYards,
    awayPassYards: totals.awayPassYards,
    homeSuccessRate: totals.homePlays ? Number((totals.homeSuccess / totals.homePlays).toFixed(3)) : 0,
    awaySuccessRate: totals.awayPlays ? Number((totals.awaySuccess / totals.awayPlays).toFixed(3)) : 0,
    normalizationConstant: totals.normalizationConstant,
    topReason1: reasons[0] ?? null,
    topReason2: reasons[1] ?? null,
  };
}

export class SimulationManager {
  private readonly workerFactory?: WorkerFactory;

  private readonly poolSize: number;

  private readonly workerPool: WorkerSlot[] = [];

  private nextMessageId = 1;

  private initialized = false;

  constructor({ poolSize, workerFactory }: { poolSize?: number; workerFactory?: WorkerFactory } = {}) {
    this.poolSize = Math.max(1, poolSize ?? Math.min(8, Math.max(2, Math.floor((globalThis.navigator?.hardwareConcurrency ?? 4) / 2))));
    this.workerFactory = workerFactory;
  }

  private supportsWorkers(): boolean {
    return typeof globalThis.Worker !== 'undefined' || Boolean(this.workerFactory);
  }

  initialize(): void {
    if (this.initialized || !this.supportsWorkers()) return;

    for (let i = 0; i < this.poolSize; i += 1) {
      const worker = this.workerFactory
        ? this.workerFactory()
        : new Worker(new URL('./SimWorker.js', import.meta.url), { type: 'module' });
      this.workerPool.push({ worker, busy: false });
    }

    this.initialized = true;
  }

  dispose(): void {
    for (const slot of this.workerPool) {
      slot.worker.terminate();
    }
    this.workerPool.length = 0;
    this.initialized = false;
  }

  async simWeekParallel(matchups: Matchup[], onProgress?: ProgressListener): Promise<WeekSummary> {
    const total = matchups.length;
    if (total === 0) {
      return { totalGames: 0, completedGames: 0, results: [] };
    }

    if (!this.supportsWorkers()) {
      const results = matchups.map((matchup, index) => {
        const result = runSingleGameInline(matchup);
        onProgress?.({ done: index + 1, total, currentGameId: matchup.gameId });
        return result;
      });
      return { totalGames: total, completedGames: total, results };
    }

    this.initialize();

    const queue = [...matchups];
    const results: GameSummary[] = [];
    let done = 0;

    const runOnWorker = (slot: WorkerSlot, matchup: Matchup): Promise<void> => {
      slot.busy = true;
      const id = this.nextMessageId++;

      return new Promise((resolve, reject) => {
        const handleMessage = (event: MessageEvent) => {
          const data = event.data ?? {};
          if (data.id !== id) return;

          slot.worker.removeEventListener('message', handleMessage);
          slot.worker.removeEventListener('error', handleError);
          slot.busy = false;

          if (data.type === 'SIM_WORKER_ERROR') {
            reject(new Error(data.payload?.message ?? 'Simulation worker error'));
            return;
          }

          results.push(data.payload as GameSummary);
          done += 1;
          onProgress?.({ done, total, currentGameId: matchup.gameId });
          resolve();
        };

        const handleError = (event: ErrorEvent) => {
          slot.worker.removeEventListener('message', handleMessage);
          slot.worker.removeEventListener('error', handleError);
          slot.busy = false;
          reject(event.error ?? new Error(event.message));
        };

        slot.worker.addEventListener('message', handleMessage);
        slot.worker.addEventListener('error', handleError);
        slot.worker.postMessage({
          type: 'SIM_SINGLE_GAME',
          id,
          payload: matchup,
        });
      });
    };

    const consumeQueue = async (slot: WorkerSlot): Promise<void> => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await runOnWorker(slot, next);
      }
    };

    await Promise.all(this.workerPool.map((slot) => consumeQueue(slot)));

    return {
      totalGames: total,
      completedGames: done,
      results,
    };
  }
}

export const simulationManager = new SimulationManager();
