/**
 * legendsBrowserEngine.unit.test.js
 * Unit tests for the Legends Browser pure utility module.
 */
import { describe, expect, it } from 'vitest';
import {
  filterLegendsByPosition,
  buildLegendLeaderboards,
  findLegendById,
  buildLegendTimeline,
  buildLegendProfileMetrics,
} from '../../src/core/history/legendsBrowserEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoh(overrides = {}) {
  return {
    id: 'p1',
    name: 'Dan Legend',
    position: 'QB',
    jerseyNumber: 10,
    yearsPlayedWithTeam: '2010–2020',
    careerGamesWithTeam: 160,
    totalPassingYards: 45000,
    totalRushingYards: null,
    totalReceivingYards: null,
    totalSacks: null,
    accolades: ['MVP (2015)', 'Champion (2018)'],
    inductionYear: 2022,
    ...overrides,
  };
}

const QB = makeRoh({ id: 'p-qb', name: 'Alpha QB', position: 'QB', totalPassingYards: 45000 });
const RB = makeRoh({ id: 'p-rb', name: 'Bravo RB', position: 'RB', totalRushingYards: 12000, totalPassingYards: null });
const WR = makeRoh({ id: 'p-wr', name: 'Charlie WR', position: 'WR', totalReceivingYards: 18000, totalPassingYards: null });
const DE = makeRoh({ id: 'p-de', name: 'Delta DE', position: 'DE', totalSacks: 95, totalPassingYards: null });

// ── filterLegendsByPosition ───────────────────────────────────────────────────

describe('filterLegendsByPosition', () => {
  it('returns all legends for ALL filter', () => {
    const roh = [QB, RB, WR];
    expect(filterLegendsByPosition(roh, 'ALL')).toHaveLength(3);
  });

  it('returns all legends when positionFilter is omitted', () => {
    expect(filterLegendsByPosition([QB, RB], undefined)).toHaveLength(2);
  });

  it('filters correctly by position', () => {
    const result = filterLegendsByPosition([QB, RB, WR], 'RB');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-rb');
  });

  it('returns empty array when no legends match the position', () => {
    expect(filterLegendsByPosition([QB, RB], 'K')).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const roh = [QB, RB];
    const orig = [...roh];
    filterLegendsByPosition(roh, 'QB');
    expect(roh).toEqual(orig);
  });

  it('handles empty ringOfHonor safely', () => {
    expect(filterLegendsByPosition([], 'QB')).toHaveLength(0);
  });

  it('handles null/undefined ringOfHonor safely', () => {
    expect(filterLegendsByPosition(null, 'ALL')).toHaveLength(0);
  });
});

// ── buildLegendLeaderboards ───────────────────────────────────────────────────

describe('buildLegendLeaderboards', () => {
  it('returns top 5 (or fewer) sorted descending', () => {
    const roh = [
      makeRoh({ id: '1', name: 'A', totalPassingYards: 100 }),
      makeRoh({ id: '2', name: 'B', totalPassingYards: 200 }),
      makeRoh({ id: '3', name: 'C', totalPassingYards: 50 }),
      makeRoh({ id: '4', name: 'D', totalPassingYards: 400 }),
      makeRoh({ id: '5', name: 'E', totalPassingYards: 300 }),
      makeRoh({ id: '6', name: 'F', totalPassingYards: 150 }),
    ];
    const boards = buildLegendLeaderboards(roh);
    expect(boards.passingYards).toHaveLength(5);
    expect(boards.passingYards[0].value).toBe(400);
    expect(boards.passingYards[1].value).toBe(300);
    expect(boards.passingYards[4].value).toBe(100);
  });

  it('resolves ties deterministically by name ascending', () => {
    const roh = [
      makeRoh({ id: '1', name: 'Zeta QB', totalPassingYards: 5000 }),
      makeRoh({ id: '2', name: 'Alpha QB', totalPassingYards: 5000 }),
    ];
    const boards = buildLegendLeaderboards(roh);
    expect(boards.passingYards[0].name).toBe('Alpha QB');
    expect(boards.passingYards[1].name).toBe('Zeta QB');
  });

  it('ignores null stats safely', () => {
    const roh = [
      makeRoh({ id: '1', totalPassingYards: null }),
      makeRoh({ id: '2', name: 'Real QB', totalPassingYards: 1000 }),
    ];
    const boards = buildLegendLeaderboards(roh);
    expect(boards.passingYards).toHaveLength(1);
    expect(boards.passingYards[0].name).toBe('Real QB');
  });

  it('ignores zero stats', () => {
    const roh = [makeRoh({ totalPassingYards: 0 })];
    expect(buildLegendLeaderboards(roh).passingYards).toHaveLength(0);
  });

  it('returns all four stat categories', () => {
    const boards = buildLegendLeaderboards([QB, RB, WR, DE]);
    expect(boards).toHaveProperty('passingYards');
    expect(boards).toHaveProperty('rushingYards');
    expect(boards).toHaveProperty('receivingYards');
    expect(boards).toHaveProperty('sacks');
  });

  it('returns rushing/receiving/sacks leaders correctly', () => {
    const boards = buildLegendLeaderboards([QB, RB, WR, DE]);
    expect(boards.rushingYards[0].name).toBe('Bravo RB');
    expect(boards.receivingYards[0].name).toBe('Charlie WR');
    expect(boards.sacks[0].name).toBe('Delta DE');
  });

  it('handles empty ringOfHonor safely', () => {
    const boards = buildLegendLeaderboards([]);
    expect(boards.passingYards).toHaveLength(0);
  });

  it('does not mutate inputs', () => {
    const roh = [QB, RB];
    const orig = [...roh];
    buildLegendLeaderboards(roh);
    expect(roh).toEqual(orig);
  });
});

