import { describe, it, expect } from 'vitest';
import {
  canPersistActiveSlot,
  hasMinimumPlayableLeague,
  NEW_SLOT_BOOTSTRAP_PHASES,
  shouldFinalizeNewSlotBootstrap,
  shouldShowAuthoritativeInitGate,
  shouldShowNewFranchiseBootstrapGate,
  shouldStartNewSlotInitialSave,
  summarizeBootstrapState,
} from './leagueBootstrap.js';

const playableLeague = {
  activeLeagueId: 'save_slot_1',
  phase: 'preseason',
  year: 2025,
  week: 1,
  userTeamId: 4,
  teams: [{ id: 4, name: 'Phoenix', roster: [{ id: 10 }] }, { id: 2, name: 'Vegas', roster: [{ id: 11 }] }],
  schedule: { weeks: [{ week: 1, games: [{ home: 4, away: 2, played: false }] }] },
};

describe('league bootstrap guards', () => {
  it('accepts minimal playable league payload', () => {
    expect(hasMinimumPlayableLeague(playableLeague)).toBe(true);
  });

  it('null league is not playable and reports missing state', () => {
    expect(hasMinimumPlayableLeague(null)).toBe(false);
    expect(summarizeBootstrapState(null).reasons[0]).toContain('No league state received');
  });

  it('rejects partial payloads and reports reasons', () => {
    const summary = summarizeBootstrapState({ teams: [], userTeamId: 0 });
    expect(summary.ready).toBe(false);
    expect(summary.reasons.length).toBeGreaterThan(0);
  });

  it('new-franchise bootstrap gate clears once league is playable', () => {
    expect(shouldShowNewFranchiseBootstrapGate({
      league: null,
      pendingNewSlot: 'save_slot_1',
      initFlowMode: 'new',
    })).toBe(true);
    expect(shouldShowNewFranchiseBootstrapGate({
      league: playableLeague,
      pendingNewSlot: 'save_slot_1',
      initFlowMode: 'new',
    })).toBe(false);
  });

  it('simple finalize path only resolves with playable league and pending slot', () => {
    expect(shouldFinalizeNewSlotBootstrap({ pendingNewSlot: null, league: playableLeague })).toBe(false);
    expect(shouldFinalizeNewSlotBootstrap({ pendingNewSlot: 'save_slot_1', league: { teams: [] } })).toBe(false);
    expect(shouldFinalizeNewSlotBootstrap({ pendingNewSlot: 'save_slot_1', league: playableLeague })).toBe(true);
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
