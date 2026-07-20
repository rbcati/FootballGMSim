/**
 * aiCapCompliancePlan.test.js
 *
 * Unit coverage for the canonical AI cap-compliance planner and cap snapshot
 * introduced by "AI Post-Rollover Salary-Cap Compliance V1".
 *
 * These exercise the PURE decision layer (no cache, no IndexedDB):
 *   - buildTeamCapSnapshot  (contractObligations.js) — the single legal-cap
 *     equation shared with the pre-advance legality gate.
 *   - AiLogic.buildAiCapCompliancePlan — deterministic plan-then-commit planner.
 *   - AiLogic._releaseDeadCapSplit — post-June-1 dead-cap split.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the heavy cache / persistence deps so importing AiLogic is side-effect
// free. The planner functions under test never touch these mocks.
vi.mock('../../src/db/cache.js', () => ({ cache: {} }));
vi.mock('../../src/db/index.js', () => ({ Transactions: { add: vi.fn() } }));
vi.mock('../../src/core/news-engine.js', () => ({ default: { logTransaction: vi.fn(), logNews: vi.fn() } }));

import { buildTeamCapSnapshot } from '../../src/core/contracts/contractObligations.js';
import AiLogic from '../../src/core/ai-logic.js';

let uid = 0;
function player({ pos = 'WR', ovr = 70, age = 27, base = 1, sb = 0, yearsTotal = 1, years = yearsTotal, id, restructureCount = 0, lastRestructuredSeason } = {}) {
  return {
    id: id ?? `p${++uid}`,
    pos, ovr, age,
    contract: { baseAnnual: base, signingBonus: sb, yearsTotal, years, yearsRemaining: years, restructureCount, ...(lastRestructuredSeason != null ? { lastRestructuredSeason } : {}) },
  };
}

/** Roster of cheap depth so position floors are always satisfied. */
function depthFiller(n, base = 0.75) {
  const positions = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(player({ pos: positions[i % positions.length], ovr: 60, age: 25, base }));
  }
  return out;
}

describe('buildTeamCapSnapshot — canonical legal equation (matches legality gate)', () => {
  it('counts current-year dead cap toward legal compliance', () => {
    // rosterCap 295 + deadCap 18 = 313 committed vs cap 301 → over by 12.
    const roster = [player({ base: 295, yearsTotal: 1 })];
    const snap = buildTeamCapSnapshot({ team: { deadCap: 18 }, roster, salaryCap: 301 });
    expect(snap.rosterCap).toBe(295);
    expect(snap.deadCap).toBe(18);
    expect(snap.totalCommitted).toBe(313);
    expect(snap.isLegallyCompliant).toBe(false);
    expect(snap.overageVsLegal).toBe(12);
  });

  it('does not treat roster cap alone below the cap as compliant when dead cap pushes it over', () => {
    const roster = [player({ base: 295, yearsTotal: 1 })];
    const snap = buildTeamCapSnapshot({ team: { deadCap: 18 }, roster, salaryCap: 301 });
    // capUsed(295) <= cap(301) would be the OLD buggy check — snapshot rejects it.
    expect(snap.rosterCap).toBeLessThanOrEqual(301);
    expect(snap.isLegallyCompliant).toBe(false);
  });

  it('uses the live salary cap passed in, not a hard-coded constant', () => {
    const roster = [player({ base: 295, yearsTotal: 1 })];
    const overSnap = buildTeamCapSnapshot({ team: { deadCap: 18 }, roster, salaryCap: 301 });
    const liveSnap = buildTeamCapSnapshot({ team: { deadCap: 18 }, roster, salaryCap: 350 });
    expect(overSnap.isLegallyCompliant).toBe(false);
    expect(liveSnap.isLegallyCompliant).toBe(true);
    expect(liveSnap.capRoom).toBe(37);
  });

  it('separates the planning buffer from the legal ceiling', () => {
    const roster = [player({ base: 290, yearsTotal: 1 })];
    const snap = buildTeamCapSnapshot({ team: { deadCap: 0 }, roster, salaryCap: 301, targetBuffer: 25 });
    expect(snap.legalLimit).toBe(301);
    expect(snap.isLegallyCompliant).toBe(true);       // 290 <= 301
    expect(snap.targetCommitted).toBe(276);           // 301 - 25
    expect(snap.isWithinPlanningTarget).toBe(false);  // 290 > 276
  });
});

