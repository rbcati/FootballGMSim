/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import MobileNav from '../MobileNav.jsx';
import { capVisibleNotifications } from '../../utils/notificationsDisplay.js';
import { recoverArchivedGameFromSchedule } from '../../../core/gameArchive.js';
import { getBoxScoreAvailability } from '../../utils/boxScoreAccess.js';

afterEach(() => cleanup());

describe('MobileNav — drawer route-change cleanup', () => {
  const panel = () => document.body.querySelector('.mobile-nav-panel');
  function openDrawer() {
    const moreButton = [...document.body.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'More');
    fireEvent.click(moreButton);
  }

  it('closes the More drawer when the active tab changes (postgame → HQ return)', () => {
    const { rerender } = render(
      <MobileNav activeSection="hq" activeTab="Game Detail" league={{ year: 2026, phase: 'regular' }} />,
    );
    openDrawer();
    expect(panel().className).toContain('open');

    // Returning to HQ (tab change without a section change) must close it.
    rerender(
      <MobileNav activeSection="hq" activeTab="HQ" league={{ year: 2026, phase: 'regular' }} />,
    );
    expect(panel().className).not.toContain('open');
  });

  it('closes the More drawer when the nav collapses for Game Book focus', () => {
    const { rerender } = render(
      <MobileNav activeSection="hq" activeTab="HQ" league={{ year: 2026, phase: 'regular' }} />,
    );
    openDrawer();
    expect(panel().className).toContain('open');
    rerender(
      <MobileNav activeSection="hq" activeTab="HQ" league={{ year: 2026, phase: 'regular' }} collapsed />,
    );
    expect(panel().className).not.toContain('open');
  });
});

describe('Activity notifications — visible-item cap', () => {
  const notice = (id, message) => ({ id, level: 'info', message });

  it('renders at most the cap, newest last, and collapses the rest', () => {
    const notifications = [1, 2, 3, 4, 5].map((n) => notice(n, `Notice ${n}`));
    const { visible, collapsed } = capVisibleNotifications(notifications, 3);
    expect(visible.map((n) => n.id)).toEqual([3, 4, 5]);
    expect(collapsed.map((n) => n.id)).toEqual([1, 2]);
  });

  it('keeps everything visible when under the cap and drops blank entries', () => {
    const notifications = [notice(1, 'Real'), notice(2, '   '), notice(3, 'Also real')];
    const { visible, collapsed } = capVisibleNotifications(notifications, 3);
    expect(visible.map((n) => n.id)).toEqual([1, 3]);
    expect(collapsed).toEqual([]);
  });

  it('never collapses warnings or retryable notices, even when newer info notices exceed the cap', () => {
    const notifications = [
      { id: 1, level: 'warn', message: 'Roster invalid' },
      { id: 2, level: 'info', message: 'Info A', retryable: true },
      notice(3, 'Info B'),
      notice(4, 'Info C'),
      notice(5, 'Info D'),
      notice(6, 'Info E'),
    ];
    const { visible, collapsed } = capVisibleNotifications(notifications, 3);
    // Actionable rows (warn + retryable) always stay visible; the info budget
    // (cap minus actionable rows) keeps only the newest routine notice.
    expect(visible.map((n) => n.id)).toEqual([1, 2, 6]);
    expect(collapsed.map((n) => n.id)).toEqual([3, 4, 5]);
    expect(collapsed.every((n) => n.level !== 'warn' && !n.retryable)).toBe(true);
  });
});

describe('Schedule 0-0 defaults never masquerade as finals', () => {
  const leagueState = {
    schedule: {
      weeks: [{
        week: 1,
        games: [
          { home: 1, away: 0, homeScore: 0, awayScore: 0, played: false },
        ],
      }],
    },
  };

  it('recoverArchivedGameFromSchedule skips explicitly-unplayed rows with default 0-0 scores', () => {
    expect(recoverArchivedGameFromSchedule('s1_w1_1_0', leagueState)).toBeNull();
  });

  it('still recovers a genuinely played 0-0 row (played flag set)', () => {
    const playedState = {
      schedule: { weeks: [{ week: 1, games: [{ home: 1, away: 0, homeScore: 14, awayScore: 10, played: true }] }] },
    };
    expect(recoverArchivedGameFromSchedule('s1_w1_1_0', playedState)?.homeScore).toBe(14);
  });

  it('box-score availability treats unplayed 0-0 rows as not completed', () => {
    const availability = getBoxScoreAvailability(
      { home: 1, away: 0, homeScore: 0, awayScore: 0, played: false, week: 1, seasonId: 's1' },
      { seasonId: 's1', week: 1 },
    );
    expect(availability.isCompleted).toBe(false);
    expect(availability.canOpen).toBe(false);
  });
});
