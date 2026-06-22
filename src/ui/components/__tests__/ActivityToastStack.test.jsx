/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import ActivityToastStack from '../ActivityToastStack.jsx';

describe('ActivityToastStack (compact activity strip)', () => {
  afterEach(() => cleanup());

  it('renders roster and simulation messages in a single compact stack', () => {
    render(
      <ActivityToastStack
        messages={[
          { id: 'sim', text: 'Simulating week — resolving games…', tone: 'info' },
          { id: 'inj', text: '2 players on the injury report', tone: 'warning' },
          { id: 'lineup', text: 'Lineup is valid. Opening depth chart.', tone: 'ok' },
        ]}
      />,
    );

    const stack = screen.getByTestId('activity-toast-stack');
    const toasts = within(stack).getAllByTestId('activity-toast');
    expect(toasts).toHaveLength(3);
    expect(stack.textContent).toMatch(/Simulating week/);
    expect(stack.textContent).toMatch(/injury report/);
    expect(stack.textContent).toMatch(/Lineup is valid/);
  });

  it('renders nothing when there are no messages', () => {
    const { container } = render(<ActivityToastStack messages={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('activity-toast-stack')).toBeNull();
  });

  it('ignores blank/invalid messages and caps the number shown', () => {
    render(
      <ActivityToastStack
        max={2}
        messages={[
          null,
          { id: 'a', text: '   ' },
          { id: 'b', text: 'First' },
          { id: 'c', text: 'Second' },
          { id: 'd', text: 'Third' },
        ]}
      />,
    );
    const toasts = screen.getAllByTestId('activity-toast');
    expect(toasts).toHaveLength(2);
    const stack = screen.getByTestId('activity-toast-stack');
    expect(stack.textContent).toMatch(/Second/);
    expect(stack.textContent).toMatch(/Third/);
    expect(stack.textContent).not.toMatch(/First/);
  });
});