describe('AiLogic._releaseDeadCapSplit — post-June-1 dead cap', () => {
  it('charges only the current year proration now and defers the rest', () => {
    const p = player({ base: 4, sb: 12, yearsTotal: 4, years: 4 });
    const { currentYearDead, futureYearsDead } = AiLogic._releaseDeadCapSplit(p);
    expect(currentYearDead).toBe(3);   // 12 / 4
    expect(futureYearsDead).toBe(9);   // 3 * (4 - 1)
  });
});

describe('AiLogic.buildAiCapCompliancePlan — restructures', () => {
  it('produces a restructure with proven positive current-year relief and reaches legal', () => {
    const star = player({ pos: 'QB', ovr: 90, base: 50, sb: 0, yearsTotal: 4, years: 4 });
    const roster = [star, ...depthFiller(52, 1.15)]; // rosterCap ≈ 50 + 59.8 = 109.8
    const team = { id: 5, abbr: 'CIN', deadCap: 0 };
    const plan = AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap: 100, targetBuffer: 0, season: 2029 });

    const restructures = plan.actions.filter((a) => a.type === 'RESTRUCTURE');
    expect(restructures.length).toBeGreaterThan(0);
    for (const r of restructures) expect(r.relief).toBeGreaterThan(0);
    expect(plan.projected.isLegallyCompliant).toBe(true);
    expect(plan.failure).toBeNull();
  });

  it('skips restructuring a player already restructured this season (no repeat)', () => {
    const star = player({ pos: 'QB', ovr: 90, base: 50, sb: 0, yearsTotal: 4, years: 4, lastRestructuredSeason: 2029 });
    const roster = [star, ...depthFiller(52, 1.15)];
    const team = { id: 5, abbr: 'CIN', deadCap: 0 };
    const plan = AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap: 100, targetBuffer: 0, season: 2029 });
    const restructuredStar = plan.actions.find((a) => a.type === 'RESTRUCTURE' && a.playerId === star.id);
    expect(restructuredStar).toBeUndefined();
  });

  it('does not restructure the same player twice within a single plan', () => {
    const star = player({ pos: 'QB', ovr: 95, base: 80, sb: 0, yearsTotal: 5, years: 5 });
    const roster = [star, ...depthFiller(52, 2)];
    const team = { id: 5, abbr: 'CIN', deadCap: 0 };
    const plan = AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap: 100, targetBuffer: 0, season: 2029 });
    const ids = plan.actions.filter((a) => a.type === 'RESTRUCTURE').map((a) => a.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('AiLogic.buildAiCapCompliancePlan — releases by net relief', () => {
  it('prefers realizable net relief over raw cap hit', () => {
    // A: high cap hit but almost all dead money → tiny net relief.
    const A = player({ id: 'A', pos: 'WR', ovr: 70, age: 30, base: 2, sb: 40, yearsTotal: 4, years: 4 }); // hit 12, dead 10, net 2
    // B: lower cap hit, all base → large net relief.
    const B = player({ id: 'B', pos: 'WR', ovr: 70, age: 30, base: 9, sb: 0, yearsTotal: 1, years: 1 });   // hit 9, dead 0, net 9
    const roster = [A, B, ...depthFiller(51, 1)];
    const team = { id: 6, abbr: 'CLE', deadCap: 0 };
    // Over the legal cap by ~ a few M so exactly one net-relief cut is needed.
    const legalCap = buildTeamCapSnapshot({ team, roster, salaryCap: 9999 }).rosterCap - 5;
    const plan = AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap, targetBuffer: 0, season: 2029 });
    const releases = plan.actions.filter((a) => a.type === 'RELEASE');
    expect(releases.length).toBeGreaterThan(0);
    // The first release must be B (net 9), never A (net 2).
    expect(releases[0].playerId).toBe('B');
    for (const r of releases) expect(r.netRelief).toBeGreaterThan(0);
  });

  it('never chooses a zero/negative-net-relief release for cap compliance', () => {
    // Player with all-bonus contract → net relief 0.
    const zero = player({ id: 'Z', pos: 'WR', ovr: 70, age: 30, base: 0, sb: 20, yearsTotal: 4, years: 4 }); // hit 5, dead 5, net 0
    const real = player({ id: 'R', pos: 'WR', ovr: 68, age: 31, base: 12, sb: 0, yearsTotal: 1, years: 1 }); // net 12
    const roster = [zero, real, ...depthFiller(51, 1)];
    const team = { id: 6, abbr: 'CLE', deadCap: 0 };
    const legalCap = buildTeamCapSnapshot({ team, roster, salaryCap: 9999 }).rosterCap - 6;
    const plan = AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap, targetBuffer: 0, season: 2029 });
    const releasedZero = plan.actions.find((a) => a.type === 'RELEASE' && a.playerId === 'Z');
    expect(releasedZero).toBeUndefined();
  });
});

