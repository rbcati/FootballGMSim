import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <div className="save-slots-v2">
      {slots.map((slot) => {
        const isActive = activeSlot === slot.key;
        const isEmpty = !slot.meta?.lastSaved;
        const slotName = slot.meta?.name ?? `Franchise ${slot.slotNum}`;

        return (
          <Card key={slot.key} variant={isActive ? 'primary' : 'secondary'} className="save-slot-v2">
            <CardHeader className="save-slot-v2__header">
              <div>
                <p className="save-slot-v2__kicker">Career Slot {slot.slotNum}</p>
                <CardTitle className="text-base">{slotName}</CardTitle>
              </div>
              <div className="save-slot-v2__header-actions">
                {isActive && <Badge>Active</Badge>}
                {editing === slot.slotNum ? (
                  <>
                    <input value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Rename slot ${slot.slotNum}`} />
                    <Button size="sm" onClick={() => persistName(slot.slotNum)}>Save</Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(slot.slotNum); setValue(slotName); }}>Rename</Button>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {isEmpty ? (
                <div className="save-slot-v2__empty">
                  <p>This franchise slot is ready for a new dynasty.</p>
                  <Button onClick={() => onNew?.(slot.key)}>Start New Franchise</Button>
                </div>
              ) : (
                <>
                  <div className="save-slot-v2__meta-grid">
                    <div><span>Team</span><strong>{slot.meta?.teamName ?? '—'}</strong></div>
                    <div><span>Season</span><strong>{slot.meta?.season ?? 1} · Week {slot.meta?.week ?? 1}</strong></div>
                    <div><span>Record</span><strong>{slot.meta?.record?.wins ?? 0}-{slot.meta?.record?.losses ?? 0}</strong></div>
                    <div><span>Last Saved</span><strong>{slot.meta?.lastSaved ?? '—'}</strong></div>
                  </div>

                  <div className="save-slot-v2__actions">
                    <Button onClick={() => onLoad?.(slot.key)}>Enter Franchise</Button>
                    <Button variant="secondary" onClick={() => onSave?.(slot.key)}>Save Here</Button>
                    <Button variant="destructive" onClick={() => window.confirm('Delete this slot?') && onDelete?.(slot.key)}>Delete</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
