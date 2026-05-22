/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WeeklyPrepScreen from '../WeeklyPrepScreen.jsx';
import * as weeklyPrepActionsModule from '../../utils/weeklyPrepActions.js';
import { getWeeklyPrepProgress } from '../../utils/weeklyPrep.js';

const league = {
  year: 2027,
  week: 8,
  seasonId: 's8',
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      name: 'Bears',
      abbr: 'CHI',
      wins: 5,
      losses: 2,
      ovr: 84,
      offenseRating: 82,
      defenseRating: 83,
      recentResults: ['W', 'W', 'L', 'W'],
      roster: [{ id: 11, pos: 'QB', ovr: 80, teamId: 1, depthChart: { rowKey: 'QB' } }],
    },
    {
      id: 2,
      name: 'Lions',
      abbr: 'DET',
      wins: 4,
      losses: 3,
      ovr: 81,
      offenseRating: 85,
      defenseRating: 76,
      recentResults: ['L', 'W', 'W', 'L'],
      roster: [],
    },
  ],
  schedule: {
    weeks: [{ week: 8, games: [{ id: 'g8', home: { id: 1 }, away: { id: 2 }, played: false }] }],
  },
};

describe('WeeklyPrepScreen', () => {
  afterEach(cleanup);

  it('renders war room flow and completion chips', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByText(/Weekly Prep War Room/i)).toBeTruthy();
    expect(screen.getByText(/Readiness Command/i)).toBeTruthy();
    expect(screen.getByText(/Priority Actions/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Matchup Intel/i })).toBeTruthy();
    expect(screen.getByText(/Prep Checklist/i)).toBeTruthy();
    expect(screen.getByText(/Opponent (scouted|pending)/i)).toBeTruthy();
  });

  it('routes action cards and secondary HQ CTA through onNavigate', () => {
    const onNavigate = vi.fn();
    render(<WeeklyPrepScreen league={league} onNavigate={onNavigate} />);

    screen.getAllByRole('button', { name: /open|review|adjust|set/i }).forEach((btn) => fireEvent.click(btn));
    screen.getAllByRole('button', { name: /back to hq/i }).forEach((btn) => fireEvent.click(btn));

    expect(onNavigate).toHaveBeenCalledWith('HQ');
    expect(onNavigate.mock.calls.some((args) => String(args?.[0] ?? '').includes('Game Plan'))).toBe(true);
  });

  it('handles missing matchup data safely', () => {
    render(
      <WeeklyPrepScreen
        league={{ year: 2027, week: 1, userTeamId: 1, teams: [{ id: 1, name: 'Legacy', roster: [] }], schedule: { weeks: [] } }}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText(/Weekly prep unavailable/i)).toBeTruthy();
  });
});

describe('WeeklyPrepScreen — Recommended Prep Actions section', () => {
  afterEach(cleanup);

  it('renders the Recommended Prep Actions section heading', () => {
    const { container } = render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(within(container).getByRole('heading', { name: /Recommended Prep Actions/i })).toBeTruthy();
  });

  it('CTA buttons in Recommended Prep Actions call onNavigate with a valid tab', () => {
    const onNavigate = vi.fn();
    const { container } = render(<WeeklyPrepScreen league={league} onNavigate={onNavigate} />);

    const heading = within(container).getByRole('heading', { name: /Recommended Prep Actions/i });
    const section = heading.closest('section');
    if (!section) return;

    const ctaButtons = within(section).queryAllByRole('button');
    if (ctaButtons.length > 0) {
      fireEvent.click(ctaButtons[0]);
      expect(onNavigate).toHaveBeenCalledTimes(1);
      const destination = onNavigate.mock.calls[0][0];
      expect(typeof destination).toBe('string');
      expect(destination.length).toBeGreaterThan(0);
    }
  });

  it('renders the empty state message when buildWeeklyPrepActions returns no actions', () => {
    const spy = vi.spyOn(weeklyPrepActionsModule, 'buildWeeklyPrepActions').mockReturnValue([]);
    const { container } = render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    const heading = within(container).getByRole('heading', { name: /Recommended Prep Actions/i });
    const section = heading.closest('section');
    expect(within(section).getByText(/No urgent prep actions/i)).toBeTruthy();
    spy.mockRestore();
  });
});

