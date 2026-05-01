import { describe, it, expect } from 'vitest';
import { buildPlayerProfileAnalysis, contractValueLabel, buildPositionStatSummary } from '../playerProfileAnalysis.js';

const basePlayer: any = { id: 'p1', name: 'Test QB', pos: 'QB', age: 24, teamId: 't1', ovr: 78, potential: 86, ratings: { schemeFit: 72 } };

describe('playerProfileAnalysis', () => {
  it('roster player profile builds with identity/snapshot/ratings', () => {
    const result = buildPlayerProfileAnalysis({ player: { ...basePlayer, contract: { baseAnnual: 8, yearsRemaining: 2 } }, team: { name: 'Sharks', abbr: 'SHK' } });
    expect(result.identity.status).toBe('roster');
    expect(result.snapshot.headline).toContain('Test QB');
    expect(result.ratings.ovr).toBe(78);
  });

  it('free agent profile builds without team and does not crash', () => {
    const result = buildPlayerProfileAnalysis({ player: { ...basePlayer, teamId: null } });
    expect(result.identity.status).toBe('free_agent');
  });

  it('draft prospect profile builds with draft_prospect status', () => {
    const result = buildPlayerProfileAnalysis({ player: { ...basePlayer, isProspect: true, teamId: null } });
    expect(result.identity.status).toBe('draft_prospect');
  });

  it('missing stats do not crash and produce missing_stats warning', () => {
    const result = buildPlayerProfileAnalysis({ player: basePlayer });
    expect(result.warnings).toContain('missing_stats');
  });

  it('contract value label handles bargain/fair/expensive/unknown', () => {
    expect(contractValueLabel({ baseAnnual: 5 }, 80)).toBe('bargain');
    expect(contractValueLabel({ baseAnnual: 14.4 }, 80)).toBe('fair');
    expect(contractValueLabel({ baseAnnual: 25 }, 80)).toBe('expensive');
    expect(contractValueLabel(null as any, 80)).toBe('unknown');
  });

  it('injury status populates health warning', () => {
    const result = buildPlayerProfileAnalysis({ player: { ...basePlayer, injury: { status: 'Out', weeksRemaining: 2 } } });
    expect(result.warnings).toContain('injury');
  });

  it('potential gap creates development priority', () => {
    const result = buildPlayerProfileAnalysis({ player: { ...basePlayer, ovr: 70, potential: 85 } });
    expect(result.development.developmentPriority).toBe('high');
  });

  it('low scheme fit creates warning', () => {
    const result = buildPlayerProfileAnalysis({ player: { ...basePlayer, ratings: { schemeFit: 40 } } });
    expect(result.warnings).toContain('low_scheme_fit');
  });

  it('position-specific stat summary works', () => {
    expect(buildPositionStatSummary('QB', { passYd: 3000, passTD: 20 }).label).toContain('QB');
    expect(buildPositionStatSummary('RB', { rushYd: 1200 }).label).toContain('Rushing');
    expect(buildPositionStatSummary('WR', { recYd: 900 }).label).toContain('Receiving');
    expect(buildPositionStatSummary('LB', { tackles: 80 }).label).toContain('Defensive');
  });

  it('missing player returns safe result', () => {
    const result = buildPlayerProfileAnalysis({ player: null as any });
    expect(result.identity).toBeNull();
  });
});
