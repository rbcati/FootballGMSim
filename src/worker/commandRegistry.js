/**
 * commandRegistry.js — minimal message-type → handler dispatch for the worker.
 *
 * worker.js remains the owner of self.onmessage and its sequential message
 * queue. It consults the registry first and falls back to its legacy switch
 * for commands that have not been migrated yet.
 *
 * Handler contract (matches the existing worker handler shape):
 *   async handler(payload, id, ctx)
 * Handlers post their own replies via ctx.post, echoing the inbound `id`
 * exactly as the monolith handlers did — the registry never touches
 * requestIds or response shapes. Handler errors are NOT swallowed here; they
 * propagate to the caller so worker.js's existing catch → toUI.ERROR path
 * stays authoritative.
 */

export function createCommandRegistry() {
  const handlers = new Map();

  /** Register one handler for a message type. Duplicate registration throws. */
  function register(type, handler) {
    if (typeof type !== 'string' || type.length === 0) {
      throw new TypeError('commandRegistry.register: type must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`commandRegistry.register: handler for "${type}" must be a function`);
    }
    if (handlers.has(type)) {
      throw new Error(`commandRegistry.register: duplicate handler for "${type}"`);
    }
    handlers.set(type, handler);
  }

  /** Register a { [messageType]: handler } map in one call. */
  function registerAll(handlerMap = {}) {
    for (const [type, handler] of Object.entries(handlerMap)) register(type, handler);
  }

  function has(type) {
    return handlers.has(type);
  }

  /** Registered message types, for diagnostics and tests. */
  function registeredTypes() {
    return [...handlers.keys()];
  }

  /**
   * Dispatch one inbound worker message. Resolves to { handled: true } after
   * the handler completes, or { handled: false } when no handler is
   * registered so the caller can fall through to its own routing (the
   * "unhandled command" result — dispatch itself never throws on unknown
   * types).
   */
  async function dispatch(type, payload = {}, id = null, ctx = undefined) {
    const handler = handlers.get(type);
    if (!handler) return { handled: false, type };
    await handler(payload, id, ctx);
    return { handled: true, type };
  }

  return { register, registerAll, has, registeredTypes, dispatch };
}
