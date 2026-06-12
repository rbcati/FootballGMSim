/**
 * Free Agency Market V2 — wiring + sequencing regression guards.
 *
 * Source-level guards in the style of src/worker/__tests__/loadPipelineRegression.test.js:
 * behavioral coverage lives in tests/integration/freeAgencyMarketV2.worker.test.js;
 * these pin the wiring and the ADVANCE_FREE_AGENCY_DAY ordering so a refactor
 * cannot silently drop or reorder them.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toWorker } from '../../src/worker/protocol.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('WITHDRAW_OFFER wiring', () => {
  it('exists in the protocol', () => {
    expect(toWorker.WITHDRAW_OFFER).toBe('WITHDRAW_OFFER');
  });

  it('is exposed by useWorker as actions.withdrawOffer', () => {
    const src = read('src/ui/hooks/useWorker.js');
    expect(src).toMatch(/withdrawOffer:\s*\(playerId,\s*teamId\)\s*=>\s*\n?\s*request\(toWorker\.WITHDRAW_OFFER/);
  });

  it('is routed to handleWithdrawOffer in the worker', () => {
    const src = read('src/worker/worker.js');
    expect(src).toContain('case toWorker.WITHDRAW_OFFER:     return await handleWithdrawOffer(payload, id);');
    expect(src).toContain('async function handleWithdrawOffer(');
  });

  it('is wired from the FreeAgency pending-offers panel to actions.withdrawOffer', () => {
    const src = read('src/ui/components/FreeAgency.jsx');
    expect(src).toContain('await actions.withdrawOffer(playerId, activeTeamId);');
    expect(src).toMatch(/<PendingOffersPanel[\s\S]{0,200}onWithdraw=/);
  });
});

describe('ADVANCE_FREE_AGENCY_DAY sequencing', () => {
  it('ages offers, rejects/expires stale bids, runs the market, then reconciles', () => {
    const src = read('src/worker/worker.js');
    const handlerStart = src.indexOf('async function handleAdvanceFreeAgencyDay(');
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = src.slice(handlerStart, src.indexOf('async function archiveSeason', handlerStart));

    const ageIdx = handler.indexOf('agePendingOffers(getPendingOffersLedger())');
    const preSyncIdx = handler.indexOf('syncPendingOfferLedger({ day, emitNotifications: true })');
    const marketIdx = handler.indexOf('AiLogic.processFreeAgencyDay(day)');
    const postSyncIdx = handler.indexOf('syncPendingOfferLedger({ day, emitNotifications: true })', marketIdx);
    const closeIdx = handler.indexOf('expireAllPendingOffers(getPendingOffersLedger()');

    // 1. age → 2. weak/stale reject-expire (pre-market sync) → 3. market acts
    // → 4. ledger reconciles outcomes → (on completion) close remaining offers.
    expect(ageIdx).toBeGreaterThan(-1);
    expect(preSyncIdx).toBeGreaterThan(ageIdx);
    expect(marketIdx).toBeGreaterThan(preSyncIdx);
    expect(postSyncIdx).toBeGreaterThan(marketIdx);
    expect(closeIdx).toBeGreaterThan(postSyncIdx);
  });

  it('the FA pool filters treat team id 0 as a signed team, not a free agent', () => {
    const workerSrc = read('src/worker/worker.js');
    const getFreeAgentsStart = workerSrc.indexOf('async function handleGetFreeAgents(');
    const getFreeAgentsBody = workerSrc.slice(getFreeAgentsStart, getFreeAgentsStart + 2000);
    // Regression: `!p.teamId` treated the default user team (id 0) as unsigned,
    // so players it signed stayed in the GET_FREE_AGENTS pool.
    expect(getFreeAgentsBody).toContain("p.teamId == null || p.status === 'free_agent'");
    expect(getFreeAgentsBody).not.toContain('!p.teamId');
  });
});
