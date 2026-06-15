/** @vitest-environment jsdom */
/**
 * negotiationModifiersUI.test.jsx — Contract Negotiation Depth V2 UI tests
 *
 * Tests for:
 *  - FreeAgency leverage label and reason rendering
 *  - PlayerProfile negotiation profile rendering
 *  - Edge cases: no modifiers, missing fields
 */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getNegotiationContext } from '../../core/contracts/negotiationModifiers.js';
import { getPlayerMoraleSummary } from '../../core/mood/playerMoraleEngine.js';
import { getPlayerAwardSummary } from '../../core/awards/awardEngine.js';

afterEach(cleanup);

// ── Minimal FreeAgency leverage indicator ─────────────────────────────────────
// Mirrors the inline rendering added to FreeAgency.jsx's player row,
// isolated so we can test it without the full FA component tree.

function FaLeverageIndicator({ player }) {
  const leverageLabel = player?.demandProfile?.leverageLabel;
  if (!leverageLabel || leverageLabel === 'Standard') return <div data-testid="no-leverage" />;
  const leverageColor = leverageLabel === 'High Leverage' ? 'var(--warning)' : 'var(--success)';
  const feedbackLine = player?.demandProfile?.feedbackLine;
  return (
    <div data-testid="fa-leverage-indicator">
      <span
        data-testid="fa-leverage-label"
        style={{ color: leverageColor }}
      >
        {leverageLabel}
      </span>
      {feedbackLine && (
        <div data-testid="fa-leverage-reason">{feedbackLine}</div>
      )}
    </div>
  );
}

// ── Minimal PlayerProfile negotiation profile ─────────────────────────────────
// Mirrors the negotiation profile block added to PlayerProfile.jsx.

function NegotiationProfile({ player, meta = {}, season = 2025, userTeamId = 1 }) {
  const moraleSummary = getPlayerMoraleSummary(player);
  const awardSummary = getPlayerAwardSummary(player);
  const negCtx = getNegotiationContext(player, meta, { moraleSummary, awardSummary, currentSeason: season, userTeamId });
  if (!negCtx.feedbackLine && negCtx.leverageLabel === 'Standard') return <div data-testid="no-negotiation-profile" />;
  return (
    <div data-testid="player-profile-negotiation">
      <span data-testid="player-profile-leverage-label">{negCtx.leverageLabel}</span>
      {negCtx.feedbackLine && (
        <span data-testid="player-profile-negotiation-reason">{negCtx.feedbackLine}</span>
      )}
    </div>
  );
}

// ── FreeAgency panel leverage label tests ─────────────────────────────────────

describe('FreeAgency panel leverage indicator', () => {
  it('renders "High Leverage" label for MVP player', () => {
    const player = {
      id: 1,
      demandProfile: {
        leverageLabel: 'High Leverage',
        feedbackLine: 'Recent MVP award increases his market value',
      },
    };
    render(<FaLeverageIndicator player={player} />);
    expect(screen.getByTestId('fa-leverage-indicator')).toBeTruthy();
    expect(screen.getByTestId('fa-leverage-label').textContent).toBe('High Leverage');
  });

  it('renders reason line alongside leverage label', () => {
    const player = {
      id: 2,
      demandProfile: {
        leverageLabel: 'High Leverage',
        feedbackLine: 'Recent MVP award increases his market value',
      },
    };
    render(<FaLeverageIndicator player={player} />);
    expect(screen.getByTestId('fa-leverage-reason').textContent).toContain('MVP');
  });

  it('renders "Discount" label for disgruntled player', () => {
    const player = {
      id: 3,
      demandProfile: {
        leverageLabel: 'Discount',
        feedbackLine: 'Player is frustrated — open to discounted deal',
      },
    };
    render(<FaLeverageIndicator player={player} />);
    expect(screen.getByTestId('fa-leverage-label').textContent).toBe('Discount');
  });

  it('leverage label absent (Standard) shows nothing', () => {
    const player = {
      id: 4,
      demandProfile: {
        leverageLabel: 'Standard',
        feedbackLine: null,
      },
    };
    render(<FaLeverageIndicator player={player} />);
    expect(screen.getByTestId('no-leverage')).toBeTruthy();
    expect(screen.queryByTestId('fa-leverage-indicator')).toBeNull();
  });

  it('leverage label absent when demandProfile missing', () => {
    const player = { id: 5 };
    render(<FaLeverageIndicator player={player} />);
    expect(screen.getByTestId('no-leverage')).toBeTruthy();
  });

  it('renders no reason line when feedbackLine is null', () => {
    const player = {
      id: 6,
      demandProfile: {
        leverageLabel: 'High Leverage',
        feedbackLine: null,
      },
    };
    render(<FaLeverageIndicator player={player} />);
    expect(screen.getByTestId('fa-leverage-label').textContent).toBe('High Leverage');
    expect(screen.queryByTestId('fa-leverage-reason')).toBeNull();
  });
});

