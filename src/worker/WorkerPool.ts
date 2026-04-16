import type { AttributesV2 } from '../types/player.ts';
import {
  simulateRichGame,
  type RichGameSummary,
  type SimPlayerRef,
} from '../core/sim/richGameSimulator.ts';

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
  homePlayers?: SimPlayerRef[];
  awayPlayers?: SimPlayerRef[];
}

export type GameSummary = RichGameSummary;

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

function runSingleGameInline(payload: Matchup): GameSummary {
  return simulateRichGame(payload);
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
