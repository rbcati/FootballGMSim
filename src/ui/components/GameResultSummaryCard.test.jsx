/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GameResultSummaryCard, {
  VIEW_GAME_BOOK_LABEL,
  resolveResultFraming,
} from './GameResultSummaryCard.jsx';

describe('GameResultSummaryCard', () => {
  afterEach(() => cleanup());

  describe('resolveResultFraming', () => {
    it('frames a user win', () => {
      const f = resolveResultFraming({ homeScore: 27, awayScore: 20, userIsHome: true });
      expect(f).toMatchObject({ userWon: true, userLost: false, tied: false, badge: 'W', tone: 'ok', userScore: 27, oppScore: 20 });
    });
    it('frames a user loss', () => {
      const f = resolveResultFraming({ homeScore: 27, awayScore: 20, userIsHome: false });
      expect(f).toMatchObject({ userWon: false, userLost: true, badge: 'L', tone: 'danger', userScore: 20, oppScore: 27 });
    });
    it('frames a tie', () => {
      const f = resolveResultFraming({ homeScore: 14, awayScore: 14, userIsHome: true });
      expect(f).toMatchObject({ tied: true, userWon: false, userLost: false, badge: 'T', tone: 'info' });
    });
  });

  describe('full variant', () => {
    it('renders both final scores', () => {
      render(
        <GameResultSummaryCard
          variant="full"
          testId="result-card"
          awayAbbr="BUF"
          awayName="Buffalo"
          awayScore={20}
          homeAbbr="KC"
          homeName="Kansas City"
          homeScore={27}
        />,
      );
      const card = screen.getByTestId('result-card');
      expect(card.getAttribute('data-variant')).toBe('full');
      expect(screen.getByText('27')).toBeTruthy();
      expect(screen.getByText('20')).toBeTruthy();
    });
  });

  describe('compact variant', () => {
    it('uses the canonical "View Game Book" CTA label', () => {
      const onViewGameBook = vi.fn();
      render(
        <GameResultSummaryCard
          variant="compact"
          testId="compact-card"
          ctaTestId="compact-cta"
          homeAbbr="DET"
          awayAbbr="CHI"
          homeScore={20}
          awayScore={23}
          userIsHome={false}
          week={9}
          onViewGameBook={onViewGameBook}
        />,
      );
      expect(VIEW_GAME_BOOK_LABEL).toBe('View Game Book');
      expect(screen.getByTestId('compact-cta').textContent).toContain('View Game Book');
      // Score framed from the user's perspective (user is away): 23–20 vs DET.
      expect(screen.getByTestId('compact-card').textContent).toContain('23–20 vs DET');
      fireEvent.click(screen.getByTestId('compact-card'));
      expect(onViewGameBook).toHaveBeenCalledTimes(1);
    });

    it('disables the row when there is no game to open', () => {
      render(
        <GameResultSummaryCard
          variant="compact"
          testId="compact-card"
          homeAbbr="DET"
          awayAbbr="CHI"
          homeScore={20}
          awayScore={23}
          userIsHome={false}
          week={9}
        />,
      );
      expect(screen.getByTestId('compact-card').disabled).toBe(true);
    });
  });
});
