import { describe, expect, it } from 'vitest';
import { buildRosterBuildingAnalysis } from '../rosterBuildingAnalysis.js';

describe('buildRosterBuildingAnalysis', () => {
  it('flags urgent need when starter and depth are weak', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB A', pos: 'QB', ovr: 62, age: 31, contract: { yearsRemaining: 1 } }] });
    expect(res.positionGroups.find((g) => g.key === 'QB')?.needLevel).toBe('urgent');
  });

  it('flags strong group when quality is high', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'WR1', pos: 'WR', ovr: 88, age: 25 }, { id: 2, name: 'WR2', pos: 'WR', ovr: 83, age: 26 }, { id: 3, name: 'WR3', pos: 'WR', ovr: 80, age: 24 }] });
    expect(['strong', 'elite']).toContain(res.positionGroups.find((g) => g.key === 'WR')?.needLevel);
  });

  it('marks high cap pressure when cap room is negative', () => {
    const res = buildRosterBuildingAnalysis({ cap: { capRoom: -2, capUsed: 260, deadCap: 20 } });
    expect(res.capSummary.payrollPressure).toBe('critical');
  });

  it('prioritizes high-ovr expiring player as must_keep', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'CB1', pos: 'CB', ovr: 86, potential: 88, age: 27, contract: { yearsRemaining: 1, baseAnnual: 14 } }] });
    expect(res.expiringContracts[0]?.priority).toBe('must_keep');
  });

  it('detects aging expensive low-fit veteran as value risk', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'RB Vet', pos: 'RB', ovr: 70, age: 31, schemeFit: 40, contract: { baseAnnual: 15, yearsRemaining: 2 } }] });
    expect(res.valueRisks.length).toBeGreaterThan(0);
  });

  it('adds young high-potential development target', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'LB Dev', pos: 'LB', ovr: 68, potential: 81, age: 22, schemeFit: 70 }] });
    expect(res.developmentTargets[0]?.id).toBe(1);
  });

  it('does not crash on missing fields', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'Unknown', pos: 'K' }] });
    expect(res.capSummary).toBeTruthy();
  });
});
