import { describe, it, expect } from 'vitest';
import {
  hasMinimumPlayableLeague,
  shouldFinalizeNewSlotBootstrap,
  shouldShowNewFranchiseBootstrapGate,
  summarizeBootstrapState,
} from './leagueBootstrap.js';

describe('league bootstrap guards', () => {
  it('accepts minimal playable league payload', () => {
    expect(hasMinimumPlayableLeague({
      phase: 'regular',
      week: 1,
      userTeamId: 0,
      teams: [{ id: 0, name: 'A' }],
    })).toBe(true);
  });

  it('rejects partial payloads and reports reasons', () => {
    const summary = summarizeBootstrapState({ teams: [], userTeamId: 0 });
    expect(summary.ready).toBe(false);
    expect(summary.reasons.length).toBeGreaterThan(0);
  });

  it('does not finalize pending slot save for partial new-league payloads', () => {
    expect(shouldFinalizeNewSlotBootstrap({
      pendingNewSlot: 'save_slot_1',
      league: { teams: [{ id: 4 }], userTeamId: 4 },
    })).toBe(false);
  });

  it('finalizes pending slot save when minimum playable league is ready', () => {
    expect(shouldFinalizeNewSlotBootstrap({
      pendingNewSlot: 'save_slot_1',
      league: {
        phase: 'preseason',
        week: 1,
        userTeamId: 4,
        teams: [{ id: 4 }],
      },
    })).toBe(true);
  });

  it('gates main dashboard during new franchise bootstrap, but not existing-slot flow', () => {
    expect(shouldShowNewFranchiseBootstrapGate({
      pendingNewSlot: 'save_slot_1',
      initFlowMode: 'new',
      league: { teams: [{ id: 3 }], userTeamId: 3 },
    })).toBe(true);

    expect(shouldShowNewFranchiseBootstrapGate({
      pendingNewSlot: null,
      initFlowMode: 'load',
      league: { teams: [{ id: 3 }], userTeamId: 3 },
    })).toBe(false);
  });
});