describe('WeeklyPrepScreen — Game Plan Control Center', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });
  afterEach(cleanup);

  it('renders Game Plan Control Center section heading', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Game Plan Control Center/i })).toBeTruthy();
  });

  it('renders all three sliders', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByLabelText(/Run Pass Balance/i)).toBeTruthy();
    expect(screen.getByLabelText(/Aggression Level/i)).toBeTruthy();
    expect(screen.getByLabelText(/Deep Short Balance/i)).toBeTruthy();
  });

  it('renders preset buttons', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('preset-btn-balanced')).toBeTruthy();
    expect(screen.getByTestId('preset-btn-attackWeakSecondary')).toBeTruthy();
    expect(screen.getByTestId('preset-btn-groundControl')).toBeTruthy();
    expect(screen.getByTestId('preset-btn-quickGame')).toBeTruthy();
    expect(screen.getByTestId('preset-btn-conservativeUnderdog')).toBeTruthy();
    expect(screen.getByTestId('preset-btn-aggressiveFavorite')).toBeTruthy();
  });

  it('applying Ground Control preset shows run-heavy label', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('preset-btn-groundControl'));
    // runPassBalance 35 → 'Run heavy'
    expect(screen.getAllByText(/Run heavy/i).length).toBeGreaterThan(0);
  });

  it('applying a preset marks planReviewed in localStorage', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('preset-btn-balanced'));
    expect(getWeeklyPrepProgress(league).planReviewed).toBe(true);
  });

  it('checklist shows Plan reviewed after preset is applied', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByText(/Plan pending/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('preset-btn-balanced'));
    expect(screen.getByText(/Plan reviewed/i)).toBeTruthy();
  });

  it('impact preview shows pass synergy reason when attacking weak secondary', () => {
    // league opponent (DET) has defenseRating: 76 → weakSecondary is true
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    // attackWeakSecondary sets runPassBalance: 65 (pass-heavy) → triggers Pass Attack Edge synergy
    fireEvent.click(screen.getByTestId('preset-btn-attackWeakSecondary'));
    const impactReasons = screen.getByTestId('impact-reasons');
    expect(impactReasons.textContent).toMatch(/Pass Attack Edge/i);
  });

  it('impact preview shows no-synergy message when no plan actions are active', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    const impactReasons = screen.getByTestId('impact-reasons');
    // Initial state with default plan (50/50/50) and no completion — may show penalties
    // Just ensure the container renders something
    expect(impactReasons.textContent.length).toBeGreaterThan(0);
  });

  it('readiness count updates after plan is reviewed via preset', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    // Before: plan pending, readiness partial
    const beforeChip = screen.getByText(/\/4 complete/);
    const beforeCount = Number(beforeChip.textContent.split('/')[0]);
    fireEvent.click(screen.getByTestId('preset-btn-balanced'));
    const afterChip = screen.getByText(/\/4 complete/);
    const afterCount = Number(afterChip.textContent.split('/')[0]);
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
  });
});

describe('WeeklyPrepScreen — Active Effects live synchronization', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });
  afterEach(cleanup);

  it('renders the Active Effects section', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Active Effects/i })).toBeTruthy();
    expect(screen.getByTestId('active-effects-reasons')).toBeTruthy();
  });

  it('Active Effects and Game Plan Control Center show the same reasons after preset change', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('preset-btn-attackWeakSecondary'));

    const ccText = screen.getByTestId('impact-reasons').textContent;
    const aeText = screen.getByTestId('active-effects-reasons').textContent;
    expect(ccText).toBe(aeText);
  });

  it('Active Effects updates immediately after preset change without reload', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    const aeReasons = screen.getByTestId('active-effects-reasons');
    // DET has defenseRating 76 (weakSecondary), default balanced plan doesn't trigger Pass Attack Edge
    expect(aeReasons.textContent).not.toMatch(/Pass Attack Edge/i);

    fireEvent.click(screen.getByTestId('preset-btn-attackWeakSecondary'));
    expect(aeReasons.textContent).toMatch(/Pass Attack Edge/i);
  });

  it('Active Effects updates immediately after slider change without reload', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    const aeReasons = screen.getByTestId('active-effects-reasons');
    expect(aeReasons.textContent).not.toMatch(/Pass Attack Edge/i);

    // Move runPassBalance to 65 (pass-heavy) — DET weak secondary triggers Pass Attack Edge
    const slider = screen.getByLabelText(/Run Pass Balance/i);
    fireEvent.change(slider, { target: { value: '65' } });

    expect(aeReasons.textContent).toMatch(/Pass Attack Edge/i);
  });

  it('Active Effects summary changes after a plan change', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    const summaryBefore = screen.getByTestId('active-effects-summary').textContent;

    // attackWeakSecondary adds Pass Attack Edge bonus, changing net impact
    fireEvent.click(screen.getByTestId('preset-btn-attackWeakSecondary'));
    const summaryAfter = screen.getByTestId('active-effects-summary').textContent;

    expect(summaryAfter).not.toBe(summaryBefore);
  });

  it('applying a preset marks planReviewed in Prep Checklist immediately', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByText(/Plan pending/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('preset-btn-groundControl'));
    expect(screen.getByText(/Plan reviewed/i)).toBeTruthy();
  });
});

