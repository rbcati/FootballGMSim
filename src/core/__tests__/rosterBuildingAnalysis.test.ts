import { describe, expect, it } from 'vitest';
import { buildRosterBuildingAnalysis } from '../rosterBuildingAnalysis.js';

describe('buildRosterBuildingAnalysis', () => {
  it('flags QB urgent need when starter is weak despite backup depth', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 60, age: 30 }] });
    expect(res.positionGroups.find((g) => g.key === 'QB')?.needLevel).toBe('urgent');
  });

  it('uses WR top-3 starter window', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'WR1', pos: 'WR', ovr: 89 }, { id: 2, name: 'WR2', pos: 'WR', ovr: 62 }, { id: 3, name: 'WR3', pos: 'WR', ovr: 61 }] });
    expect(res.positionGroups.find((g) => g.key === 'WR')?.starterOVR).toBe(71);
  });

  it('uses OL top-5 starters and does not hide weak line', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'OL1', pos: 'OL', ovr: 92 }, { id: 2, name: 'OL2', pos: 'OL', ovr: 62 }, { id: 3, name: 'OL3', pos: 'OL', ovr: 61 }, { id: 4, name: 'OL4', pos: 'OL', ovr: 60 }, { id: 5, name: 'OL5', pos: 'OL', ovr: 59 }, { id: 6, name: 'OL6', pos: 'OL', ovr: 58 }] });
    const group = res.positionGroups.find((g) => g.key === 'OL');
    expect(group?.starterCountExpected).toBe(5);
    expect(group?.needLevel).toMatch(/urgent|thin/);
  });

  it('increases RB age risk earlier', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'RB Vet', pos: 'RB', ovr: 80, age: 29 }] });
    expect((res.positionGroups.find((g) => g.key === 'RB')?.ageRisk ?? 0)).toBeGreaterThan(0);
  });

  it('sets starter expectations for DL/LB/CB/S', () => {
    const res = buildRosterBuildingAnalysis({ roster: [] });
    expect(res.positionGroups.find((g) => g.key === 'DL')?.starterCountExpected).toBe(4);
    expect(res.positionGroups.find((g) => g.key === 'LB')?.starterCountExpected).toBe(3);
    expect(res.positionGroups.find((g) => g.key === 'CB')?.starterCountExpected).toBe(3);
    expect(res.positionGroups.find((g) => g.key === 'S')?.starterCountExpected).toBe(2);
  });

  it('adds matching free-agent candidate when available', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB A', pos: 'QB', ovr: 58 }], freeAgents: [{ id: 99, name: 'FA QB', pos: 'QB', ovr: 74 }] });
    expect(res.candidateActions.some((a) => a.type === 'freeAgency' && a.playerName === 'FA QB')).toBe(true);
  });

  it('does not add free-agent action when no matching FA exists', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB A', pos: 'QB', ovr: 58 }], freeAgents: [{ id: 99, name: 'FA RB', pos: 'RB', ovr: 74 }] });
    expect(res.candidateActions.some((a) => a.type === 'freeAgency' && a.pos === 'QB')).toBe(false);
  });

  it('detects aging expensive low-fit veteran as value risk', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'RB Vet', pos: 'RB', ovr: 70, age: 31, schemeFit: 40, contract: { baseAnnual: 15, yearsRemaining: 2 } }] });
    expect(res.valueRisks.length).toBeGreaterThan(0);
  });

  it('creates training action from development target', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'LB Dev', pos: 'LB', ovr: 68, potential: 81, age: 22, schemeFit: 70 }, { id: 2, name: 'LB Vet', pos: 'LB', ovr: 48, age: 31 }], draftPicks: [{ round: 2 }] });
    expect(res.candidateActions.some((a) => a.type === 'training')).toBe(true);
  });

  it('does not crash on missing cap/free-agent/draft data', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'Unknown', pos: 'K' }] });
    expect(res.capSummary).toBeTruthy();
  });
});
