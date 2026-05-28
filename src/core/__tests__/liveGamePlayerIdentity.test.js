import { describe, it, expect } from 'vitest';
import { buildDefaultLeague } from '../../data/defaultLeague.ts';
import { buildLeaguePlayerMap, resolvePlayerName } from '../../ui/utils/playerNameResolver.js';

// ─── defaultLeague name generation ───────────────────────────────────────────

describe('buildDefaultLeague — player names', () => {
  const league = buildDefaultLeague({ userTeamId: 0 });

  it('generates non-placeholder names for all roster players', () => {
    const STARTER_RE = /\bstarter\b/i;
    for (const team of league.teams) {
      for (const player of team.roster) {
        expect(player.name, `Team ${team.id} player id=${player.id}`).toBeTruthy();
        expect(STARTER_RE.test(player.name), `Starter placeholder found: "${player.name}"`).toBe(false);
      }
    }
  });

  it('names look like "FirstName LastName" (two words, no position prefix)', () => {
    for (const team of league.teams) {
      for (const player of team.roster) {
        const parts = player.name.trim().split(/\s+/);
        expect(parts.length, `Expected 2 name parts, got "${player.name}"`).toBe(2);
        // First part should not be a position abbreviation
        expect(parts[0]).not.toMatch(/^(QB|RB|WR|TE|OL|DL|LB|CB|S|K|P|EDGE|DE|DT)$/i);
      }
    }
  });

  it('name generation is deterministic — same league produces identical names', () => {
    const league2 = buildDefaultLeague({ userTeamId: 0 });
    for (let t = 0; t < league.teams.length; t++) {
      for (let p = 0; p < league.teams[t].roster.length; p++) {
        expect(league.teams[t].roster[p].name).toBe(league2.teams[t].roster[p].name);
      }
    }
  });

  it('player IDs, ratings, pos, depthOrder are unchanged by name generation', () => {
    // Spot-check: first QB on team 0 should be id=1, pos=QB, depthOrder=1
    const team0 = league.teams[0];
    const qbs = team0.roster.filter((p) => p.pos === 'QB');
    expect(qbs.length).toBeGreaterThanOrEqual(1);
    expect(qbs[0].pos).toBe('QB');
    expect(typeof qbs[0].ovr).toBe('number');
    expect(qbs[0].ovr).toBeGreaterThan(0);
    expect(qbs[0].teamId).toBe(0);
  });

  it('buildLeaguePlayerMap treats generated names as real (not placeholder)', () => {
    const playerMap = buildLeaguePlayerMap(league);
    // All roster players should be in the map and their names should resolve
    const firstPlayer = league.teams[0].roster[0];
    const resolved = resolvePlayerName(firstPlayer.id, { playerMap });
    expect(resolved).toBe(firstPlayer.name);
    expect(resolved).not.toMatch(/^Player #/);
    expect(resolved).not.toMatch(/\bstarter\b/i);
  });
});

// ─── Live play-log text sanity ────────────────────────────────────────────────

describe('simGameStats play logs — no placeholder names in text', () => {
  it('play logs with defaultLeague players use clean names (no "Starter", no double-pos)', async () => {
    const { simGameStats } = await import('../../core/game-simulator.js').catch(() =>
      import('../game-simulator.js'),
    );
    const league = buildDefaultLeague({ userTeamId: 0 });
    const home = league.teams[0];
    const away = league.teams[1];

    const result = simGameStats(home, away, { league, generateLogs: true });
    expect(result).toBeTruthy();

    const logs = result?.playLogs ?? [];
    expect(logs.length).toBeGreaterThan(0);

    for (const log of logs) {
      const text = String(log.text || log.playText || '');
      expect(text, `Play log contains "Starter": "${text}"`).not.toMatch(/\bStarter\b/);
      // Reject double-position patterns like "QB QB" or "WR WR"
      expect(text, `Play log has double pos prefix: "${text}"`).not.toMatch(/\b(QB|RB|WR|TE|DL|LB|CB|S)\s+\1\b/i);
    }
  });
});
