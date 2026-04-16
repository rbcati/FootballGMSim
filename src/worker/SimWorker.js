import { simulateRichGame } from '../core/sim/richGameSimulator.ts';

self.onmessage = (event) => {
  const { type, payload = {}, id } = event.data ?? {};

  if (type !== 'SIM_SINGLE_GAME') {
    self.postMessage({
      type: 'SIM_WORKER_ERROR',
      id,
      payload: { message: `Unsupported message type: ${type}` },
    });
    return;
  }

  const summary = simulateRichGame(payload);
  self.postMessage({
    type: 'SIM_SINGLE_GAME_COMPLETE',
    id,
    payload: summary,
  });
};
