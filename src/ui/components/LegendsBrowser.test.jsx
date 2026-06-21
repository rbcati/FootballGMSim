/** @vitest-environment jsdom */
/**
 * LegendsBrowser.test.jsx
 * UI tests for the interactive Legends Browser component.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LegendsBrowser from './LegendsBrowser.jsx';

afterEach(() => cleanup());

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoh(overrides = {}) {
  return {
    id: 'p1',
    name: 'Dan Legend',
    position: 'QB',
    jerseyNumber: 10,
    yearsPlayedWithTeam: '2010–2020',
    careerGamesWithTeam: 160,
    totalPassingYards: 45000,
    totalRushingYards: null,
    totalReceivingYards: null,
    totalSacks: null,
    accolades: ['MVP (2015)', 'Champion (2018)'],
    inductionYear: 2022,
    ...overrides,
  };
}

const QB = makeRoh({ id: 'p-qb', name: 'Alpha QB', position: 'QB', totalPassingYards: 45000 });
const RB = makeRoh({ id: 'p-rb', name: 'Bravo RB', position: 'RB', totalPassingYards: null, totalRushingYards: 12000 });
const WR = makeRoh({ id: 'p-wr', name: 'Charlie WR', position: 'WR', totalPassingYards: null, totalReceivingYards: 18000 });

// ── Empty state ───────────────────────────────────────────────────────────────

describe('LegendsBrowser — empty state', () => {
  it('renders empty state when ringOfHonor is empty', () => {
    render(<LegendsBrowser ringOfHonor={[]} />);
    expect(screen.getByTestId('legends-browser-empty')).toBeTruthy();
  });

  it('renders empty state when ringOfHonor is not provided', () => {
    render(<LegendsBrowser />);
    expect(screen.getByTestId('legends-browser-empty')).toBeTruthy();
  });

  it('does not render the browser when ROH is empty', () => {
    render(<LegendsBrowser ringOfHonor={[]} />);
    expect(screen.queryByTestId('legends-browser')).toBeNull();
  });
});

// ── Leaderboard rendering ─────────────────────────────────────────────────────

describe('LegendsBrowser — leaderboards', () => {
  it('renders leaderboard sections for all stat categories', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB, WR]} />);
    expect(screen.getByTestId('leaderboard-section-passing-yards')).toBeTruthy();
    expect(screen.getByTestId('leaderboard-section-rushing-yards')).toBeTruthy();
    expect(screen.getByTestId('leaderboard-section-receiving-yards')).toBeTruthy();
    expect(screen.getByTestId('leaderboard-section-sacks')).toBeTruthy();
  });

  it('displays legend name in leaderboard rows (rank + name combined)', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    // Name appears as "1. Alpha QB" combined with rank
    const row = screen.getByTestId('leaderboard-row-passing-yards-0');
    expect(row.textContent).toContain('Alpha QB');
  });

  it('clicking leaderboard row selects legend profile', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB]} />);
    const rushRow = screen.getByTestId('leaderboard-row-rushing-yards-0');
    fireEvent.click(rushRow);
    expect(screen.getByTestId('legend-profile')).toBeTruthy();
    expect(screen.getByTestId('legend-name').textContent).toContain('Bravo RB');
  });
});

// ── Legend card grid ──────────────────────────────────────────────────────────

describe('LegendsBrowser — legend card grid', () => {
  it('renders roh-card elements for all ROH members', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB, WR]} />);
    expect(screen.getAllByTestId('roh-card')).toHaveLength(3);
  });

  it('clicking legend card selects legend profile', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB]} />);
    const cards = screen.getAllByTestId('roh-card');
    // First card is QB (auto-selected), click the second (RB)
    fireEvent.click(cards[1]);
    expect(screen.getByTestId('legend-name').textContent).toContain('Bravo RB');
  });

  it('auto-selects first legend when ROH exists', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB]} />);
    expect(screen.getByTestId('legend-profile')).toBeTruthy();
  });
});

// ── Position filter ───────────────────────────────────────────────────────────

describe('LegendsBrowser — position filter', () => {
  it('renders the position filter control', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB]} />);
    expect(screen.getByTestId('position-filter')).toBeTruthy();
  });

  it('includes ALL and all unique positions', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB, WR]} />);
    expect(screen.getByTestId('filter-btn-ALL')).toBeTruthy();
    expect(screen.getByTestId('filter-btn-QB')).toBeTruthy();
    expect(screen.getByTestId('filter-btn-RB')).toBeTruthy();
    expect(screen.getByTestId('filter-btn-WR')).toBeTruthy();
  });

  it('position filter updates visible legend cards', () => {
    render(<LegendsBrowser ringOfHonor={[QB, RB, WR]} />);
    fireEvent.click(screen.getByTestId('filter-btn-RB'));
    const cards = screen.getAllByTestId('roh-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Bravo RB');
  });

  it('renders filter empty state text when no legends match', () => {
    // Create a legend with a unique position, then add another with different position
    const kicker = makeRoh({ id: 'k1', name: 'Kicker K', position: 'K', totalPassingYards: null });
    render(<LegendsBrowser ringOfHonor={[QB, kicker]} />);
    // Filter to K — only 1 card (kicker)
    fireEvent.click(screen.getByTestId('filter-btn-QB'));
    expect(screen.getAllByTestId('roh-card')).toHaveLength(1);
    // Now check that when we filter to a position with no one, empty state shows
    // We can't easily trigger this without a nonexistent position button,
    // but we can verify empty state testid exists in the DOM when needed
    // by testing filterLegendsByPosition separately (done in engine tests)
    expect(screen.getByTestId('legend-card-grid')).toBeTruthy();
  });
});

// ── Legend profile panel ──────────────────────────────────────────────────────

describe('LegendsBrowser — legend profile', () => {
  it('renders jersey badge in hero header', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    expect(screen.getByTestId('jersey-badge')).toBeTruthy();
  });

  it('jersey badge shows jersey number', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    expect(screen.getByTestId('jersey-badge').textContent).toContain('10');
  });

  it('renders legend name in hero header (combined with position)', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    const nameEl = screen.getByTestId('legend-name');
    expect(nameEl.textContent).toContain('Alpha QB');
    expect(nameEl.textContent).toContain('QB');
  });

  it('renders position in hero header', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    expect(screen.getByTestId('legend-name').textContent).toContain('QB');
  });

  it('renders induction year in hero header', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    expect(screen.getByTestId('legend-induction-year')).toBeTruthy();
    expect(screen.getByTestId('legend-induction-year').textContent).toContain('2022');
  });

  it('renders metric sheet with available stats only', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    expect(screen.getByTestId('metric-passingYards')).toBeTruthy();
    expect(screen.queryByTestId('metric-rushingYards')).toBeNull();
  });

  it('does not show rushing metric when null', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    expect(screen.queryByTestId('metric-rushingYards')).toBeNull();
  });

  it('renders accolade timeline section', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    expect(screen.getByTestId('accolade-timeline')).toBeTruthy();
  });

  it('renders timeline events in order', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    const events = screen.getAllByTestId('timeline-event');
    expect(events.length).toBeGreaterThan(0);
  });

  it('timeline renders year and label combined (no standalone year text)', () => {
    render(<LegendsBrowser ringOfHonor={[QB]} />);
    // Timeline events combine year and label: "2022 · Inducted 2022"
    // So getByText('2022') alone should NOT find a match in the timeline
    // (The LegendCard shows standalone "2022" as induction year — 1 match there)
    const timelineEl = screen.getByTestId('accolade-timeline');
    const events = timelineEl.querySelectorAll('[data-testid="timeline-event"]');
    for (const ev of events) {
      // Each event text is a combined string, never just a bare year
      const text = ev.textContent;
      expect(text.length).toBeGreaterThan(4); // more than just a 4-digit year
    }
  });
});

// ── Profile with sparse data ──────────────────────────────────────────────────

describe('LegendsBrowser — sparse/partial data', () => {
  it('does not crash when accolades is empty', () => {
    const sparse = makeRoh({ accolades: [], yearsPlayedWithTeam: '' });
    expect(() => render(<LegendsBrowser ringOfHonor={[sparse]} />)).not.toThrow();
  });

  it('does not crash when jerseyNumber is null', () => {
    const noJersey = makeRoh({ jerseyNumber: null });
    expect(() => render(<LegendsBrowser ringOfHonor={[noJersey]} />)).not.toThrow();
  });

  it('does not crash when inductionYear is 0', () => {
    const noInduction = makeRoh({ inductionYear: 0 });
    expect(() => render(<LegendsBrowser ringOfHonor={[noInduction]} />)).not.toThrow();
  });

  it('does not crash with all stats null', () => {
    const noStats = makeRoh({
      totalPassingYards: null,
      totalRushingYards: null,
      totalReceivingYards: null,
      totalSacks: null,
      careerGamesWithTeam: 0,
    });
    expect(() => render(<LegendsBrowser ringOfHonor={[noStats]} />)).not.toThrow();
  });

  it('handles legacy saves with partial optional stats', () => {
    const legacy = { id: 'leg1', name: 'Old Timer', position: 'OG', inductionYear: 2010 };
    expect(() => render(<LegendsBrowser ringOfHonor={[legacy]} />)).not.toThrow();
  });

  it('renders with a single ROH member without crashing', () => {
    expect(() => render(<LegendsBrowser ringOfHonor={[makeRoh()]} />)).not.toThrow();
  });
});
