/** @vitest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import AdvancedGameStats from '../AdvancedGameStats.jsx';

const basePlayerTables = {
  away: [{ playerId: 12, name: 'WR Alpha', position: 'WR' }],
  home: [{ playerId: 34, name: 'CB Beta', position: 'CB' }],
};

describe('AdvancedGameStats', () => {
  afterEach(() => cleanup());
  it('renders null when advancedAttribution is missing', () => {
    const { container } = render(<AdvancedGameStats />);
    expect(container.firstChild).toBeNull();
  });

  it('renders rows and all advanced labels', () => {
    render(
      <AdvancedGameStats
        advancedAttribution={{
          12: { targets: 5, drops: 1, battedPasses: 0, coverageTargets: 0, coverageCompletionsAllowed: 0, receptionsAllowed: 0, sacksAllowed: 2, sacksMade: 0 },
          34: { targets: 0, drops: 0, battedPasses: 2, coverageTargets: 7, coverageCompletionsAllowed: 3, receptionsAllowed: 3, sacksAllowed: 0, sacksMade: 1 },
        }}
        playerTables={basePlayerTables}
      />,
    );

    expect(screen.getByTestId('game-book-advanced-stats')).toBeTruthy();
    expect(screen.getByText('Tgt')).toBeTruthy();
    expect(screen.getByText('Drop')).toBeTruthy();
    expect(screen.getByText('Bat')).toBeTruthy();
    expect(screen.getByText('Cov Tgt')).toBeTruthy();
    expect(screen.getByText('Cov Comp')).toBeTruthy();
    expect(screen.getByText('Sck All')).toBeTruthy();
    expect(screen.getByText('Sck Made')).toBeTruthy();
    expect(screen.getByText('WR Alpha')).toBeTruthy();
    expect(screen.getByText('CB Beta')).toBeTruthy();
  });

  it('falls back to player id for unknown players and preserves mobile wrappers', () => {
    render(<AdvancedGameStats advancedAttribution={{ 999: { targets: 1 } }} playerTables={basePlayerTables} />);
    expect(screen.getByText('#999')).toBeTruthy();
    const wrapper = screen.getAllByRole('region', { name: /advanced game stats/i }).at(-1);
    expect(wrapper?.className).toContain('bs-table-wrap');
  });

  it('does not mutate input objects', () => {
    const advancedAttribution = Object.freeze({ 12: Object.freeze({ targets: '3', drops: '1' }) });
    const spy = vi.fn();
    render(<AdvancedGameStats advancedAttribution={advancedAttribution} playerTables={basePlayerTables} onPlayerSelect={spy} />);
    expect(advancedAttribution[12].targets).toBe('3');
  });

  it('handles legacy empty object without crashing', () => {
    const { container } = render(<AdvancedGameStats advancedAttribution={{}} playerTables={basePlayerTables} />);
    expect(container.firstChild).toBeNull();
  });
});
