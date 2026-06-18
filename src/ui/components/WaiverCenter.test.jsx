/**
 * WaiverCenter.test.jsx — React component tests for WaiverCenter
 *
 * Uses renderToString for SSR-style testing (no jsdom required).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import WaiverCenter from './WaiverCenter.jsx';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLeague(overrides = {}) {
  return {
    waiverWindowOpen: true,
    waiverPlayers: [],
    waiverPriorityPosition: 15,
    userWaiverClaims: [],
    userTeamId: 1,
    teams: [
      { id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 },
      { id: 2, name: 'Other Team', abbr: 'OTH', capRoom: 30 },
    ],
    ...overrides,
  };
}

function makeWaiverPlayer(overrides = {}) {
  return {
    id: 10,
    name: 'Test Player',
    pos: 'WR',
    ovr: 78,
    age: 26,
    waiverContract: { baseAnnual: 5, signingBonus: 4, yearsTotal: 2, years: 2 },
    previousTeamId: 2,
    waiverWeekExpires: 12,
    ...overrides,
  };
}

function makeActions(overrides = {}) {
  return {
    submitWaiverClaim: vi.fn(),
    cancelWaiverClaim: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WaiverCenter — render conditions', () => {
  it('renders nothing when waiver window is closed and no players', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverWindowOpen: false, waiverPlayers: [] })}
        actions={makeActions()}
      />
    );
    expect(html).toBe('');
  });

  it('renders when waiver window is open', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverWindowOpen: true, waiverPlayers: [] })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Waiver Wire');
  });

  it('renders when window is closed but there are waiver players', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverWindowOpen: false, waiverPlayers: [makeWaiverPlayer()] })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Waiver Wire');
  });
});

describe('WaiverCenter — priority display', () => {
  it('displays waiver priority position when window is open', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverWindowOpen: true, waiverPriorityPosition: 8 })}
        actions={makeActions()}
      />
    );
    // React SSR may inject comment nodes between adjacent text/numbers
    expect(html).toContain('Your Waiver Priority:');
    expect(html).toMatch(/8.*\/.*32/);
  });

  it('shows open window message', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverWindowOpen: true })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Waiver window open');
  });

  it('shows closed window message', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverWindowOpen: false, waiverPlayers: [makeWaiverPlayer()] })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Waiver window is closed');
  });
});

describe('WaiverCenter — player table', () => {
  it('renders player name, pos, ovr', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverPlayers: [makeWaiverPlayer({ name: 'John Doe', pos: 'QB', ovr: 85 })] })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('John Doe');
    expect(html).toContain('QB');
    expect(html).toContain('85');
  });

  it('renders contract information', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverPlayers: [makeWaiverPlayer({
            waiverContract: { baseAnnual: 6, signingBonus: 4, yearsTotal: 2 }
          })]
        })}
        actions={makeActions()}
      />
    );
    // capHit = 6 + 4/2 = 8.0
    expect(html).toContain('$8.0M/yr');
  });

  it('renders previous team abbreviation', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverPlayers: [makeWaiverPlayer({ previousTeamId: 2 })],
          teams: [
            { id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 },
            { id: 2, name: 'Other Team', abbr: 'OTH', capRoom: 30 },
          ],
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('OTH');
  });

  it('renders waiver expiry week', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverPlayers: [makeWaiverPlayer({ waiverWeekExpires: 13 })] })}
        actions={makeActions()}
      />
    );
    // React SSR may inject comment nodes adjacent to numbers
    expect(html).toContain('Wk');
    expect(html).toContain('13');
  });

  it('shows empty state when no waiver players', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({ waiverPlayers: [] })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('No players currently on waivers');
  });
});

describe('WaiverCenter — action buttons', () => {
  it('shows Claim Player button when user can afford and has no claim', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverWindowOpen: true,
          waiverPlayers: [makeWaiverPlayer({ id: 10, waiverContract: { baseAnnual: 5, signingBonus: 0, yearsTotal: 1 } })],
          userWaiverClaims: [], // no claim
          teams: [{ id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 }], // enough cap
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Claim Player');
  });

  it('shows Insufficient cap space when user cannot afford', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverWindowOpen: true,
          waiverPlayers: [makeWaiverPlayer({ id: 10, waiverContract: { baseAnnual: 40, signingBonus: 20, yearsTotal: 1 } })],
          userWaiverClaims: [],
          teams: [{ id: 1, name: 'My Team', abbr: 'MYT', capRoom: 5 }], // not enough cap
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Insufficient cap space');
  });

  it('shows Claim Pending badge when user has an active claim', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverWindowOpen: true,
          waiverPlayers: [makeWaiverPlayer({ id: 10 })],
          userWaiverClaims: ['10'], // has claim for player 10
          teams: [{ id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 }],
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Claim Pending');
    expect(html).toContain('Cancel');
  });

  it('shows Cancel button alongside claim pending badge', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverWindowOpen: true,
          waiverPlayers: [makeWaiverPlayer({ id: 10 })],
          userWaiverClaims: ['10'],
          teams: [{ id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 }],
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Cancel');
  });
});

describe('WaiverCenter — edge cases', () => {
  it('handles null league prop gracefully', () => {
    // Should not throw
    const html = renderToString(
      <WaiverCenter league={null} actions={makeActions()} />
    );
    // With null league, waiverWindowOpen=false and waiverPlayers=[], renders nothing
    expect(html).toBe('');
  });

  it('handles player with no waiverContract', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverWindowOpen: true,
          waiverPlayers: [makeWaiverPlayer({ waiverContract: null })],
          teams: [{ id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 }],
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('No Contract');
  });

  it('handles player with unknown previous team', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverWindowOpen: true,
          waiverPlayers: [makeWaiverPlayer({ previousTeamId: null })],
          teams: [{ id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 }],
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('FA');
  });

  it('renders multiple players', () => {
    const html = renderToString(
      <WaiverCenter
        league={makeLeague({
          waiverWindowOpen: true,
          waiverPlayers: [
            makeWaiverPlayer({ id: 10, name: 'Player Alpha', pos: 'QB' }),
            makeWaiverPlayer({ id: 11, name: 'Player Beta', pos: 'RB' }),
          ],
          teams: [{ id: 1, name: 'My Team', abbr: 'MYT', capRoom: 50 }],
        })}
        actions={makeActions()}
      />
    );
    expect(html).toContain('Player Alpha');
    expect(html).toContain('Player Beta');
  });
});
