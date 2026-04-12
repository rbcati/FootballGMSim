export const HQ_CARD_STATE_KEY = 'gmsim_hq_collapsed_cards_v2';

export function readHqCollapsedState(storage = globalThis?.localStorage) {
  try {
    const raw = storage?.getItem?.(HQ_CARD_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { leagueNews: true, statLeaders: true };
}

export function persistHqCollapsedState(nextState, storage = globalThis?.localStorage) {
  try {
    storage?.setItem?.(HQ_CARD_STATE_KEY, JSON.stringify(nextState));
  } catch {}
}