// ── findLegendById ────────────────────────────────────────────────────────────

describe('findLegendById', () => {
  it('returns the legend when found', () => {
    const roh = [QB, RB];
    const found = findLegendById(roh, 'p-rb');
    expect(found).toBe(RB);
  });

  it('returns null when not found', () => {
    expect(findLegendById([QB], 'nonexistent')).toBeNull();
  });

  it('returns null for null/undefined playerId', () => {
    expect(findLegendById([QB], null)).toBeNull();
    expect(findLegendById([QB], undefined)).toBeNull();
  });

  it('returns null for empty ringOfHonor', () => {
    expect(findLegendById([], 'p-qb')).toBeNull();
  });
});

// ── buildLegendTimeline ───────────────────────────────────────────────────────

describe('buildLegendTimeline', () => {
  it('includes induction year as an event', () => {
    const legend = makeRoh({ inductionYear: 2022, accolades: [] });
    const timeline = buildLegendTimeline(legend);
    const inductionEvent = timeline.find((e) => e.year === 2022 && e.label.includes('Ring of Honor'));
    expect(inductionEvent).toBeTruthy();
  });

  it('sorts events chronologically ascending', () => {
    const legend = makeRoh({
      yearsPlayedWithTeam: '2010–2020',
      accolades: ['MVP (2015)', 'Champion (2018)'],
      inductionYear: 2022,
    });
    const timeline = buildLegendTimeline(legend);
    const years = timeline.filter((e) => e.year !== null).map((e) => e.year);
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
    }
  });

  it('includes franchise tenure start marker from yearsPlayedWithTeam range', () => {
    const legend = makeRoh({ yearsPlayedWithTeam: '2010–2020', accolades: [] });
    const timeline = buildLegendTimeline(legend);
    const joinEvent = timeline.find((e) => e.year === 2010);
    expect(joinEvent).toBeTruthy();
  });

  it('handles single year in yearsPlayedWithTeam', () => {
    const legend = makeRoh({ yearsPlayedWithTeam: '2015', accolades: [] });
    const timeline = buildLegendTimeline(legend);
    const joinEvent = timeline.find((e) => e.year === 2015);
    expect(joinEvent).toBeTruthy();
  });

  it('handles accolades without year gracefully', () => {
    const legend = makeRoh({ accolades: ['Hall of Fame', 'All-Pro'], inductionYear: 2022 });
    const timeline = buildLegendTimeline(legend);
    expect(timeline).toBeTruthy();
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('returns empty array for null legend', () => {
    expect(buildLegendTimeline(null)).toHaveLength(0);
  });

  it('returns empty array for legend with no timeline data', () => {
    const legend = makeRoh({ yearsPlayedWithTeam: '', accolades: [], inductionYear: 0 });
    const timeline = buildLegendTimeline(legend);
    expect(timeline).toHaveLength(0);
  });

  it('does not mutate the legend input', () => {
    const legend = makeRoh({ accolades: ['MVP (2015)'] });
    const orig = [...legend.accolades];
    buildLegendTimeline(legend);
    expect(legend.accolades).toEqual(orig);
  });
});

// ── buildLegendProfileMetrics ─────────────────────────────────────────────────

describe('buildLegendProfileMetrics', () => {
  it('includes available stats only', () => {
    const legend = makeRoh({ totalPassingYards: 45000, totalRushingYards: null, totalReceivingYards: null, totalSacks: null });
    const metrics = buildLegendProfileMetrics(legend);
    expect(metrics).toHaveProperty('passingYards');
    expect(metrics).not.toHaveProperty('rushingYards');
    expect(metrics).not.toHaveProperty('receivingYards');
    expect(metrics).not.toHaveProperty('sacks');
  });

  it('omits stats that are null or zero', () => {
    const legend = makeRoh({ totalPassingYards: 0, totalRushingYards: null });
    const metrics = buildLegendProfileMetrics(legend);
    expect(metrics).not.toHaveProperty('passingYards');
    expect(metrics).not.toHaveProperty('rushingYards');
  });

  it('includes games played when positive', () => {
    const legend = makeRoh({ careerGamesWithTeam: 128 });
    const metrics = buildLegendProfileMetrics(legend);
    expect(metrics.gamesPlayed).toBe(128);
  });

  it('includes jersey number when present', () => {
    const legend = makeRoh({ jerseyNumber: 12 });
    const metrics = buildLegendProfileMetrics(legend);
    expect(metrics.jerseyNumber).toBe(12);
  });

  it('computes seasonsWithFranchise from year range', () => {
    const legend = makeRoh({ yearsPlayedWithTeam: '2010–2020' });
    const metrics = buildLegendProfileMetrics(legend);
    expect(metrics.seasonsWithFranchise).toBe(11);
  });

  it('returns 1 season for single year', () => {
    const legend = makeRoh({ yearsPlayedWithTeam: '2015' });
    const metrics = buildLegendProfileMetrics(legend);
    expect(metrics.seasonsWithFranchise).toBe(1);
  });

  it('returns empty object for null legend', () => {
    expect(buildLegendProfileMetrics(null)).toEqual({});
  });

  it('does not mutate the input', () => {
    const legend = makeRoh();
    const orig = { ...legend };
    buildLegendProfileMetrics(legend);
    expect(legend).toEqual(orig);
  });
});

// ── Guardrail: no Math.random ─────────────────────────────────────────────────

describe('guardrails', () => {
  it('legendsBrowserEngine.js does not use Math.random', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve('src/core/history/legendsBrowserEngine.js');
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).not.toContain('Math.random');
  });
});
