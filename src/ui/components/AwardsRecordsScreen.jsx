import React, { useEffect, useMemo, useState } from 'react';
import { filterAwardRows } from '../utils/historyDestinations.js';
import { ScreenHeader, SectionCard, StickySubnav, EmptyState } from './ScreenSystem.jsx';
import { getStickyTopOffset } from '../utils/screenSystem.js';
import { AWARD_DISPLAY_NAMES, AWARDS_HISTORY_ORDER } from '../../core/footballMeta';
const AWARDS_V1_ORDER = [...AWARDS_HISTORY_ORDER, 'oroy', 'droy', 'bestQB', 'bestRB', 'bestWrTe', 'bestDefensivePlayer', 'bestKicker'];
const AWARDS_V1_LABELS = {
  bestQB: 'Best QB',
  bestRB: 'Best RB',
  bestWrTe: 'Best WR/TE',
  bestDefensivePlayer: 'Best Defensive Player',
  bestKicker: 'Best Kicker',
};

export default function AwardsRecordsScreen({ actions, league, onPlayerSelect, onBack }) {
  const [seasons, setSeasons] = useState([]);
  const [scope, setScope] = useState('all');

  useEffect(() => {
    Promise.all([
      actions?.getAllSeasons?.() ?? Promise.resolve({ payload: { seasons: [] } }),
    ]).then(([seasonRes]) => {
      setSeasons(seasonRes?.payload?.seasons ?? []);
    });
  }, [actions]);

  const awardRows = useMemo(() => (seasons ?? []).flatMap((s) => AWARDS_V1_ORDER.map((k) => ({
    season: s.year,
    award: AWARD_DISPLAY_NAMES[k] ?? AWARDS_V1_LABELS[k] ?? k.toUpperCase(),
    ...s?.awards?.[k],
  }))).filter((r) => r?.name), [seasons]);

  const filteredAwardRows = filterAwardRows(awardRows.slice().reverse(), scope);
  return (
    <div className="app-screen-stack" style={{ '--screen-sticky-top': getStickyTopOffset('compact') }}>
      <ScreenHeader
        title="Awards & Records"
        subtitle="Award history, league records, and fast browsing controls."
        onBack={onBack}
        backLabel="History Hub"
      />

      <StickySubnav title="Filter">
        <button className={`standings-tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All awards</button>
        <button className={`standings-tab ${scope === 'recent' ? 'active' : ''}`} onClick={() => setScope('recent')}>Recent awards</button>
        <button className={`standings-tab ${scope === 'mvp' ? 'active' : ''}`} onClick={() => setScope('mvp')}>MVP history</button>
      </StickySubnav>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
        <SectionCard title="Award history">
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {filteredAwardRows.length === 0 ? <EmptyState title="No award rows available." body="Advance the league to generate award history entries." /> : filteredAwardRows.map((row, idx) => (
              <div key={`${row.season}-${row.award}-${idx}`} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.season} · {row.award}</div>
                {row.playerId != null ? <button className="btn-link" onClick={() => onPlayerSelect?.(row.playerId)}>{row.name}</button> : <strong>{row.name}</strong>}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.pos ?? ''}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="League records">
          <EmptyState
            title="Records coming later."
            body="Season award history is fully archived in V1. Full all-time and validated record-book tracking will arrive in a later release."
          />
        </SectionCard>
      </div>

      <SectionCard title="Franchise records (current user team)">
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{league?.teams?.find((t) => t.id === league?.userTeamId)?.name ?? 'Your team'} records and all-time book tracking are intentionally deferred until the dedicated records milestone.</div>
      </SectionCard>
    </div>
  );
}
