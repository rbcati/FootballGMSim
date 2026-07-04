/**
 * GET_FREE_AGENTS / SUBMIT_OFFER / WITHDRAW_OFFER handlers — extracted
 * behavior parity.
 *
 * Proves the migrated FA mutation path still maintains the pending-offer
 * ledger and cap reservations exactly like the monolith:
 *  - SUBMIT_OFFER records a pending ledger row + the player bid, reserves
 *    cap, replaces re-submitted offers, and rejects offers that exceed the
 *    effective cap room
 *  - WITHDRAW_OFFER resolves the row to withdrawn (releasing the
 *    reservation) and strips the bid from player.offers
 *  - GET_FREE_AGENTS returns the FREE_AGENT_DATA slice (pendingOffers,
 *    capSummary, aiOfferCountByPlayerId) with the requestId echoed
 *
 * Deeper end-to-end coverage (real league, real resolution pipeline) lives in
 * tests/integration/freeAgencyMarketV2.worker.test.js, which drives these
 * same handlers through the worker's real self.onmessage path.
 */
import { describe, expect, it } from 'vitest';
import { toUI } from '../../../../src/worker/protocol.js';
import {
  PENDING_OFFER_STATUS,
  computeReservedPendingCap,
} from '../../../../src/core/freeAgency/pendingOffers.js';
import {
  handleGetFreeAgents,
  handleSubmitOffer,
  handleWithdrawOffer,
} from '../../../../src/worker/handlers/freeAgencyHandlers.js';
import { makeFakeCache, makeCtx, makeFaMeta, makeUserTeam, makeFreeAgent } from './testContext.js';

const USER_TEAM_ID = 0;

function setup({ capRoom = 60, playerOverrides = {} } = {}) {
  const cache = makeFakeCache({
    meta: makeFaMeta({ userTeamId: USER_TEAM_ID }),
    teams: [makeUserTeam({ id: USER_TEAM_ID, capRoom })],
    players: [makeFreeAgent(playerOverrides)],
  });
  return { cache, ctx: makeCtx(cache) };
}

const CONTRACT = { baseAnnual: 10, yearsTotal: 3, signingBonus: 3 };
// Annual cap hit the monolith computed: baseAnnual + signingBonus / yearsTotal.
const CONTRACT_CAP_HIT = CONTRACT.baseAnnual + CONTRACT.signingBonus / CONTRACT.yearsTotal;

function postsOfType(ctx, type) {
  return ctx.posts.filter((p) => p.type === type);
}

