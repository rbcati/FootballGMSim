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
    awardKey: k,
    award: AWARD_DISPLAY_NAMES[k] ?? AWARDS_V1_LABELS[k] ?? k.toUpperCase(),
    ...s?.awards?.[k],
  }))).filter((r) => r?.name), [seasons]);

  const filteredAwardRows = filterAwardRows(awardRows.slice().reverse(), scope);

  const seasonsGrouped = useMemo(() => {
    const sorted = [...(seasons ?? [])].sort((a, b) => Number(b?.year ?? 0) - Number(a?.year ?? 0));
    let blocks = sorted.map((s) => ({
      year: s.year,
      seasonId: s.id ?? s.seasonId ?? null,
      lines: AWARDS_V1_ORDER.map((k) => {
        const a = s?.awards?.[k];
        if (!a?.name) return null;
        return {
          key: k,
          label: AWARD_DISPLAY_NAMES[k] ?? AWARDS_V1_LABELS[k] ?? k,
          playerId: a.playerId ?? null,
          name: a.name,
          pos: a.pos ?? '',
        };
      }).filter(Boolean),
    })).filter((b) => b.lines.length > 0);
    if (scope === 'recent') blocks = blocks.slice(0, 6);
    if (scope === 'mvp') {
      blocks = blocks
        .map((b) => ({ ...b, lines: b.lines.filter((l) => l.key === 'mvp') }))
        .filter((b) => b.lines.length > 0);
    }
    return blocks;
  }, [seasons, scope]);

  return (
    <div className="app-screen-stack" style={{ '--screen-sticky-top': getStickyTopOffset('compact') }}>
      <ScreenHeader
        title="Awards & Records"
        subtitle="Archived season honors (V1). League records stay honest until a dedicated records release."
        onBack={onBack}
        backLabel="History Hub"
      />

      <StickySubnav title="Filter">
        <button type="button" className={`standings-tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All awards</button>
        <button type="button" className={`standings-tab ${scope === 'recent' ? 'active' : ''}`} onClick={() => setScope('recent')}>Recent seasons</button>
        <button type="button" className={`standings-tab ${scope === 'mvp' ? 'active' : ''}`} onClick={() => setScope('mvp')}>MVP history</button>
      </StickySubnav>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 10 }}>
        <SectionCard title="By season" subtitle="MVP, OPOY, DPOY, rookies, and best-by-position from each archive.">
          <div style={{ display: 'grid', gap: 10, maxHeight: 480, overflow: 'auto' }}>
            {seasonsGrouped.length === 0 ? (
              <EmptyState title="No archived award data yet." body="Complete a full season to populate the archive." />
            ) : (
              seasonsGrouped.map((block) => (
                <div
                  key={`${block.year}-${block.seasonId ?? ''}`}
                  style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '10px 12px' }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Season {block.year}</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-xs)', lineHeight: 1.45 }}>
                    {block.lines.map((line) => (
                      <li key={line.key} style={{ marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{line.label}: </span>
                        {line.playerId != null ? (
                          <button type="button" className="btn-link" onClick={() => onPlayerSelect?.(line.playerId)}>{line.name}</button>
                        ) : (
                          <strong>{line.name}</strong>
                        )}
                        {line.pos ? <span style={{ color: 'var(--text-muted)' }}> ({line.pos})</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Flat list" subtitle="Same data as a compact scrollable list.">
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {filteredAwardRows.length === 0 ? <EmptyState title="No award rows in this filter." body="Try another filter or advance the league." /> : filteredAwardRows.map((row, idx) => (
              <div key={`${row.season}-${row.award}-${idx}`} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.season} · {row.award}</div>
                {row.playerId != null ? <button type="button" className="btn-link" onClick={() => onPlayerSelect?.(row.playerId)}>{row.name}</button> : <strong>{row.name}</strong>}
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
