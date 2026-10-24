import { describe, it, expect, vi } from 'vitest';
import { simulateRichGame } from '../sim/richGameSimulator.ts';
import * as ledgerModule from '../sim/offensiveLedger.ts';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import { validateOffensiveStatIntegrity, reconcilePlayerToTeam, sumBoxScoreSide } from '../simulation/gameStatReconciliation.js';
import { simulateBatch } from '../simulation/index.js';
import { Utils } from '../utils.js';

const positions = ['QB', 'QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'OL', 'OL', 'OL', 'OL', 'OL', 'DL', 'DL', 'LB', 'LB', 'CB', 'CB', 'S', 'K', 'P'];
function roster(teamId: number) {
  return positions.map((pos, i) => ({ id: `${teamId}-${i}`, teamId, name: `${pos} ${teamId}-${i}`, pos, ovr: 78, ratings: { speed: 80, catching: 77, throwAccuracy: 80, awareness: 80, throwPower: 80, durability: 65 }, depthOrder: i === 0 ? 1 : undefined }));
}

describe('production game attribution invariants', () => {
  it('keeps reserved player IDs as independent own box-score rows through JSON serialization', () => {
    const attributes = mapOverallToAttributesV2(75, 5, 'reserved-ids');
    const home = roster(1), away = roster(2);
    // Exercise offense, defense and special teams, including IDs with inherited names.
    const ids = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'];
    for (const [index, id] of ids.entries()) home[[0, 2, 4, 16, 20][index]].id = id;
    const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype);
    for (let seed = 1; seed <= 12; seed++) {
      const game = simulateRichGame({ gameId: `reserved-${seed}`, seed, homeTeamId: 1, awayTeamId: 2,
        homeOffense: attributes, homeDefense: attributes, awayOffense: attributes, awayDefense: attributes,
        homePlayers: home, awayPlayers: away });
      const box = game.boxScore.home;
      expect(Object.getPrototypeOf(box)).toBeNull();
      const restored = JSON.parse(JSON.stringify(box));
      for (const id of ids) {
        expect(Object.hasOwn(box, id), `seed=${seed} id=${id}`).toBe(true);
        expect(restored[id]).toEqual(box[id]);
        expect(box[id].name).toBe(home.find(p => p.id === id)!.name);
      }
      expect(validateOffensiveStatIntegrity(box).errors).toEqual([]);
      expect(reconcilePlayerToTeam(box, game.teamStats.home).ok).toBe(true);
    }
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeBefore);
  });

  it('preserves reserved player IDs through legacy live and completed-game attribution', () => {
    const home = { id: 1, abbr: 'HME', roster: roster(1) }, away = { id: 2, abbr: 'AWY', roster: roster(2) };
    home.roster[0].id = '__proto__'; home.roster[2].id = 'constructor'; home.roster[4].id = 'prototype';
    const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype);
    Utils.setSeed(1804);
    const [game] = simulateBatch([{ home, away, week: 1 }], { league: { week: 1, year: 2026, seasonId: 's1', globalSeed: 1804, teams: [home, away] }, injuryFactor: 0 });
    for (const id of ['__proto__', 'constructor', 'prototype']) {
      expect(Object.hasOwn(game.boxScore.home, id), id).toBe(true);
      expect(JSON.parse(JSON.stringify(game.boxScore.home))[id]).toEqual(game.boxScore.home[id]);
    }
    expect(validateOffensiveStatIntegrity(game.boxScore.home).errors).toEqual([]);
    expect(reconcilePlayerToTeam(game.boxScore.home, game.teamStats.home).ok).toBe(true);
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeBefore);
  });

  it.each(['missing', 'injured', 'inactive'])('rejects a legacy %s QB room before a credited result exists', (condition) => {
    const home = { id: 1, abbr: 'HME', roster: roster(1) }, away = { id: 2, abbr: 'AWY', roster: roster(2) };
    if (condition === 'missing') home.roster = home.roster.filter(p => p.pos !== 'QB');
    else for (const p of home.roster.filter(p => p.pos === 'QB')) Object.assign(p, condition === 'injured' ? { injured: true } : { status: 'inactive' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      Utils.setSeed(1804);
      expect(() => simulateBatch([{ home, away, week: 1 }], { league: { week: 1, year: 2026, seasonId: 's1', globalSeed: 1804, teams: [home, away] } })).toThrow();
      expect(error.mock.calls.flat().join(' ')).toContain('no eligible QB');
    } finally { error.mockRestore(); }
  });

  it('validates both teams and actual supporting gains across seeds 1–64 and three personnel configurations (192 games)', () => {
    const actualFactory = ledgerModule.createOffensiveLedger;
    let ledgers: Array<{ context: string; ledger: ReturnType<typeof actualFactory>; events: ledgerModule.OffensivePlay[] }> = [];
    const spy = vi.spyOn(ledgerModule, 'createOffensiveLedger').mockImplementation((ids, context) => {
      const ledger = actualFactory(ids, context);
      const credit = ledger.credit;
      const events: ledgerModule.OffensivePlay[] = [];
      ledger.credit = (event) => { credit(event); events.push({ ...event }); };
      ledgers.push({ context, ledger, events });
      return ledger;
    });
    try {
      for (let seed = 1; seed <= 64; seed++) for (let config = 0; config < 3; config++) {
        const attributes = mapOverallToAttributesV2(config === 2 ? 95 : 75, 5, `integrity-${seed}`);
        const home = roster(1), away = roster(2);
        if (config === 1) for (const players of [home, away]) {
          Object.assign(players[0], { injured: true });
          Object.assign(players[4], { status: 'inactive' });
          Object.assign(players[5], { teamId: 99 });
        }
        const payload = { gameId: `seed=${seed}/config=${config}`, seed, homeTeamId: 1, awayTeamId: 2, homeOffense: attributes, awayOffense: attributes, homeDefense: attributes, awayDefense: attributes,
          ...(config ? { homePlayers: home, awayPlayers: away } : {}) };
        ledgers = [];
        const game = simulateRichGame(payload);
        expect(sumBoxScoreSide(game.boxScore.home).interceptionsThrown).toBe(game.teamStats.away.interceptions);
        expect(sumBoxScoreSide(game.boxScore.away).interceptionsThrown).toBe(game.teamStats.home.interceptions);
        for (const side of ['home', 'away'] as const) {
          const rows = game.boxScore[side];
          expect(validateOffensiveStatIntegrity(rows, { context: `${payload.gameId}/${side}` }).errors).toEqual([]);
          expect(reconcilePlayerToTeam(rows, game.teamStats[side]).ok, `${payload.gameId}/${side}`).toBe(true);
          const events = ledgers.find((x) => x.context.endsWith(`/${side}`))!.events;
          for (const [id, { stats }] of Object.entries(rows)) {
            const runs = events.filter((e) => e.type === 'rush' && e.runnerId === id);
            const catches = events.filter((e) => e.type === 'pass' && e.complete && e.targetId === id);
            const passes = events.filter((e) => e.type === 'pass' && e.complete && e.passerId === id);
            for (const [key, plays] of [['longestRun', runs], ['longestCatch', catches], ['longestPass', passes]] as const) {
              if (plays.length) expect(stats[key], `${payload.gameId}/${side}/${id}/${key}`).toBe(Math.max(...plays.map((p) => p.yards)));
              else expect(stats[key]).toBeUndefined();
            }
            expect(stats.rushTD ?? 0).toBe(runs.filter((e) => e.touchdown).length);
            expect(stats.recTD ?? 0).toBe(catches.filter((e) => e.touchdown).length);
            expect(stats.passTD ?? 0).toBe(passes.filter((e) => e.touchdown).length);
          }
          if (config === 1) for (const suffix of [0, 4, 5]) expect(rows[`${side === 'home' ? 1 : 2}-${suffix}`]).toBeUndefined();
        }
        expect(simulateRichGame(payload)).toEqual(game);
      }
    } finally { spy.mockRestore(); }
  });

  it('rejects explicitly empty, malformed, duplicate and opponent-owned personnel instead of inventing offense', () => {
    const a = mapOverallToAttributesV2(75, 5, 'invalid');
    const payload = { gameId: 'invalid', seed: 1804, homeTeamId: 1, awayTeamId: 2, homeOffense: a, awayOffense: a, homeDefense: a, awayDefense: a };
    expect(() => simulateRichGame({ ...payload, homePlayers: [] })).toThrow(/missing eligible/);
    expect(() => simulateRichGame({ ...payload, homePlayers: roster(2) })).toThrow(/missing eligible/);
    expect(() => simulateRichGame({ ...payload, homePlayers: [...roster(1), roster(1)[0]] })).toThrow(/duplicate/);
  });

  it('reconciles legacy generated participation, eligibility and injury substitutions (seeds 1–64 plus 122)', () => {
    let injuries = 0;
    for (const seed of [...Array.from({ length: 64 }, (_, i) => i + 1), 122]) {
      const home = { id: 1, abbr: 'HME', roster: roster(1) }, away = { id: 2, abbr: 'AWY', roster: roster(2) };
      Object.assign(home.roster[5], { status: 'inactive' });
      Object.assign(away.roster[5], { teamId: 99 });
      Utils.setSeed(seed);
      const [game] = simulateBatch([{ home, away, week: 6 }], { league: { week: 6, year: 2026, seasonId: 's1', globalSeed: seed, teams: [home, away] }, injuryFactor: 8 });
      expect(game, `seed=${seed}`).toBeTruthy();
      injuries += game.injuries.length;
      for (const side of ['home', 'away'] as const) {
        expect(validateOffensiveStatIntegrity(game.boxScore[side], { context: `legacy seed=${seed}/${side}` }).errors).toEqual([]);
        expect(reconcilePlayerToTeam(game.boxScore[side], game.teamStats[side]).ok).toBe(true);
        const excluded = game.boxScore[side][`${side === 'home' ? 1 : 2}-5`];
        expect(excluded?.stats.receptions ?? 0).toBe(0);
        for (const row of Object.values(game.boxScore[side]) as any[]) {
          expect(row.stats.longestPass).toBeUndefined();
          expect(row.stats.longestRun).toBeUndefined();
          expect(row.stats.longestCatch).toBeUndefined();
        }
      }
      for (const inj of game.injuries) {
        const side = inj.teamId === 1 ? 'home' : 'away';
        expect(game.boxScore[side][String(inj.playerId)], `seed=${seed} injury=${inj.playerId}`).toBeTruthy();
      }
    }
    expect(injuries).toBeGreaterThan(0);
  });
});
