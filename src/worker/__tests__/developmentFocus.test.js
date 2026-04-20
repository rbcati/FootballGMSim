import { describe, expect, it } from 'vitest';
import { buildTeamDevelopmentFocusMap } from '../developmentFocus.js';

const ensureTeamStaff = (team) => ({
  headCoach: { overall: team?.staff?.headCoach?.overall ?? 80 },
  offCoordinator: { overall: team?.staff?.offCoordinator?.overall ?? 76 },
  defCoordinator: { overall: team?.staff?.defCoordinator?.overall ?? 74 },
  headTrainer: { overall: team?.staff?.headTrainer?.overall ?? 72 },
});

const computeStaffTeamBonuses = () => ({
  developmentDelta: 0.1,
  recoveryDelta: 0.08,
  injuryRateDelta: -0.05,
});

const normalizeFranchiseInvestments = (raw = {}) => ({
  trainingLevel: Number(raw?.trainingLevel ?? 1),
  stadiumLevel: Number(raw?.stadiumLevel ?? 1),
  trainingFocus: raw?.trainingFocus ?? 'balanced',
});

describe('buildTeamDevelopmentFocusMap', () => {
  it('maps canonical staff + franchise investments and not removed placeholder fields', () => {
    const focusMap = buildTeamDevelopmentFocusMap({
      teams: [{
        id: 4,
        weeklyDevelopmentFocus: { intensity: 'hard', drillType: 'film', positionGroups: ['qb'] },
        staff: { headCoach: { overall: 88 }, offCoordinator: { overall: 84 }, defCoordinator: { overall: 79 }, headTrainer: { overall: 81 } },
        staffState: { overallScore: 3 },
        medicalStaff: { overallScore: 2 },
        franchiseInvestments: { trainingLevel: 5, stadiumLevel: 4, facilityLevel: 1, trainingFocus: 'youth_development' },
      }],
      year: 2028,
      ensureTeamStaff,
      computeStaffTeamBonuses,
      normalizeFranchiseInvestments,
    });

    const focus = focusMap['4'];
    expect(focus.trainingFocus).toBe('youth_development');
    expect(focus.intensity).toBe('hard');
    expect(focus.drillType).toBe('film');
    expect(focus.positionGroups).toEqual(['qb']);

    // Canonical staff/investment signals should produce high quality values.
    expect(focus.staffQuality).toBeGreaterThan(80);
    expect(focus.medicalQuality).toBeGreaterThan(70);
    expect(focus.facilityQuality).toBeGreaterThan(90);
  });
});
