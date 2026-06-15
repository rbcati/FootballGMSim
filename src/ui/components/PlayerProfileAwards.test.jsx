/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AWARD_TYPES } from '../../core/awards/awardEngine.js';

// Minimal PlayerProfile stub — we test only the Career Awards shelf block
// by importing the summary helper directly and testing its rendering contract.
import { getPlayerAwardSummary } from '../../core/awards/awardEngine.js';

afterEach(cleanup);

function AwardShelf({ player, teams = [] }) {
  const awardSummary = getPlayerAwardSummary(player);
  if (awardSummary.totalAwards === 0) return <div data-testid="no-awards" />;
  const teamAbbrById = new Map((teams ?? []).map(t => [String(t.id), t.abbr]));
  return (
    <div data-testid="player-profile-career-awards">
      {awardSummary.summaryLine && (
        <div data-testid="player-profile-award-summary">{awardSummary.summaryLine}</div>
      )}
      {awardSummary.highlights.map(h => (
        <div key={h.dedupeKey} data-testid={`award-row-${h.dedupeKey}`}>
          {h.season} {h.label}
          {h.teamId != null && <span> · {teamAbbrById.get(String(h.teamId)) ?? h.teamId}</span>}
        </div>
      ))}
    </div>
  );
}

describe('PlayerProfile career trophy shelf', () => {
  it('renders award summary when player has awards', () => {
    const player = {
      awards: [
        { type: AWARD_TYPES.MVP, season: 2025, dedupeKey: 'MVP_2025', teamId: 1 },
        { type: AWARD_TYPES.ALL_PRO_QB, season: 2025, dedupeKey: 'ALL_PRO_QB_2025', teamId: 1 },
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: 2025, dedupeKey: 'LEAGUE_CHAMPION_2025', teamId: 1 },
      ],
    };
    const teams = [{ id: 1, abbr: 'KC' }];
    render(<AwardShelf player={player} teams={teams} />);
    expect(screen.getByTestId('player-profile-career-awards')).toBeTruthy();
    expect(screen.getByTestId('player-profile-award-summary').textContent).toContain('MVP');
    expect(screen.getByTestId('player-profile-award-summary').textContent).toContain('Champion');
  });

  it('renders nothing meaningful when player has no awards', () => {
    const player = { id: 1, name: 'No Awards', awards: [] };
    render(<AwardShelf player={player} />);
    expect(screen.getByTestId('no-awards')).toBeTruthy();
    expect(screen.queryByTestId('player-profile-career-awards')).toBeNull();
  });

  it('renders nothing when player.awards field is absent', () => {
    const player = { id: 1, name: 'Legacy Player' };
    render(<AwardShelf player={player} />);
    expect(screen.getByTestId('no-awards')).toBeTruthy();
  });

  it('shows team abbreviation next to award', () => {
    const player = {
      awards: [
        { type: AWARD_TYPES.MVP, season: 2025, dedupeKey: 'MVP_2025', teamId: 5 },
      ],
    };
    const teams = [{ id: 5, abbr: 'PHI' }];
    render(<AwardShelf player={player} teams={teams} />);
    expect(screen.getByTestId('player-profile-career-awards').textContent).toContain('PHI');
  });
});

// ── FranchiseHQ Trophy Case ───────────────────────────────────────────────────

function TrophyCase({ league }) {
  const userTeamId = Number(league?.userTeamId);
  const franchiseAwards = Array.isArray(league?.franchiseAwards) ? league.franchiseAwards : [];
  const championships = franchiseAwards.filter(a => a.type === AWARD_TYPES.LEAGUE_CHAMPION && Number(a.teamId) === userTeamId);
  if (!championships.length) return <div data-testid="no-trophies" />;
  return (
    <div data-testid="hq-trophy-case">
      {championships.map(c => (
        <div key={`champ-${c.season}`} data-testid={`trophy-champ-${c.season}`}>
          {c.season} League Champions
        </div>
      ))}
    </div>
  );
}

describe('FranchiseHQ trophy case', () => {
  it('renders championship entry when franchise has won', () => {
    const league = {
      userTeamId: 1,
      franchiseAwards: [
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: 2025, teamId: 1 },
      ],
    };
    render(<TrophyCase league={league} />);
    expect(screen.getByTestId('hq-trophy-case')).toBeTruthy();
    expect(screen.getByTestId('trophy-champ-2025')).toBeTruthy();
  });

  it('renders empty when no championships', () => {
    const league = { userTeamId: 1, franchiseAwards: [] };
    render(<TrophyCase league={league} />);
    expect(screen.getByTestId('no-trophies')).toBeTruthy();
    expect(screen.queryByTestId('hq-trophy-case')).toBeNull();
  });

  it('does not show championships from other teams', () => {
    const league = {
      userTeamId: 1,
      franchiseAwards: [
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: 2025, teamId: 2 },
      ],
    };
    render(<TrophyCase league={league} />);
    expect(screen.getByTestId('no-trophies')).toBeTruthy();
    expect(screen.queryByTestId('hq-trophy-case')).toBeNull();
  });
});

// ── Season Awards Panel ───────────────────────────────────────────────────────

function SeasonAwardsPanel({ league }) {
  const phase = league?.phase ?? 'regular';
  const isPostSeason = !['regular', 'preseason', 'playoffs'].includes(phase);
  if (!isPostSeason) return <div data-testid="season-awards-hidden" />;
  const leagueHistory = Array.isArray(league?.leagueHistory) ? league.leagueHistory : [];
  const lastSeason = leagueHistory[leagueHistory.length - 1];
  if (!lastSeason?.awards) return <div data-testid="season-awards-empty" />;
  const aw = lastSeason.awards;
  const mvp = aw.mvp;
  return (
    <div data-testid="season-awards-panel">
      {mvp && <div data-testid="season-awards-mvp">{mvp.name} — MVP</div>}
    </div>
  );
}

describe('LeagueDashboard Season Awards panel', () => {
  it('shows after season end phase', () => {
    const league = {
      phase: 'offseason_resign',
      leagueHistory: [{ year: 2025, awards: { mvp: { playerId: 1, name: 'QB Star', teamId: 1, pos: 'QB' } } }],
    };
    render(<SeasonAwardsPanel league={league} />);
    expect(screen.getByTestId('season-awards-panel')).toBeTruthy();
    expect(screen.getByTestId('season-awards-mvp').textContent).toContain('QB Star');
  });

  it('is hidden during active regular season', () => {
    const league = { phase: 'regular', leagueHistory: [] };
    render(<SeasonAwardsPanel league={league} />);
    expect(screen.getByTestId('season-awards-hidden')).toBeTruthy();
    expect(screen.queryByTestId('season-awards-panel')).toBeNull();
  });

  it('is hidden during playoffs', () => {
    const league = { phase: 'playoffs', leagueHistory: [] };
    render(<SeasonAwardsPanel league={league} />);
    expect(screen.getByTestId('season-awards-hidden')).toBeTruthy();
  });

  it('shows empty when no award history', () => {
    const league = { phase: 'draft', leagueHistory: [] };
    render(<SeasonAwardsPanel league={league} />);
    expect(screen.getByTestId('season-awards-empty')).toBeTruthy();
    expect(screen.queryByTestId('season-awards-panel')).toBeNull();
  });
});
