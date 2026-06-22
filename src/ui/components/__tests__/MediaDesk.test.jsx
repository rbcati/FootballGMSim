/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MediaDesk from '../MediaDesk.jsx';

afterEach(() => { cleanup(); });

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStory(overrides = {}) {
  return {
    id:              'owner-pressure-1-2026-high',
    type:            'OWNER_PRESSURE',
    priority:        90,
    week:            10,
    season:          2026,
    teamId:          1,
    secondaryTeamId: null,
    playerId:        null,
    headline:        'CHI Front Office on Hot Seat',
    dek:             'Mandate: Make The Playoffs. Job-security index at 85/100 — 2 consecutive seasons below expectations.',
    tone:            'urgent',
    tags:            ['owner-pressure'],
    sourceEventIds:  [],
    ...overrides,
  };
}

// ── Render tests ──────────────────────────────────────────────────────────────

describe('MediaDesk — empty state', () => {
  it('renders the section element even with no stories', () => {
    render(<MediaDesk stories={[]} />);
    expect(screen.getByTestId('media-desk')).toBeTruthy();
  });

  it('shows empty state text when stories is an empty array', () => {
    render(<MediaDesk stories={[]} />);
    expect(screen.getByTestId('media-desk-empty')).toBeTruthy();
    expect(screen.getByText(/no league media stories this week/i)).toBeTruthy();
  });

  it('shows empty state when stories prop is null', () => {
    render(<MediaDesk stories={null} />);
    expect(screen.getByTestId('media-desk-empty')).toBeTruthy();
  });

  it('shows empty state when stories prop is undefined', () => {
    render(<MediaDesk />);
    expect(screen.getByTestId('media-desk-empty')).toBeTruthy();
  });

  it('does not crash when stories is a non-array value', () => {
    render(<MediaDesk stories="invalid" />);
    expect(screen.getByTestId('media-desk')).toBeTruthy();
  });
});

