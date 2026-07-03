// saveSlotStorage.js — active save slot selection + slot-keyed localStorage.
//
// Extracted from src/core/state.js. Key names and normalization are part of
// the on-disk save compatibility contract — do not change them:
//   nflGM4.activeSlot          → active slot number (1..MAX_SAVE_SLOTS)
//   <SAVE_KEY_BASE>.slot<N>    → serialized state per slot
//   <SAVE_KEY_BASE>            → legacy single-save key (migrated by loadState)

import { Constants } from '../core/constants.js';
import { patchLegacyState } from './legacyStateBridge.js';

const C = Constants;

export const SAVE_KEY_BASE = (C.GAME_CONFIG && C.GAME_CONFIG.SAVE_KEY) || 'nflGM4.state';
export const MAX_SAVE_SLOTS = 5;

const ACTIVE_SLOT_KEY = 'nflGM4.activeSlot';

export function normalizeSlot(slot) {
  const parsed = parseInt(slot, 10);
  if (isNaN(parsed) || parsed < 1) return 1;
  if (parsed > MAX_SAVE_SLOTS) return MAX_SAVE_SLOTS;
  return parsed;
}

export function getActiveSaveSlot() {
  if (typeof window === 'undefined') return 1;
  const stored = window.localStorage.getItem(ACTIVE_SLOT_KEY);
  return normalizeSlot(stored || 1);
}

export function setActiveSaveSlot(slot) {
  const normalized = normalizeSlot(slot);
  if (typeof window === 'undefined') return normalized;
  try {
    window.localStorage.setItem(ACTIVE_SLOT_KEY, normalized);
    patchLegacyState({ saveSlot: normalized });
  } catch (err) {
    console.warn('Unable to persist active save slot', err);
  }
  return normalized;
}

export function saveKeyFor(slot) {
  const normalized = normalizeSlot(slot);
  return `${SAVE_KEY_BASE}.slot${normalized}`;
}

export function getSaveMetadata(slot) {
  const normalized = normalizeSlot(slot);
  const key = saveKeyFor(normalized);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      slot: normalized,
      lastSaved: parsed.lastSaved || null,
      team: parsed.league?.teams?.[parsed.userTeamId || 0]?.name || null,
      season: parsed.season || 1,
      mode: parsed.namesMode || 'fictional'
    };
  } catch (err) {
    console.warn('Could not parse save metadata for slot', normalized, err);
    return null;
  }
}

export function listSaveSlots() {
  const slots = [];
  for (let i = 1; i <= MAX_SAVE_SLOTS; i++) {
    slots.push(getSaveMetadata(i));
  }
  return slots;
}
