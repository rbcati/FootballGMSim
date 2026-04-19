import { describe, expect, it } from 'vitest';
import { normalizeManagement, toggleContractPlan } from './playerManagement.js';

describe('playerManagement helpers', () => {
  it('normalizes trade status fallback and plan flags', () => {
    const out = normalizeManagement({ onTradeBlock: true, contractPlan: ['trade_candidate', 'bogus'] });
    expect(out.tradeStatus).toBe('actively_shopping');
    expect(out.contractPlan).toEqual(['trade_candidate']);
  });

  it('toggles contract plan flags', () => {
    const p = { contractPlan: ['shortlist_extension'] };
    expect(toggleContractPlan(p, 'trade_candidate')).toEqual(['shortlist_extension', 'trade_candidate']);
    expect(toggleContractPlan({ contractPlan: ['trade_candidate'] }, 'trade_candidate')).toEqual([]);
  });
});