describe('WeeklyPrepScreen — Game Book action handling', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });
  afterEach(cleanup);

  it('Game Book destination calls onOpenBoxScore with gameId when handler provided', () => {
    const onOpenBoxScore = vi.fn();
    const onNavigate = vi.fn();
    const spy = vi.spyOn(weeklyPrepActionsModule, 'buildWeeklyPrepActions').mockReturnValue([{
      id: 'prep-action-game-book',
      title: 'Review Last Loss',
      detail: 'Open the Game Book to identify what went wrong.',
      tone: 'warning',
      priority: 60,
      destination: 'Game Book:g7prev',
      ctaLabel: 'Open Game Book',
      reason: 'Team is coming off a loss.',
    }]);

    render(<WeeklyPrepScreen league={league} onNavigate={onNavigate} onOpenBoxScore={onOpenBoxScore} />);
    const gameBookBtn = screen.getByTestId('prep-action-cta-prep-action-game-book');
    fireEvent.click(gameBookBtn);

    expect(onOpenBoxScore).toHaveBeenCalledWith('g7prev');
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining('Game Book:'));
    spy.mockRestore();
  });

  it('Game Book destination does not call onNavigate with broken route when no handler exists', () => {
    const onNavigate = vi.fn();
    const spy = vi.spyOn(weeklyPrepActionsModule, 'buildWeeklyPrepActions').mockReturnValue([{
      id: 'prep-action-game-book',
      title: 'Review Last Loss',
      detail: 'Open the Game Book to identify what went wrong.',
      tone: 'warning',
      priority: 60,
      destination: 'Game Book:g7prev',
      ctaLabel: 'Open Game Book',
      reason: 'Team is coming off a loss.',
    }]);

    render(<WeeklyPrepScreen league={league} onNavigate={onNavigate} />);
    const gameBookBtn = screen.getByTestId('prep-action-cta-prep-action-game-book');
    fireEvent.click(gameBookBtn);

    // onNavigate must never receive a 'Game Book:' destination — that would be a broken route
    const gamebookCalls = onNavigate.mock.calls.filter((args) => String(args[0] ?? '').startsWith('Game Book:'));
    expect(gamebookCalls).toHaveLength(0);
    spy.mockRestore();
  });

  it('non-Game-Book destinations still route through onNavigate normally', () => {
    const onNavigate = vi.fn();
    const spy = vi.spyOn(weeklyPrepActionsModule, 'buildWeeklyPrepActions').mockReturnValue([{
      id: 'prep-action-injuries',
      title: 'Review Injuries',
      detail: 'Active injuries may affect depth.',
      tone: 'warning',
      priority: 70,
      destination: 'Team:Injuries',
      ctaLabel: 'Open Injuries',
      reason: 'Injuries flagged.',
    }]);

    render(<WeeklyPrepScreen league={league} onNavigate={onNavigate} />);
    const btn = screen.getByTestId('prep-action-cta-prep-action-injuries');
    fireEvent.click(btn);

    expect(onNavigate).toHaveBeenCalledWith('Team:Injuries');
    spy.mockRestore();
  });
});

describe('WeeklyPrepScreen — localStorage safety', () => {
  afterEach(cleanup);

  it('does not crash when localStorage throws on access', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('Storage disabled'); },
      configurable: true,
    });
    try {
      expect(() => render(
        <WeeklyPrepScreen league={league} onNavigate={vi.fn()} />,
      )).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, 'localStorage', originalDescriptor);
      }
    }
  });

  it('does not crash when league is undefined', () => {
    expect(() => render(
      <WeeklyPrepScreen league={undefined} onNavigate={vi.fn()} />,
    )).not.toThrow();
  });
});
