/** @vitest-environment jsdom */
/**
 * FranchiseLegacyView.test.jsx
 * UI tests for the Franchise Ring of Honor gallery and leaders panel.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FranchiseLegacyView from './FranchiseLegacyView.jsx';

afterEach(() => cleanup());

// ── Shared fixtures ───────────────────────────────────────────────────────────

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

function makePendingCandidate(overrides = {}) {
  return {
    playerId: 'p-candidate',
    teamId:   '3',
    title:    'Ring of Honor Candidate',
    body:     'Al Candidate retired after 7 seasons. Induct him into the Ring of Honor?',
    ...overrides,
  };
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe('FranchiseLegacyView — empty state', () => {
  it('renders the empty state message when no ROH members exist', () => {
    render(<FranchiseLegacyView ringOfHonor={[]} />);
    expect(screen.getByTestId('roh-empty-state')).toBeTruthy();
    expect(screen.getByText(/No members yet/i)).toBeTruthy();
  });

  it('does not render roh-card elements when ringOfHonor is empty', () => {
    render(<FranchiseLegacyView ringOfHonor={[]} />);
    expect(screen.queryAllByTestId('roh-card')).toHaveLength(0);
  });

  it('renders the all-time leaders section even when leaders are null', () => {
    render(<FranchiseLegacyView ringOfHonor={[]} allTimeLeaders={null} />);
    expect(screen.getByTestId('all-time-leaders-panel')).toBeTruthy();
  });

  it('shows dash placeholders in leaders panel when no leader entries exist', () => {
    render(<FranchiseLegacyView ringOfHonor={[]} allTimeLeaders={null} />);
    const panel = screen.getByTestId('all-time-leaders-panel');
    // Four rows, each with a dash for name and value
    expect(panel).toBeTruthy();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Ring of Honor gallery ─────────────────────────────────────────────────────

describe('FranchiseLegacyView — ROH gallery', () => {
  it('renders inducted members as roh-cards', () => {
    const roh = [makeRohMember(), makeRohMember({ id: 'p2', name: 'Rush King', position: 'RB', jerseyNumber: 33 })];
    render(<FranchiseLegacyView ringOfHonor={roh} />);
    expect(screen.getAllByTestId('roh-card')).toHaveLength(2);
  });

  it('shows jersey number and name on each card', () => {
    render(<FranchiseLegacyView ringOfHonor={[makeRohMember()]} />);
    expect(screen.getByText('#10')).toBeTruthy();
    expect(screen.getByText('Dan Legend')).toBeTruthy();
  });

  it('shows induction year on the card', () => {
    render(<FranchiseLegacyView ringOfHonor={[makeRohMember()]} />);
    expect(screen.getByText('2027')).toBeTruthy();
  });

  it('shows accolades chips on the card', () => {
    render(<FranchiseLegacyView ringOfHonor={[makeRohMember()]} />);
    expect(screen.getByText('MVP (2022)')).toBeTruthy();
    expect(screen.getByText('Champion (2023)')).toBeTruthy();
  });

  it('shows career stat summary for a QB', () => {
    render(<FranchiseLegacyView ringOfHonor={[makeRohMember()]} />);
    // 35,000 formatted as "35,000 pass yds"
    expect(screen.getByText(/35,000 pass yds/i)).toBeTruthy();
  });

  it('does not show stat row when all stats are null', () => {
    const noStatsMember = makeRohMember({
      totalPassingYards: null,
      totalRushingYards: null,
      totalReceivingYards: null,
      totalSacks: null,
    });
    render(<FranchiseLegacyView ringOfHonor={[noStatsMember]} />);
    expect(screen.queryByText(/pass yds/i)).toBeNull();
  });

  it('does not show empty accolades list when accolades is empty', () => {
    const noAccolades = makeRohMember({ accolades: [] });
    render(<FranchiseLegacyView ringOfHonor={[noAccolades]} />);
    // No accolade chips should render
    expect(screen.queryByText('MVP (2022)')).toBeNull();
  });
});

// ── All-time franchise leaders panel ─────────────────────────────────────────

describe('FranchiseLegacyView — leaders panel', () => {
  it('renders four leader category rows', () => {
    render(<FranchiseLegacyView allTimeLeaders={makeAllTimeLeaders()} />);
    expect(screen.getByTestId('leader-row-passingYards')).toBeTruthy();
    expect(screen.getByTestId('leader-row-rushingYards')).toBeTruthy();
    expect(screen.getByTestId('leader-row-receivingYards')).toBeTruthy();
    expect(screen.getByTestId('leader-row-sacks')).toBeTruthy();
  });

  it('displays leader names and formatted values', () => {
    render(<FranchiseLegacyView allTimeLeaders={makeAllTimeLeaders()} />);
    expect(screen.getByText('Dan Legend')).toBeTruthy();
    expect(screen.getByText('35,000')).toBeTruthy();
    expect(screen.getByText('Rush King')).toBeTruthy();
    expect(screen.getByText('12,000')).toBeTruthy();
  });

  it('shows dash when a specific leader category is null', () => {
    render(<FranchiseLegacyView allTimeLeaders={{ passingYards: null, rushingYards: null, receivingYards: null, sacks: null }} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Induction prompt card ─────────────────────────────────────────────────────

describe('FranchiseLegacyView — induction prompt', () => {
  it('renders induction prompt for a pending candidate', () => {
    render(<FranchiseLegacyView pendingRohCandidates={[makePendingCandidate()]} />);
    expect(screen.getByTestId('roh-induction-prompt')).toBeTruthy();
    expect(screen.getByText('Ring of Honor Candidate')).toBeTruthy();
    expect(screen.getByText(/Al Candidate retired/i)).toBeTruthy();
  });

  it('renders "Induct into Ring of Honor" button', () => {
    render(<FranchiseLegacyView pendingRohCandidates={[makePendingCandidate()]} />);
    expect(screen.getByTestId('induct-roh-button')).toBeTruthy();
    expect(screen.getByText('Induct into Ring of Honor')).toBeTruthy();
  });

  it('renders "Not Now" dismiss button when onDismissCandidate is provided', () => {
    const onDismiss = vi.fn();
    render(
      <FranchiseLegacyView
        pendingRohCandidates={[makePendingCandidate()]}
        onDismissCandidate={onDismiss}
      />
    );
    expect(screen.getByTestId('dismiss-roh-button')).toBeTruthy();
  });

  it('does NOT render dismiss button when onDismissCandidate is not provided', () => {
    render(<FranchiseLegacyView pendingRohCandidates={[makePendingCandidate()]} />);
    expect(screen.queryByTestId('dismiss-roh-button')).toBeNull();
  });

  it('calls onInduct with correct playerId and teamId when button is clicked', () => {
    const onInduct = vi.fn();
    const candidate = makePendingCandidate({ playerId: 'p-candidate', teamId: '3' });
    render(
      <FranchiseLegacyView
        pendingRohCandidates={[candidate]}
        onInduct={onInduct}
      />
    );
    fireEvent.click(screen.getByTestId('induct-roh-button'));
    expect(onInduct).toHaveBeenCalledOnce();
    expect(onInduct).toHaveBeenCalledWith('p-candidate', '3');
  });

  it('calls onDismissCandidate with playerId when "Not Now" is clicked', () => {
    const onDismiss = vi.fn();
    const candidate = makePendingCandidate({ playerId: 'p-candidate' });
    render(
      <FranchiseLegacyView
        pendingRohCandidates={[candidate]}
        onDismissCandidate={onDismiss}
      />
    );
    fireEvent.click(screen.getByTestId('dismiss-roh-button'));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith('p-candidate');
  });

  it('renders multiple candidate prompts when multiple candidates are pending', () => {
    const candidates = [
      makePendingCandidate({ playerId: 'c1', title: 'Ring of Honor Candidate' }),
      makePendingCandidate({ playerId: 'c2', title: 'Ring of Honor Candidate' }),
    ];
    render(<FranchiseLegacyView pendingRohCandidates={candidates} />);
    expect(screen.getAllByTestId('roh-induction-prompt')).toHaveLength(2);
    expect(screen.getAllByTestId('induct-roh-button')).toHaveLength(2);
  });

  it('does not render the candidates section when pendingRohCandidates is empty', () => {
    render(<FranchiseLegacyView pendingRohCandidates={[]} ringOfHonor={[makeRohMember()]} />);
    expect(screen.queryByTestId('roh-candidates-section')).toBeNull();
  });
});

// ── Structural / accessibility ────────────────────────────────────────────────

describe('FranchiseLegacyView — structure', () => {
  it('renders the root franchise-legacy-view container', () => {
    render(<FranchiseLegacyView />);
    expect(screen.getByTestId('franchise-legacy-view')).toBeTruthy();
  });

  it('renders Ring of Honor and Franchise Leaders sections in all cases', () => {
    render(<FranchiseLegacyView />);
    expect(screen.getByText('Ring of Honor')).toBeTruthy();
    expect(screen.getByText('Franchise Leaders')).toBeTruthy();
  });

  it('renders with all default props (no crash)', () => {
    expect(() => render(<FranchiseLegacyView />)).not.toThrow();
  });
});