describe('handleSubmitOffer', () => {
  it('records a pending ledger row, the player bid, and the cap reservation', async () => {
    const { cache, ctx } = setup();

    await handleSubmitOffer({ playerId: 101, teamId: USER_TEAM_ID, contract: CONTRACT }, 'msg_offer_1', ctx);

    // Ledger: exactly one pending row for this bid, reserving the cap hit.
    const ledger = ctx.getPendingOffersLedger();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(Number(ledger[0].playerId)).toBe(101);
    expect(Number(ledger[0].teamId)).toBe(USER_TEAM_ID);
    expect(computeReservedPendingCap(ledger, USER_TEAM_ID)).toBeCloseTo(CONTRACT_CAP_HIT, 1);

    // The operational bid lives on the player for the decision pipeline.
    const offers = cache.getPlayer(101).offers ?? [];
    expect(offers).toHaveLength(1);
    expect(Number(offers[0].teamId)).toBe(USER_TEAM_ID);
    expect(offers[0].contract).toEqual(CONTRACT);

    // Response contract: an FA broadcast (no id) then STATE_UPDATE echoing the
    // requestId with the submitted ledger row attached.
    const faPosts = postsOfType(ctx, toUI.FREE_AGENT_DATA);
    expect(faPosts).toHaveLength(1);
    expect(faPosts[0].id).toBeNull();
    const stateUpdates = postsOfType(ctx, toUI.STATE_UPDATE);
    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].id).toBe('msg_offer_1');
    expect(stateUpdates[0].payload.submittedOffer.id).toBe(ledger[0].id);
    expect(ctx.flushDirty).toHaveBeenCalled();
  });

  it('replaces a re-submitted offer for the same player instead of double-reserving', async () => {
    const { cache, ctx } = setup();
    await handleSubmitOffer({ playerId: 101, teamId: USER_TEAM_ID, contract: CONTRACT }, 'msg_offer_2', ctx);

    const replacement = { baseAnnual: 12, yearsTotal: 3, signingBonus: 3 };
    await handleSubmitOffer({ playerId: 101, teamId: USER_TEAM_ID, contract: replacement }, 'msg_offer_3', ctx);

    const pendingRows = ctx.getPendingOffersLedger().filter((r) => r.status === PENDING_OFFER_STATUS.PENDING);
    expect(pendingRows).toHaveLength(1);
    expect(computeReservedPendingCap(ctx.getPendingOffersLedger(), USER_TEAM_ID))
      .toBeCloseTo(replacement.baseAnnual + replacement.signingBonus / replacement.yearsTotal, 1);

    const userBids = (cache.getPlayer(101).offers ?? []).filter((o) => Number(o.teamId) === USER_TEAM_ID);
    expect(userBids).toHaveLength(1);
    expect(userBids[0].contract).toEqual(replacement);
  });

  it('rejects an offer that exceeds effective cap room with ERROR and no ledger change', async () => {
    const { cache, ctx } = setup({ capRoom: 5 });

    await handleSubmitOffer({ playerId: 101, teamId: USER_TEAM_ID, contract: CONTRACT }, 'msg_offer_4', ctx);

    expect(ctx.posts).toHaveLength(1);
    expect(ctx.posts[0].type).toBe(toUI.ERROR);
    expect(ctx.posts[0].id).toBe('msg_offer_4');
    expect(ctx.posts[0].payload.message).toBeTruthy();
    expect(ctx.getPendingOffersLedger()).toHaveLength(0);
    expect(cache.getPlayer(101).offers ?? []).toHaveLength(0);
  });

  it('posts ERROR when the player does not exist', async () => {
    const { ctx } = setup();
    await handleSubmitOffer({ playerId: 999, teamId: USER_TEAM_ID, contract: CONTRACT }, 'msg_offer_5', ctx);

    expect(ctx.posts).toEqual([
      { type: toUI.ERROR, payload: { message: 'Player not found' }, id: 'msg_offer_5' },
    ]);
  });

  it('posts ERROR when no team context can be resolved', async () => {
    const cache = makeFakeCache({
      meta: makeFaMeta({ userTeamId: null }),
      teams: [],
      players: [makeFreeAgent()],
    });
    const ctx = makeCtx(cache);
    await handleSubmitOffer({ playerId: 101, contract: CONTRACT }, 'msg_offer_6', ctx);

    expect(ctx.posts).toHaveLength(1);
    expect(ctx.posts[0].type).toBe(toUI.ERROR);
    expect(ctx.posts[0].id).toBe('msg_offer_6');
  });
});

