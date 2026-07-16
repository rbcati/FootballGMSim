/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import PostGameScreen from '../PostGameScreen.jsx';

const baseProps = {
  homeTeam: { id: 1, abbr: 'HME', name: 'Home' },
  awayTeam: { id: 2, abbr: 'AWY', name: 'Away' },
  homeScore: 24,
  awayScore: 20,
  userTeamId: 1,
  onContinue: () => {},
};

describe('PostGameScreen — Game Flow empty state', () => {
  afterEach(() => cleanup());

  it('hides the interactive Game Flow card and shows a compact empty state when no flow data exists', async () => {
    await act(async () => {
      render(<PostGameScreen {...baseProps} logs={[]} />);
    });

    // The empty, useful state is shown...
    expect(screen.queryByTestId('postgame-flow-empty')).toBeTruthy();
    // ...and the interactive moments toggle / list are not rendered.
    expect(screen.queryByTestId('postgame-flow-toggle')).toBeNull();
    expect(screen.queryByTestId('postgame-flow-moments')).toBeNull();
  });

  it('renders the interactive Game Flow card when notable moments exist', async () => {
    const logs = [
      { teamId: 1, player: { id: 30, name: 'RB', pos: 'RB' }, rushYds: 4, type: 'run', isTouchdown: true, quarter: 2, text: 'RB rushes for a touchdown' },
    ];
    await act(async () => {
      render(<PostGameScreen {...baseProps} logs={logs} boxScoreGameId="g1" week={4} />);
    });

    expect(screen.queryByTestId('postgame-flow-empty')).toBeNull();
    expect(screen.queryByTestId('postgame-flow-toggle')).toBeTruthy();
  });
});

describe('PostGameScreen — compact leaders with partial data', () => {
  afterEach(() => cleanup());

  it('renders available leaders compactly and omits missing ones without crashing', async () => {
    // Only a passing leader is present in the CANONICAL box score.
    const playerStats = {
      home: { 10: { name: 'Home QB', pos: 'QB', stats: { passComp: 22, passAtt: 31, passYd: 258, passTD: 2 } } },
      away: {},
    };

    let container;
    await act(async () => {
      ({ container } = render(
        <PostGameScreen {...baseProps} playerStats={playerStats} boxScoreGameId="g2" week={5} />,
      ));
    });

    // Passing leader renders.
    expect(container.textContent).toMatch(/Passing/);
    expect(container.textContent).toMatch(/Home QB/);
    // No receiving/rushing leader fabricated from the partial data.
    expect(container.textContent).not.toMatch(/Receiving/);
    expect(container.textContent).not.toMatch(/Rushing/);
    // Box score affordance is present and points at the game.
    expect(screen.getByTestId('box-score-trigger')).toBeTruthy();
  });
});
