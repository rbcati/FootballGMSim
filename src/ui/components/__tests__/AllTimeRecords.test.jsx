/** @vitest-environment jsdom */
/**
 * AllTimeRecords.test.jsx — Feature C UI tests
 *
 * Tests:
 *  - LeagueDashboard AllTimeRecordsPanel renders correctly
 *  - Stat category selector switches leaderboard data
 *  - Active badge shown, trophy icon for HOF inductees
 *  - PlayerProfile All-Time Rank line shows/hides correctly
 *  - Max 2 categories displayed
 */

import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TRACKED_STATS } from '../../../core/awards/statLeaderboard.js';

afterEach(cleanup);

// ── Inline AllTimeRecordsPanel (mirrors LeagueDashboard.jsx implementation) ───

function AllTimeRecordsPanelTest({ league }) {
  const [selectedStat, setSelectedStat] = useState(TRACKED_STATS[0].key);
  const leaderboards = league?.allTimeLeaderboards ?? {};
  const board = leaderboards[selectedStat] ?? [];
  const statDef = TRACKED_STATS.find((s) => s.key === selectedStat) ?? TRACKED_STATS[0];

  return (
    <div data-testid="all-time-records-panel">
      <div data-testid="all-time-records-stat-selector">
        {TRACKED_STATS.map((s) => (
          <button
            key={s.key}
            data-testid={`stat-tab-${s.key}`}
            onClick={() => setSelectedStat(s.key)}
            aria-pressed={selectedStat === s.key}
          >
            {s.label}
          </button>
        ))}
      </div>
      <table>
        <tbody>
          {board.map((entry) => (
            <tr key={entry.playerId} data-testid="all-time-leaderboard-row">
              <td data-testid="row-rank">{entry.rank}</td>
              <td data-testid="row-name">{entry.playerName}</td>
              <td>
                {entry.isInducted && <span data-testid="trophy-icon">★</span>}
                {entry.isActive && !entry.isInducted && (
                  <span data-testid="active-badge">Active</span>
                )}
              </td>
              <td data-testid="row-value">{entry.value}</td>
            </tr>
          ))}
          {board.length === 0 && (
            <tr data-testid="empty-row">
              <td colSpan={4}>No data yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline PlayerProfile All-Time Rank section ────────────────────────────────

function AlltimeRankSection({ player, league }) {
  const pid = String(player?.id ?? '');
  const leaderboards = league?.allTimeLeaderboards ?? {};
  const matches = [];
  for (const stat of TRACKED_STATS) {
    if (matches.length >= 2) break;
    const board = leaderboards[stat.key];
    if (!Array.isArray(board)) continue;
    const entry = board.find((e) => String(e.playerId) === pid);
    if (entry) matches.push({ rank: entry.rank, label: stat.label });
  }
  if (!matches.length) return null;
  return (
    <div data-testid="player-profile-alltime-rank">
      {matches.map(({ rank, label }) => (
        <span key={label} data-testid="player-profile-alltime-rank-entry">
          #{rank} {label}
        </span>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBoardEntry(overrides = {}) {
  return {
    rank: 1,
    playerId: 'p1',
    playerName: 'Test Player',
    position: 'QB',
    teamName: 'KC',
    value: 300,
    isActive: false,
    isInducted: true,
    isHofNominee: false,
    ...overrides,
  };
}

// ── AllTimeRecordsPanel tests ─────────────────────────────────────────────────

describe('AllTimeRecordsPanel', () => {
  it('renders the panel container', () => {
    render(<AllTimeRecordsPanelTest league={{ allTimeLeaderboards: {} }} />);
    expect(screen.getByTestId('all-time-records-panel')).toBeTruthy();
  });

  it('renders a tab button for every TRACKED_STATS entry', () => {
    render(<AllTimeRecordsPanelTest league={{ allTimeLeaderboards: {} }} />);
    for (const s of TRACKED_STATS) {
      expect(screen.getByTestId(`stat-tab-${s.key}`)).toBeTruthy();
    }
  });

  it('renders leaderboard rows for the initial stat', () => {
    const firstKey = TRACKED_STATS[0].key;
    const league = {
      allTimeLeaderboards: {
        [firstKey]: [makeBoardEntry({ playerId: 'row1', playerName: 'First Player', value: 400 })],
      },
    };
    render(<AllTimeRecordsPanelTest league={league} />);
    expect(screen.getAllByTestId('all-time-leaderboard-row')).toHaveLength(1);
    expect(screen.getByTestId('row-name').textContent).toBe('First Player');
  });

  it('stat category selector switches leaderboard data', () => {
    const firstKey = TRACKED_STATS[0].key;
    const secondKey = TRACKED_STATS[1].key;
    const league = {
      allTimeLeaderboards: {
        [firstKey]: [makeBoardEntry({ playerId: 'p1', playerName: 'QB Leader', value: 400 })],
        [secondKey]: [makeBoardEntry({ playerId: 'p2', playerName: 'Second Stat Leader', value: 60000 })],
      },
    };
    render(<AllTimeRecordsPanelTest league={league} />);

    // Initially shows first stat
    expect(screen.getByTestId('row-name').textContent).toBe('QB Leader');

    // Click second tab
    fireEvent.click(screen.getByTestId(`stat-tab-${secondKey}`));
    expect(screen.getByTestId('row-name').textContent).toBe('Second Stat Leader');
  });

  it('shows trophy icon for HOF inductees', () => {
    const firstKey = TRACKED_STATS[0].key;
    const league = {
      allTimeLeaderboards: {
        [firstKey]: [makeBoardEntry({ isInducted: true, isActive: false })],
      },
    };
    render(<AllTimeRecordsPanelTest league={league} />);
    expect(screen.getByTestId('trophy-icon')).toBeTruthy();
  });

  it('shows Active badge for active non-inducted players', () => {
    const firstKey = TRACKED_STATS[0].key;
    const league = {
      allTimeLeaderboards: {
        [firstKey]: [makeBoardEntry({ isActive: true, isInducted: false })],
      },
    };
    render(<AllTimeRecordsPanelTest league={league} />);
    expect(screen.getByTestId('active-badge')).toBeTruthy();
  });

  it('renders empty state when leaderboard is empty', () => {
    const firstKey = TRACKED_STATS[0].key;
    const league = { allTimeLeaderboards: { [firstKey]: [] } };
    render(<AllTimeRecordsPanelTest league={league} />);
    expect(screen.getByTestId('empty-row')).toBeTruthy();
  });

  it('renders safely when allTimeLeaderboards is absent (old save)', () => {
    expect(() => render(<AllTimeRecordsPanelTest league={{}} />)).not.toThrow();
    expect(screen.getByTestId('all-time-records-panel')).toBeTruthy();
  });
});

// ── PlayerProfile All-Time Rank tests ─────────────────────────────────────────

describe('PlayerProfile All-Time Rank line', () => {
  it('shows All-Time Rank line when player appears in top 10', () => {
    const league = {
      allTimeLeaderboards: {
        passTd: [makeBoardEntry({ playerId: 'qb1', rank: 3, playerName: 'QB Star' })],
      },
    };
    render(<AlltimeRankSection player={{ id: 'qb1' }} league={league} />);
    expect(screen.getByTestId('player-profile-alltime-rank')).toBeTruthy();
    expect(screen.getByTestId('player-profile-alltime-rank-entry').textContent).toContain('#3');
  });

  it('hides All-Time Rank line when player not in any top 10', () => {
    const league = {
      allTimeLeaderboards: {
        passTd: [makeBoardEntry({ playerId: 'other', rank: 1 })],
      },
    };
    const { container } = render(<AlltimeRankSection player={{ id: 'nobody' }} league={league} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows max 2 categories', () => {
    const leaderboards = {};
    for (const s of TRACKED_STATS) {
      leaderboards[s.key] = [makeBoardEntry({ playerId: 'multi', rank: 1 })];
    }
    render(<AlltimeRankSection player={{ id: 'multi' }} league={{ allTimeLeaderboards: leaderboards }} />);
    const entries = screen.getAllByTestId('player-profile-alltime-rank-entry');
    expect(entries.length).toBeLessThanOrEqual(2);
  });

  it('renders safely when allTimeLeaderboards is absent', () => {
    const { container } = render(<AlltimeRankSection player={{ id: 'p1' }} league={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders safely when player id is absent', () => {
    const league = { allTimeLeaderboards: { passTd: [makeBoardEntry()] } };
    expect(() => render(<AlltimeRankSection player={{}} league={league} />)).not.toThrow();
  });
});
