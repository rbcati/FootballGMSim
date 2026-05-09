import { describe, it, expect } from 'vitest';
import {
  buildLegacyScoreReport,
  HOF_LEGACY_INDUCT_THRESHOLD,
  HOF_MIN_SEASONS,
  getPositionBucket,
} from '../../src/core/legacyScore.js';
import { RECORD_KEYS } from '../../src/core/recordBookV1.js';

describe('legacyScore V1', () => {
  it('scores an elite QB with MVP and high production near induct threshold', () => {
    const p = {
      id: 'qb1',
      pos: 'QB',
      accolades: [{ type: 'MVP' }],
      careerStats: Array.from({ length: 12 }).map(() => ({ passYds: 1200, ovr: 90 })),
    };
    const r = buildLegacyScoreReport(p, {});
    expect(r.legacyScore).toBeGreaterThanOrEqual(HOF_LEGACY_INDUCT_THRESHOLD);
    expect(r.meta.seasonsPlayed).toBeGreaterThanOrEqual(HOF_MIN_SEASONS);
    expect(r.breakdown.awards).toBeGreaterThan(0);
    expect(r.breakdown.production).toBeGreaterThan(30);
  });

  it('scores a defensive star from tackles/sacks, not passing stats', () => {
    const p = {
      id: 'lb1',
      pos: 'LB',
      accolades: [{ type: 'DPOY', year: 2030 }],
      careerStats: Array.from({ length: 10 }).map(() => ({ tackles: 120, sacks: 8, defInts: 2, ovr: 88 })),
    };
    const r = buildLegacyScoreReport(p, {});
    expect(r.breakdown.production).toBeGreaterThan(10);
    expect(getPositionBucket('LB')).toBe('defense');
  });

  it('adds record-book contribution when player holds a career board rank', () => {
    const pid = 'star1';
    const recordBook = {
      careerLeadersV1: {
        [RECORD_KEYS.sacks]: [
          { playerId: pid, playerName: 'Edge', value: 99, position: 'EDGE' },
          { playerId: 'x', value: 80 },
        ],
      },
      singleSeasonV1: {},
    };
    const p = {
      id: pid,
      pos: 'EDGE',
      careerStats: Array.from({ length: 8 }).map(() => ({ tackles: 40, sacks: 10, ovr: 84 })),
    };
    const r = buildLegacyScoreReport(p, { recordBook });
    expect(r.breakdown.records).toBeGreaterThan(0);
  });

  it('treats active players as legacy_watch, not induct recommendation', () => {
    const p = {
      id: 'a1',
      pos: 'QB',
      status: 'active',
      accolades: [],
      careerStats: [{ passYds: 4000, ovr: 80 }],
    };
    const r = buildLegacyScoreReport(p, {});
    expect(r.recommendation).not.toBe('induct');
    expect(r.eligible).toBe(false);
  });
});
