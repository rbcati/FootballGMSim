import { describe, it, expect } from 'vitest';
import { buildAskOfferOutcome } from './tradeFinderOffers.js';

describe('buildAskOfferOutcome', () => {
  it('returns candidate and explanation when partner has tradable assets', () => {
    const outcome = buildAskOfferOutcome({
      partnerTeam: {
        abbr: 'ARI',
        capRoom: 14.2,
        roster: [
          { id: 1, name: 'A', pos: 'WR', ovr: 70, age: 24, contract: { baseAnnual: 4 }, management: { tradeStatus: 'available' } },
          { id: 2, name: 'B', pos: 'QB', ovr: 80, age: 29, contract: { baseAnnual: 28 }, management: { tradeStatus: 'available' } },
        ],
      },
      partnerIntel: { direction: 'buyers', needsNow: [{ pos: 'QB' }] },
      outgoingValue: 3000,
    });

    expect(outcome.status).toBe('ok');
    expect(outcome.incomingPlayerIds.length).toBe(1);
    expect(outcome.helperReason).toContain('ARI offers');
    expect(outcome.reasons.some((line) => line.includes('Need'))).toBe(true);
  });

  it('returns visible no-offer reason when no candidate exists', () => {
    const outcome = buildAskOfferOutcome({
      partnerTeam: {
        abbr: 'DAL',
        capRoom: 2.1,
        roster: [{ id: 4, name: 'Locked', pos: 'CB', ovr: 89, management: { tradeStatus: 'untouchable' } }],
      },
      partnerIntel: { direction: 'balanced' },
      outgoingValue: 1200,
    });

    expect(outcome.status).toBe('empty');
    expect(outcome.incomingPlayerIds).toEqual([]);
    expect(outcome.reasons.length).toBeGreaterThan(0);
  });
});
