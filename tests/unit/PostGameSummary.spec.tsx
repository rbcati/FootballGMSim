/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

afterEach(cleanup);
import PostGameSummary from '../../src/ui/components/PostGameSummary.jsx';

const HOME_TEAM = { id: 1, abbr: 'KC', name: 'Kansas City' };
const AWAY_TEAM = { id: 2, abbr: 'BUF', name: 'Buffalo' };

const BASE_RESULT = {
  homeTeam: HOME_TEAM,
  awayTeam: AWAY_TEAM,
  homeId: 1,
  awayId: 2,
  homeScore: 27,
  awayScore: 20,
  userTeamId: 1,
  week: 3,
  phase: 'regular',
};

describe('PostGameSummary', () => {
  it('renders the final score', () => {
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        momentumChange={2}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('post-game-summary')).toBeTruthy();
    expect(screen.getByText('27')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('shows VICTORY when the user wins', () => {
    render(
      <PostGameSummary
        gameResult={{ ...BASE_RESULT, userTeamId: 1 }}
        momentumChange={2}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('VICTORY!')).toBeTruthy();
  });

  it('shows DEFEAT when the user loses', () => {
    render(
      <PostGameSummary
        gameResult={{ ...BASE_RESULT, userTeamId: 2 }}
        momentumChange={-2}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('DEFEAT')).toBeTruthy();
  });

  it('shows TIE when scores are equal', () => {
    render(
      <PostGameSummary
        gameResult={{ ...BASE_RESULT, homeScore: 14, awayScore: 14, userTeamId: 1 }}
        momentumChange={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('TIE')).toBeTruthy();
  });

  it('calls onClose when Return to Franchise HQ is clicked', () => {
    const onClose = vi.fn();
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        momentumChange={2}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('post-game-summary-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        momentumChange={2}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows View Game Book button when onViewGameBook is provided', () => {
    const onViewGameBook = vi.fn();
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        momentumChange={2}
        onClose={() => {}}
        onViewGameBook={onViewGameBook}
      />,
    );
    const btn = screen.getByTestId('post-game-summary-view-game-book');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onViewGameBook).toHaveBeenCalledTimes(1);
  });

  it('does not show View Game Book when onViewGameBook is absent', () => {
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        momentumChange={2}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('post-game-summary-view-game-book')).toBeNull();
  });

  it('renders game leaders when provided', () => {
    const leaders = [
      { pos: 'QB', name: 'P. Mahomes', statLine: '22/30 · 310 yds · 3 TD' },
      { pos: 'WR', name: 'T. Hill', statLine: '8 rec · 120 yds · 1 TD' },
    ];
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        leaders={leaders}
        momentumChange={2}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('P. Mahomes')).toBeTruthy();
    expect(screen.getByText('T. Hill')).toBeTruthy();
    expect(screen.getByText('22/30 · 310 yds · 3 TD')).toBeTruthy();
  });

  it('renders notable injuries when provided', () => {
    const injuries = [
      { id: 99, name: 'C. McCaffrey', pos: 'RB', ovr: 94, injuryWeeksRemaining: 3 },
    ];
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        injuries={injuries}
        momentumChange={2}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('C. McCaffrey')).toBeTruthy();
    expect(screen.getByText('OUT')).toBeTruthy();
  });

  it('shows positive momentum label', () => {
    render(
      <PostGameSummary
        gameResult={BASE_RESULT}
        momentumChange={3}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/\+3 momentum/i)).toBeTruthy();
  });

  it('shows negative momentum label', () => {
    render(
      <PostGameSummary
        gameResult={{ ...BASE_RESULT, userTeamId: 2 }}
        momentumChange={-3}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/-3 momentum/i)).toBeTruthy();
  });

  it('renders nothing when gameResult is null', () => {
    const { container } = render(
      <PostGameSummary
        gameResult={null}
        momentumChange={0}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the week and phase context', () => {
    render(
      <PostGameSummary
        gameResult={{ ...BASE_RESULT, week: 7, phase: 'playoffs' }}
        momentumChange={2}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Week 7/)).toBeTruthy();
    expect(screen.getByText(/Playoffs/)).toBeTruthy();
  });
});
