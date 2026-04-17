import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldWarnRepeatedRouteRequest } from '../utils/requestLoopGuard.js';

const inFlightRequests = new Map();
const completedRequestCache = new Map();

function buildScopedRequestKey(requestKey, cacheScopeKey) {
  const scope = cacheScopeKey == null || cacheScopeKey === '' ? 'global' : String(cacheScopeKey);
  return `${scope}::${requestKey}`;
}

export function __resetStableRouteRequestCache() {
  inFlightRequests.clear();
  completedRequestCache.clear();
}

export function __invalidateStableRouteRequestCache(cacheScopeKey = null) {
  if (cacheScopeKey == null) {
    __resetStableRouteRequestCache();
    return;
  }
  const scopePrefix = `${String(cacheScopeKey)}::`;
  for (const key of inFlightRequests.keys()) {
    if (key.startsWith(scopePrefix)) inFlightRequests.delete(key);
  }
  for (const key of completedRequestCache.keys()) {
    if (key.startsWith(scopePrefix)) completedRequestCache.delete(key);
  }
}

function normalizeError(error, fallbackMessage) {
  if (error instanceof Error) return error;
  return new Error(error?.message ?? fallbackMessage);
}

export function createStableRouteRequestController({
  warnLabel = 'RouteRequest',
  warnThreshold = 4,
  onStateChange = null,
} = {}) {
  const state = { data: null, loading: false, error: null };
  let activeToken = 0;
  let previousKey = null;
  let repeatCount = 0;

  const emit = () => {
    onStateChange?.({ ...state });
  };

  const request = async ({
    requestKey,
    fetcher,
    cacheScopeKey = 'global',
    enabled = true,
    force = false,
    clearDataOnLoad = true,
  }) => {
    if (!enabled || !requestKey || !fetcher) {
      state.loading = false;
      emit();
      return null;
    }

    const scopedRequestKey = buildScopedRequestKey(requestKey, cacheScopeKey);

    if (!force && completedRequestCache.has(scopedRequestKey)) {
      state.data = completedRequestCache.get(scopedRequestKey);
      state.error = null;
      state.loading = false;
      emit();
      return state.data;
    }

    const token = activeToken + 1;
    activeToken = token;

    const existingInFlight = inFlightRequests.get(scopedRequestKey);
    if (existingInFlight) {
      state.loading = true;
      state.error = null;
      emit();
      return existingInFlight
        .then((result) => {
          if (activeToken !== token) return result ?? null;
          state.data = result ?? null;
          state.error = null;
          emit();
          return result ?? null;
        })
        .catch((err) => {
          const normalized = normalizeError(err, 'Unable to load route data.');
          if (activeToken === token) {
            state.error = normalized;
            emit();
          }
          throw normalized;
        })
        .finally(() => {
          if (activeToken === token) {
            state.loading = false;
            emit();
          }
        });
    }

    const nextRepeatCount = previousKey === requestKey ? repeatCount + 1 : 1;
    if (
      import.meta.env.DEV
      && shouldWarnRepeatedRouteRequest({ requestKey, previousKey, repeatCount, threshold: warnThreshold })
    ) {
      console.warn(`[${warnLabel}] repeated request for key`, { requestKey, repeatCount: nextRepeatCount });
    }
    previousKey = requestKey;
    repeatCount = nextRepeatCount;

    state.loading = true;
    state.error = null;
    if (clearDataOnLoad) state.data = null;
    emit();

    const pendingRequest = Promise.resolve()
      .then(() => fetcher())
      .then((result) => {
        completedRequestCache.set(scopedRequestKey, result ?? null);
        if (activeToken !== token) return result ?? null;
        state.data = result ?? null;
        state.error = null;
        emit();
        return result ?? null;
      })
      .catch((err) => {
        const normalized = normalizeError(err, 'Unable to load route data.');
        if (activeToken === token) {
          state.error = normalized;
          emit();
        }
        throw normalized;
      })
      .finally(() => {
        if (inFlightRequests.get(scopedRequestKey) === pendingRequest) {
          inFlightRequests.delete(scopedRequestKey);
        }
        if (activeToken === token) {
          state.loading = false;
          emit();
        }
      });

    inFlightRequests.set(scopedRequestKey, pendingRequest);
    return pendingRequest;
  };

  const refresh = ({ requestKey, fetcher, cacheScopeKey = 'global', enabled = true, clearDataOnLoad = true }) => {
    if (!requestKey) return Promise.resolve(null);
    completedRequestCache.delete(buildScopedRequestKey(requestKey, cacheScopeKey));
    return request({ requestKey, fetcher, cacheScopeKey, enabled, force: true, clearDataOnLoad });
  };

  return { request, refresh };
}

export default function useStableRouteRequest({
  requestKey,
  fetcher,
  cacheScopeKey = 'global',
  enabled = true,
  warnLabel = 'RouteRequest',
  warnThreshold = 4,
  clearDataOnLoad = true,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  const controllerRef = useRef(null);

  if (!controllerRef.current) {
    controllerRef.current = createStableRouteRequestController({
      warnLabel,
      warnThreshold,
      onStateChange: ({ data: nextData, loading: nextLoading, error: nextError }) => {
        setData(nextData);
        setLoading(nextLoading);
        setError(nextError);
      },
    });
  }

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const startRequest = useCallback((force = false) => controllerRef.current.request({
    requestKey,
    fetcher: fetcherRef.current,
    cacheScopeKey,
    enabled,
    force,
    clearDataOnLoad,
  }), [cacheScopeKey, clearDataOnLoad, enabled, requestKey]);

  useEffect(() => {
    if (!enabled || !requestKey) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    startRequest(false).catch(() => {});
  }, [cacheScopeKey, enabled, requestKey, startRequest]);

  const refresh = useCallback(() => {
    return controllerRef.current.refresh({
      requestKey,
      fetcher: fetcherRef.current,
      cacheScopeKey,
      enabled,
      clearDataOnLoad,
    });
  }, [cacheScopeKey, clearDataOnLoad, enabled, requestKey]);

  return { data, loading, error, refresh };
}
