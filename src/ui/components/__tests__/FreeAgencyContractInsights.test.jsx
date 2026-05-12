import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ContractOfferInsightBlock } from '../FreeAgency.jsx';

const metaPlayer = {
  id: 1,
  name: 'Market QB',
  pos: 'QB',
  age: 27,
  ovr: 89,
  potential: 92,
  offers: {
    topOfferContractModel: {
      marketTier: 'elite starter',
      capFit: 'risky',
      riskTags: ['large cap share'],
      reasons: ['elite starter based on 89 OVR / 92 POT.'],
      suggestedAnnual: 34,
      suggestedYears: 5,
    },
  },
};

describe('FreeAgency contract insight UI', () => {
  it('renders market tier, cap fit, risk chips, and visible why copy from metadata', () => {
    const html = renderToString(<ContractOfferInsightBlock player={metaPlayer} capRoom={55} showReasons />);
    expect(html).toContain('Elite starter');
    expect(html).toContain('Risky cap fit');
    expect(html).toContain('Cap squeeze');
    expect(html).toContain('Why this deal?');
    expect(html).toContain('offer metadata');
  });

  it('renders fallback estimate without hover-only text when metadata is missing', () => {
    const html = renderToString(<ContractOfferInsightBlock player={{ id: 2, name: 'Depth LB', pos: 'LB', age: 26, ovr: 60, potential: 61 }} capRoom={20} />);
    expect(html).toContain('Replacement level');
    expect(html).toContain('model estimate for your cap');
    expect(html).toContain('Contract market read');
  });
});
