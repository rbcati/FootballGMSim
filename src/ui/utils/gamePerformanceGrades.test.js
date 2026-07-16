import { describe, it, expect } from 'vitest';
import {
  computePlayerGameGrade,
  gradeTeamBoxScore,
  gradeTier,
  statLineFor,
  sideForPosition,
} from './gamePerformanceGrades.js';

describe('gamePerformanceGrades — small-sample protection', () => {
  it('does not award an authoritative Elite grade for a single perfect target (WR)', () => {
    const g = computePlayerGameGrade('WR', { targets: 1, receptions: 1, recYd: 22, recTD: 0 });
    expect(g.limitedSample).toBe(true);
    expect(g.tier).toBe('Limited');
    expect(g.tier).not.toBe('Elite');
    expect(g.tier).not.toBe('Star');
    // Regressed toward the neutral baseline rather than a perfect-rate spike.
    expect(g.overall).toBeLessThan(75);
  });

  it('does not award an authoritative Elite grade for a single carry (RB)', () => {
    const g = computePlayerGameGrade('RB', { rushAtt: 1, rushYd: 30, rushTD: 1 });
    expect(g.limitedSample).toBe(true);
    expect(['Limited']).toContain(g.tier);
    expect(g.overall).toBeLessThan(80);
  });

  it('allows a genuinely high grade when participation is meaningful', () => {
    const g = computePlayerGameGrade('QB', {
      passAtt: 34, passComp: 28, passYd: 360, passTD: 4, interceptions: 0,
    });
    expect(g.limitedSample).toBe(false);
    expect(g.overall).toBeGreaterThanOrEqual(80);
    expect(['Star', 'Elite']).toContain(g.tier);
  });

  it('is deterministic — identical stats produce identical grades', () => {
    const stats = { passAtt: 20, passComp: 13, passYd: 190, passTD: 1, interceptions: 1 };
    const a = computePlayerGameGrade('QB', stats);
    const b = computePlayerGameGrade('QB', stats);
    expect(a.overall).toBe(b.overall);
    expect(a.tier).toBe(b.tier);
  });

  it('is bounded within [0,100]', () => {
    const hi = computePlayerGameGrade('QB', { passAtt: 40, passComp: 40, passYd: 800, passTD: 8, interceptions: 0 });
    const lo = computePlayerGameGrade('QB', { passAtt: 40, passComp: 5, passYd: 20, passTD: 0, interceptions: 8 });
    expect(hi.overall).toBeLessThanOrEqual(100);
    expect(lo.overall).toBeGreaterThanOrEqual(0);
  });
});

describe('gamePerformanceGrades — position awareness & honesty', () => {
  it('classifies offense vs defense by position', () => {
    expect(sideForPosition('QB')).toBe('offense');
    expect(sideForPosition('WR')).toBe('offense');
    expect(sideForPosition('CB')).toBe('defense');
    expect(sideForPosition('LB')).toBe('defense');
  });

  it('participation label reports an honest metric — never "snaps"', () => {
    const qb = computePlayerGameGrade('QB', { passAtt: 30, passComp: 20, passYd: 240 });
    const rb = computePlayerGameGrade('RB', { rushAtt: 15, rushYd: 70, receptions: 3 });
    expect(qb.participation.label).toMatch(/att/);
    expect(rb.participation.label).toMatch(/touch/);
    expect(qb.participation.label).not.toMatch(/snap/i);
    expect(rb.participation.label).not.toMatch(/snap/i);
  });

  it('omits a grade for players with no honest production metric (bare OL)', () => {
    const rows = gradeTeamBoxScore({
      1: { name: 'Tackle', pos: 'OL', stats: {} },
      2: { name: 'Starter QB', pos: 'QB', stats: { passAtt: 30, passComp: 21, passYd: 250, passTD: 2 } },
    }, { teamId: 7, teamAbbr: 'NYJ', teamSide: 'home' });
    const names = rows.map((r) => r.name);
    expect(names).toContain('Starter QB');
    expect(names).not.toContain('Tackle');
  });

  it('tags every graded row with its team', () => {
    const rows = gradeTeamBoxScore({
      2: { name: 'Starter QB', pos: 'QB', stats: { passAtt: 30, passComp: 21, passYd: 250, passTD: 2 } },
    }, { teamId: 7, teamAbbr: 'NYJ', teamSide: 'home' });
    expect(rows).toHaveLength(1);
    expect(rows[0].teamAbbr).toBe('NYJ');
    expect(rows[0].teamId).toBe(7);
  });
});

describe('gamePerformanceGrades — statLine & tier gating', () => {
  it('formats a QB line from canonical fields', () => {
    expect(statLineFor('QB', { passComp: 22, passAtt: 31, passYd: 258, passTD: 2 })).toBe('22/31 · 258 yds · 2 TD');
  });

  it('gates Elite/Star behind confidence', () => {
    expect(gradeTier(95, { limitedSample: false, confidence: 1 })).toBe('Elite');
    expect(gradeTier(95, { limitedSample: false, confidence: 0.4 })).not.toBe('Elite');
    expect(gradeTier(95, { limitedSample: true })).toBe('Limited');
  });
});
