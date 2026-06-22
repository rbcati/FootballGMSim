import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import JobSecurityCard from './JobSecurityCard.jsx';

function makeOwnerProfile(overrides = {}) {
  return {
    mandate: 'MAKE_PLAYOFFS',
    hotSeatRating: 25,
    seasonsUnderGoal: 0,
    ...overrides,
  };
}

describe('JobSecurityCard', () => {
  it('renders mandate label', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ mandate: 'WIN_DIVISION' })} />,
    );
    expect(html).toContain('Win the Division');
  });

  it('renders mandate label for MAKE_PLAYOFFS', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ mandate: 'MAKE_PLAYOFFS' })} />,
    );
    expect(html).toContain('Make the Playoffs');
  });

  it('renders DEVELOP_YOUNG_CORE label', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ mandate: 'DEVELOP_YOUNG_CORE' })} />,
    );
    expect(html).toContain('Develop Young Core');
  });

  it('renders REDUCE_PAYROLL label', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ mandate: 'REDUCE_PAYROLL' })} />,
    );
    expect(html).toContain('Reduce Payroll');
  });

  it('renders secure status for low hot-seat rating', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ hotSeatRating: 20 })} />,
    );
    expect(html).toContain('Secure');
    expect(html).toContain('data-testid="hot-seat-status-label"');
  });

  it('renders unstable status for mid hot-seat rating', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ hotSeatRating: 65 })} />,
    );
    expect(html).toContain('Unstable');
  });

  it('renders high-risk status for high hot-seat rating', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ hotSeatRating: 85 })} />,
    );
    expect(html).toContain('Hot Seat');
    expect(html).toContain('High Risk');
  });

  it('renders progress bar with correct aria attributes', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ hotSeatRating: 50 })} />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it('shows seasons under goal when > 0', () => {
    const html = renderToString(
      <JobSecurityCard ownerProfile={makeOwnerProfile({ hotSeatRating: 60, seasonsUnderGoal: 2 })} />,
    );
    expect(html).toContain('2 seasons under goal');
  });

  it('returns null for null ownerProfile', () => {
    const html = renderToString(<JobSecurityCard ownerProfile={null} />);
    expect(html).toBe('');
  });

  it('returns null for ownerProfile without mandate', () => {
    const html = renderToString(<JobSecurityCard ownerProfile={{ hotSeatRating: 25 }} />);
    expect(html).toBe('');
  });
});

// ── TradeCenter hint rendering ────────────────────────────────────────────────

import TradeCenter from './TradeCenter.jsx';

const baseLeague = {
  phase: 'regular',
  week: 5,
  userTeamId: 0,
  teams: [
    {
      id: 0,
      name: 'My Team',
      abbr: 'MY',
      wins: 4,
      losses: 3,
      ties: 0,
      capRoom: 20,
      capUsed: 200_000_000,
      capTotal: 255_000_000,
      ovr: 78,
      roster: [],
      picks: [],
      frontOffice: { persona: 'WIN_NOW' },
      owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 30, seasonsUnderGoal: 0 },
    },
    {
      id: 1,
      name: 'High Pressure Team',
      abbr: 'HPT',
      wins: 2,
      losses: 5,
      ties: 0,
      capRoom: 5,
      capUsed: 240_000_000,
      capTotal: 255_000_000,
      ovr: 70,
      roster: [],
      picks: [],
      frontOffice: { persona: 'PATIENT_BUILDER' },
      owner: { mandate: 'WIN_DIVISION', hotSeatRating: 85, seasonsUnderGoal: 3 },
    },
    {
      id: 2,
      name: 'Stable Team',
      abbr: 'STB',
      wins: 6,
      losses: 1,
      ties: 0,
      capRoom: 30,
      capUsed: 150_000_000,
      capTotal: 255_000_000,
      ovr: 88,
      roster: [],
      picks: [],
      frontOffice: { persona: 'WIN_NOW' },
      owner: { mandate: 'WIN_DIVISION', hotSeatRating: 20, seasonsUnderGoal: 0 },
    },
  ],
  schedule: { weeks: [] },
  tradeOffers: [],
  incomingTradeOffers: [],
  inboundTradeOffers: [],
  tradeDeadline: null,
  settings: {},
};

describe('TradeCenter opponent pressure hint', () => {
  it('renders high-pressure hint for high-risk opponent', () => {
    const html = renderToString(
      <TradeCenter
        league={baseLeague}
        actions={{}}
        onNavigate={() => {}}
        initialTradeContext={{ partnerTeamId: 1 }}
      />,
    );
    expect(html).toContain('data-testid="trade-opponent-pressure-hint"');
    expect(html).toContain('Front Office Pressure: High');
  });

  it('does not render hint for secure-status opponent', () => {
    const html = renderToString(
      <TradeCenter
        league={baseLeague}
        actions={{}}
        onNavigate={() => {}}
        initialTradeContext={{ partnerTeamId: 2 }}
      />,
    );
    expect(html).not.toContain('Front Office Pressure: High');
  });
});

// ── Franchise terminated state ────────────────────────────────────────────────

import FranchiseHQ from './FranchiseHQ.jsx';

const baseFranchiseLeague = {
  year: 2026,
  season: 3,
  week: 1,
  phase: 'regular',
  userTeamId: 0,
  teams: [
    {
      id: 0,
      name: 'My Team',
      abbr: 'MY',
      conf: 0,
      div: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      ovr: 75,
      capRoom: 20,
      capUsed: 200_000_000,
      capTotal: 255_000_000,
      roster: [],
      picks: [],
      fanApproval: 50,
      franchiseInvestments: {},
      frontOffice: { persona: 'MAKE_PLAYOFFS' },
      owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 30, seasonsUnderGoal: 0 },
      ringOfHonor: [],
      allTimeLeaders: {},
      retiredNumbers: [],
      championshipYears: [],
    },
  ],
  schedule: { weeks: [] },
  userOwnerPressure: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 30, seasonsUnderGoal: 0, status: 'secure' },
  userFranchiseTerminated: false,
  newsItems: [],
  ownerGoals: [],
  tradeOffers: [],
  incomingTradeOffers: [],
  inboundTradeOffers: [],
  tradeDeadline: null,
  settings: {},
  weeklyHeadlines: [],
};

describe('FranchiseHQ terminated user state', () => {
  it('renders terminated notice when userFranchiseTerminated is true', () => {
    const terminatedLeague = { ...baseFranchiseLeague, userFranchiseTerminated: true };
    const html = renderToString(
      <FranchiseHQ
        league={terminatedLeague}
        lastResults={[]}
        onNavigate={() => {}}
        onAdvanceWeek={() => {}}
        actions={{}}
      />,
    );
    expect(html).toContain('data-testid="franchise-terminated-notice"');
    expect(html).toContain('Franchise Dismissed');
  });

  it('does not render terminated notice when flag is false', () => {
    const html = renderToString(
      <FranchiseHQ
        league={baseFranchiseLeague}
        lastResults={[]}
        onNavigate={() => {}}
        onAdvanceWeek={() => {}}
        actions={{}}
      />,
    );
    expect(html).not.toContain('data-testid="franchise-terminated-notice"');
  });

  it('JobSecurityCard renders in HQ when userOwnerPressure is provided', () => {
    const html = renderToString(
      <FranchiseHQ
        league={baseFranchiseLeague}
        lastResults={[]}
        onNavigate={() => {}}
        onAdvanceWeek={() => {}}
        actions={{}}
      />,
    );
    expect(html).toContain('data-testid="job-security-card"');
    expect(html).toContain('Make the Playoffs');
  });
});
