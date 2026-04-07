import { describe, it, expect } from 'vitest';
import { ensureTeamStaff, computeStaffTeamBonuses, buildScoutingSnapshot } from '../../src/core/staff-system.js';

describe('staff system bounds', () => {
  it('ensures all major roles exist', () => {
    const staff = ensureTeamStaff({ id: 1, staff: {} }, { year: 2026 });
    expect(staff.headCoach).toBeTruthy();
    expect(staff.leadScout).toBeTruthy();
    expect(staff.proScout).toBeTruthy();
    expect(staff.headTrainer).toBeTruthy();
    expect(staff.capAdvisor).toBeTruthy();
  });

  it('keeps modifiers bounded', () => {
    const bonuses = computeStaffTeamBonuses({ id: 1, staff: ensureTeamStaff({ id: 1, staff: {} }, { year: 2026 }) }, { staffImpactStrength: 100 });
    expect(bonuses.developmentDelta).toBeLessThanOrEqual(0.18);
    expect(bonuses.developmentDelta).toBeGreaterThanOrEqual(-0.16);
    expect(bonuses.collegeScoutAccuracy).toBeLessThanOrEqual(0.93);
    expect(bonuses.collegeScoutAccuracy).toBeGreaterThanOrEqual(0.45);
  });

  it('applies fog-of-war unless commissioner mode', () => {
    const team = { id: 1, staff: ensureTeamStaff({ id: 1, staff: {} }, { year: 2026 }) };
    const player = { id: 5, ovr: 80, potential: 90, scoutProgress: 30 };
    const hidden = buildScoutingSnapshot(player, team, { fogStrength: 80, commissionerMode: false });
    const revealed = buildScoutingSnapshot(player, team, { fogStrength: 80, commissionerMode: true });
    expect(hidden.hidden).toBe(true);
    expect(hidden.uncertainty).toBeGreaterThan(0);
    expect(revealed.hidden).toBe(false);
    expect(revealed.estimatedOvr).toBe(80);
  });
});
