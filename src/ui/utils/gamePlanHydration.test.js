import { describe, expect, it } from 'vitest';
import { resolveGamePlanForLeague } from './gamePlanHydration.js';

describe('resolveGamePlanForLeague', () => {
  it('preserves persisted special-teams and blitz values without scoped storage', () => {
    const resolved = resolveGamePlanForLeague({
      persistedPlan: {
        kickReturn: 'aggressive', puntReturn: 'fair_catch', coverage: 'protect_lead', blitzFrequency: 42,
      },
    });
    expect(resolved).toMatchObject({
      kickReturn: 'aggressive', puntReturn: 'fair_catch', coverage: 'protect_lead', blitzFrequency: 42,
    });
  });

  it('prefers scoped values over persisted save values', () => {
    const resolved = resolveGamePlanForLeague({
      scopedPlan: { kickReturn: 'aggressive', coverage: 'protect_lead' },
      persistedPlan: { kickReturn: 'balanced', coverage: 'balanced' },
    });
    expect(resolved).toMatchObject({ kickReturn: 'aggressive', coverage: 'protect_lead' });
  });

  it('falls through field-by-field instead of treating scoped storage as all-or-nothing', () => {
    const resolved = resolveGamePlanForLeague({
      scopedPlan: { runPassBalance: 65 },
      persistedPlan: { kickReturn: 'aggressive', coverage: 'pin_deep' },
    });
    expect(resolved).toMatchObject({ runPassBalance: 65, kickReturn: 'aggressive', coverage: 'pin_deep' });
  });

  it('uses defaults only when scoped, persisted, and model values are absent', () => {
    expect(resolveGamePlanForLeague()).toMatchObject({
      kickReturn: 'balanced', puntReturn: 'balanced', coverage: 'balanced', blitzFrequency: 30,
    });
  });

  it('preserves deliberate zero and 100 while clamping invalid persisted values', () => {
    expect(resolveGamePlanForLeague({ persistedPlan: { blitzFrequency: 0 } }).blitzFrequency).toBe(0);
    expect(resolveGamePlanForLeague({ persistedPlan: { blitzFrequency: 100 } }).blitzFrequency).toBe(100);
    expect(resolveGamePlanForLeague({ persistedPlan: { blitzFrequency: 140 } }).blitzFrequency).toBe(100);
    expect(resolveGamePlanForLeague({ persistedPlan: { blitzFrequency: -12 } }).blitzFrequency).toBe(0);
    expect(resolveGamePlanForLeague({ persistedPlan: { blitzFrequency: 'invalid' } }).blitzFrequency).toBe(30);
  });
});
