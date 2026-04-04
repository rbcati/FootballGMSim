import React, { useMemo, useState } from 'react';

const SLOT_KEYS = ['save_slot_1', 'save_slot_2', 'save_slot_3'];

function readMeta(slotNum) {
  try {
    const raw = localStorage.getItem(`footballgm_slot_${slotNum}_meta`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function SaveSlotManager({ activeSlot, onLoad, onSave, onDelete, onNew }) {
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');

  const slots = useMemo(() => SLOT_KEYS.map((key, idx) => {
    const slotNum = idx + 1;
    return { key, slotNum, meta: readMeta(slotNum) };
  }), []);

  const persistName = (slotNum) => {
    const existing = readMeta(slotNum) ?? {};
    localStorage.setItem(`footballgm_slot_${slotNum}_meta`, JSON.stringify({ ...existing, name: value || `Franchise ${slotNum}` }));
    setEditing(null);
  };

  return (
    <div style={{ display: 'grid', gap: 12, padding: 16 }}>
      {slots.map((slot) => {
        const isActive = activeSlot === slot.key;
        const isEmpty = !slot.meta?.lastSaved;
        return (
          <div key={slot.key} style={{ background: '#1e293b', border: `2px solid ${isActive ? '#f59e0b' : '#334155'}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Slot {slot.slotNum}</strong>
              {editing === slot.slotNum ? (
                <span>
                  <input value={value} onChange={(e) => setValue(e.target.value)} />
                  <button onClick={() => persistName(slot.slotNum)}>✓</button>
                </span>
              ) : (
                <button onClick={() => { setEditing(slot.slotNum); setValue(slot.meta?.name ?? `Franchise ${slot.slotNum}`); }}>✏️</button>
              )}
            </div>
            {isEmpty ? (
              <div>
                <div>Empty Slot</div>
                <button className="btn btn-primary" onClick={() => onNew?.(slot.key)}>New Game</button>
              </div>
            ) : (
              <div>
                <div>{slot.meta?.name ?? `Franchise ${slot.slotNum}`}</div>
                <div>{slot.meta?.teamName ?? '—'} ({slot.meta?.record?.wins ?? 0}-{slot.meta?.record?.losses ?? 0})</div>
                <div>Season {slot.meta?.season ?? 1} • Week {slot.meta?.week ?? 1}</div>
                <div>Last saved: {slot.meta?.lastSaved ?? '—'}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={() => onLoad?.(slot.key)}>Load Game</button>
                  <button className="btn" onClick={() => onSave?.(slot.key)}>Save Here</button>
                  <button className="btn btn-danger" onClick={() => window.confirm('Delete this slot?') && onDelete?.(slot.key)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
