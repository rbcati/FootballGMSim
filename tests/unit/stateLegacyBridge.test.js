/** @vitest-environment jsdom */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getLegacyState,
  setLegacyState,
  patchLegacyState,
  resetLegacyState,
  getLegacySaveDelegate,
} from '../../src/state/legacyStateBridge.js';
import { saveKeyFor, SAVE_KEY_BASE } from '../../src/state/saveSlotStorage.js';

// src/core/state.js is imported dynamically (not statically) so the spy below
// can prove that merely importing the module installs nothing on window.
let stateModule;
let addEventListenerSpy;

beforeAll(async () => {
  addEventListenerSpy = vi.spyOn(window, 'addEventListener');
  stateModule = await import('../../src/core/state.js');
});

beforeEach(() => {
  window.localStorage.clear();
  delete window.state;
  delete window.saveGame;
});

afterEach(() => {
  window.localStorage.clear();
  delete window.state;
  delete window.saveGame;
});

describe('importing src/core/state.js is side-effect free for global state', () => {
  it('does not eagerly install window.state', () => {
    // beforeEach deletes window.state, but the import in beforeAll ran before
    // any cleanup — capture proof from the spy-era instead: the module-level
    // export must still be null and re-importing must not recreate state.
    expect(stateModule.state).toBeNull();
    expect(window.state).toBeUndefined();
  });

  it('does not eagerly install the beforeunload autosave hook', () => {
    const beforeunloadHooks = addEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'beforeunload'
    );
    expect(beforeunloadHooks).toHaveLength(0);
  });

});

describe('legacyStateBridge primitives', () => {
  it('getLegacyState returns null until state is installed', () => {
    expect(getLegacyState()).toBeNull();
    const installed = setLegacyState({ hello: 'world' });
    expect(getLegacyState()).toBe(installed);
    expect(window.state).toBe(installed);
  });

  it('patchLegacyState merges in place and no-ops without state', () => {
    expect(patchLegacyState({ a: 1 })).toBeNull();
    expect(window.state).toBeUndefined();

    const installed = setLegacyState({ a: 1, b: 2 });
    const patched = patchLegacyState({ b: 3, c: 4 });
    expect(patched).toBe(installed);
    expect(window.state).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('resetLegacyState preserves object identity for legacy references', () => {
    const original = setLegacyState({ staleKey: true, league: 'old' });
    const result = resetLegacyState(() => ({ league: null, week: 1 }));

    expect(result).toBe(original); // same object, cleared in place
    expect(result.staleKey).toBeUndefined();
    expect(result).toEqual({ league: null, week: 1 });
  });

  it('resetLegacyState installs fresh state when none exists', () => {
    const result = resetLegacyState(() => ({ week: 1 }));
    expect(window.state).toBe(result);
    expect(result).toEqual({ week: 1 });
  });

  it('getLegacySaveDelegate only returns installed callable delegates', () => {
    expect(getLegacySaveDelegate()).toBeNull();
    window.saveGame = 'not-a-function';
    expect(getLegacySaveDelegate()).toBeNull();
    const fn = () => {};
    window.saveGame = fn;
    expect(getLegacySaveDelegate()).toBe(fn);
  });
});

describe('State.reset preserves legacy behavior via the bridge', () => {
  it('clears extra keys and repopulates schema on the same object', () => {
    const legacy = setLegacyState({ zombieKey: 'stale', userTeamId: 7 });
    const result = stateModule.State.reset();

    expect(result).toBe(legacy); // identity preserved for legacy references
    expect(result.zombieKey).toBeUndefined();
    expect(result.userTeamId).toBe(0);
    expect(result.settings.autoSave).toBe(true);
    expect(result.version).toBe('4.0.0');
    // the module-level legacy export tracks the reset
    expect(stateModule.state).toBe(result);
  });
});

describe('saveState routes the dual save path through the bridge', () => {
  it('delegates to the installed save delegate', async () => {
    window.saveGame = vi.fn().mockResolvedValue(true);
    const gameState = { version: '4.0.0', saveSlot: 2, league: null };

    const ok = await stateModule.saveState(gameState, { reason: 'test' });

    expect(ok).toBe(true);
    expect(window.saveGame).toHaveBeenCalledTimes(1);
    expect(window.saveGame.mock.calls[0][0]).toMatchObject({ version: '4.0.0', saveSlot: 2 });
    // nothing written to localStorage when the delegate handles the save
    expect(window.localStorage.getItem(saveKeyFor(2))).toBeNull();
  });

  it('falls back to slot-keyed localStorage when no delegate exists', async () => {
    const gameState = { version: '4.0.0', saveSlot: 2, league: null };

    const ok = await stateModule.saveState(gameState);

    expect(ok).toBe(true);
    const raw = window.localStorage.getItem(saveKeyFor(2));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw)).toMatchObject({ version: '4.0.0', saveSlot: 2 });
  });

  it('honors legacyOnly by skipping the delegate', async () => {
    window.saveGame = vi.fn();
    const gameState = { version: '4.0.0', saveSlot: 3, league: null };

    const ok = await stateModule.saveState(gameState, { legacyOnly: true });

    expect(ok).toBe(true);
    expect(window.saveGame).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(saveKeyFor(3))).not.toBeNull();
  });
});

