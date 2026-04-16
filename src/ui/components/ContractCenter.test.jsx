import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import ContractCenter from './ContractCenter.jsx';

const league = {
  phase: 'offseason_resign',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      name: 'User Team',
      abbr: 'USR',
      capTotal: 255,
      capUsed: 230,
      capRoom: 25,
      roster: [
        { id: 1, name: 'Core QB', pos: 'QB', age: 27, ovr: 88, schemeFit: 81, depthOrder: 1, contract: { years: 1, baseAnnual: 22, signingBonus: 10, yearsTotal: 4 }, extensionDecision: 'pending' },
        { id: 2, name: 'Slot WR', pos: 'WR', age: 25, ovr: 77, schemeFit: 72, depthOrder: 1, contract: { years: 1, baseAnnual: 8, signingBonus: 2, yearsTotal: 3 }, extensionDecision: 'deferred' },
      ],
    },
  ],
};

describe('ContractCenter re-signing mode', () => {
  it('renders dedicated re-signing management table during offseason_resign', () => {
    const html = renderToString(<ContractCenter league={league} actions={{}} onNavigate={() => {}} />);
    expect(html).toContain('Re-signing Center');
    expect(html).toContain('Projected cap room (pending)');
    expect(html).toContain('Premium positions at risk');
    expect(html).toContain('Core QB');
    expect(html).toContain('Let Walk');
    expect(html).toContain('Defer');
  });
});
