/** @vitest-environment jsdom */
/**
 * End-to-end canonical data-flow integration:
 *   simulateBatch → worker PLAY_LOGS payload → PostGameScreen → archive → Game Book
 *
 * Proves the SAME canonical box score flows unaltered through every stage and
 * that the passing leader + final score agree on the postgame screen and in the
 * Game Book view model. No live worker: we reproduce the exact PLAY_LOGS payload
 * that `handleWatchGame` posts, then drive the real UI + archive + Game Book code.
 */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Utils as U } from '../../../core/utils.js';
import { simulateBatch } from '../../../core/simulation/index.js';
import { buildPlayerLeadersFromArchive } from '../../../core/gameSummary.js';
import { buildBoxScoreViewModel } from '../../utils/boxScoreViewModel.js';
import PostGameScreen from '../PostGameScreen.jsx';

function makePlayer(id, pos, ovr = 75) {
  const ratings = {
    QB: { throwPower: 82, throwAccuracy: 84, awareness: 82, speed: 70 },
    RB: { speed: 88, trucking: 80, juking: 84 }, WR: { speed: 90, catching: 88 },
    TE: { speed: 76, catching: 80 }, OL: { passBlock: 80, runBlock: 80 },
    DL: { tackle: 76, strength: 80 }, LB: { tackle: 80 }, CB: { speed: 86 },
    S: { tackle: 74 }, K: { kickAccuracy: 82 }, P: { kickPower: 80 },
  };
  return { id: `${id}`, pos, ovr, name: `${pos} ${id}`, ratings: ratings[pos] || {}, stats: { game: {}, season: {} } };
}
function buildTeam(id, abbr) {
  return {
    id, abbr, name: abbr,
    roster: [
      makePlayer(`${id}-qb1`, 'QB', 88), makePlayer(`${id}-qb2`, 'QB', 74),
      makePlayer(`${id}-rb1`, 'RB', 84), makePlayer(`${id}-rb2`, 'RB', 74),
      makePlayer(`${id}-wr1`, 'WR', 86), makePlayer(`${id}-wr2`, 'WR', 80), makePlayer(`${id}-wr3`, 'WR', 74),
      makePlayer(`${id}-te1`, 'TE', 78),
      ...[1, 2, 3, 4, 5].map((i) => makePlayer(`${id}-ol${i}`, 'OL', 76)),
      makePlayer(`${id}-dl1`, 'DL', 80), makePlayer(`${id}-lb1`, 'LB', 78),
      makePlayer(`${id}-cb1`, 'CB', 78), makePlayer(`${id}-s1`, 'S', 76),
      makePlayer(`${id}-k1`, 'K', 78), makePlayer(`${id}-p1`, 'P', 74),
    ],
  };
}

function simulateUserGame(seed) {
  const home = buildTeam(1, 'NYJ');
  const away = buildTeam(2, 'BAL');
  const league = { id: 'L', week: 6, seasonId: 2026, year: 2026, teams: [home, away], globalSeed: seed };
  U.setSeed(seed);
  const [res] = simulateBatch([{ home, away, week: 6 }], { league, generateLogs: true });
  return { res, home, away, league };
}

describe('canonical postgame integration: simulateBatch → PLAY_LOGS → PostGameScreen → archive → Game Book', () => {
  afterEach(() => cleanup());

  it('carries one canonical box score through every surface with matching leaders and score', async () => {
    const { res, home, away, league } = simulateUserGame(2026);
    expect(res?.boxScore).toBeTruthy();

    // 1) Exact PLAY_LOGS payload the worker's handleWatchGame posts.
    const playLogsPayload = {
      logs: res.playLogs || [],
      liveStats: res.liveStats || {},
      playerStats: res.boxScore ? { home: res.boxScore.home ?? {}, away: res.boxScore.away ?? {} } : null,
      teamStats: res.teamStats ?? null,
    };
    expect(playLogsPayload.playerStats).toBeTruthy();

    const homeTeam = { id: home.id, abbr: home.abbr, name: home.name };
    const awayTeam = { id: away.id, abbr: away.abbr, name: away.name };
    const finalHome = res.scoreHome ?? res.homeScore;
    const finalAway = res.scoreAway ?? res.awayScore;

    // 2) Render PostGameScreen with the canonical payload; capture the archive.
    const archiveSpy = vi.fn();
    await act(async () => {
      render(
        <PostGameScreen
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={finalHome}
          awayScore={finalAway}
          userTeamId={home.id}
          boxScoreGameId="integration-game"
          logs={playLogsPayload.logs}
          playerStats={playLogsPayload.playerStats}
          week={6}
          onArchiveReady={archiveSpy}
          onContinue={() => {}}
        />,
      );
    });

    // 3) The archive persisted the canonical box score UNCHANGED (not narration).
    expect(archiveSpy).toHaveBeenCalledOnce();
    const archive = archiveSpy.mock.calls[0][0];
    expect(archive.playerStats).toEqual(playLogsPayload.playerStats);

    // 4) The canonical passing leader is the same computed from res.boxScore and
    //    from the archived playerStats.
    const ctx = { homeId: home.id, awayId: away.id, homeAbbr: home.abbr, awayAbbr: away.abbr };
    const resLeader = buildPlayerLeadersFromArchive(res.boxScore, ctx).categories.passing;
    const archiveLeader = buildPlayerLeadersFromArchive(archive.playerStats, ctx).categories.passing;
    expect(archiveLeader.name).toBe(resLeader.name);
    expect(archiveLeader.stats.passYd).toBe(resLeader.stats.passYd);

    // 5) That leader is visible on the rendered PostGameScreen (Leaders tab).
    expect(screen.getAllByText(resLeader.name).length).toBeGreaterThan(0);

    // 6) The Game Book view model, fed the SAME archive, shows the same final
    //    score and the same passing leader line — no swap to different totals.
    const vm = buildBoxScoreViewModel({ league, game: archive, gameId: archive.gameId });
    expect(vm.finalScore.home).toBe(finalHome);
    expect(vm.finalScore.away).toBe(finalAway);
    const gameBookLeaderSide = resLeader.teamId === home.id ? vm.playerTables.home : vm.playerTables.away;
    const gameBookLeader = gameBookLeaderSide.find((p) => p.name === resLeader.name);
    expect(gameBookLeader, 'passing leader must appear in the Game Book player tables').toBeTruthy();
    const gbPassYd = Number(gameBookLeader.stats?.passYd ?? gameBookLeader.passYd);
    expect(gbPassYd).toBe(resLeader.stats.passYd);
  });
});
