/** @vitest-environment jsdom */
/**
 * FranchiseBrandHQ.test.jsx
 * UI tests for the Championship Wall and Retired Numbers panel.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FranchiseBrandHQ from './FranchiseBrandHQ.jsx';
import FranchiseLegacyView from './FranchiseLegacyView.jsx';

afterEach(() => cleanup());

// ── FranchiseBrandHQ — Championship Wall ─────────────────────────────────────

describe('FranchiseBrandHQ — championship wall', () => {
  it('renders trophy badges for each championship year', () => {
    render(<FranchiseBrandHQ championshipYears={[2024, 2026]} />);
    const badges = screen.getAllByTestId('championship-badge');
    expect(badges).toHaveLength(2);
    expect(screen.getByText('2024')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
  });

  it('renders the championship wall container', () => {
    render(<FranchiseBrandHQ championshipYears={[2025]} />);
    expect(screen.getByTestId('championship-wall')).toBeTruthy();
  });

  it('renders the root franchise-brand-hq container when years exist', () => {
    render(<FranchiseBrandHQ championshipYears={[2025]} />);
    expect(screen.getByTestId('franchise-brand-hq')).toBeTruthy();
  });

  it('renders nothing when championshipYears is empty', () => {
    const { container } = render(<FranchiseBrandHQ championshipYears={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when championshipYears is not provided', () => {
    const { container } = render(<FranchiseBrandHQ />);
    expect(container.firstChild).toBeNull();
  });

  it('does not crash with null as prop', () => {
    expect(() => render(<FranchiseBrandHQ championshipYears={null} />)).not.toThrow();
  });

  it('renders multiple trophy badges in order', () => {
    render(<FranchiseBrandHQ championshipYears={[2020, 2022, 2025]} />);
    const badges = screen.getAllByTestId('championship-badge');
    expect(badges).toHaveLength(3);
  });
});

// ── FranchiseLegacyView — Retired Numbers panel ──────────────────────────────

describe('FranchiseLegacyView — retired numbers panel', () => {
  it('renders the retired numbers section', () => {
    render(<FranchiseLegacyView />);
    expect(screen.getByText('Retired Numbers')).toBeTruthy();
  });

  it('shows empty state when no numbers are retired', () => {
    render(<FranchiseLegacyView retiredNumberDisplay={[]} />);
    expect(screen.getByTestId('retired-numbers-empty')).toBeTruthy();
    expect(screen.getByText(/No retired numbers yet/i)).toBeTruthy();
  });

  it('renders number/surname badges for each retired number', () => {
    const display = [
      { jerseyNumber: 12, surname: 'VANCE' },
      { jerseyNumber: 80, surname: 'MILLER' },
    ];
    render(<FranchiseLegacyView retiredNumberDisplay={display} />);
    const badges = screen.getAllByTestId('retired-number-badge');
    expect(badges).toHaveLength(2);
    expect(screen.getByText(/#12 VANCE/i)).toBeTruthy();
    expect(screen.getByText(/#80 MILLER/i)).toBeTruthy();
  });

  it('renders number-only badge when surname is null', () => {
    const display = [{ jerseyNumber: 55, surname: null }];
    render(<FranchiseLegacyView retiredNumberDisplay={display} />);
    expect(screen.getByText('#55')).toBeTruthy();
  });

  it('retired numbers panel container has correct testid', () => {
    render(<FranchiseLegacyView retiredNumberDisplay={[{ jerseyNumber: 12, surname: 'JONES' }]} />);
    expect(screen.getByTestId('retired-numbers-panel')).toBeTruthy();
  });
});

// ── FranchiseLegacyView — Retire Number action ───────────────────────────────

describe('FranchiseLegacyView — retire number button on ROH cards', () => {
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
      accolades: [],
      inductionYear: 2027,
      ...overrides,
    };
  }

  it('renders retire button on ROH card when onRetireNumber is provided', () => {
    const onRetire = vi.fn();
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        retiredNumbers={[]}
        onRetireNumber={onRetire}
      />
    );
    expect(screen.getByTestId('retire-number-button')).toBeTruthy();
  });

  it('retire button shows the jersey number', () => {
    const onRetire = vi.fn();
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember({ jerseyNumber: 10 })]}
        retiredNumbers={[]}
        onRetireNumber={onRetire}
      />
    );
    expect(screen.getByText('Retire #10')).toBeTruthy();
  });

  it('calls onRetireNumber with (playerId, jerseyNumber) when clicked', () => {
    const onRetire = vi.fn();
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember({ id: 'p-legend', jerseyNumber: 10 })]}
        retiredNumbers={[]}
        onRetireNumber={onRetire}
      />
    );
    fireEvent.click(screen.getByTestId('retire-number-button'));
    expect(onRetire).toHaveBeenCalledOnce();
    expect(onRetire).toHaveBeenCalledWith('p-legend', 10);
  });

  it('does not render retire button when number is already retired', () => {
    const onRetire = vi.fn();
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember({ jerseyNumber: 10 })]}
        retiredNumbers={[10]}
        onRetireNumber={onRetire}
      />
    );
    expect(screen.queryByTestId('retire-number-button')).toBeNull();
  });

  it('shows retired badge instead when number is already retired', () => {
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember({ jerseyNumber: 10 })]}
        retiredNumbers={[10]}
        onRetireNumber={vi.fn()}
      />
    );
    expect(screen.getByTestId('jersey-retired-badge')).toBeTruthy();
    expect(screen.getByText(/10 Retired/i)).toBeTruthy();
  });

  it('does not render retire button when onRetireNumber is not provided', () => {
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember()]}
        retiredNumbers={[]}
      />
    );
    expect(screen.queryByTestId('retire-number-button')).toBeNull();
  });

  it('does not render retire button when ROH member has no jerseyNumber', () => {
    const onRetire = vi.fn();
    render(
      <FranchiseLegacyView
        ringOfHonor={[makeRohMember({ jerseyNumber: null })]}
        retiredNumbers={[]}
        onRetireNumber={onRetire}
      />
    );
    expect(screen.queryByTestId('retire-number-button')).toBeNull();
  });
});

// ── Empty state safety ────────────────────────────────────────────────────────

describe('FranchiseLegacyView — combined empty states render safely', () => {
  it('renders without crash when all props are empty/default', () => {
    expect(() =>
      render(
        <FranchiseLegacyView
          ringOfHonor={[]}
          allTimeLeaders={null}
          pendingRohCandidates={[]}
          retiredNumbers={[]}
          retiredNumberDisplay={[]}
        />
      )
    ).not.toThrow();
  });

  it('shows empty state for retired numbers section', () => {
    render(<FranchiseLegacyView retiredNumberDisplay={[]} />);
    expect(screen.getByTestId('retired-numbers-empty')).toBeTruthy();
  });

  it('still renders other sections when retiredNumbers is empty', () => {
    render(<FranchiseLegacyView retiredNumberDisplay={[]} />);
    expect(screen.getByTestId('franchise-legacy-view')).toBeTruthy();
    expect(screen.getByText('Ring of Honor')).toBeTruthy();
    expect(screen.getByText('Retired Numbers')).toBeTruthy();
  });
});