describe('MediaDesk — stories present', () => {
  it('renders the section with accessible label', () => {
    render(<MediaDesk stories={[makeStory()]} />);
    expect(screen.getByRole('region', { name: /league media desk/i })).toBeTruthy();
  });

  it('renders League Media heading', () => {
    render(<MediaDesk stories={[makeStory()]} />);
    expect(screen.getByRole('heading', { name: /league media/i })).toBeTruthy();
  });

  it('does NOT show empty state when stories are present', () => {
    render(<MediaDesk stories={[makeStory()]} />);
    expect(screen.queryByTestId('media-desk-empty')).toBeNull();
  });

  it('renders at least one story card', () => {
    render(<MediaDesk stories={[makeStory()]} />);
    const cards = screen.getAllByTestId('media-story-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the headline text of the top story', () => {
    const story = makeStory({ headline: 'CHI Front Office on Hot Seat' });
    render(<MediaDesk stories={[story]} />);
    expect(screen.getByText('CHI Front Office on Hot Seat')).toBeTruthy();
  });

  it('renders the dek of the top story', () => {
    const story = makeStory({ dek: 'Job security index at 85/100.' });
    render(<MediaDesk stories={[story]} />);
    expect(screen.getByText('Job security index at 85/100.')).toBeTruthy();
  });

  it('displays the week number in the top story', () => {
    render(<MediaDesk stories={[makeStory({ week: 9 })]} />);
    expect(screen.getByText('Wk 9')).toBeTruthy();
  });

  it('attaches data-story-type attribute to card', () => {
    render(<MediaDesk stories={[makeStory({ type: 'OWNER_PRESSURE' })]} />);
    const card = screen.getByTestId('media-story-card');
    expect(card.getAttribute('data-story-type')).toBe('OWNER_PRESSURE');
  });

  it('attaches data-story-id attribute to card', () => {
    const story = makeStory({ id: 'test-story-id' });
    render(<MediaDesk stories={[story]} />);
    const card = screen.getByTestId('media-story-card');
    expect(card.getAttribute('data-story-id')).toBe('test-story-id');
  });
});

describe('MediaDesk — high-priority owner pressure story', () => {
  it('renders OWNER_PRESSURE story correctly', () => {
    const story = makeStory({
      type:     'OWNER_PRESSURE',
      headline: 'DAL Front Office on Hot Seat',
      dek:      'Mandate: Win The Division. Job-security index at 88/100 — 3 consecutive seasons below expectations.',
      tone:     'urgent',
      teamId:   5,
      week:     11,
    });
    render(<MediaDesk stories={[story]} />);
    expect(screen.getByText('DAL Front Office on Hot Seat')).toBeTruthy();
    expect(screen.getByText(/job-security index at 88\/100/i)).toBeTruthy();
  });

  it('shows type badge label for OWNER_PRESSURE', () => {
    render(<MediaDesk stories={[makeStory({ type: 'OWNER_PRESSURE' })]} />);
    expect(screen.getByText(/owner pressure/i)).toBeTruthy();
  });
});

describe('MediaDesk — multiple stories', () => {
  it('renders multiple story cards when multiple stories provided', () => {
    const stories = [
      makeStory({ id: 's1', type: 'OWNER_PRESSURE', headline: 'Story One' }),
      makeStory({ id: 's2', type: 'MANDATE_SLIP',   headline: 'Story Two' }),
      makeStory({ id: 's3', type: 'PLAYOFF_PUSH',   headline: 'Story Three' }),
    ];
    render(<MediaDesk stories={stories} />);
    const cards = screen.getAllByTestId('media-story-card');
    expect(cards.length).toBe(3);
  });

  it('caps at maxVisible (default 6)', () => {
    const stories = Array.from({ length: 10 }, (_, i) =>
      makeStory({ id: `s${i}`, headline: `Story ${i}` }),
    );
    render(<MediaDesk stories={stories} />);
    const cards = screen.getAllByTestId('media-story-card');
    expect(cards.length).toBeLessThanOrEqual(6);
  });

  it('respects custom maxVisible prop', () => {
    const stories = Array.from({ length: 10 }, (_, i) =>
      makeStory({ id: `s${i}`, headline: `Story ${i}` }),
    );
    render(<MediaDesk stories={stories} maxVisible={3} />);
    const cards = screen.getAllByTestId('media-story-card');
    expect(cards.length).toBeLessThanOrEqual(3);
  });
});

describe('MediaDesk — missing team/player references', () => {
  it('does not crash when teamId is null', () => {
    const story = makeStory({ teamId: null });
    expect(() => render(<MediaDesk stories={[story]} />)).not.toThrow();
  });

  it('does not crash when playerId is null', () => {
    const story = makeStory({ playerId: null });
    expect(() => render(<MediaDesk stories={[story]} />)).not.toThrow();
  });

  it('does not crash when week is missing', () => {
    const story = makeStory({ week: null });
    expect(() => render(<MediaDesk stories={[story]} />)).not.toThrow();
  });

  it('does not crash when headline is empty string', () => {
    const story = makeStory({ headline: '', dek: '' });
    expect(() => render(<MediaDesk stories={[story]} />)).not.toThrow();
  });

  it('renders type badge for an unknown story type gracefully', () => {
    const story = makeStory({ type: 'UNKNOWN_FUTURE_TYPE' });
    expect(() => render(<MediaDesk stories={[story]} />)).not.toThrow();
  });
});

describe('MediaDesk — different story types render without crash', () => {
  const types = [
    'OWNER_PRESSURE',
    'BLOCKBUSTER_TRADE',
    'MANDATE_SURGE',
    'MANDATE_SLIP',
    'PRESTIGE_HONOR',
    'WAIVER_MOVE',
    'PLAYOFF_PUSH',
    'LEGACY_MILESTONE',
  ];
  for (const type of types) {
    it(`renders ${type} without crashing`, () => {
      const story = makeStory({ id: `s-${type}`, type });
      expect(() => render(<MediaDesk stories={[story]} />)).not.toThrow();
      cleanup();
    });
  }
});
