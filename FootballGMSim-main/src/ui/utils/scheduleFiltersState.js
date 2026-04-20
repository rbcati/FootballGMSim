const KEY = 'gmsim_schedule_filters_v2';

export function getScheduleFiltersState(defaults) {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      selectedWeek: Number(parsed?.selectedWeek ?? defaults.selectedWeek),
      selectedTeamId: parsed?.selectedTeamId != null ? Number(parsed.selectedTeamId) : defaults.selectedTeamId,
    };
  } catch {
    return { ...defaults };
  }
}

export function persistScheduleFiltersState(state) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore session storage failures
  }
}
