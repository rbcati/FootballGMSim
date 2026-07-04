/**
 * Command registry dispatch — Worker Handler Registry V1.
 *
 * Proves the registry contract worker.js relies on:
 *  - registered handlers receive (payload, id, ctx) untouched
 *  - unknown commands resolve { handled: false } without throwing, so the
 *    worker can fall through to its legacy switch (and its existing
 *    unknown-command ERROR post) instead of crashing
 *  - handler errors propagate to the caller (worker.js owns the catch that
 *    posts toUI.ERROR with the original requestId)
 *  - duplicate/invalid registrations fail loudly at wiring time
 */
import { describe, expect, it, vi } from 'vitest';
import { createCommandRegistry } from '../../../src/worker/commandRegistry.js';

describe('createCommandRegistry', () => {
  it('dispatches to the registered handler with payload, id, and ctx untouched', async () => {
    const registry = createCommandRegistry();
    const handler = vi.fn(async () => {});
    registry.register('GET_ROSTER', handler);

    const payload = { teamId: 4 };
    const ctx = { cache: {}, post: () => {} };
    const result = await registry.dispatch('GET_ROSTER', payload, 'msg_42', ctx);

    expect(result).toEqual({ handled: true, type: 'GET_ROSTER' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload, 'msg_42', ctx);
    // Same object references — the registry must not clone or rewrap.
    expect(handler.mock.calls[0][0]).toBe(payload);
    expect(handler.mock.calls[0][2]).toBe(ctx);
  });

  it('resolves { handled: false } for unknown commands without throwing', async () => {
    const registry = createCommandRegistry();
    registry.register('KNOWN', vi.fn());

    await expect(registry.dispatch('TOTALLY_UNKNOWN', {}, 'msg_1', {})).resolves.toEqual({
      handled: false,
      type: 'TOTALLY_UNKNOWN',
    });
  });

  it('propagates handler errors to the caller instead of swallowing them', async () => {
    const registry = createCommandRegistry();
    registry.register('EXPLODES', async () => {
      throw new Error('boom');
    });

    await expect(registry.dispatch('EXPLODES', {}, 'msg_9', {})).rejects.toThrow('boom');
  });

  it('supports synchronous handlers (awaited transparently)', async () => {
    const registry = createCommandRegistry();
    let seen = null;
    registry.register('SYNC', (payload, id) => { seen = { payload, id }; });

    const result = await registry.dispatch('SYNC', { a: 1 }, 'msg_3');
    expect(result.handled).toBe(true);
    expect(seen).toEqual({ payload: { a: 1 }, id: 'msg_3' });
  });

  it('registerAll registers a message-type → handler map', async () => {
    const registry = createCommandRegistry();
    const a = vi.fn();
    const b = vi.fn();
    registry.registerAll({ A: a, B: b });

    expect(registry.has('A')).toBe(true);
    expect(registry.has('B')).toBe(true);
    expect(registry.registeredTypes().sort()).toEqual(['A', 'B']);

    await registry.dispatch('B', {}, null);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  it('rejects duplicate registrations for the same message type', () => {
    const registry = createCommandRegistry();
    registry.register('DUP', () => {});
    expect(() => registry.register('DUP', () => {})).toThrow(/duplicate handler/);
  });

  it('rejects invalid types and non-function handlers at registration time', () => {
    const registry = createCommandRegistry();
    expect(() => registry.register('', () => {})).toThrow(TypeError);
    expect(() => registry.register(42, () => {})).toThrow(TypeError);
    expect(() => registry.register('X', null)).toThrow(TypeError);
  });
});