// ── PlayerProfile negotiation profile tests ───────────────────────────────────

describe('PlayerProfile negotiation profile', () => {
  it('renders negotiation profile with multiplier label for MVP player', () => {
    const player = {
      id: 10,
      name: 'Star Player',
      pos: 'QB',
      ovr: 85,
      age: 28,
      morale: 70,
      moraleEvents: [],
      awards: [{ type: 'MVP', season: 2024, dedupeKey: 'MVP_2024' }],
    };
    render(<NegotiationProfile player={player} season={2025} />);
    expect(screen.getByTestId('player-profile-negotiation')).toBeTruthy();
    expect(screen.getByTestId('player-profile-leverage-label').textContent).toBe('High Leverage');
  });

  it('renders reason for disgruntled player', () => {
    const player = {
      id: 11,
      name: 'Upset Player',
      pos: 'RB',
      ovr: 75,
      age: 27,
      morale: 25,
      moraleEvents: [],
      awards: [],
    };
    render(<NegotiationProfile player={player} season={2025} />);
    expect(screen.getByTestId('player-profile-leverage-label').textContent).toBe('Discount');
    expect(screen.getByTestId('player-profile-negotiation-reason').textContent).toMatch(/frustrated/i);
  });

  it('renders nothing for neutral player with no modifiers', () => {
    const player = {
      id: 12,
      name: 'Average Joe',
      pos: 'WR',
      ovr: 72,
      age: 26,
      morale: 70,
      moraleEvents: [],
      awards: [],
    };
    render(<NegotiationProfile player={player} season={2025} />);
    expect(screen.getByTestId('no-negotiation-profile')).toBeTruthy();
    expect(screen.queryByTestId('player-profile-negotiation')).toBeNull();
  });

  it('renders safely when player.awards is absent (old save)', () => {
    const player = { id: 13, name: 'Legacy', pos: 'TE', ovr: 70, age: 30 };
    expect(() => render(<NegotiationProfile player={player} />)).not.toThrow();
    expect(screen.getByTestId('no-negotiation-profile')).toBeTruthy();
  });

  it('renders safely when player.morale is absent (old save)', () => {
    const player = { id: 14, name: 'Morale-Free', pos: 'CB', ovr: 71, age: 29, awards: [] };
    expect(() => render(<NegotiationProfile player={player} />)).not.toThrow();
  });

  it('renders franchise reputation reason when championship franchise', () => {
    const player = {
      id: 15,
      name: 'Ring Chaser',
      pos: 'WR',
      ovr: 80,
      age: 27,
      morale: 70,
      moraleEvents: [],
      awards: [],
    };
    const meta = {
      season: 2025,
      userTeamId: 1,
      franchiseAwards: [
        { type: 'LEAGUE_CHAMPION', season: 2023, teamId: 1 },
        { type: 'LEAGUE_CHAMPION', season: 2024, teamId: 1 },
      ],
    };
    render(<NegotiationProfile player={player} meta={meta} season={2025} userTeamId={1} />);
    expect(screen.getByTestId('player-profile-leverage-label').textContent).toBe('Discount');
    expect(screen.getByTestId('player-profile-negotiation-reason').textContent).toMatch(/championship/i);
  });

  it('thriving player shows High Leverage label', () => {
    const player = {
      id: 16,
      name: 'Happy Player',
      pos: 'QB',
      ovr: 82,
      age: 29,
      morale: 92,
      moraleEvents: [],
      awards: [],
    };
    render(<NegotiationProfile player={player} season={2025} />);
    expect(screen.getByTestId('player-profile-leverage-label').textContent).toBe('High Leverage');
    expect(screen.getByTestId('player-profile-negotiation-reason').textContent).toMatch(/thriving/i);
  });
});
