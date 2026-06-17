import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { isTradeWindowOpen } from '../../core/tradeWindow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(resolve(__dirname, '../worker.js'), 'utf8');

// ── isTradeWindowOpen guard behaviour (mirrors handler logic) ─────────────────
//
// The four handlers (ACCEPT, REJECT, COUNTER, INITIATE) each call:
//   isTradeWindowOpen({ week: deadline.currentWeek, phase: deadline.phase, ... })
// These tests verify that the function they depend on behaves correctly at the
// week boundaries that matter for the deadline cutoff.

// The handlers call: isTradeWindowOpen({ week, phase, settings, commissionerMode })
// Default leagueSettings has tradeDeadlineWeek=9.
function open(week, settings = {}) {
  return isTradeWindowOpen({ week, phase: 'regular', settings });
}

describe('Task 0 — Trade handler cutoff (ACCEPT_TRADE_OFFER)', () => {
  it('ACCEPT_TRADE_OFFER locked on week 11: isTradeWindowOpen returns false', () => {
    expect(open(11)).toBe(false);
  });

  it('ACCEPT_TRADE_OFFER succeeds on week 8 (open window): isTradeWindowOpen returns true', () => {
    expect(open(8)).toBe(true);
  });

  it('ACCEPT_TRADE_OFFER succeeds on week 10 when deadline configured at 10', () => {
    expect(open(10, { tradeDeadlineWeek: 10 })).toBe(true);
  });
});

describe('Task 0 — Trade handler cutoff (COUNTER_TRADE_OFFER)', () => {
  it('COUNTER_TRADE_OFFER locked on week 11: isTradeWindowOpen returns false', () => {
    expect(open(11)).toBe(false);
  });

  it('COUNTER_TRADE_OFFER succeeds on week 8 (open window): isTradeWindowOpen returns true', () => {
    expect(open(8)).toBe(true);
  });

  it('COUNTER_TRADE_OFFER succeeds on week 10 when deadline configured at 10', () => {
    expect(open(10, { tradeDeadlineWeek: 10 })).toBe(true);
  });
});

describe('Task 0 — All four handlers locked at week 12 (regression)', () => {
  it('isTradeWindowOpen returns false on week 12 (ACCEPT locks)', () => {
    expect(open(12)).toBe(false);
  });

  it('isTradeWindowOpen returns false on week 12 (REJECT locks)', () => {
    expect(open(12)).toBe(false);
  });

  it('isTradeWindowOpen returns false on week 12 (COUNTER locks)', () => {
    expect(open(12)).toBe(false);
  });

  it('isTradeWindowOpen returns false on week 12 (INITIATE locks)', () => {
    expect(open(12)).toBe(false);
  });
});

describe('Task 0 — REMOVE_FROM_TRADE_BLOCK is exempt (succeeds on week 11)', () => {
  it('REMOVE_FROM_TRADE_BLOCK has no isTradeWindowOpen check in worker.js', () => {
    // The handler sits between REMOVE_FROM_TRADE_BLOCK and ACCEPT_TRADE_OFFER.
    // We confirm it does NOT contain the guard by checking the source region.
    const removeStart = workerSrc.indexOf('Handler: REMOVE_FROM_TRADE_BLOCK');
    const removeEnd   = workerSrc.indexOf('Handler: ACCEPT_TRADE_OFFER');
    expect(removeStart).toBeGreaterThan(0);
    expect(removeEnd).toBeGreaterThan(removeStart);
    const removeBody = workerSrc.slice(removeStart, removeEnd);
    expect(removeBody).not.toContain('isTradeWindowOpen');
  });
});

// ── Source-level guardrails ────────────────────────────────────────────────────

describe('Task 0 — Source-level: all four handlers have isTradeWindowOpen check', () => {
  it('ACCEPT_TRADE_OFFER handler contains isTradeWindowOpen', () => {
    const start = workerSrc.indexOf('Handler: ACCEPT_TRADE_OFFER');
    const end   = workerSrc.indexOf('Handler: REJECT_TRADE_OFFER');
    const body  = workerSrc.slice(start, end);
    expect(body).toContain('isTradeWindowOpen');
  });

  it('REJECT_TRADE_OFFER handler contains isTradeWindowOpen', () => {
    const start = workerSrc.indexOf('Handler: REJECT_TRADE_OFFER');
    const end   = workerSrc.indexOf('Handler: COUNTER_TRADE_OFFER');
    const body  = workerSrc.slice(start, end);
    expect(body).toContain('isTradeWindowOpen');
  });

  it('COUNTER_TRADE_OFFER handler contains isTradeWindowOpen', () => {
    const start = workerSrc.indexOf('Handler: COUNTER_TRADE_OFFER');
    // Find the next handler comment after COUNTER
    const end   = workerSrc.indexOf('// ── Handler:', workerSrc.indexOf('Handler: COUNTER_TRADE_OFFER') + 1);
    const body  = workerSrc.slice(start, end);
    expect(body).toContain('isTradeWindowOpen');
  });

  it('INITIATE_TRADE_BLOCK handler contains isTradeWindowOpen', () => {
    const start = workerSrc.indexOf('Handler: INITIATE_TRADE_BLOCK');
    const end   = workerSrc.indexOf('Handler: REMOVE_FROM_TRADE_BLOCK');
    const body  = workerSrc.slice(start, end);
    expect(body).toContain('isTradeWindowOpen');
  });
});
