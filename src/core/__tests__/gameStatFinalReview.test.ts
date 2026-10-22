import { describe, it, expect, vi } from 'vitest';
import { simulateRichGame } from '../sim/richGameSimulator.ts';
import * as matchup from '../sim/matchupEngine.ts';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import { createOffensiveLedger } from '../sim/offensiveLedger.ts';
import { deriveTeamStatsFromPlayerRows, normalizeArchivedGamePayload } from '../gameArchive.js';
import { buildCanonicalTeamStats } from '../simulation/gameSummaryBuilder.js';
import { buildLeagueStatsHubModel } from '../../ui/utils/leagueStatsHub.js';
import { reconcilePlayerToTeam } from '../simulation/gameStatReconciliation.js';
import { advanceInjuryRecovery, canPlayerPlay } from '../injury-core.js';

const attributes = mapOverallToAttributesV2(75, 5, 'final-review');
const payload = { gameId: 's1_w1_1_2', seed: 1804, homeTeamId: 1, awayTeamId: 2,
  homeOffense: attributes, homeDefense: attributes, awayOffense: attributes, awayDefense: attributes };

describe('gross passing, team net offense and actual drive movement', () => {
  it.each([0, 1, 3])('deducts %i supported sacks once, including an all-sack passer and turnovers', count => {
    const ledger = createOffensiveLedger(['qb', 'wr', 'rb'], `sacks=${count}`);
    for (let i = 0; i < count; i++) ledger.credit({ type: 'pass', passerId: 'qb', sack: true, complete: false, yards: -7 });
    if (!count) ledger.credit({ type: 'pass', passerId: 'qb', targetId: 'wr', complete: true, yards: 10 });
    ledger.credit({ type: 'rush', runnerId: 'rb', yards: -2, fumbleLost: true });
    const box = Object.fromEntries(Object.entries(ledger.players).map(([id, stats]) => [id, { stats }]));
    const expected = (count ? 0 : 10) - 2 - count * 7;
    const archive = deriveTeamStatsFromPlayerRows(box)!;
    const canonical = buildCanonicalTeamStats({ home: box, away: {}, rawTeamStats: { home: { totalYards: 999 } } }).home;
    for (const line of [archive, canonical]) {
      expect(line.passYards).toBe(count ? 0 : 10);
      expect(line.sackYards).toBe(count * 7);
      expect(line.totalYards).toBe(expected);
      expect(line.sacksAllowed).toBe(count);
      expect(line.plays).toBe(count + 1 + (count ? 0 : 1));
      expect(line.turnovers).toBe(1);
    }
  });

  it('preserves gross completion/receiving totals and deducts observed sacks in actual seeded games', () => {
    let sacks = 0;
    for (let seed = 1; seed <= 32; seed++) {
      const game = simulateRichGame({ ...payload, seed });
      for (const side of ['home', 'away'] as const) {
        const team = game.teamStats[side];
        const rows = Object.values(game.boxScore[side]);
        const losses = rows.reduce((sum, r) => sum + (r.stats.sackYards ?? 0), 0);
        sacks += team.sacksAllowed;
        expect(team.sackYards, `seed=${seed}/${side}`).toBe(losses);
        expect(team.totalYards).toBe(team.passYd + team.rushYd - losses);
        expect(team.netPassYards).toBe(team.passYd - losses);
        expect(team.yardsPerPlay).toBe(Number((team.totalYards / Math.max(1, team.plays)).toFixed(2)));
        expect(reconcilePlayerToTeam(game.boxScore[side], team).ok).toBe(true);
      }
    }
    expect(sacks).toBeGreaterThan(1);
  });

  it('caps touchdown drive yards to field movement and preserves the archived ledger (seed 1804)', () => {
    const actual = matchup.resolveMatchup;
    const movements: number[] = [];
    const spy = vi.spyOn(matchup, 'resolveMatchup').mockImplementation((offense, defense, context, rng) => {
      const result = actual(offense, defense, context, rng); // Preserve all real RNG draws.
      movements.push(100 - context.yardLine);
      return { ...result, success: true, isSack: false, turnover: false, turnoverType: null,
        yardsGained: 1000, nextYardLine: 100, firstDown: true, nextDown: 1, nextDistance: 10, attributionEvents: [] };
    });
    try {
      const game = simulateRichGame(payload);
      const touchdowns = game.driveSummary.filter(d => d.result === 'TD');
      expect(touchdowns.length).toBeGreaterThan(0);
      expect(touchdowns).toHaveLength(movements.length);
      for (const [i, drive] of touchdowns.entries()) {
        expect(drive.plays).toBe(1);
        expect(drive.yards).toBe(movements[i]);
        expect(drive.yards).toBe(75); // One play from the kickoff's own 25 to the goal line.
      }
      const credited = ['home', 'away'].reduce((sum, side) => sum + game.teamStats[side].passYd + game.teamStats[side].rushYd, 0);
      expect(credited).toBe(movements.reduce((a, b) => a + b, 0));
      const archived = normalizeArchivedGamePayload({ ...game, id: game.gameId, seasonId: 's1', week: 1,
        homeId: 1, awayId: 2, playerStats: game.boxScore });
      expect(archived.driveSummary).toEqual(game.driveSummary);
      expect(JSON.parse(JSON.stringify(archived)).driveSummary).toEqual(game.driveSummary);
    } finally { spy.mockRestore(); }
  });

  it('retains authoritative zero and negative net yards in team offensive rankings', () => {
    const teams = [{ id: 1, name: 'One', abbr: 'ONE', roster: [] }, { id: 2, name: 'Two', abbr: 'TWO', roster: [] }];
    const model = buildLeagueStatsHubModel({ teams, schedule: [{ id: 's1_w1_1_2', homeId: 1, awayId: 2, homeScore: 3, awayScore: 0,
      teamStats: { home: { passYards: 10, rushYards: 0, sackYards: 10, totalYards: 0 }, away: { passYards: 0, rushYards: -2, sackYards: 14, totalYards: -16 } } }] });
    const rows = model.teamRankings.offense;
    expect(rows.find(r => r.teamId === 1)?.yds).toBe(0);
    expect(rows.find(r => r.teamId === 2)?.yds).toBe(-16);
    expect(model.teamRankingColumns.yds).toBe(true);
  });
});

describe('canonical recovery shared by worker and synthetic calendar', () => {
  it('keeps a QB unavailable until the existing aggregate and entry clocks expire', () => {
    const qb = { injured: true, seasonEndingInjury: true, injuryWeeksRemaining: 40, injuries: [{ weeksRemaining: 40 }] };
    advanceInjuryRecovery(qb, 35);
    expect(qb.injuryWeeksRemaining).toBe(5);
    expect(qb.injuries[0].weeksRemaining).toBe(5);
    expect(canPlayerPlay(qb)).toBe(false);
    advanceInjuryRecovery(qb, 4);
    expect(canPlayerPlay(qb)).toBe(false);
    advanceInjuryRecovery(qb);
    expect(qb).toMatchObject({ injured: false, seasonEndingInjury: false, injuryWeeksRemaining: 0, injuries: [] });
    expect(canPlayerPlay(qb)).toBe(true);
    expect(advanceInjuryRecovery(qb)).toBe(false);
  });
});
