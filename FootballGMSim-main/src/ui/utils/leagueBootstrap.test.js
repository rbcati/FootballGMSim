import { describe, it, expect } from 'vitest';
import {
  canPersistActiveSlot,
  hasMinimumPlayableLeague,
  NEW_SLOT_BOOTSTRAP_PHASES,
  shouldFinalizeNewSlotBootstrap,
  shouldShowAuthoritativeInitGate,
  shouldStartNewSlotInitialSave,
  summarizeBootstrapState,
} from './leagueBootstrap.js';

const playableLeague = {
  activeLeagueId: 'save_slot_1',
  phase: 'preseason',
  week: 1,
  userTeamId: 4,
  teams: [{ id: 4, name: 'Phoenix' }],
};

describe('league bootstrap guards', () => {
  it('accepts minimal playable league payload', () => {
    expect(hasMinimumPlayableLeague(playableLeague)).toBe(true);
  });

  it('rejects partial payloads and reports reasons', () => {
    const summary = summarizeBootstrapState({ teams: [], userTeamId: 0 });
    expect(summary.ready).toBe(false);
    expect(summary.reasons.length).toBeGreaterThan(0);
  });

  it('does not request the first new-save write before a league is minimally playable', () => {
    expect(shouldStartNewSlotInitialSave({
      league: { teams: [{ id: 4 }], userTeamId: 4 },
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.AWAITING_PLAYABLE,
    })).toBe(false);

    expect(canPersistActiveSlot({
      league: { teams: [{ id: 4 }], userTeamId: 4 },
      activeSlot: 'save_slot_1',
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.AWAITING_PLAYABLE,
    })).toBe(false);
  });

  it('keeps new-save initialization gated for partial leagues and while the opening save is in-flight', () => {
    expect(shouldShowAuthoritativeInitGate({
      league: { teams: [{ id: 4 }], userTeamId: 4 },
      initFlowMode: 'new',
      initFlowActive: true,
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.AWAITING_PLAYABLE,
    })).toBe(true);

    expect(shouldShowAuthoritativeInitGate({
      league: playableLeague,
      initFlowMode: 'new',
      initFlowActive: true,
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT,
    })).toBe(true);
  });

  it('does not finalize bootstrap until the matching slot save acknowledgement arrives', () => {
    expect(shouldFinalizeNewSlotBootstrap({
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT,
      saveEvent: null,
    })).toBe(false);

    expect(shouldFinalizeNewSlotBootstrap({
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT,
      saveEvent: { kind: 'slot', slotKey: 'save_slot_2' },
    })).toBe(false);
  });

  it('treats a playable league plus matching slot save acknowledgement as the normal completion path', () => {
    expect(shouldStartNewSlotInitialSave({
      league: playableLeague,
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.AWAITING_PLAYABLE,
    })).toBe(true);

    expect(shouldFinalizeNewSlotBootstrap({
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT,
      saveEvent: { kind: 'slot', slotKey: 'save_slot_1' },
    })).toBe(true);

    expect(canPersistActiveSlot({
      league: playableLeague,
      activeSlot: 'save_slot_1',
      pendingNewSlot: 'save_slot_1',
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.IDLE,
    })).toBe(true);
  });

  it('preserves the existing-slot load gate until the requested save is fully playable', () => {
    expect(shouldShowAuthoritativeInitGate({
      league: playableLeague,
      initFlowMode: 'load',
      initFlowActive: true,
      pendingNewSlot: null,
      loadReady: false,
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.IDLE,
    })).toBe(true);

    expect(shouldShowAuthoritativeInitGate({
      league: playableLeague,
      initFlowMode: 'load',
      initFlowActive: true,
      pendingNewSlot: null,
      loadReady: true,
      bootstrapPhase: NEW_SLOT_BOOTSTRAP_PHASES.IDLE,
    })).toBe(false);
  });
});
