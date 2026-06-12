/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CapManager from './CapManager.jsx';
import { SALARY_CAP_AMOUNT } from '../../core/constants.js';

const ROSTER_SALARY = 20; // single QB at $20M in the test fixture
const PENDING_RESERVED = 15; // two pending offers: $12.5M + $2.5M
// Expected effective cap: SALARY_CAP_AMOUNT - ROSTER_SALARY - PENDING_RESERVED
// Uses the real cap constant so a league-ceiling change produces a clear
// failure here rather than a misleading pending-cap math message.
const EXPECTED_EFFECTIVE = SALARY_CAP_AMOUNT - ROSTER_SALARY - PENDING_RESERVED;

const baseLeague = (pendingOffers) => ({
  userTeamId: 0,
  teams: [
    {
      id: 0,
      deadCap: 0,
      roster: [
        { id: 1, name: 'Cap QB', pos: 'QB', ovr: 80, age: 27, contract: { salary: ROSTER_SALARY, years: 3, guaranteed: 10 } },
      ],
    },
  ],
  pendingOffers,
});

describe('CapManager pending-offer cap display', () => {
  afterEach(cleanup);

  it('shows reserved pending cap and effective cap space, counting only pending rows', () => {
    const { container } = render(
      <CapManager
        league={baseLeague([
          { id: 'o1', status: 'pending', annualCapHit: 12.5 },
          { id: 'o2', status: 'pending', annualCapHit: 2.5 },
          // Resolved rows must not reserve cap.
          { id: 'o3', status: 'accepted', annualCapHit: 40 },
          { id: 'o4', status: 'withdrawn', annualCapHit: 40 },
        ])}
        actions={{}}
      />,
    );
    expect(container.textContent).toContain(`Pending FA offers reserve $${PENDING_RESERVED.toFixed(1)}M`);
    expect(container.textContent).toContain(`Effective cap space: $${EXPECTED_EFFECTIVE.toFixed(1)}M`);
  });

  it('hides the reserved line when no offers are pending', () => {
    const { container } = render(<CapManager league={baseLeague([])} actions={{}} />);
    expect(container.textContent).not.toContain('Pending FA offers reserve');
    expect(container.textContent).toContain('Dead Cap');
  });
});
