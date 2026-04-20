import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UI_TOKENS } from '../constants/themeTokens.js';

const SLOT_KEYS = ['save_slot_1', 'save_slot_2', 'save_slot_3'];
const SLOT_ORDER_KEY = 'footballgm_slot_order_v1';

function readMeta(slotNum) {
  try {
    const raw = localStorage.getItem(`footballgm_slot_${slotNum}_meta`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatLastSaved(lastSaved) {
  if (!lastSaved) return 'Never';
  const date = new Date(lastSaved);
  if (Number.isNaN(date.getTime())) return String(lastSaved);
  return date.toLocaleString();
}

function teamAccent(meta) {
  const seed = (meta?.teamAbbr ?? meta?.teamName ?? 'FGM').slice(0, 3).toUpperCase();
  let hash = 0;
  for (const c of seed) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  const palette = ['#2f7cff', '#34C759', '#FF9F0A', '#FF453A', '#7C6CF3'];
  return { seed, color: palette[Math.abs(hash) % palette.length] };
}

function readSlotOrder() {
  try {
    const raw = localStorage.getItem(SLOT_ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length === SLOT_KEYS.length) return parsed;
  } catch {}
  return SLOT_KEYS;
}

export function createSlotActionHandlers({ onLoad, onSave }, slotKey) {
  return {
    onEnterFranchise: () => onLoad?.(slotKey),
    onSaveChanges: () => onSave?.(slotKey),
  };
}

export default function SaveSlotManager({ activeSlot, onLoad, onSave, onDelete, onNew }) {
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [slotOrder, setSlotOrder] = useState(() => readSlotOrder());

  useEffect(() => {
    try { localStorage.setItem(SLOT_ORDER_KEY, JSON.stringify(slotOrder)); } catch {}
  }, [slotOrder]);

  const slots = useMemo(() => slotOrder.map((key) => {
    const slotNum = Number(key.split('_').pop());
    return { key, slotNum, meta: readMeta(slotNum) };
  }), [refreshKey, activeSlot, slotOrder]);

  const persistName = (slotNum) => {
    const existing = readMeta(slotNum) ?? {};
    localStorage.setItem(`footballgm_slot_${slotNum}_meta`, JSON.stringify({ ...existing, name: value || `Franchise ${slotNum}` }));
    setEditing(null);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="save-slots-v2" role="list" aria-label="Franchise save slots">
      {slots.map((slot) => {
        const isActive = activeSlot === slot.key;
        const isEmpty = !slot.meta?.lastSaved;
        const slotName = slot.meta?.name ?? `Franchise ${slot.slotNum}`;
        const accent = teamAccent(slot.meta);
        const slotActions = createSlotActionHandlers({ onLoad, onSave }, slot.key);

        return (
          <Card key={slot.key} variant={isActive ? 'primary' : 'secondary'} className="save-slot-v2" role="listitem">
            <CardHeader className="save-slot-v2__header" style={{ borderLeft: `4px solid ${accent.color}`, gap: UI_TOKENS.spacing.md }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="save-slot-v2__logo" style={{ borderColor: accent.color, color: accent.color }}>{accent.seed}</div>
                <div>
                  <p className="save-slot-v2__kicker">Career Slot {slot.slotNum}</p>
                  <CardTitle className="text-base">{slotName}</CardTitle>
                </div>
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
                  <p>No franchise started yet. Create a new career in this slot.</p>
                  <Button data-testid="start-new-franchise-cta" onClick={() => onNew?.(slot.key)}>Start New Franchise</Button>
                </div>
              ) : (
                <>
                  <div className="save-slot-v2__meta-grid">
                    <div><span>Franchise</span><strong>{slot.meta?.teamName ?? '—'}</strong></div>
                    <div><span>Record</span><strong>{slot.meta?.record?.wins ?? 0}-{slot.meta?.record?.losses ?? 0}{slot.meta?.record?.ties ? `-${slot.meta.record.ties}` : ''}</strong></div>
                    <div><span>Season / Week</span><strong>{slot.meta?.season ?? 1} · Week {slot.meta?.week ?? 1}</strong></div>
                    <div><span>Difficulty</span><strong>{slot.meta?.difficulty ?? 'Standard'}</strong></div>
                    <div><span>Last Saved</span><strong>{formatLastSaved(slot.meta?.lastSaved)}</strong></div>
                  </div>

                  <div className="save-slot-v2__actions">
                    <Button onClick={slotActions.onEnterFranchise}>Enter Franchise</Button>
                    <Button variant="secondary" onClick={slotActions.onSaveChanges}>Save Changes</Button>
                    <Button variant="destructive" onClick={() => {
                      if (!window.confirm('Delete this slot? This clears all franchise data in this slot.')) return;
                      localStorage.removeItem(`footballgm_slot_${slot.slotNum}_meta`);
                      onDelete?.(slot.key);
                      setRefreshKey((k) => k + 1);
                    }}>Delete</Button>
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
