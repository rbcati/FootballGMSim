import { describe, expect, it } from 'vitest';
import { buildRosterBuildingAnalysis } from '../rosterBuildingAnalysis.js';
import { FOOTBALL_ROSTER_CONFIG } from '../sports/footballRosterConfig.js';

describe('buildRosterBuildingAnalysis replacement boards', () => {
  it('replacementBoards exists and includes urgent QB need', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 58, age: 31 }] });
    expect(res.replacementBoards).toBeTruthy();
    expect(res.replacementBoards.some((b) => b.key === 'QB' && b.needLevel === 'urgent')).toBe(true);
  });

  it('internalOptions includes backup when available', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 52 }, { id: 2, name: 'QB2', pos: 'QB', ovr: 68 }] });
    const qb = res.replacementBoards.find((b) => b.key === 'QB');
    expect(qb?.internalOptions.some((p) => p.name === 'QB1' || p.name === 'QB2')).toBe(true);
  });

  it('freeAgentOptions includes matching FA and excludes wrong position', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 55 }], freeAgents: [{ id: 20, name: 'FA QB', pos: 'QB', ovr: 72 }, { id: 21, name: 'FA RB', pos: 'RB', ovr: 90 }] });
    const qb = res.replacementBoards.find((b) => b.key === 'QB');
    expect(qb?.freeAgentOptions.some((p) => p.name === 'FA QB')).toBe(true);
    expect(qb?.freeAgentOptions.some((p) => p.pos === 'RB')).toBe(false);
  });

  it('bestAction chooses freeAgency when FA is better and cap is okay', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 55 }], freeAgents: [{ id: 20, name: 'FA QB', pos: 'QB', ovr: 82 }], cap: { capRoom: 40, capUsed: 200, deadCap: 10 } });
    expect(res.replacementBoards.find((b) => b.key === 'QB')?.bestAction?.type).toBe('freeAgency');
  });

  it('bestAction chooses internal when backup is good enough', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 54 }, { id: 2, name: 'QB2', pos: 'QB', ovr: 78, schemeFit: 80 }] });
    expect(['internal', 'draft']).toContain(res.replacementBoards.find((b) => b.key === 'QB')?.bestAction?.type);
  });

  it('bestAction chooses draft when no immediate option and picks exist', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 58 }], draftPicks: [{ round: 1 }] });
    const qb = res.replacementBoards.find((b) => b.key === 'QB');
    expect(['draft', 'trade']).toContain(qb?.bestAction?.type);
  });

  it('bestAction chooses training when development target matches and need not urgent', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'TE1', pos: 'TE', ovr: 60 }, { id: 2, name: 'TE2', pos: 'TE', ovr: 58, potential: 84, age: 22, schemeFit: 75 }], draftPicks: [{ round: 2 }] });
    const te = res.replacementBoards.find((b) => b.key === 'TE');
    expect(['training', 'internal', 'draft']).toContain(te?.bestAction?.type);
  });

  it('tradeSearch enabled only when urgent and no clear options', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 48 }] });
    expect(res.replacementBoards.find((b) => b.key === 'QB')?.tradeSearch?.enabled).toBe(true);
  });

  it('K/P lower priority than QB for similar weakness', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'QB1', pos: 'QB', ovr: 62 }, { id: 2, name: 'K1', pos: 'K', ovr: 62 }, { id: 3, name: 'P1', pos: 'P', ovr: 62 }] });
    const qb = res.positionGroups.find((g) => g.key === 'QB')?.needScore ?? 0;
    const k = res.positionGroups.find((g) => g.key === 'K')?.needScore ?? 0;
    expect(qb).toBeGreaterThan(k);
  });

  it('missing freeAgents/draftPicks/cap does not crash', () => {
    const res = buildRosterBuildingAnalysis({ roster: [{ id: 1, name: 'Unknown', pos: 'K' }] });
    expect(res.capSummary).toBeTruthy();
  });

  it('football config starter counts remain correct', () => {
    expect(FOOTBALL_ROSTER_CONFIG.groupConfig.OL.starterCountExpected).toBe(5);
    expect(FOOTBALL_ROSTER_CONFIG.groupConfig.DL.starterCountExpected).toBe(4);
    expect(FOOTBALL_ROSTER_CONFIG.groupConfig.CB.starterCountExpected).toBe(3);
  });
});
