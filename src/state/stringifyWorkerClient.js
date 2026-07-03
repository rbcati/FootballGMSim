// stringifyWorkerClient.js — off-main-thread JSON.stringify for large saves.
//
// Extracted from src/core/state.js. Serialization output is byte-identical
// to JSON.stringify — the worker exists only to keep the main thread
// responsive while multi-megabyte league states are serialized.
//
// The Blob worker is created lazily on first use and torn down on pagehide;
// environments without Worker/Blob/URL support fall back to synchronous
// JSON.stringify.

let _stringifyWorker = null;
let _stringifyCallbacks = {};
let _stringifyId = 0;
let _unloadHookInstalled = false;

const WORKER_CODE = `
  self.onmessage = function(e) {
    try {
      const str = JSON.stringify(e.data.obj);
      self.postMessage({ id: e.data.id, str });
    } catch (err) {
      self.postMessage({ id: e.data.id, error: err.message });
    }
  };
`;

// Terminate the worker and reject anything still in flight. Safe to call
// repeatedly; the next asyncStringify() lazily recreates the worker.
export function disposeStringifyWorker(reason = 'stringify worker disposed') {
  if (_stringifyWorker) {
    try { _stringifyWorker.terminate(); } catch (err) { /* already gone */ }
    _stringifyWorker = null;
  }
  const pending = _stringifyCallbacks;
  _stringifyCallbacks = {};
  Object.values(pending).forEach(({ reject }) => {
    try { reject(new Error(reason)); } catch (err) { /* listener gone */ }
  });
}

function installUnloadHook() {
  if (_unloadHookInstalled) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  // pagehide fires on both navigation and tab close, and unlike beforeunload
  // it does not interfere with the browser's leave-page prompt.
  window.addEventListener('pagehide', () => {
    disposeStringifyWorker('page unloading');
  });
  _unloadHookInstalled = true;
}

function ensureWorker() {
  if (_stringifyWorker) return _stringifyWorker;
  const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
  _stringifyWorker = new Worker(URL.createObjectURL(blob));
  _stringifyWorker.onmessage = function (e) {
    const { id, str, error } = e.data;
    if (_stringifyCallbacks[id]) {
      if (error) _stringifyCallbacks[id].reject(new Error(error));
      else _stringifyCallbacks[id].resolve(str);
      delete _stringifyCallbacks[id];
    }
  };
  installUnloadHook();
  return _stringifyWorker;
}

export function asyncStringify(obj) {
  if (typeof window === 'undefined' || !window.Worker || !window.Blob || !window.URL) {
    return Promise.resolve(JSON.stringify(obj));
  }

  let worker;
  try {
    worker = ensureWorker();
  } catch (err) {
    console.warn('Failed to create stringify worker, falling back to sync', err);
    return Promise.resolve(JSON.stringify(obj));
  }

  return new Promise((resolve, reject) => {
    const id = ++_stringifyId;
    _stringifyCallbacks[id] = { resolve, reject };
    try {
      worker.postMessage({ id, obj });
    } catch (err) {
      delete _stringifyCallbacks[id];
      reject(err);
    }
  });
}