describe('AiLogic.buildAiCapCompliancePlan — safeguards', () => {
  it('does not cut a position below its floor even when it is the only cap relief', () => {
    // Roster sits at EXACTLY the position floor for every group, so cutting any
    // player would drop that position below its floor. The two QBs are expensive
    // and un-restructurable (1 yr left) — the only theoretical relief.
    const floors = { QB: 2, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1 };
    const roster = [];
    for (const [pos, count] of Object.entries(floors)) {
      for (let i = 0; i < count; i++) {
        const expensiveQb = pos === 'QB';
        roster.push(player({
          id: `${pos}${i}`, pos, ovr: 78, age: 30,
          base: expensiveQb ? 30 : 0.75, sb: 0, yearsTotal: 1, years: 1,
        }));
      }
    }
    const team = { id: 9, abbr: 'IND', deadCap: 0 };
    const legalCap = buildTeamCapSnapshot({ team, roster, salaryCap: 9999 }).rosterCap - 10;
    const plan = AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap, targetBuffer: 0, season: 2029 });
    const cutQb = plan.actions.find((a) => a.type === 'RELEASE' && String(a.playerId).startsWith('QB'));
    expect(cutQb).toBeUndefined();
    // No legal plan exists without violating a floor → structured failure, not silent success.
    expect(plan.failure).not.toBeNull();
    expect(plan.failure.remainingOverage).toBeGreaterThan(0);
  });

  it('returns a structured failure (not an infinite loop) when no legal plan exists', () => {
    const roster = depthFiller(53, 0.75).map((p) => ({ ...p, contract: { ...p.contract, baseAnnual: 0, signingBonus: 20, yearsTotal: 4, years: 4 } }));
    const team = { id: 13, abbr: 'KC', deadCap: 0 };
    const plan = AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap: 10, targetBuffer: 0, season: 2029 });
    expect(plan.failure).not.toBeNull();
    expect(plan.failure.reason).toBe('no_legal_plan');
  });

  it('is deterministic for identical input', () => {
    const build = () => {
      uid = 1000; // stable ids across both builds
      const star = player({ pos: 'QB', ovr: 90, base: 40, sb: 0, yearsTotal: 4, years: 4, id: 'STAR' });
      const roster = [star, ...depthFiller(52, 2)];
      const team = { id: 5, abbr: 'CIN', deadCap: 4 };
      return AiLogic.buildAiCapCompliancePlan(team, roster, { legalCap: 100, targetBuffer: 0, season: 2029 });
    };
    const a = build();
    const b = build();
    expect(JSON.stringify(a.actions)).toBe(JSON.stringify(b.actions));
  });
});
