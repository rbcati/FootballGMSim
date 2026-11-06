import { describe, expect, it } from 'vitest';
import { serializeLeagueDelta, applyLeagueDelta } from '../../src/worker/serialization.js';
function state(teamId, playerId, patch = {}) {
  return { phase: 'offseason_resign', teams: [{ id: teamId, rosterCount: 1, capUsed: 10, roster: [{ id: playerId, extensionDecision: 'pending', contract: { years: 1, baseAnnual: 10 }, ...patch }] }] };
}
describe.each([0, 7])('offseason delta for team %s', teamId => {
  for (const playerId of [0, 'opaque-player']) {
    for (const decision of ['let_walk', 'deferred', null]) it(`transports decision ${decision} for ${playerId} without a cap or membership change`, () => {
      const before = state(teamId, playerId);
      const after = state(teamId, playerId, { extensionDecision: decision });
      const { delta } = serializeLeagueDelta(after, before);
      expect(delta.teams).toEqual(after.teams);
      const restored = applyLeagueDelta(before, delta);
      expect(restored.teams[0].roster[0]).toMatchObject({ id: playerId, extensionDecision: decision });
    });
    it(`transports same-cap contract and plan changes for ${playerId}`, () => {
      const before = state(teamId, playerId);
      for (const patch of [{ contract: { years: 3, baseAnnual: 10 } }, { contractPlan: ['shortlist_extension'] }, { tradeStatus: 'untouchable' }, { onTradeBlock: true }]) {
        const after = state(teamId, playerId, patch);
        expect(serializeLeagueDelta(after, before).delta.teams).toEqual(after.teams);
      }
    });
    it(`keeps unchanged roster snapshots out of the delta for ${playerId}`, () => {
      const before = state(teamId, playerId);
      expect(serializeLeagueDelta(structuredClone(before), before).delta.teams).toBeUndefined();
    });
  }
});
