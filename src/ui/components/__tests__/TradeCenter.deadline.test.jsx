import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import TradeCenter from '../TradeCenter.jsx';

// ── Minimal league fixture builders ───────────────────────────────────────────

function makeTeam(id, wins, losses, { abbr, capRoom = 20, roster = [], picks = [] } = {}) {
  return {
    id,
    name: `Team ${id}`,
    abbr: abbr ?? `T${id}`,
    wins,
    losses,
    ties: 0,
    capRoom,
    picks,
    roster,
  };
}

const MOCK_ACTIONS = {
  getRoster: vi.fn(async (tid) => ({
    payload: { team: makeTeam(tid, 0, 0), players: [] },
  })),
  submitTrade: vi.fn(async () => ({ payload: { accepted: false, reason: 'test' } })),
  acceptIncomingTrade: vi.fn(async () => ({ payload: { accepted: false } })),
  counterIncomingTrade: vi.fn(async () => ({ payload: { accepted: false } })),
  toggleTradeBlock: vi.fn(async () => ({})),
  save: vi.fn(),
};

function makeLeague({ week, userWins = 0, userLosses = 0, deadlineWeek = 9, phase = 'regular' } = {}) {
  const userTeam = makeTeam(1, userWins, userLosses, { abbr: 'CHI' });
  const aiTeam   = makeTeam(2, 4, 6,                  { abbr: 'DET' });
  return {
    year: 2027,
    season: 2027,
    week,
    phase,
    userTeamId: 1,
    teams: [userTeam, aiTeam],
    incomingTradeOffers: [],
    settings: { tradeDeadlineWeek: deadlineWeek },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TradeCenter — deadline pressure badge', () => {
  it('renders without throwing in early season (no badge expected)', () => {
    const league = makeLeague({ week: 1 });
    expect(() => renderToString(
      <TradeCenter league={league} actions={MOCK_ACTIONS} />,
    )).not.toThrow();
  });

  it('renders without throwing on deadline week', () => {
    const league = makeLeague({ week: 9, userWins: 8, userLosses: 2 });
    expect(() => renderToString(
      <TradeCenter league={league} actions={MOCK_ACTIONS} />,
    )).not.toThrow();
  });

  it('deadline pressure badge is absent in early season (week 1)', () => {
    const league = makeLeague({ week: 1 });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).not.toContain('Deadline Pressure Active');
    expect(html).not.toContain('Deadline Approaching');
  });

  it('deadline pressure badge is absent after deadline is closed (week 12)', () => {
    const league = makeLeague({ week: 12 });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).not.toContain('Deadline Pressure Active');
    expect(html).not.toContain('Deadline Approaching');
  });

  it('deadline pressure badge renders on deadline week', () => {
    const league = makeLeague({ week: 9, userWins: 8, userLosses: 2 });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).toContain('Deadline Pressure Active');
  });

  it('deadline pressure badge renders in approaching window (2 weeks out)', () => {
    const league = makeLeague({ week: 7, userWins: 6, userLosses: 4 });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).toContain('Deadline Approaching');
  });

  it('badge includes user team posture label on deadline week', () => {
    // 8-2 record → contender
    const league = makeLeague({ week: 9, userWins: 8, userLosses: 2 });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).toContain('Contender');
  });

  it('badge includes partner team posture label', () => {
    // DET has 4-6 → playoff_hunt; CHI is 8-2 → contender
    const league = makeLeague({ week: 9, userWins: 8, userLosses: 2 });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    // Partner (DET, 4-6) should show Playoff Push or Middle label
    expect(html).toMatch(/Playoff Push|Middle/);
  });

  it('badge includes explanation text', () => {
    const league = makeLeague({ week: 9, userWins: 8, userLosses: 2 });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    // explanation references upgrade, deadline, or upgrades
    expect(html).toMatch(/urgently|deadline|week/i);
  });
});
