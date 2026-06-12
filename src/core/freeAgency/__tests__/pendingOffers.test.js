import { describe, expect, it } from 'vitest';
import {
  PENDING_OFFER_STATUS,
  WEAK_OFFER_REJECT_DAYS,
  MAX_OFFER_PENDING_DAYS,
  ensurePendingOffersList,
  ensurePendingOffersMeta,
  computeOfferFinancials,
  createPendingOffer,
  upsertPendingOffer,
  computeReservedPendingCap,
  computeEffectiveCapRoom,
  validateOfferAgainstReservedCap,
  buildOfferFeedback,
  agePendingOffers,
  markOfferResolved,
  reconcilePendingOffers,
  expireAllPendingOffers,
  prunePendingOffers,
} from '../pendingOffers.js';

const CONTRACT = { baseAnnual: 10, yearsTotal: 3, signingBonus: 6 };
const DEMAND = { baseAnnual: 10, yearsTotal: 3, signingBonus: 6 };

function makeOffer(overrides = {}) {
  return createPendingOffer({
    playerId: 21,
    playerName: 'Test FA',
    pos: 'WR',
    ovr: 80,
    teamId: 5,
    teamName: 'Testers',
    contract: CONTRACT,
    day: 1,
    demandSnapshot: DEMAND,
    createdAt: 1000,
    ...overrides,
  });
}

describe('pending offer creation', () => {
  it('creates a pending record with derived financials', () => {
    const offer = makeOffer();
    expect(offer.status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(offer.playerId).toBe(21);
    expect(offer.teamId).toBe(5);
    expect(offer.years).toBe(3);
    expect(offer.signingBonus).toBe(6);
    expect(offer.annualCapHit).toBe(12); // 10 + 6/3
    expect(offer.totalValue).toBe(36);   // 10*3 + 6
    expect(offer.daySubmitted).toBe(1);
    expect(offer.daysPending).toBe(0);
    expect(offer.playerDemandSnapshot).toEqual(DEMAND);
    expect(offer.id).toContain('fa-offer-21-5');
  });

  it('computeOfferFinancials handles 1-year defaults', () => {
    expect(computeOfferFinancials({ baseAnnual: 4 })).toEqual({
      years: 1, baseAnnual: 4, signingBonus: 0, annualCapHit: 4, totalValue: 4,
    });
  });
});

describe('duplicate offer prevention', () => {
  it('replaces an existing pending offer from the same team for the same player', () => {
    const first = makeOffer();
    const second = makeOffer({ contract: { baseAnnual: 14, yearsTotal: 2, signingBonus: 0 }, createdAt: 2000 });
    const afterFirst = upsertPendingOffer([], first);
    expect(afterFirst.replaced).toBe(false);
    const afterSecond = upsertPendingOffer(afterFirst.list, second);
    expect(afterSecond.replaced).toBe(true);
    const pending = afterSecond.list.filter((row) => row.status === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].annualCapHit).toBe(14);
  });

  it('keeps resolved history rows when a new offer is submitted', () => {
    const rejected = { ...makeOffer(), status: PENDING_OFFER_STATUS.REJECTED };
    const fresh = makeOffer({ createdAt: 2000 });
    const { list } = upsertPendingOffer([rejected], fresh);
    expect(list).toHaveLength(2);
    expect(list.filter((row) => row.status === 'pending')).toHaveLength(1);
  });
});

