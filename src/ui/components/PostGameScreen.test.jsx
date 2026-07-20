/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render, act, screen } from '@testing-library/react';
import PostGameScreen from './PostGameScreen.jsx';

describe('PostGameScreen resilience', () => {
  it('renders without crashing when logs are missing', () => {
    const html = renderToString(
      <PostGameScreen
        homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
        awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
        homeScore={21}
        awayScore={14}
        userTeamId={1}
        onContinue={() => {}}
      />,
    );

    expect(html).toContain('Back to Hub');
  });
});

describe('PostGameScreen onArchiveReady payload', () => {
  beforeEach(() => { cleanup(); });

  it('persists the canonical playerStats (not narration logs) in the archive payload', async () => {
    const archiveSpy = vi.fn();
    // Canonical box score is the authority; narration logs must NOT be the
    // source of archived player totals.
    const playerStats = {
      home: {
        10: { name: 'Home QB', pos: 'QB', stats: { passComp: 24, passAtt: 34, passYd: 288, passTD: 3 } },
        30: { name: 'Home RB', pos: 'RB', stats: { rushAtt: 18, rushYd: 92, rushTD: 1 } },
      },
      away: {
        20: { name: 'Away QB', pos: 'QB', stats: { passComp: 19, passAtt: 30, passYd: 205 } },
      },
    };
    const logs = [
      { teamId: 1, passer: { id: 99, name: 'Narration Ghost QB', pos: 'QB' }, passYds: 15, completed: true },
    ];

    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
          awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
          homeScore={28}
          awayScore={21}
          userTeamId={1}
          boxScoreGameId="test-game-123"
          logs={logs}
          playerStats={playerStats}
          week={3}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });

    expect(archiveSpy).toHaveBeenCalledOnce();
    const payload = archiveSpy.mock.calls[0][0];
    expect(payload.playerStats).toEqual(playerStats);
    // The narration-only "ghost" passer never leaks into archived player stats.
    const allNames = [...Object.values(payload.playerStats.home), ...Object.values(payload.playerStats.away)].map((r) => r.name);
    expect(allNames).not.toContain('Narration Ghost QB');
  });

  it('persists canonical teamStats unchanged when supplied', async () => {
    const archiveSpy = vi.fn();
    const playerStats = { home: { 10: { name: 'Home QB', pos: 'QB', stats: { passAtt: 1, passComp: 1, passYd: 12 } } }, away: {} };
    const teamStats = {
      home: { passYards: 12, rushYards: 90, totalYards: 102, firstDowns: 11, thirdDownMade: 4, thirdDownAtt: 9, redZoneMade: 1, redZoneAtt: 2, turnovers: 0, plays: 55, yardsPerPlay: 1.85 },
      away: { passYards: 0, rushYards: 80, totalYards: 80, firstDowns: 8, thirdDownMade: 2, thirdDownAtt: 8, redZoneMade: 0, redZoneAtt: 1, turnovers: 1, plays: 50, yardsPerPlay: 1.6 },
    };

    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
          awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
          homeScore={10}
          awayScore={7}
          userTeamId={1}
          boxScoreGameId="team-stats-game"
          playerStats={playerStats}
          teamStats={teamStats}
          week={1}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });

    expect(archiveSpy).toHaveBeenCalledOnce();
    expect(archiveSpy.mock.calls[0][0].teamStats).toBe(teamStats);
  });

  it('preserves player names in canonical playerStats', async () => {
    const archiveSpy = vi.fn();
    const playerStats = {
      home: { 10: { name: 'Home QB', pos: 'QB', stats: { passComp: 18, passAtt: 27, passYd: 210 } } },
      away: { 20: { name: 'Away QB', pos: 'QB', stats: { passComp: 14, passAtt: 24, passYd: 160 } } },
    };

    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
          awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
          homeScore={17}
          awayScore={14}
          userTeamId={1}
          boxScoreGameId="test-game-456"
          playerStats={playerStats}
          week={1}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });

    expect(archiveSpy).toHaveBeenCalledOnce();
    const payload = archiveSpy.mock.calls[0][0];
    const homeQB = Object.values(payload.playerStats.home).find((r) => r.name === 'Home QB');
    const awayQB = Object.values(payload.playerStats.away).find((r) => r.name === 'Away QB');
    expect(homeQB).toBeDefined();
    expect(awayQB).toBeDefined();
    expect(homeQB.stats.passAtt).toBeGreaterThanOrEqual(1);
    expect(awayQB.stats.passAtt).toBeGreaterThanOrEqual(1);
  });

  it('does not crash when canonical stats are absent and still archives empty playerStats', async () => {
    const archiveSpy = vi.fn();
    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
          awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
          homeScore={3}
          awayScore={0}
          userTeamId={1}
          boxScoreGameId="empty-game"
          logs={[]}
          week={2}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });
    expect(archiveSpy).toHaveBeenCalledOnce();
    const payload = archiveSpy.mock.calls[0][0];
    expect(payload.playerStats).toBeDefined();
    expect(payload.playerStats.home).toEqual({});
    expect(payload.playerStats.away).toEqual({});
  });

  it('does not persist archives or allow Game Book navigation when the strict final is missing', async () => {
    const archiveSpy = vi.fn();
    const openSpy = vi.fn();
    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
          awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
          homeScore={null}
          awayScore={null}
          userTeamId={1}
          boxScoreGameId="pending-game"
          logs={[]}
          week={2}
          onArchiveReady={archiveSpy}
          onOpenBoxScore={openSpy}
          onContinue={() => {}}
        />,
      );
    });

    expect(document.body.textContent).not.toMatch(/VICTORY|DEFEAT|\\bTIE\\b|Game saved/i);
    expect(archiveSpy).not.toHaveBeenCalled();
    const cta = screen.getByTestId('box-score-trigger');
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('treats a genuine 0-0 canonical result as a real tie', async () => {
    const archiveSpy = vi.fn();
    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
          awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
          homeScore={0}
          awayScore={0}
          userTeamId={1}
          boxScoreGameId="zero-zero-game"
          logs={[]}
          week={2}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });

    expect(screen.getByTestId('postgame-result-banner').textContent).toContain('TIE');
    expect(screen.getByTestId('box-score-trigger').disabled).toBe(false);
    expect(archiveSpy).toHaveBeenCalledOnce();
    expect(archiveSpy.mock.calls[0][0]).toMatchObject({ homeScore: 0, awayScore: 0 });
  });
});
