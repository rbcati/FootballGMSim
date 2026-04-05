import { describe, expect, it } from 'vitest';
import { evaluateCounterOffer, buildOfferSignature, shouldSkipOfferFromMemory, getPickMarketValue } from '../trade-logic.js';

describe('trade market v2.5 counter evaluation', () => {
  const aiTeam = { id: 2, abbr: 'ATL', capRoom: 24 };
  const userTeam = { id: 1, abbr: 'NYG' };

  it('accepts counter when AI value threshold is met', () => {
    const result = evaluateCounterOffer({
      aiTeam,
      userTeam,
      week: 11,
      aiDirection: 'contender',
      offerType: 'deadline_rental',
      aiReceivesValue: 1500,
      aiGivesValue: 1200,
      hasUserPickSweetener: false,
      isCounterRound: true,
    });

    expect(result.status).toBe('accepts');
  });

  it('asks for more when counter is close but missing a sweetener', () => {
    const result = evaluateCounterOffer({
      aiTeam: { ...aiTeam, capRoom: 8 },
      userTeam,
      week: 12,
      aiDirection: 'balanced',
      aiReceivesValue: 905,
      aiGivesValue: 1000,
      hasUserPickSweetener: false,
      isCounterRound: true,
    });

    expect(result.status).toBe('asks_more');
    expect(result.askHint).toBe('add_pick');
  });

  it('rejects wide-gap counter', () => {
    const result = evaluateCounterOffer({
      aiTeam,
      userTeam,
      week: 9,
      aiDirection: 'contender',
      aiReceivesValue: 350,
      aiGivesValue: 1200,
      isCounterRound: true,
    });

    expect(result.status).toBe('rejects');
  });
});

describe('trade market v2.5 offer memory', () => {
  it('dedupes near-identical offers within memory window', () => {
    const offer = {
      offeringTeamId: 2,
      offeringDirection: 'contender',
      offerType: 'depth_swap',
      offering: { playerIds: [12], pickIds: [301] },
      receiving: { playerIds: [25], pickIds: [] },
      offeringPickSnapshots: [{ season: 2027, round: 3 }],
      receivingPickSnapshots: [],
    };

    const sig = buildOfferSignature(offer);
    const shouldSkip = shouldSkipOfferFromMemory({
      offer,
      week: 8,
      memory: {
        [sig]: { lastWeek: 7, lastDirection: 'contender' },
      },
    });

    expect(shouldSkip).toBe(true);
  });

  it('allows re-engagement after deadline context shift', () => {
    const offer = {
      offeringTeamId: 2,
      offeringDirection: 'contender',
      offerType: 'depth_swap',
      offering: { playerIds: [12], pickIds: [] },
      receiving: { playerIds: [25], pickIds: [] },
      offeringPickSnapshots: [],
      receivingPickSnapshots: [],
    };

    const sig = buildOfferSignature(offer);
    const shouldSkip = shouldSkipOfferFromMemory({
      offer,
      week: 10,
      memory: {
        [sig]: { lastWeek: 9, lastDirection: 'contender' },
      },
    });

    expect(shouldSkip).toBe(false);
  });

  it('maps pick round value in descending order', () => {
    expect(getPickMarketValue({ round: 1 })).toBeGreaterThan(getPickMarketValue({ round: 3 }));
    expect(getPickMarketValue({ round: 3 })).toBeGreaterThan(getPickMarketValue({ round: 6 }));
  });
});