describe('cap reservation math', () => {
  it('reserves the first-year cap hit of every pending offer for the team', () => {
    const a = makeOffer(); // cap hit 12
    const b = makeOffer({ playerId: 22, contract: { baseAnnual: 5, yearsTotal: 2, signingBonus: 2 } }); // 6
    const other = makeOffer({ playerId: 23, teamId: 9 });
    const ledger = [a, b, other];
    expect(computeReservedPendingCap(ledger, 5)).toBe(18);
    expect(computeEffectiveCapRoom(40, ledger, 5)).toBe(22);
  });

  it('releases the reservation when an offer resolves', () => {
    const a = makeOffer();
    const b = makeOffer({ playerId: 22, contract: { baseAnnual: 5, yearsTotal: 2, signingBonus: 2 } });
    let ledger = [a, b];
    ledger = markOfferResolved(ledger, { playerId: 22, teamId: 5, status: PENDING_OFFER_STATUS.REJECTED, day: 2 });
    expect(computeReservedPendingCap(ledger, 5)).toBe(12);
    ledger = markOfferResolved(ledger, { playerId: 21, teamId: 5, status: PENDING_OFFER_STATUS.EXPIRED, day: 3 });
    expect(computeReservedPendingCap(ledger, 5)).toBe(0);
  });

  it('does not double-count a replaced offer for the same player', () => {
    const ledger = [makeOffer()];
    const check = validateOfferAgainstReservedCap({
      capRoom: 13, annualCapHit: 13, pendingOffers: ledger, teamId: 5, playerId: 21,
    });
    expect(check.ok).toBe(true); // existing 12M reservation excluded for same player
    expect(check.reserved).toBe(0);
  });

  it('blocks an offer that exceeds effective cap room', () => {
    const ledger = [makeOffer()]; // reserves 12 of 20
    const check = validateOfferAgainstReservedCap({
      capRoom: 20, annualCapHit: 10, pendingOffers: ledger, teamId: 5, playerId: 99,
    });
    expect(check.ok).toBe(false);
    expect(check.effectiveCapRoom).toBe(8);
    expect(check.message).toContain('Withdraw a pending offer');
  });

  it('blocks an offer larger than total cap room outright', () => {
    const check = validateOfferAgainstReservedCap({ capRoom: 5, annualCapHit: 9, pendingOffers: [], teamId: 5 });
    expect(check.ok).toBe(false);
    expect(check.message).toContain('Not enough cap room');
  });
});

