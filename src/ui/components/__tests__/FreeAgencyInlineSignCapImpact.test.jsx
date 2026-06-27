/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SignInlineForm } from '../FreeAgency.jsx';

const fmt = (n) => (n < 0 ? `-$${Math.abs(n).toFixed(1)}M` : `$${n.toFixed(1)}M`);

describe('FreeAgency inline sign form — cap impact summary', () => {
  afterEach(cleanup);

  it('renders the shared cap-impact-summary with current → this contract → projected room', () => {
    const capRoom = 18;
    const { getByTestId, container } = render(
      <SignInlineForm
        player={{ id: 10, name: 'Inline FA', pos: 'WR', age: 26, ovr: 78, _ask: 6 }}
        capRoom={capRoom}
        asDiv
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

    const summary = getByTestId('cap-impact-summary');
    expect(summary).toBeTruthy();

    // The annual cap hit is the value the form's salary input already shows.
    const annualInput = container.querySelector('input[type="number"][step="0.1"]');
    const annual = parseFloat(annualInput.value);
    expect(Number.isFinite(annual)).toBe(true);

    // Without a pending-cap context the form's projected figure is currentRoom - annual.
    const projected = Math.round((capRoom - annual) * 10) / 10;

    // Current room row.
    expect(summary.textContent).toContain(fmt(capRoom));
    // "This contract (annual)" deduction row.
    expect(summary.textContent).toContain('This contract (annual)');
    expect(summary.textContent).toContain(`-${fmt(annual)}`);
    // Projected room row matches the form's own post-move figure.
    expect(summary.textContent).toContain(fmt(projected));

    // Outgoing (freed) row reads $0.0M since signing frees no salary.
    expect(summary.textContent).toContain('Salary freed');
  });
});
