/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CapImpactSummary from './CapImpactSummary.jsx';

describe('CapImpactSummary', () => {
  afterEach(cleanup);

  it('renders current room, incoming, outgoing, and projected room', () => {
    const { getByTestId } = render(
      <CapImpactSummary currentRoom={20} incoming={5} outgoing={8} projectedRoom={23} />,
    );
    const el = getByTestId('cap-impact-summary');
    expect(el.textContent).toContain('Current cap room');
    expect(el.textContent).toContain('$20.0M');
    expect(el.textContent).toContain('Salary added');
    expect(el.textContent).toContain('-$5.0M');
    expect(el.textContent).toContain('Salary freed');
    expect(el.textContent).toContain('+$8.0M');
    expect(el.textContent).toContain('Projected cap room');
    expect(el.textContent).toContain('$23.0M');
  });

  it('computes projected room from current + outgoing - incoming when not provided', () => {
    const { getByTestId } = render(
      <CapImpactSummary currentRoom={10} incoming={6} outgoing={2} />,
    );
    // 10 + 2 - 6 = 6.0
    expect(getByTestId('cap-impact-summary').textContent).toContain('$6.0M');
  });

  it('flags an over-cap projection with an alert and warning copy', () => {
    const { getByTestId, getByRole } = render(
      <CapImpactSummary currentRoom={2} incoming={10} outgoing={0} projectedRoom={-8} />,
    );
    const el = getByTestId('cap-impact-summary');
    expect(el.getAttribute('data-over-cap')).toBe('true');
    expect(getByRole('alert').textContent).toMatch(/over the cap/i);
    expect(el.textContent).toContain('-$8.0M');
  });

  it('does not warn when projected room is comfortable', () => {
    const { getByTestId, queryByRole } = render(
      <CapImpactSummary currentRoom={40} incoming={5} outgoing={5} projectedRoom={40} />,
    );
    expect(getByTestId('cap-impact-summary').getAttribute('data-over-cap')).toBe('false');
    expect(queryByRole('alert')).toBeNull();
  });

  it('honours a custom title', () => {
    const { getByTestId } = render(
      <CapImpactSummary title="CHI cap impact" currentRoom={10} />,
    );
    expect(getByTestId('cap-impact-summary').textContent).toContain('CHI cap impact');
  });
});
