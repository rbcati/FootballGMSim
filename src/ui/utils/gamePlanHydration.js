const GAME_PLAN_DEFAULTS = Object.freeze({
  runPassBalance: 50,
  aggressionLevel: 50,
  deepShortBalance: 50,
  blitzFrequency: 30,
  kickReturn: 'balanced',
  puntReturn: 'balanced',
  coverage: 'balanced',
});

export function resolveGamePlanForLeague({ scopedPlan, persistedPlan, modelSummary } = {}) {
  const scoped = scopedPlan && typeof scopedPlan === 'object' ? scopedPlan : {};
  const persisted = persistedPlan && typeof persistedPlan === 'object' ? persistedPlan : {};
  const model = modelSummary && typeof modelSummary === 'object' ? modelSummary : {};
  const resolve = (field) => scoped[field] ?? persisted[field] ?? model[field] ?? GAME_PLAN_DEFAULTS[field];

  return {
    runPassBalance: resolve('runPassBalance'),
    aggressionLevel: resolve('aggressionLevel'),
    deepShortBalance: resolve('deepShortBalance'),
    blitzFrequency: resolve('blitzFrequency'),
    kickReturn: resolve('kickReturn'),
    puntReturn: resolve('puntReturn'),
    coverage: resolve('coverage'),
  };
}
