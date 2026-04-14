import { describe, it, expect, vi } from 'vitest';
import { createSlotActionHandlers } from './SaveSlotManager.jsx';

describe('SaveSlotManager action separation', () => {
  it('Enter Franchise handler calls load only', () => {
    const onLoad = vi.fn();
    const onSave = vi.fn();
    const handlers = createSlotActionHandlers({ onLoad, onSave }, 'save_slot_1');

    handlers.onEnterFranchise();

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith('save_slot_1');
    expect(onSave).toHaveBeenCalledTimes(0);
  });

  it('Save Changes handler calls save only', () => {
    const onLoad = vi.fn();
    const onSave = vi.fn();
    const handlers = createSlotActionHandlers({ onLoad, onSave }, 'save_slot_2');

    handlers.onSaveChanges();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('save_slot_2');
    expect(onLoad).toHaveBeenCalledTimes(0);
  });
});
