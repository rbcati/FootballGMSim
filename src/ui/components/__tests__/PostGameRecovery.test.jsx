/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import PostGameScreen, { PostGameErrorBoundary } from '../PostGameScreen.jsx';

const baseProps = {
  homeTeam: { id: 1, abbr: 'MIA', name: 'Miami' },
  awayTeam: { id: 0, abbr: 'BUF', name: 'Buffalo' },
  homeScore: 35,
  awayScore: 41,
  userTeamId: 0,
  week: 1,
  phase: 'regular',
};

function Bomb() {
  throw new Error('recap render exploded');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PostGameScreen — result heading is user-team based', () => {
  it('declares VICTORY when the user (away) team outscores the home team', async () => {
    await act(async () => {
      render(<PostGameScreen {...baseProps} onContinue={() => {}} />);
    });
    expect(screen.getByTestId('postgame-result-banner').textContent).toContain('VICTORY');
  });

  it('declares DEFEAT when the user (home) team loses', async () => {
    await act(async () => {
      render(<PostGameScreen {...baseProps} userTeamId={1} onContinue={() => {}} />);
    });
    expect(screen.getByTestId('postgame-result-banner').textContent).toContain('DEFEAT');
    // The final score itself is intact.
    expect(document.body.textContent).toContain('41');
    expect(document.body.textContent).toContain('35');
  });
});

describe('PostGameScreen — Game Book CTA and continuation path', () => {
  it('routes View Game Book through the canonical completed-game id', async () => {
    const onOpenBoxScore = vi.fn();
    await act(async () => {
      render(
        <PostGameScreen
          {...baseProps}
          boxScoreGameId="s1_w1_1_0"
          onOpenBoxScore={onOpenBoxScore}
          onContinue={() => {}}
        />,
      );
    });
    fireEvent.click(screen.getByTestId('box-score-trigger'));
    expect(onOpenBoxScore).toHaveBeenCalledWith('s1_w1_1_0');
  });

  it('keeps the Back to Hub continuation available', async () => {
    const onContinue = vi.fn();
    await act(async () => {
      render(<PostGameScreen {...baseProps} onContinue={onContinue} />);
    });
    fireEvent.click(screen.getByRole('button', { name: /Back to Hub/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('PostGameScreen — crash recovery surface', () => {
  function renderCrashed(onContinue) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return render(
      <PostGameErrorBoundary onContinue={onContinue}>
        <Bomb />
      </PostGameErrorBoundary>,
    );
  }

  it('anchors an honest recovery dialog with a single user-controlled exit', () => {
    const onContinue = vi.fn();
    renderCrashed(onContinue);

    const dialog = screen.getByTestId('postgame-recovery');
    // Announced to assistive tech as a blocking alert dialog.
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Honest copy: result is safe, recap failed — no fake auto-redirect text.
    expect(dialog.textContent).toContain('Game recap unavailable');
    expect(dialog.textContent).toContain('final result was saved');
    expect(dialog.textContent).not.toMatch(/Returning you to/i);
    // Fully opaque anchor: unrelated screens cannot bleed through behind it.
    expect(dialog.style.background).not.toMatch(/rgba/);
  });

  it('navigates exactly once even when the recovery action is tapped repeatedly', () => {
    const onContinue = vi.fn();
    renderCrashed(onContinue);
    const button = screen.getByTestId('postgame-recovery-return');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
