import { describe, it, expect } from 'vitest';
import { generatePersonalityProfile, ensurePersonalityProfile, mentorshipBonusForPlayer, contractPersonalityModifier } from '../../src/core/development/personalitySystem.js';

describe('personality + mentorship', () => {
  it('generates bounded traits', () => {
    const profile = generatePersonalityProfile({ college: 'Notre Dame', age: 22 });
    Object.values(profile).forEach((value) => {
      expect(Number(value)).toBeGreaterThanOrEqual(0);
      expect(Number(value)).toBeLessThanOrEqual(100);
    });
  });

  it('hydrates defaults for legacy players', () => {
    const hydrated = ensurePersonalityProfile({ age: 28 });
    expect(hydrated.workEthic).toBeGreaterThan(0);
    expect(hydrated.consistency).toBeGreaterThan(0);
  });

  it('applies mentorship bonus when mentor qualifies', () => {
    const mentor = { id: 'm1', name: 'Vet', age: 31, personalityProfile: { leadership: 84, workEthic: 82, discipline: 78 }, mentorship: { maxMentees: 2 } };
    const mentee = { id: 'm2', mentorship: { mentorId: 'm1' } };
    const bonus = mentorshipBonusForPlayer(mentee, [mentor, mentee]);
    expect(bonus.applied).toBe(true);
    expect(bonus.development).toBeGreaterThan(0);
  });

  it('scales contract demands for diva players', () => {
    const mod = contractPersonalityModifier({ diva: 85, leadership: 40, workEthic: 40, holdoutRisk: 50 });
    expect(mod.annualDemandMultiplier).toBeGreaterThan(1);
    expect(mod.holdoutRisk).toBeGreaterThan(50);
  });
});