describe('loadState still migrates the legacy single-save key', () => {
  it('moves an old nflGM4-era save into the active slot', async () => {
    const oldSave = {
      version: '3.0.0',
      namesMode: 'fictional',
      onboarded: true,
      gameMode: 'gm',
      playerRole: 'GM',
      userTeamId: 0,
      season: 5,
    };
    window.localStorage.setItem(SAVE_KEY_BASE, JSON.stringify(oldSave));

    const loaded = await stateModule.loadState();

    expect(loaded).toBe(window.state);
    expect(loaded.version).toBe('4.0.0'); // migrated forward
    expect(loaded.onboarded).toBe(true);
    expect(loaded.season).toBe(5);
    expect(loaded.saveSlot).toBe(1);

    // legacy key is retired…
    expect(window.localStorage.getItem(SAVE_KEY_BASE)).toBeNull();
    // …and the save lands in the active slot (write is fire-and-forget)
    await vi.waitFor(() => {
      expect(window.localStorage.getItem(saveKeyFor(1))).not.toBeNull();
    });
    expect(JSON.parse(window.localStorage.getItem(saveKeyFor(1)))).toMatchObject({
      version: '4.0.0',
      season: 5,
    });
  });

  it('loads a current-format slot save without touching other slots', async () => {
    const currentSave = {
      ...stateModule.State.init(),
      onboarded: true,
      season: 9,
    };
    window.localStorage.setItem(saveKeyFor(1), JSON.stringify(currentSave));

    const loaded = await stateModule.loadState();

    expect(loaded).toBe(window.state);
    expect(loaded.season).toBe(9);
    expect(loaded.saveSlot).toBe(1);
  });
});

describe('source-level quarantine (grep guards)', () => {
  // vitest runs from the repo root, so resolve src/ from the working directory
  const srcRoot = path.resolve(process.cwd(), 'src');

  function walkSourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkSourceFiles(full);
      return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it('only legacyStateBridge.js assigns window.state', () => {
    const offenders = walkSourceFiles(srcRoot).filter((file) => {
      if (file.endsWith(`${path.sep}legacyStateBridge.js`)) return false;
      return /window\.state\s*=/.test(fs.readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('only legacyStateBridge.js reads the legacy save delegate global', () => {
    const offenders = walkSourceFiles(srcRoot).filter((file) => {
      if (file.endsWith(`${path.sep}legacyStateBridge.js`)) return false;
      return /window\.saveGame/.test(fs.readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('src/core/state.js no longer delete-loops globals or mutates name globals', () => {
    const source = fs.readFileSync(path.join(srcRoot, 'core', 'state.js'), 'utf8');
    expect(source).not.toMatch(/delete window\.state/);
    expect(source).not.toMatch(/Object\.keys\(window\.state\)/);
    expect(source).not.toMatch(/delete window\.FIRST_NAMES/);
    expect(source).not.toMatch(/delete window\.LAST_NAMES/);
    expect(source).not.toMatch(/window\.FIRST_NAMES\s*=/);
    expect(source).not.toMatch(/window\.LAST_NAMES\s*=/);
  });
});
