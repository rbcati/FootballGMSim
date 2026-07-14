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

  it('includes playerStats derived from logs in the archive payload', async () => {
    const archiveSpy = vi.fn();
    const logs = [
      { teamId: 1, passer: { id: 10, name: 'Home QB', pos: 'QB' }, passYds: 220, completed: true },
      { teamId: 1, passer: { id: 10, name: 'Home QB', pos: 'QB' }, passYds: 15, completed: true, isTouchdown: true, tdType: 'pass' },
      { teamId: 2, passer: { id: 20, name: 'Away QB', pos: 'QB' }, passYds: 180, completed: true },
      { teamId: 1, player: { id: 30, name: 'Home RB', pos: 'RB' }, rushYds: 55, type: 'run' },
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
          week={3}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });

    expect(archiveSpy).toHaveBeenCalledOnce();
    const payload = archiveSpy.mock.calls[0][0];
    expect(payload.playerStats).toBeDefined();
    expect(payload.playerStats.home).toBeDefined();
    expect(payload.playerStats.away).toBeDefined();
  });

  it('preserves player names in derived playerStats', async () => {
    const archiveSpy = vi.fn();
    const logs = [
      { teamId: 1, passer: { id: 10, name: 'Home QB', pos: 'QB' }, passYds: 200, completed: true },
      { teamId: 2, passer: { id: 20, name: 'Away QB', pos: 'QB' }, passYds: 150, completed: true },
    ];

    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
          awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
          homeScore={17}
          awayScore={14}
          userTeamId={1}
          boxScoreGameId="test-game-456"
          logs={logs}
          week={1}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });

    expect(archiveSpy).toHaveBeenCalledOnce();
    const payload = archiveSpy.mock.calls[0][0];
    const homeRows = Object.values(payload.playerStats.home);
    const awayRows = Object.values(payload.playerStats.away);
    const homeQB = homeRows.find((r) => r.name === 'Home QB');
    const awayQB = awayRows.find((r) => r.name === 'Away QB');
    expect(homeQB).toBeDefined();
    expect(awayQB).toBeDefined();
    expect(homeQB.stats.passAtt).toBeGreaterThanOrEqual(1);
    expect(awayQB.stats.passAtt).toBeGreaterThanOrEqual(1);
  });

  it('does not crash when logs are empty and still calls onArchiveReady with empty playerStats', async () => {
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
