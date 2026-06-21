/** @vitest-environment jsdom */
/**
 * FranchiseLegacy.browser.integration.test.jsx
 * Integration tests for FranchiseLegacyView with LegendsBrowser embedded.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FranchiseLegacyView from '../../src/ui/components/FranchiseLegacyView.jsx';

afterEach(() => cleanup());

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRohMember(overrides = {}) {
  return {
    id: 'p-legend',
    name: 'Dan Legend',
    position: 'QB',
    jerseyNumber: 10,
    yearsPlayedWithTeam: '2018–2026',
    careerGamesWithTeam: 128,
    totalPassingYards: 35000,
    totalRushingYards: null,
    totalReceivingYards: null,
    totalSacks: null,
    accolades: ['MVP (2022)', 'Champion (2023)'],
    inductionYear: 2027,
    ...overrides,
  };
}

function makeAllTimeLeaders(overrides = {}) {
  return {
    passingYards:   { name: 'Dan Legend', value: 35000, playerId: 'p-legend' },
    rushingYards:   { name: 'Rush King',  value: 12000, playerId: 'p-rush' },
    receivingYards: { name: 'Slot Star',  value: 18000, playerId: 'p-rec' },
    sacks:          { name: 'Edge Lord',  value: 89,    playerId: 'p-edge' },
    ...overrides,
  };
}

function makeRetiredNumbers() {
  return [10];
}

function makeRetiredNumberDisplay() {
  return [{ jerseyNumber: 10, surname: 'Legend' }];
}

// ── FranchiseLegacyView renders LegendsBrowser ────────────────────────────────

describe('FranchiseLegacyView — integrates LegendsBrowser', () => {
  it('renders LegendsBrowser when ROH data exists', () => {
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        allTimeLeaders={makeAllTimeLeaders()}
      />
    );
    expect(screen.getByTestId('legends-browser')).toBeTruthy();
  });

  it('does not render LegendsBrowser when ROH is empty', () => {
    render(<FranchiseLegacyView ringOfHonor={[]} />);
    expect(screen.queryByTestId('legends-browser')).toBeNull();
    expect(screen.getByTestId('roh-empty-state')).toBeTruthy();
  });

  it('renders roh-card elements via LegendsBrowser', () => {
    const roh = [
      makeRohMember({ id: 'p1', name: 'Alpha QB' }),
      makeRohMember({ id: 'p2', name: 'Beta RB', position: 'RB', jerseyNumber: 33 }),
    ];
    render(<FranchiseLegacyView ringOfHonor={roh} />);
    expect(screen.getAllByTestId('roh-card')).toHaveLength(2);
    expect(screen.getByTestId('legends-browser')).toBeTruthy();
  });
});

// ── Retired numbers panel still renders (#1613 regression) ───────────────────

describe('FranchiseLegacyView — retired numbers panel (#1613 regression)', () => {
  it('renders the retired numbers panel when ROH and retired numbers exist', () => {
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        retiredNumbers={makeRetiredNumbers()}
        retiredNumberDisplay={makeRetiredNumberDisplay()}
      />
    );
    expect(screen.getByTestId('retired-numbers-panel')).toBeTruthy();
  });

  it('renders retired number badges correctly', () => {
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        retiredNumbers={makeRetiredNumbers()}
        retiredNumberDisplay={makeRetiredNumberDisplay()}
      />
    );
    expect(screen.getAllByTestId('retired-number-badge').length).toBeGreaterThan(0);
    expect(screen.getByText(/#10 LEGEND/i)).toBeTruthy();
  });

  it('renders the retired numbers empty state when no numbers are retired', () => {
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        retiredNumbers={[]}
        retiredNumberDisplay={[]}
      />
    );
    expect(screen.getByTestId('retired-numbers-empty')).toBeTruthy();
  });
});

// ── No mutation during browsing ───────────────────────────────────────────────

describe('FranchiseLegacyView — read-only browsing', () => {
  it('selecting a legend profile fires no mutation handler', () => {
    const onInduct = vi.fn();
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        onInduct={onInduct}
      />
    );
    const cards = screen.getAllByTestId('roh-card');
    fireEvent.click(cards[0]);
    expect(onInduct).not.toHaveBeenCalled();
  });

  it('changing the position filter fires no mutation handler', () => {
    const onInduct = vi.fn();
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        onInduct={onInduct}
      />
    );
    const allBtn = screen.getByTestId('filter-btn-ALL');
    fireEvent.click(allBtn);
    expect(onInduct).not.toHaveBeenCalled();
  });
});

// ── Legacy saves with partial stats ──────────────────────────────────────────

describe('FranchiseLegacyView — backward compatibility', () => {
  it('works with ROH members that have no stats (legacy saves)', () => {
    const legacyMember = {
      id: 'leg1',
      name: 'Old Timer',
      position: 'OG',
      inductionYear: 2010,
    };
    expect(() =>
      render(<FranchiseLegacyView ringOfHonor={[legacyMember]} />)
    ).not.toThrow();
    expect(screen.getByTestId('legends-browser')).toBeTruthy();
  });

  it('works with ROH members missing optional fields', () => {
    const partialMember = makeRohMember({
      jerseyNumber: undefined,
      yearsPlayedWithTeam: undefined,
      careerGamesWithTeam: undefined,
      accolades: undefined,
    });
    expect(() =>
      render(<FranchiseLegacyView ringOfHonor={[partialMember]} />)
    ).not.toThrow();
  });

  it('renders full view without crash when all sections have data', () => {
    expect(() =>
      render(
        <FranchiseLegacyView
          ringOfHonor={[makeRohMember()]}
          allTimeLeaders={makeAllTimeLeaders()}
          pendingRohCandidates={[]}
          retiredNumbers={makeRetiredNumbers()}
          retiredNumberDisplay={makeRetiredNumberDisplay()}
          onInduct={vi.fn()}
          onDismissCandidate={vi.fn()}
          onRetireNumber={vi.fn()}
        />
      )
    ).not.toThrow();
  });
});
