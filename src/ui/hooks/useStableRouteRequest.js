import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldWarnRepeatedRouteRequest } from '../utils/requestLoopGuard.js';

const inFlightRequests = new Map();
const completedRequestCache = new Map();
export function __resetStableRouteRequestCache() {
  inFlightRequests.clear();
  completedRequestCache.clear();
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
    enabled = true,
    force = false,
    clearDataOnLoad = true,
  }) => {
    if (!enabled || !requestKey || !fetcher) {
      state.loading = false;
      emit();
      return null;
    }

    if (!force && completedRequestCache.has(requestKey)) {
      state.data = completedRequestCache.get(requestKey);
      state.error = null;
      state.loading = false;
      emit();
      return state.data;
    }

    const token = activeToken + 1;
    activeToken = token;

    const existingInFlight = inFlightRequests.get(requestKey);
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
        completedRequestCache.set(requestKey, result ?? null);
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
        if (inFlightRequests.get(requestKey) === pendingRequest) {
          inFlightRequests.delete(requestKey);
        }
        if (activeToken === token) {
          state.loading = false;
          emit();
        }
      });

    inFlightRequests.set(requestKey, pendingRequest);
    return pendingRequest;
  };

  const refresh = ({ requestKey, fetcher, enabled = true, clearDataOnLoad = true }) => {
    if (!requestKey) return Promise.resolve(null);
    completedRequestCache.delete(requestKey);
    return request({ requestKey, fetcher, enabled, force: true, clearDataOnLoad });
  };

  return { request, refresh };
}

export default function useStableRouteRequest({
  requestKey,
  fetcher,
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
    enabled,
    force,
    clearDataOnLoad,
  }), [clearDataOnLoad, enabled, requestKey]);

  useEffect(() => {
    if (!enabled || !requestKey) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    startRequest(false).catch(() => {});
  }, [enabled, requestKey, startRequest]);

  const refresh = useCallback(() => {
    return controllerRef.current.refresh({
      requestKey,
      fetcher: fetcherRef.current,
      enabled,
      clearDataOnLoad,
    });
  }, [clearDataOnLoad, enabled, requestKey]);

  return { data, loading, error, refresh };
}
