import { describe, expect, it, beforeEach, vi } from 'vitest';
import { buildRouteRequestKey } from '../utils/requestLoopGuard.js';
import {
  __invalidateStableRouteRequestCache,
  __resetStableRouteRequestCache,
  createStableRouteRequestController,
} from './useStableRouteRequest.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useStableRouteRequest controller behavior', () => {
  beforeEach(() => {
    __resetStableRouteRequestCache();
  });

  it('suppresses stale player responses when route id changes rapidly', async () => {
    const snapshots = [];
    const requests = new Map();
    const fetcher = vi.fn((id) => {
      const d = deferred();
      requests.set(id, d);
      return d.promise;
    });
    const controller = createStableRouteRequestController({
      onStateChange: (state) => snapshots.push(state),
    });

    const requestA = controller.request({
      requestKey: buildRouteRequestKey('player', 1),
      fetcher: () => fetcher(1),
    });
    const requestB = controller.request({
      requestKey: buildRouteRequestKey('player', 2),
      fetcher: () => fetcher(2),
    });
    await Promise.resolve();

    requests.get(2).resolve({ player: { id: 2 } });
    await requestB;
    requests.get(1).resolve({ player: { id: 1 } });
    await requestA;

    const latest = snapshots.at(-1);
    expect(latest.data.player.id).toBe(2);
    expect(latest.error).toBeNull();
    expect(latest.loading).toBe(false);
  });

  it('prevents stale team request errors from replacing newer successes', async () => {
    const snapshots = [];
    const requests = new Map();
    const fetcher = vi.fn((id) => {
      const d = deferred();
      requests.set(id, d);
      return d.promise;
    });
    const controller = createStableRouteRequestController({
      onStateChange: (state) => snapshots.push(state),
    });

    const oldReq = controller.request({
      requestKey: buildRouteRequestKey('team', 10),
      fetcher: () => fetcher(10),
    }).catch(() => {});
    const newReq = controller.request({
      requestKey: buildRouteRequestKey('team', 20),
      fetcher: () => fetcher(20),
    });
    await Promise.resolve();

    requests.get(20).resolve({ team: { id: 20 } });
    await newReq;
    requests.get(10).reject(new Error('old failed'));
    await oldReq;

    const latest = snapshots.at(-1);
    expect(latest.data.team.id).toBe(20);
    expect(latest.error).toBeNull();
    expect(latest.loading).toBe(false);
  });

  it('dedupes same-key requests and only re-fetches on forced refresh', async () => {
    const snapshots = [];
    const requestA = deferred();
    const fetcher = vi.fn(() => requestA.promise);
    const controller = createStableRouteRequestController({
      onStateChange: (state) => snapshots.push(state),
    });

    const one = controller.request({
      requestKey: buildRouteRequestKey('game', 'g1'),
      cacheScopeKey: 'scope-a',
      fetcher,
    });
    const two = controller.request({
      requestKey: buildRouteRequestKey('game', 'g1'),
      cacheScopeKey: 'scope-a',
      fetcher,
    });

    requestA.resolve({ game: { id: 'g1' } });
    await one;
    await two;
    expect(fetcher).toHaveBeenCalledTimes(1);

    const refreshRequest = deferred();
    fetcher.mockImplementationOnce(() => refreshRequest.promise);
    const refreshPromise = controller.refresh({
      requestKey: buildRouteRequestKey('game', 'g1'),
      cacheScopeKey: 'scope-a',
      fetcher,
    });
    refreshRequest.resolve({ game: { id: 'g1', rev: 2 } });
    await refreshPromise;

    expect(fetcher).toHaveBeenCalledTimes(2);
    const latest = snapshots.at(-1);
    expect(latest.data.game.rev).toBe(2);
    expect(latest.loading).toBe(false);
  });

  it('isolates completed cache entries by scope', async () => {
    const controller = createStableRouteRequestController();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ player: { id: 1, scope: 'A' } })
      .mockResolvedValueOnce({ player: { id: 1, scope: 'B' } });

    await controller.request({
      requestKey: buildRouteRequestKey('player', 1),
      cacheScopeKey: 'scope-a',
      fetcher,
    });
    await controller.request({
      requestKey: buildRouteRequestKey('player', 1),
      cacheScopeKey: 'scope-b',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps in-flight dedupe isolated by scope', async () => {
    const controller = createStableRouteRequestController();
    const scopedA = deferred();
    const scopedB = deferred();
    const fetcher = vi.fn((scope) => (scope === 'scope-a' ? scopedA.promise : scopedB.promise));

    const reqA1 = controller.request({
      requestKey: buildRouteRequestKey('team', 5),
      cacheScopeKey: 'scope-a',
      fetcher: () => fetcher('scope-a'),
    });
    const reqA2 = controller.request({
      requestKey: buildRouteRequestKey('team', 5),
      cacheScopeKey: 'scope-a',
      fetcher: () => fetcher('scope-a'),
    });
    const reqB = controller.request({
      requestKey: buildRouteRequestKey('team', 5),
      cacheScopeKey: 'scope-b',
      fetcher: () => fetcher('scope-b'),
    });

    scopedA.resolve({ team: { id: 5, scope: 'A' } });
    scopedB.resolve({ team: { id: 5, scope: 'B' } });
    await Promise.all([reqA1, reqA2, reqB]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidates completed cache by scope when requested', async () => {
    const controller = createStableRouteRequestController();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ game: { id: 'g1', rev: 1 } })
      .mockResolvedValueOnce({ game: { id: 'g1', rev: 2 } });

    await controller.request({
      requestKey: buildRouteRequestKey('game', 'g1'),
      cacheScopeKey: 'scope-a',
      fetcher,
    });
    __invalidateStableRouteRequestCache('scope-a');
    await controller.request({
      requestKey: buildRouteRequestKey('game', 'g1'),
      cacheScopeKey: 'scope-a',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidates same-scope cache when __invalidateStableRouteRequestCache is called with matching scope", async () => {
    const controller = createStableRouteRequestController();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ player: { id: 1, ver: 1 } })
      .mockResolvedValueOnce({ player: { id: 1, ver: 2 } });

    const scope = "season:2024:week:1";

    // First request
    await controller.request({
      requestKey: buildRouteRequestKey("player", 1),
      cacheScopeKey: scope,
      fetcher,
    });

    // Invalidate the scope
    __invalidateStableRouteRequestCache(scope);

    // Second request with same key and scope
    await controller.request({
      requestKey: buildRouteRequestKey("player", 1),
      cacheScopeKey: scope,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not invalidate other scopes when __invalidateStableRouteRequestCache is called with specific scope", async () => {
    const controller = createStableRouteRequestController();
    const fetcher = vi.fn()
      .mockResolvedValue({ player: { id: 1 } });

    await controller.request({
      requestKey: buildRouteRequestKey("player", 1),
      cacheScopeKey: "scope-a",
      fetcher,
    });
    await controller.request({
      requestKey: buildRouteRequestKey("player", 1),
      cacheScopeKey: "scope-b",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);

    __invalidateStableRouteRequestCache("scope-a");

    // Request scope-a again -> should fetch
    await controller.request({
      requestKey: buildRouteRequestKey("player", 1),
      cacheScopeKey: "scope-a",
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);

    // Request scope-b again -> should NOT fetch (still cached)
    await controller.request({
      requestKey: buildRouteRequestKey("player", 1),
      cacheScopeKey: "scope-b",
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
