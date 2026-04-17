import { describe, expect, it } from 'vitest';
import { buildRouteRequestKey, shouldStartRouteRequest, shouldWarnRepeatedRouteRequest } from './requestLoopGuard.js';

describe('requestLoopGuard', () => {
  it('builds stable route keys for primitive ids', () => {
    expect(buildRouteRequestKey('player', 42)).toBe('player:42');
    expect(buildRouteRequestKey('game', 'abc')).toBe('game:abc');
    expect(buildRouteRequestKey('game', null)).toBeNull();
  });

  it('dedupes in-flight and completed requests for unchanged route ids', () => {
    const requestKey = buildRouteRequestKey('player', 99);
    expect(shouldStartRouteRequest({ requestKey, inFlightKey: null, lastCompletedKey: null })).toBe(true);
    expect(shouldStartRouteRequest({ requestKey, inFlightKey: requestKey, lastCompletedKey: null })).toBe(false);
    expect(shouldStartRouteRequest({ requestKey, inFlightKey: null, lastCompletedKey: requestKey })).toBe(false);
    expect(shouldStartRouteRequest({ requestKey, inFlightKey: requestKey, lastCompletedKey: requestKey, force: true })).toBe(false);
    expect(shouldStartRouteRequest({ requestKey, inFlightKey: null, lastCompletedKey: requestKey, force: true })).toBe(true);
  });

  it('flags repeated same-id request cycles for dev diagnostics', () => {
    expect(shouldWarnRepeatedRouteRequest({ requestKey: 'game:4', previousKey: 'game:4', repeatCount: 3 })).toBe(true);
    expect(shouldWarnRepeatedRouteRequest({ requestKey: 'game:4', previousKey: 'game:5', repeatCount: 20 })).toBe(false);
  });
});