describe('daily resolution (reconcile)', () => {
  const signedPlayer = (teamId) => ({ id: 21, teamId, status: 'active', offers: [] });

  it('marks the offer accepted when the player signed with the offering team', () => {
    const { list, accepted } = reconcilePendingOffers({
      pendingOffers: [makeOffer()],
      resolvePlayer: () => signedPlayer(5),
      day: 2,
    });
    expect(accepted).toHaveLength(1);
    expect(list[0].status).toBe(PENDING_OFFER_STATUS.ACCEPTED);
    expect(list[0].feedback[0]).toContain('Accepted');
    expect(list[0].resolvedDay).toBe(2);
  });

  it('marks the offer rejected when the player signed elsewhere', () => {
    const { list, rejected } = reconcilePendingOffers({
      pendingOffers: [makeOffer()],
      resolvePlayer: () => signedPlayer(9),
      resolveTeamName: () => 'Rivals',
      day: 2,
    });
    expect(rejected).toHaveLength(1);
    expect(list[0].status).toBe(PENDING_OFFER_STATUS.REJECTED);
    expect(list[0].feedback[0]).toContain('Rivals');
  });

  it('rejects a clearly-below-demand offer after the short review window and removes the bid', () => {
    const weak = makeOffer({ contract: { baseAnnual: 4, yearsTotal: 2, signingBonus: 0 } }); // 8 vs ask 36
    weak.daysPending = WEAK_OFFER_REJECT_DAYS;
    const player = { id: 21, teamId: null, status: 'free_agent', offers: [{ teamId: 5 }] };
    const { list, rejected, offerRemovals } = reconcilePendingOffers({
      pendingOffers: [weak],
      resolvePlayer: () => player,
      day: 3,
    });
    expect(rejected).toHaveLength(1);
    expect(list[0].status).toBe(PENDING_OFFER_STATUS.REJECTED);
    expect(offerRemovals).toEqual([{ playerId: 21, teamId: 5 }]);
  });

  it('expires a fair offer that stays pending past the max window', () => {
    const stale = makeOffer();
    stale.daysPending = MAX_OFFER_PENDING_DAYS;
    const player = { id: 21, teamId: null, status: 'free_agent', offers: [{ teamId: 5 }] };
    const { list, expired, offerRemovals } = reconcilePendingOffers({
      pendingOffers: [stale],
      resolvePlayer: () => player,
      day: 5,
    });
    expect(expired).toHaveLength(1);
    expect(list[0].status).toBe(PENDING_OFFER_STATUS.EXPIRED);
    expect(offerRemovals).toHaveLength(1);
  });

  it('rejects when the bid was dropped from the player offer list (cap room disappeared)', () => {
    const player = { id: 21, teamId: null, status: 'free_agent', offers: [] };
    const { list, rejected } = reconcilePendingOffers({
      pendingOffers: [makeOffer()],
      resolvePlayer: () => player,
      day: 2,
    });
    expect(rejected).toHaveLength(1);
    expect(list[0].feedback[0]).toContain('cap room');
  });

  it('keeps a competitive offer pending and refreshes competing teams', () => {
    const fair = makeOffer();
    fair.daysPending = 1;
    const player = { id: 21, teamId: null, status: 'free_agent', offers: [{ teamId: 5 }, { teamId: 8 }, { teamId: 12 }] };
    const { list, accepted, rejected, expired } = reconcilePendingOffers({
      pendingOffers: [fair],
      resolvePlayer: () => player,
      day: 2,
    });
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(0);
    expect(expired).toHaveLength(0);
    expect(list[0].status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(list[0].competingTeamIds).toEqual([8, 12]);
  });

  it('ages pending offers by one day and leaves resolved rows alone', () => {
    const pending = makeOffer();
    const done = { ...makeOffer({ playerId: 22 }), status: PENDING_OFFER_STATUS.ACCEPTED, daysPending: 1 };
    const aged = agePendingOffers([pending, done]);
    expect(aged[0].daysPending).toBe(1);
    expect(aged[1].daysPending).toBe(1);
  });

  it('expires every remaining pending offer when the market closes', () => {
    const { list, expired } = expireAllPendingOffers([makeOffer(), makeOffer({ playerId: 22 })], { day: 6 });
    expect(expired).toHaveLength(2);
    expect(list.every((row) => row.status === PENDING_OFFER_STATUS.EXPIRED)).toBe(true);
  });
});

describe('save/load migration', () => {
  it('migrates saves without pendingOffers to an empty array', () => {
    expect(ensurePendingOffersMeta({}).pendingOffers).toEqual([]);
    expect(ensurePendingOffersMeta({ pendingOffers: null }).pendingOffers).toEqual([]);
    expect(ensurePendingOffersMeta({ pendingOffers: 'junk' }).pendingOffers).toEqual([]);
  });

  it('preserves an existing ledger untouched', () => {
    const ledger = [makeOffer()];
    const meta = { pendingOffers: ledger };
    expect(ensurePendingOffersMeta(meta)).toBe(meta);
    expect(ensurePendingOffersMeta(meta).pendingOffers).toBe(ledger);
  });

  it('drops malformed rows when normalizing a list', () => {
    expect(ensurePendingOffersList([null, undefined, makeOffer()])).toHaveLength(1);
    expect(ensurePendingOffersList(undefined)).toEqual([]);
  });

  it('prunes old resolved rows but never pending ones', () => {
    const old = { ...makeOffer(), status: PENDING_OFFER_STATUS.REJECTED, resolvedDay: -20 };
    const pending = makeOffer({ playerId: 22 });
    const pruned = prunePendingOffers([old, pending], { day: 5 });
    expect(pruned).toHaveLength(1);
    expect(pruned[0].playerId).toBe(22);
  });
});

describe('offer feedback', () => {
  it('is deterministic for identical inputs', () => {
    const input = { contract: CONTRACT, demand: DEMAND, playerAge: 27, competingOfferCount: 2, capRoomAfter: 4 };
    expect(buildOfferFeedback(input)).toEqual(buildOfferFeedback(input));
  });

  it('praises an offer that meets demand', () => {
    const fb = buildOfferFeedback({ contract: CONTRACT, demand: DEMAND, playerAge: 27 });
    expect(fb.verdict).toBe('strong');
    expect(fb.feedback[0]).toContain('Strong offer');
  });

  it('flags low annual value on a lowball offer', () => {
    const fb = buildOfferFeedback({
      contract: { baseAnnual: 4, yearsTotal: 2, signingBonus: 0 },
      demand: DEMAND,
      playerAge: 27,
    });
    expect(fb.verdict).toBe('weak');
    expect(fb.feedback[0]).toContain('Low annual value');
  });

  it('flags a term mismatch for veterans asked to sign long deals', () => {
    const fb = buildOfferFeedback({
      contract: { baseAnnual: 12, yearsTotal: 5, signingBonus: 6 },
      demand: { baseAnnual: 10, yearsTotal: 2, signingBonus: 2 },
      playerAge: 32,
    });
    expect(fb.feedback.join(' ')).toContain('veteran prefers shorter commitment');
  });

  it('warns about cap risk and competing offers', () => {
    const fb = buildOfferFeedback({
      contract: CONTRACT,
      demand: DEMAND,
      playerAge: 27,
      competingOfferCount: 3,
      capRoomAfter: -2,
    });
    const text = fb.feedback.join(' ');
    expect(text).toContain('Cap risk');
    expect(text).toContain('Competing offers');
  });
});
