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

function makeLeague({ week, userWins = 0, userLosses = 0, deadlineWeek = 9, phase = 'regular', inboundOffers = [] } = {}) {
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
    inboundTradeOffers: inboundOffers,
    settings: { tradeDeadlineWeek: deadlineWeek },
  };
}

function makeInboundOffer({ ovr = 85, targetPlayerName = 'Star WR' } = {}) {
  return {
    offerId: 'offer-test-1',
    aiTeamId: 2,
    aiTeamName: 'Team 2',
    targetPlayerName,
    targetPlayerPos: 'WR',
    targetPlayerOvr: ovr,
    offerPlayers: [{ name: 'Backup QB', pos: 'QB', ovr: 72 }],
    offerPicks: [],
    bundleValue: 8000,
    acquisitionValue: 10000,
    createdWeek: 8,
    expiresWeek: 10,
    aggression: 'normal',
    status: 'pending',
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

// ── Task A — Deadline Premium Badge on inbound offer card ──────────────────────

describe('TradeCenter — deadline premium badge on inbound offer', () => {
  const BADGE_TEXT = '+25% Deadline Demand';

  it('badge renders when player.ovr >= 82 AND week 8 (deadline window start)', () => {
    const league = makeLeague({ week: 8, inboundOffers: [makeInboundOffer({ ovr: 85 })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).toContain(BADGE_TEXT);
  });

  it('badge renders when player.ovr >= 82 AND week 10 (deadline window end)', () => {
    const league = makeLeague({ week: 10, inboundOffers: [makeInboundOffer({ ovr: 82 })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).toContain(BADGE_TEXT);
  });

  it('badge does NOT render when player.ovr < 82 on week 9', () => {
    const league = makeLeague({ week: 9, inboundOffers: [makeInboundOffer({ ovr: 81 })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).not.toContain(BADGE_TEXT);
  });

  it('badge does NOT render on week 7 (before deadline window)', () => {
    const league = makeLeague({ week: 7, inboundOffers: [makeInboundOffer({ ovr: 90 })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).not.toContain(BADGE_TEXT);
  });

  it('badge does NOT render on week 11 (post-deadline)', () => {
    const league = makeLeague({ week: 11, inboundOffers: [makeInboundOffer({ ovr: 90 })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).not.toContain(BADGE_TEXT);
  });

  it('badge appears on requested player section, not offered player section', () => {
    const league = makeLeague({ week: 9, inboundOffers: [makeInboundOffer({ ovr: 88, targetPlayerName: 'Elite WR' })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    // Badge must appear near the target player name (requested player)
    const badgeIdx = html.indexOf(BADGE_TEXT);
    const targetIdx = html.indexOf('Elite WR');
    expect(badgeIdx).toBeGreaterThan(-1);
    // Badge appears after the target player name in the DOM
    expect(Math.abs(badgeIdx - targetIdx)).toBeLessThan(300);
    // offered player name does not have badge nearby
    const offeredPlayerIdx = html.indexOf('Backup QB');
    expect(Math.abs(badgeIdx - offeredPlayerIdx)).toBeGreaterThan(100);
  });

  it('badge label text is "🔥 +25% Deadline Demand"', () => {
    const league = makeLeague({ week: 9, inboundOffers: [makeInboundOffer({ ovr: 85 })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    expect(html).toContain('🔥 +25% Deadline Demand');
  });

  it('badge uses warning color (amber, not error red or success green)', () => {
    const league = makeLeague({ week: 9, inboundOffers: [makeInboundOffer({ ovr: 85 })] });
    const html = renderToString(<TradeCenter league={league} actions={MOCK_ACTIONS} />);
    // The badge element uses the amber warning colour token (#FF9F0A / rgba(255,159,10,...))
    expect(html).toMatch(/FF9F0A|255,159,10/);
  });
});
