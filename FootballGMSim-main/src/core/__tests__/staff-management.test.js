import { describe, expect, it } from 'vitest';
import { ensureTeamStaff, computeStaffTeamBonuses, hireStaffForTeam, fireStaffForTeam, createStaffMember } from '../staff-system.js';
import { negotiateStaffContract } from '../staff/staffModel.ts';

describe('staff management core', () => {
  it('hydrates backward-compatible default staff for legacy saves', () => {
    const team = { id: 1, name: 'Legacy Team', staff: null };
    const staff = ensureTeamStaff(team, { year: 2026 });
    expect(staff.headCoach).toBeTruthy();
    expect(staff.scoutDirector).toBeTruthy();
  });

  it('negotiates contracts with cap-aware acceptance', () => {
    const staff = ensureTeamStaff({ id: 2, staff: null }, { year: 2026 });
    const result = negotiateStaffContract({
      member: staff.headCoach,
      ask: { annualSalary: 4.2, years: 4 },
      teamCapRoom: 20,
      hardCap: 301.2,
    });
    expect(result.accepted || result.counter).toBeTruthy();
  });

  it('supports hire and fire role workflows', () => {
    const team = { id: 5, staff: ensureTeamStaff({ id: 5, staff: null }, { year: 2026 }) };
    const candidate = createStaffMember('offCoordinator', { year: 2026, teamId: -1 });
    const hired = hireStaffForTeam(team, { roleKey: 'offCoordinator', candidate, year: 2026 });
    expect(hired.offCoordinator?.id).toBe(candidate.id);
    const fired = fireStaffForTeam({ ...team, staff: hired }, { roleKey: 'offCoordinator', year: 2026 });
    expect(fired.offCoordinator).toBeNull();
  });

  it('computes development bonus including mentor influence channel', () => {
    const staff = ensureTeamStaff({ id: 3, staff: null }, { year: 2026 });
    staff.mentor = { ...staff.mentor, modifiers: { mentor: 0.12 } };
    const bonuses = computeStaffTeamBonuses({ id: 3, staff }, { year: 2026, staffImpactStrength: 100 });
    expect(typeof bonuses.mentorDelta).toBe('number');
  });
});
