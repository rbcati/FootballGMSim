/**
 * playerMoraleUI.test.js
 *
 * Unit tests for morale-driven UI logic:
 *  - PlayerProfile morale label / defaults
 *  - Roster low-morale flag threshold
 */
import { describe, it, expect } from 'vitest';
import {
  getPlayerMoraleSummary,
  MORALE_DEFAULT,
  MORALE_LOW_THRESHOLD,
  MORALE_ALERT_THRESHOLD,
} from '../mood/playerMoraleEngine.js';

// ── PlayerProfile morale indicator logic ──────────────────────────────────────

describe('PlayerProfile — morale indicator', () => {
  it('renders correct label when morale is present', () => {
    expect(getPlayerMoraleSummary({ morale: 90 }).label).toBe('Thriving');
    expect(getPlayerMoraleSummary({ morale: 75 }).label).toBe('Settled');
    expect(getPlayerMoraleSummary({ morale: 60 }).label).toBe('Neutral');
    expect(getPlayerMoraleSummary({ morale: 45 }).label).toBe('Frustrated');
    expect(getPlayerMoraleSummary({ morale: 20 }).label).toBe('Disgruntled');
  });

  it('defaults to Settled / score 70 when morale is absent (undefined)', () => {
    const result = getPlayerMoraleSummary({ id: 1 });
    expect(result.score).toBe(MORALE_DEFAULT);
    expect(result.label).toBe('Settled');
  });

  it('defaults to Settled / score 70 when player is null-ish', () => {
    const result = getPlayerMoraleSummary(null);
    expect(result.score).toBe(MORALE_DEFAULT);
    expect(result.label).toBe('Settled');
  });

  it('defaults to Settled / score 70 when morale is null', () => {
    const result = getPlayerMoraleSummary({ morale: null });
    expect(result.score).toBe(MORALE_DEFAULT);
    expect(result.label).toBe('Settled');
  });

  it('provides topEvent reason for display when events exist', () => {
    const events = [
      {
        type: 'CONTRACT_EXTENDED',
        delta: 10,
        season: 1,
        week: 3,
        reason: 'Contract extension signed',
        source: 'contract',
        dedupeKey: 'CE-1-1-3',
      },
    ];
    const result = getPlayerMoraleSummary({ morale: 80, moraleEvents: events });
    expect(result.topEvent?.reason).toBe('Contract extension signed');
  });

  it('topEvent is null when there are no events', () => {
    expect(getPlayerMoraleSummary({ morale: 70 }).topEvent).toBeNull();
  });

  it('returns isLow=false for morale >= 40', () => {
    expect(getPlayerMoraleSummary({ morale: 40 }).isLow).toBe(false);
    expect(getPlayerMoraleSummary({ morale: 70 }).isLow).toBe(false);
  });

  it('returns isLow=true for morale < 40', () => {
    expect(getPlayerMoraleSummary({ morale: 39 }).isLow).toBe(true);
    expect(getPlayerMoraleSummary({ morale: 0 }).isLow).toBe(true);
  });
});

// ── Roster low-morale flag threshold ─────────────────────────────────────────

describe('Roster — low-morale flag', () => {
  it('flag appears for morale < 40', () => {
    const cases = [0, 10, 20, 30, 39];
    for (const m of cases) {
      expect(getPlayerMoraleSummary({ morale: m }).isLow).toBe(true);
    }
  });

  it('flag is absent for morale >= 40', () => {
    const cases = [40, 50, 60, 70, 80, 90, 100];
    for (const m of cases) {
      expect(getPlayerMoraleSummary({ morale: m }).isLow).toBe(false);
    }
  });

  it('MORALE_LOW_THRESHOLD constant is 40', () => {
    expect(MORALE_LOW_THRESHOLD).toBe(40);
  });

  it('MORALE_ALERT_THRESHOLD constant is 35', () => {
    expect(MORALE_ALERT_THRESHOLD).toBe(35);
  });

  it('boundary: morale 39 → LOW flag, morale 40 → no flag', () => {
    expect(getPlayerMoraleSummary({ morale: 39 }).isLow).toBe(true);
    expect(getPlayerMoraleSummary({ morale: 40 }).isLow).toBe(false);
  });
});
