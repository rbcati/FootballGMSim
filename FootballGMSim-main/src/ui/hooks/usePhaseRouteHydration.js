import { useEffect, useRef } from 'react';

const HYDRATION_TABS = new Set(['Draft', 'Standings', 'League Leaders']);

export function usePhaseRouteHydration({ activeTab, league, actions }) {
  const hydratedKeysRef = useRef(new Set());

  useEffect(() => {
    if (!HYDRATION_TABS.has(activeTab)) return;
    const phase = String(league?.phase ?? '');
    const seasonId = String(league?.seasonId ?? league?.year ?? '0');
    const key = `${activeTab}:${phase}:${seasonId}`;
    if (hydratedKeysRef.current.has(key)) return;

    let cancelled = false;
    const run = async () => {
      try {
        if (activeTab === 'Draft') {
          if (phase === 'draft' && !league?.draftStarted) {
            await actions?.startDraft?.();
          } else {
            await actions?.getDraftState?.();
          }
        } else if (activeTab === 'League Leaders') {
          await actions?.getLeagueLeaders?.('season');
        }
      } catch (_err) {
        // Route-level hydration is best-effort. Component-level fallback UI still handles errors.
      } finally {
        if (!cancelled) hydratedKeysRef.current.add(key);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, league?.phase, league?.seasonId, league?.year, league?.draftStarted, actions]);
}
