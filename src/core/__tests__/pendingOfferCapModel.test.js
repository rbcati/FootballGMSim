import { describe, expect, it } from 'vitest';
import { evaluatePendingOfferCapReservation } from '../pendingOfferCapModel.js';

const team = { id: 1, capRoom: 30, capTotal: 255, capUsed: 225 };

describe('pending offer cap reservation model', () => {
  it('returns safe zero commitment with no pending offers', () => {
    const result = evaluatePendingOfferCapReservation({ team, freeAgents: [], teamId: 1 });
    expect(result).toMatchObject({
      currentCapRoom: 30,
      pendingAnnualCommitment: 0,
      pendingOfferCount: 0,
      estimatedCapRoomAfterPending: 30,
      capReservationStatus: 'safe',
    });
  });

  it('reduces estimated cap room for one pending offer', () => {
    const result = evaluatePendingOfferCapReservation({
      team,
      teamId: 1,
      freeAgents: [{ id: 10, name: 'Starter WR', offers: [{ teamId: 1, contract: { baseAnnual: 8, yearsTotal: 3, signingBonus: 0 } }] }],
    });
    expect(result.pendingAnnualCommitment).toBe(8);
    expect(result.estimatedCapRoomAfterPending).toBe(22);
    expect(result.offerRows[0]).toMatchObject({ playerId: 10, playerName: 'Starter WR', annualValue: 8, years: 3 });
  });

  it('aggregates multiple pending annual commitments', () => {
    const result = evaluatePendingOfferCapReservation({
      team,
      teamId: 1,
      freeAgents: [
        { id: 10, name: 'QB', offers: [{ teamId: 1, contract: { baseAnnual: 12, yearsTotal: 2 } }] },
        { id: 11, name: 'CB', offers: [{ teamId: 1, contract: { baseAnnual: 6.5, yearsTotal: 1 } }] },
      ],
    });
    expect(result.pendingOfferCount).toBe(2);
    expect(result.pendingAnnualCommitment).toBe(18.5);
    expect(result.estimatedCapRoomAfterPending).toBe(11.5);
    expect(result.capReservationStatus).toBe('manageable');
  });

  it('marks overcommitted pending offers with warning and blocking reason only for obvious overage', () => {
    const result = evaluatePendingOfferCapReservation({
      team: { id: 1, capRoom: 20 },
      teamId: 1,
      freeAgents: [
        { id: 10, name: 'QB', offers: [{ teamId: 1, contract: { baseAnnual: 22, yearsTotal: 3 } }] },
        { id: 11, name: 'EDGE', offers: [{ teamId: 1, contract: { baseAnnual: 14, yearsTotal: 2 } }] },
      ],
    });
    expect(result.capReservationStatus).toBe('overcommitted');
    expect(result.warnings.join(' ')).toMatch(/exceed current cap room/i);
    expect(result.blockingReasons.length).toBe(1);
  });

  it('treats missing salary as unknown without inventing cap values', () => {
    const result = evaluatePendingOfferCapReservation({
      team,
      teamId: 1,
      freeAgents: [{ id: 10, name: 'Legacy FA', offers: [{ teamId: 1, contract: { yearsTotal: 2 } }] }],
    });
    expect(result.pendingOfferCount).toBe(1);
    expect(result.pendingAnnualCommitment).toBe(0);
    expect(result.unknownOfferCount).toBe(1);
    expect(result.offerRows[0].status).toBe('unknown');
    expect(result.warnings.join(' ')).toMatch(/missing annual salary data/i);
  });

  it('uses annual cap hit instead of total multi-year value', () => {
    const result = evaluatePendingOfferCapReservation({
      team,
      teamId: 1,
      freeAgents: [{ id: 10, name: 'Long Deal', offers: [{ teamId: 1, totalValue: 80, contract: { baseAnnual: 10, yearsTotal: 4, signingBonus: 8 } }] }],
    });
    expect(result.pendingAnnualCommitment).toBe(12);
    expect(result.estimatedCapRoomAfterPending).toBe(18);
  });

  it('handles old-save summarized UI offer shapes', () => {
    const result = evaluatePendingOfferCapReservation({
      team,
      teamId: 1,
      freeAgents: [{ id: 10, name: 'Summarized Bid', offers: { userOffered: true, userBidAnnual: 7.2, userBidYears: 2 } }],
    });
    expect(result.pendingAnnualCommitment).toBe(7.2);
    expect(result.offerRows[0]).toMatchObject({ playerName: 'Summarized Bid', years: 2 });
  });
});
