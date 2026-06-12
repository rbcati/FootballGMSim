import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PendingOffersPanel } from './FreeAgency.jsx';

const baseOffer = {
  id: 'fa-offer-1-5-1-1000',
  playerId: 1,
  playerName: 'Pending WR',
  pos: 'WR',
  teamId: 5,
  years: 3,
  totalValue: 36,
  annualCapHit: 12,
  status: 'pending',
  feedback: ['Competitive offer — close to the player’s asking price.'],
  competingTeamIds: [8, 12],
};

const offers = [
  baseOffer,
  { ...baseOffer, id: 'o2', playerId: 2, playerName: 'Accepted QB', pos: 'QB', status: 'accepted', feedback: ['Accepted — best current offer after day advanced.'], competingTeamIds: [] },
  { ...baseOffer, id: 'o3', playerId: 3, playerName: 'Rejected RB', pos: 'RB', status: 'rejected', feedback: ['Rejected — signed with Rivals instead.'], competingTeamIds: [] },
  { ...baseOffer, id: 'o4', playerId: 4, playerName: 'Expired TE', pos: 'TE', status: 'expired', feedback: ['Expired — the negotiation window closed without a deal.'], competingTeamIds: [] },
];

const capSummary = { capRoom: 40, reservedPendingCap: 12, effectiveCapRoom: 28 };

// renderToString inserts `<!-- -->` markers between text segments; strip them
// so assertions can match user-visible strings.
const renderHtml = (node) => renderToString(node).replace(/<!-- -->/g, '');

describe('PendingOffersPanel', () => {
  it('shows each offer with its pending/accepted/rejected/expired status and feedback', () => {
    const html = renderHtml(
      <PendingOffersPanel pendingOffers={offers} capSummary={capSummary} onWithdraw={() => {}} />,
    );
    expect(html).toContain('Pending WR');
    expect(html).toContain('>Pending<');
    expect(html).toContain('Accepted QB');
    expect(html).toContain('>Accepted<');
    expect(html).toContain('Rejected RB');
    expect(html).toContain('>Rejected<');
    expect(html).toContain('Expired TE');
    expect(html).toContain('>Expired<');
    expect(html).toContain('Accepted — best current offer after day advanced.');
    expect(html).toContain('Rejected — signed with Rivals instead.');
    expect(html).toContain('2 competing teams bidding');
  });

  it('shows effective cap room net of pending reservations', () => {
    const html = renderHtml(
      <PendingOffersPanel pendingOffers={offers} capSummary={capSummary} />,
    );
    expect(html).toContain('Effective cap: $28.0M (reserved $12.0M)');
  });

  it('offers a withdraw action only for pending offers', () => {
    const html = renderHtml(
      <PendingOffersPanel pendingOffers={offers} capSummary={capSummary} onWithdraw={() => {}} />,
    );
    expect((html.match(/Withdraw/g) ?? []).length).toBe(1);
  });

  it('renders nothing when there are no offers and no reserved cap', () => {
    const html = renderHtml(
      <PendingOffersPanel pendingOffers={[]} capSummary={{ capRoom: 40, reservedPendingCap: 0, effectiveCapRoom: 40 }} />,
    );
    expect(html).toBe('');
  });
});
