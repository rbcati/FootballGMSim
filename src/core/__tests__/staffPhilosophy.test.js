import { describe, expect, it } from 'vitest';
import {
  OFFENSIVE_PHILOSOPHY,
  buildStaffPhilosophySummary,
  createDefaultStaffForTeam,
  getStaffPhilosophyLabel,
  normalizeStaffMember,
  normalizeTeamStaff,
} from '../staff/staffPhilosophy.js';

describe('staffPhilosophy', () => {
  it('normalizes missing staff to safe defaults', () => {
    const summary = buildStaffPhilosophySummary({ id: 7, name: 'Bears' });
    expect(summary.headCoachName).toContain('Interim Staff');
    expect(summary.offensivePhilosophy).toBe('BALANCED');
    expect(summary.defensivePhilosophy).toBe('BALANCED');
  });

  it('creates default legacy fallback staff for empty teams', () => {
    const staff = createDefaultStaffForTeam({ id: 2, name: 'Jets' });
    expect(staff.headCoach.roleKey).toBe('headCoach');
    expect(staff.headCoach.offensivePhilosophy).toBe(OFFENSIVE_PHILOSOPHY.BALANCED);
  });

  it('handles malformed staff input without crashing', () => {
    const malformed = normalizeStaffMember({ name: null, traits: ['scheme_teacher', 'bad', 'scheme_teacher'], offensivePhilosophy: '???' });
    expect(malformed.name).toBe('Interim Staff');
    expect(malformed.offensivePhilosophy).toBe('BALANCED');
    expect(malformed.traits).toEqual(['SCHEME_TEACHER']);
  });

  it('has deterministic philosophy labels', () => {
    expect(getStaffPhilosophyLabel('offense', 'WEST_COAST')).toBe('West Coast timing offense');
    expect(getStaffPhilosophyLabel('defense', 'COVER_2')).toBe('Cover 2 shell defense');
  });

  it('summary avoids gameplay bonus language', () => {
    const summary = buildStaffPhilosophySummary({
      staff: { headCoach: { name: 'Alex Reed', offensivePhilosophy: 'SPREAD', defensivePhilosophy: 'MAN_COVERAGE', traits: ['PLAYER_FRIENDLY'] } },
    });
    expect(summary.flavor).toContain('leans');
    expect(summary.flavor).not.toMatch(/bonus|boost|modifier|improve/i);
  });

  it('normalizes coordinator aliases from legacy keys', () => {
    const normalized = normalizeTeamStaff({ staff: { offCoord: { name: 'OC', schemePreference: 'spread' }, defCoord: { name: 'DC', schemePreference: 'cover 2' } } });
    expect(normalized.offCoordinator.offensivePhilosophy).toBe('SPREAD');
    expect(normalized.defCoordinator.defensivePhilosophy).toBe('COVER_2');
  });
});
