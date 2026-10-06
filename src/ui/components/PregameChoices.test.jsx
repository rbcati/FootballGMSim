/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PregameChoices from './PregameChoices.jsx';

afterEach(cleanup);
describe('guided pregame choices', () => {
  it('starts with two primary actions and preserves all existing modes behind More Options', () => {
    const onWatch = vi.fn();
    const onSimWeek = vi.fn();
    const onTendencyChange = vi.fn();
    const { container } = render(<PregameChoices tendency="BALANCED" onWatch={onWatch} onSimWeek={onSimWeek} onTendencyChange={onTendencyChange} />);
    expect(container.querySelector('details').open).toBe(false);
    expect(container.querySelectorAll('.pregame-choices > button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Watch Game/ }));
    expect(onWatch).toHaveBeenLastCalledWith('watch');
    fireEvent.click(screen.getByRole('button', { name: /^Quick Sim/ }));
    expect(onWatch).toHaveBeenLastCalledWith('instant');
    container.querySelector('details').open = true;
    for (const [name, mode] of [['Watch (Broadcast Pace)', 'watch'], ['Fast Watch (Condensed)', 'fast'], ['Sim to End (Instant Recap)', 'instant']]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(name.replace(/[()]/g, '\\$&')) }));
      expect(onWatch).toHaveBeenLastCalledWith(mode);
    }
    fireEvent.click(screen.getByRole('button', { name: /^Simulate Week/ }));
    expect(onSimWeek).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'aggressive' }));
    expect(onTendencyChange).toHaveBeenCalledWith('AGGRESSIVE');
  });
  it('disables every simulation choice while processing', () => {
    const { container } = render(<PregameChoices busy tendency="BALANCED" />);
    expect([...container.querySelectorAll('button')].every((button) => button.disabled || button.closest('fieldset').disabled)).toBe(true);
  });
});
