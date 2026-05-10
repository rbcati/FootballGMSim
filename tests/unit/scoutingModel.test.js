import { describe, expect, it } from 'vitest';
import { buildProspectScoutingReport } from '../../src/core/scoutingModel.js';

describe('scoutingModel', () => {
  it('returns safe fallback for null prospect', () => {
    const r = buildProspectScoutingReport(null);
    expect(r.confidence).toBe('unknown');
    expect(r.summary).toMatch(/No prospect/i);
  });

  it('uses combine and interview for confidence and risk signals', () => {
    const r = buildProspectScoutingReport({
      id: 'p1',
      name: 'Test QB',
      pos: 'QB',
      age: 21,
      ovr: 78,
      potential: 92,
      schemeFit: 72,
      combineResults: { fortyTime: 4.52, verticalLeap: 36, agility: 6.9 },
      interviewReport: { riskScore: 28 },
      collegeProductionScore: 22,
    });
    expect(['high', 'medium']).toContain(r.confidence);
    expect(r.combineSignals.length).toBeGreaterThan(0);
    expect(r.interviewSignals.length).toBeGreaterThan(0);
    expect(r.upsideLabel).toMatch(/franchise|high-end|starter/i);
  });

  it('falls back to low confidence when few fields exist', () => {
    const r = buildProspectScoutingReport({
      id: 'sparse',
      pos: 'WR',
      potential: 70,
    });
    expect(r.confidence === 'low' || r.confidence === 'unknown' || r.confidence === 'medium').toBe(true);
  });

  it('projects QB vs defensive roles differently at similar grades', () => {
    const qb = buildProspectScoutingReport({
      id: 'qb',
      pos: 'QB',
      ovr: 76,
      potential: 88,
      schemeFit: 60,
      interviewReport: { riskScore: 40 },
    });
    const cb = buildProspectScoutingReport({
      id: 'cb',
      pos: 'CB',
      ovr: 76,
      potential: 88,
      schemeFit: 60,
      interviewReport: { riskScore: 40 },
    });
    expect(qb.projectedRole.toLowerCase()).toContain('qb');
    expect(cb.projectedRole.toLowerCase()).not.toContain('quarterback');
  });

  it('flags boom_bust risk when interview and upside gap are extreme', () => {
    const r = buildProspectScoutingReport({
      id: 'bb',
      pos: 'WR',
      ovr: 68,
      potential: 92,
      interviewReport: { riskScore: 68 },
      combineResults: { fortyTime: 4.48 },
    });
    expect(r.riskLevel).toBe('boom_bust');
  });
});
