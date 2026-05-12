import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PendingCapImpactPanel, SignInlineForm } from '../FreeAgency.jsx';
import { evaluatePendingOfferCapReservation } from '../../../core/pendingOfferCapModel.js';

describe('FreeAgency pending cap impact UI', () => {
  it('shows pending cap impact totals and mobile-safe labels', () => {
    const reservation = evaluatePendingOfferCapReservation({
      team: { id: 1, capRoom: 25 },
      teamId: 1,
      freeAgents: [{ id: 10, name: 'Cap WR', offers: { userOffered: true, userBidAnnual: 8.5, userBidYears: 2 } }],
    });
    const html = renderToString(<PendingCapImpactPanel reservation={reservation} />);
    expect(html).toContain('Pending cap impact');
    expect(html).toContain('Current Room');
    expect(html).toContain('Annual Reserved');
    expect(html).toContain('After Pending');
    expect(html).toContain('$16.5M');
    expect(html).toContain('Cap WR');
  });

  it('renders warning copy when pending offers overcommit cap', () => {
    const reservation = evaluatePendingOfferCapReservation({
      team: { id: 1, capRoom: 10 },
      teamId: 1,
      freeAgents: [{ id: 10, name: 'Cap QB', offers: { userOffered: true, userBidAnnual: 16, userBidYears: 3 } }],
    });
    const html = renderToString(<PendingCapImpactPanel reservation={reservation} />);
    expect(html).toContain('Overcommitted');
    expect(html).toContain('would exceed current cap room');
  });

  it('shows honest unknown fallback for legacy pending offers', () => {
    const reservation = evaluatePendingOfferCapReservation({
      team: { id: 1, capRoom: 10 },
      teamId: 1,
      freeAgents: [{ id: 10, name: 'Legacy Bid', offers: { userOffered: true } }],
    });
    const html = renderToString(<PendingCapImpactPanel reservation={reservation} />);
    expect(html).toContain('Unknown annual');
    expect(html).toContain('missing annual salary data');
  });

  it('keeps the primary bid action visible while showing projected pending warning', () => {
    const pendingCapContext = {
      team: { id: 1, capRoom: 12 },
      teamId: 1,
      currentCapRoom: 12,
      freeAgents: [{ id: 99, name: 'Existing Bid', offers: { userOffered: true, userBidAnnual: 9, userBidYears: 1 } }],
    };
    const html = renderToString(
      <SignInlineForm
        player={{ id: 10, name: 'New Bid', pos: 'WR', age: 26, ovr: 76, _ask: 5 }}
        capRoom={12}
        pendingCapContext={pendingCapContext}
        asDiv
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(html).toContain('Cap after all pending');
    expect(html).toContain('Confirm Bid');
    expect(html).toContain('would exceed current cap room');
  });
});
