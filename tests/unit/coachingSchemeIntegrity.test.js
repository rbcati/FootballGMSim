import { expect, it } from 'vitest';
import { deriveTeamCoachingIdentity } from '../../src/ui/utils/coachingIdentity.js';

it('coaching identity shares scheme aliases and actual V2 fit authority', () => {
  const roster = [{ id: 1, pos: 'QB', attributesV2: { throwPower: 90 } }, { id: 2, pos: 'FL', attributesV2: { catchInTraffic: 82 } }];
  const canonical = deriveTeamCoachingIdentity({ roster, strategies: { offSchemeId: 'VERTICAL', defSchemeId: 'BLITZ_34' } });
  const named = deriveTeamCoachingIdentity({ roster, staff: { headCoach: { offScheme: 'Vertical', defScheme: '3-4 Blitz' } } });
  expect(named.philosophy).toEqual(canonical.philosophy);
  expect(named.fit).toEqual(canonical.fit);
  expect(canonical.fit.qbFit).toBe(90);
  expect(canonical.fit.wrFit).toBe(82);
});

it('does not describe neutral specialists as a scheme weakness', () => {
  const identity = deriveTeamCoachingIdentity({ roster: [{ id: 1, pos: 'K', ovr: 90 }, { id: 2, pos: 'P', ovr: 90 }] });
  expect(identity.fit.top).toBeNull();
  expect(identity.fit.bottom).toBeNull();
  expect(identity.rosterFitNotes).toEqual([]);
});
