import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { Utils as U } from '../../src/core/utils.js';
import { simGameStats } from '../../src/core/simulation/index.js';
import { calculateTeamRatingWithSchemeFit } from '../../src/core/scheme-core.js';
import { reconcileCanonicalEvents } from '../../src/core/simulation/canonicalGameEvents.js';

function makePlayer(id, pos, ovr = 75) {
  const ratings = {
    QB: { throwPower: 82, throwAccuracy: 84, awareness: 82 },
    RB: { speed: 88, trucking: 80, juking: 84 },
    WR: { speed: 90, awareness: 80, catching: 88 },
    TE: { speed: 76, awareness: 76, catching: 80 },
    OL: { passBlock: 80, runBlock: 80 },
    DL: { passRushPower: 80, passRushSpeed: 78, tackle: 76, strength: 80 },
    LB: { tackle: 80, awareness: 76, speed: 76 },
    CB: { speed: 86, awareness: 76 },
    S: { speed: 82, awareness: 78, tackle: 74 },
    K: { kickPower: 82, kickAccuracy: 82 },
    P: { kickPower: 80 },
  };
  return { id: `${id}`, pos, ovr, name: `${pos} ${id}`, ratings: ratings[pos] || {}, stats: { game: {}, season: {} } };
}

function buildTeam(id, abbr) {
  return {
    id, abbr, name: abbr, strategies: { offSchemeId: 'VERTICAL', defSchemeId: 'BLITZ_34' },
    roster: [
      makePlayer(`${id}-qb1`, 'QB', 88), makePlayer(`${id}-qb2`, 'QB', 74),
      makePlayer(`${id}-rb1`, 'RB', 84), makePlayer(`${id}-rb2`, 'RB', 74),
      makePlayer(`${id}-wr1`, 'WR', 86), makePlayer(`${id}-wr2`, 'WR', 80), makePlayer(`${id}-wr3`, 'WR', 74),
      makePlayer(`${id}-te1`, 'TE', 78),
      ...[1, 2, 3, 4, 5].map((i) => makePlayer(`${id}-ol${i}`, 'OL', 76)),
      makePlayer(`${id}-dl1`, 'DL', 80), makePlayer(`${id}-dl2`, 'DL', 74),
      makePlayer(`${id}-lb1`, 'LB', 78), makePlayer(`${id}-lb2`, 'LB', 72),
      makePlayer(`${id}-cb1`, 'CB', 78), makePlayer(`${id}-cb2`, 'CB', 74),
      makePlayer(`${id}-s1`, 'S', 76),
      makePlayer(`${id}-k1`, 'K', 78), makePlayer(`${id}-p1`, 'P', 74),
    ],
  };
}


// Golden outputs captured on main e34b808 before scheme integrity changes.
describe('scheme integrity simulation balance firewall', () => {
  for (const mode of ['legacy', 'modern', 'mixed', 'detailed']) {
    it.each([39, 777, 2026])(`${mode} seed %i preserves scores, effects, stats and ledger`, (seed) => {
      const home = buildTeam(1, 'NYJ');
      const away = buildTeam(2, 'BAL');
      for (const team of [home, away]) for (const p of team.roster) {
        if (mode === 'modern' || mode === 'mixed') p.attributesV2 = { throwPower: 95, catchInTraffic: 92, passRush: 91, pressCoverage: 88, zoneCoverage: 84 };
        if (mode === 'modern') delete p.ratings;
        if (mode === 'detailed') p.pos = ({ OL: 'LT', DL: 'DE', LB: 'MLB', S: 'FS' })[p.pos] ?? p.pos;
      }
      const league = { week: 6, seasonId: 2026, year: 2026, teams: [home, away], globalSeed: seed };
      U.setSeed(seed);
      const fit = [home, away].map(calculateTeamRatingWithSchemeFit);
      const result = simGameStats(home, away, { generateLogs: true, league, homeAbbr: 'NYJ', awayAbbr: 'BAL' });
      const rec = reconcileCanonicalEvents(result.canonicalEvents, { home: result.homeScore, away: result.awayScore });
      expect(rec.finalMatchesSum).toBe(true);
      expect(rec.monotonic).toBe(true);
      expect(rec.uniqueIds).toBe(true);
      // Hash the entire result, including all stats, effects and scoring events.
      expect({ fit, homeScore: result.homeScore, awayScore: result.awayScore,
        digest: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      }).toMatchSnapshot();
    });
  }
});