describe('handleWithdrawOffer', () => {
  it('marks the row withdrawn, releases the cap reservation, and strips the bid', async () => {
    const { cache, ctx } = setup();
    await handleSubmitOffer({ playerId: 101, teamId: USER_TEAM_ID, contract: CONTRACT }, 'msg_w_1', ctx);
    expect(computeReservedPendingCap(ctx.getPendingOffersLedger(), USER_TEAM_ID)).toBeGreaterThan(0);

    await handleWithdrawOffer({ playerId: 101, teamId: USER_TEAM_ID }, 'msg_w_2', ctx);

    const ledger = ctx.getPendingOffersLedger();
    const row = ledger.find((r) => Number(r.playerId) === 101 && Number(r.teamId) === USER_TEAM_ID);
    expect(row.status).toBe(PENDING_OFFER_STATUS.WITHDRAWN);
    expect(computeReservedPendingCap(ledger, USER_TEAM_ID)).toBe(0);
    expect((cache.getPlayer(101).offers ?? []).some((o) => Number(o.teamId) === USER_TEAM_ID)).toBe(false);

    // Reply: STATE_UPDATE echoing the withdraw requestId.
    const stateUpdates = postsOfType(ctx, toUI.STATE_UPDATE);
    expect(stateUpdates.at(-1).id).toBe('msg_w_2');
  });

  it('leaves AI bids from other teams on the player untouched', async () => {
    const aiOffer = { teamId: 7, teamName: 'Rival', contract: { baseAnnual: 9, yearsTotal: 2, signingBonus: 1 }, timestamp: 1 };
    const { cache, ctx } = setup({ playerOverrides: { offers: [aiOffer] } });
    await handleSubmitOffer({ playerId: 101, teamId: USER_TEAM_ID, contract: CONTRACT }, 'msg_w_3', ctx);
    await handleWithdrawOffer({ playerId: 101, teamId: USER_TEAM_ID }, 'msg_w_4', ctx);

    const offers = cache.getPlayer(101).offers ?? [];
    expect(offers).toHaveLength(1);
    expect(Number(offers[0].teamId)).toBe(7);
  });
});

describe('handleGetFreeAgents', () => {
  it('posts FREE_AGENT_DATA with the FA slice and the requestId echoed', async () => {
    const { ctx } = setup();
    await handleGetFreeAgents({}, 'msg_fa_1', ctx);

    expect(ctx.posts).toHaveLength(1);
    const { type, payload, id } = ctx.posts[0];
    expect(type).toBe(toUI.FREE_AGENT_DATA);
    expect(id).toBe('msg_fa_1');
    expect(payload.faDay).toBe(1);
    expect(payload.faMaxDays).toBe(5);
    expect(payload.phase).toBe('free_agency');
    expect(payload.pendingOffers).toEqual([]);
    expect(payload.capSummary).toEqual({ capRoom: 60, reservedPendingCap: 0, effectiveCapRoom: 60 });

    expect(payload.freeAgents).toHaveLength(1);
    const fa = payload.freeAgents[0];
    expect(fa.id).toBe(101);
    // Response-shape parity with the monolith's FA row.
    for (const key of ['market', 'demandProfile', 'playbookKnowledge', 'reSign', 'offers']) {
      expect(fa[key], `freeAgents[0].${key}`).toBeTruthy();
    }
    expect(fa.offers.count).toBe(0);
    expect(fa.offers.userOffered).toBe(false);
  });

  it('reports pending offers, reserved cap, and AI bid counts after a submit', async () => {
    const aiOffer = { teamId: 7, teamName: 'Rival', contract: { baseAnnual: 9, yearsTotal: 2, signingBonus: 1 }, timestamp: 1 };
    const { ctx } = setup({ playerOverrides: { offers: [aiOffer] } });
    await handleSubmitOffer({ playerId: 101, teamId: USER_TEAM_ID, contract: CONTRACT }, 'msg_fa_2', ctx);
    ctx.posts.length = 0;

    await handleGetFreeAgents({}, 'msg_fa_3', ctx);
    const { payload, id } = ctx.posts[0];
    expect(id).toBe('msg_fa_3');
    expect(payload.pendingOffers).toHaveLength(1);
    expect(payload.pendingOffers[0].status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(payload.capSummary.reservedPendingCap).toBeCloseTo(CONTRACT_CAP_HIT, 1);
    expect(payload.capSummary.effectiveCapRoom).toBeCloseTo(60 - CONTRACT_CAP_HIT, 1);
    // Only the AI bid counts toward the badge; the user bid is excluded.
    expect(payload.aiOfferCountByPlayerId).toEqual({ 101: 1 });
    const fa = payload.freeAgents[0];
    expect(fa.offers.userOffered).toBe(true);
    expect(fa.offers.count).toBe(2);
  });
});
