import React, { useEffect, useMemo, useState } from 'react';
import { filterAwardRows } from '../utils/historyDestinations.js';
import { ScreenHeader, SectionCard, StickySubnav, EmptyState } from './ScreenSystem.jsx';
import { getStickyTopOffset } from '../utils/screenSystem.js';
import { AWARD_DISPLAY_NAMES, AWARDS_HISTORY_ORDER } from '../../core/footballMeta';
import { RECORD_LABELS, RECORD_BOOK_PLAYER_KEYS } from '../../core/recordBookV1.js';

const AWARDS_V1_ORDER = [...AWARDS_HISTORY_ORDER, 'oroy', 'droy', 'bestQB', 'bestRB', 'bestWrTe', 'bestDefensivePlayer', 'bestKicker'];
const AWARDS_V1_LABELS = {
  bestQB: 'Best QB',
  bestRB: 'Best RB',
  bestWrTe: 'Best WR/TE',
  bestDefensivePlayer: 'Best Defensive Player',
  bestKicker: 'Best Kicker',
};

function hasRecordData(recordBook) {
  if (!recordBook?.schemaVersion) return false;
  const ss = recordBook.singleSeasonV1 ?? {};
  if (Object.values(ss).some((r) => r && Number(r.value) > 0)) return true;
  const cl = recordBook.careerLeadersV1 ?? {};
  if (Object.values(cl).some((arr) => Array.isArray(arr) && arr.length)) return true;
  const tm = recordBook.teamSeasonV1 ?? {};
  return Object.values(tm).some((r) => r && Number(r.value) > 0);
}

function RecordRowCard({ title, row, onPlayerSelect, onTeamSelect }) {
  if (!row || Number(row.value) <= 0) return null;
  const isTeam = row.playerId == null && row.teamId != null;
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--accent)', marginTop: 4 }}>{Number(row.value).toLocaleString()}</div>
      <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>
        {isTeam ? (
          <button type="button" className="btn-link" onClick={() => onTeamSelect?.(row.teamId)}>
            {row.teamName ?? row.teamAbbr ?? row.teamId}
          </button>
        ) : row.playerId != null ? (
          <button type="button" className="btn-link" onClick={() => onPlayerSelect?.(row.playerId)}>{row.playerName ?? '—'}</button>
        ) : (
          <span>{row.playerName ?? row.teamAbbr ?? '—'}</span>
        )}
        {row.position ? <span style={{ color: 'var(--text-muted)' }}> · {row.position}</span> : null}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        {row.year != null ? `Season ${row.year}` : '—'}
        {row.teamAbbr && !isTeam ? ` · ${row.teamAbbr}` : ''}
      </div>
    </div>
  );
}

function CareerBoard({ recordBook, onPlayerSelect }) {
  const boards = recordBook?.careerLeadersV1 ?? {};
  const keys = RECORD_BOOK_PLAYER_KEYS.filter((k) => Array.isArray(boards[k]) && boards[k].length);
  if (!keys.length) {
    return <EmptyState title="No career leader data yet." body="Career totals populate as seasons archive onto players." />;
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {keys.map((key) => (
        <div key={key}>
          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 'var(--text-sm)' }}>{RECORD_LABELS[key]}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {boards[key].slice(0, 10).map((row, i) => (
              <div
                key={`${key}-${row.playerId}-${i}`}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 'var(--text-xs)',
                  borderBottom: '1px solid var(--hairline)',
                  paddingBottom: 6,
                }}
              >
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>#{i + 1}</span>
                <span style={{ flex: 1 }}>
                  {row.playerId != null ? (
                    <button type="button" className="btn-link" onClick={() => onPlayerSelect?.(row.playerId)}>{row.playerName}</button>
                  ) : row.playerName}
                  {row.position ? <span style={{ color: 'var(--text-muted)' }}> ({row.position})</span> : null}
                </span>
                <strong>{Number(row.value).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamBoard({ recordBook, onTeamSelect }) {
  const tm = recordBook?.teamSeasonV1 ?? {};
  const rows = [
    ['wins', 'Most wins (season)'],
    ['winPct', 'Best win %'],
    ['pointsFor', 'Most points scored'],
    ['pointsAllowed', 'Fewest points allowed'],
    ['pointDifferential', 'Best point differential'],
    ['pointsPerGame', 'Best PPG'],
    ['pointsAllowedPerGame', 'Fewest PAPG'],
  ];
  const any = rows.some(([k]) => tm[k] && Number(tm[k].value) > 0);
  if (!any) {
    return <EmptyState title="No team season records yet." body="Complete and archive seasons with standings to populate team marks." />;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
      {rows.map(([k, label]) => (
        <RecordRowCard key={k} title={label} row={tm[k]} onTeamSelect={onTeamSelect} />
      ))}
    </div>
  );
}

export default function AwardsRecordsScreen({ actions, league, onPlayerSelect, onTeamSelect, onBack }) {
  const [seasons, setSeasons] = useState([]);
  const [recordBook, setRecordBook] = useState(null);
  const [scope, setScope] = useState('all');
  const [recordsTab, setRecordsTab] = useState('singleSeason');

  useEffect(() => {
    Promise.all([
      actions?.getAllSeasons?.() ?? Promise.resolve({ payload: { seasons: [] } }),
      actions?.getRecords?.() ?? Promise.resolve({ payload: { recordBook: null } }),
    ]).then(([seasonRes, recRes]) => {
      setSeasons(seasonRes?.payload?.seasons ?? []);
      setRecordBook(recRes?.payload?.recordBook ?? null);
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

  const singleSeasonKeys = useMemo(() => RECORD_BOOK_PLAYER_KEYS.filter(
    (k) => recordBook?.singleSeasonV1?.[k] && Number(recordBook.singleSeasonV1[k].value) > 0,
  ), [recordBook]);

  const showRecords = hasRecordData(recordBook);

  return (
    <div className="app-screen-stack" style={{ '--screen-sticky-top': getStickyTopOffset('compact') }}>
      <ScreenHeader
        title="Awards & Records"
        subtitle="Archived season honors plus all-time record book (V1) from league archives."
        onBack={onBack}
        backLabel="History Hub"
      />

      <StickySubnav title="Awards filter">
        <button type="button" className={`standings-tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All awards</button>
        <button type="button" className={`standings-tab ${scope === 'recent' ? 'active' : ''}`} onClick={() => setScope('recent')}>Recent seasons</button>
        <button type="button" className={`standings-tab ${scope === 'mvp' ? 'active' : ''}`} onClick={() => setScope('mvp')}>MVP history</button>
      </StickySubnav>

      <StickySubnav title="Records">
        <button type="button" className={`standings-tab ${recordsTab === 'singleSeason' ? 'active' : ''}`} onClick={() => setRecordsTab('singleSeason')}>Single-season</button>
        <button type="button" className={`standings-tab ${recordsTab === 'career' ? 'active' : ''}`} onClick={() => setRecordsTab('career')}>Career leaders</button>
        <button type="button" className={`standings-tab ${recordsTab === 'team' ? 'active' : ''}`} onClick={() => setRecordsTab('team')}>Team records</button>
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

        <SectionCard
          title={recordsTab === 'singleSeason' ? 'Single-season records' : recordsTab === 'career' ? 'Career leaders' : 'Team season records'}
          subtitle="League-wide bests from archived season snapshots and player career totals."
        >
          {!showRecords ? (
            <EmptyState
              title="No record book data in this save yet."
              body="Older saves may lack archives until you complete new seasons. Records never guess missing stats."
            />
          ) : recordsTab === 'singleSeason' ? (
            singleSeasonKeys.length === 0 ? (
              <EmptyState title="No single-season marks stored." body="Player stat leaders are saved with each season archive." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
                {singleSeasonKeys.map((key) => (
                  <RecordRowCard
                    key={key}
                    title={RECORD_LABELS[key]}
                    row={recordBook.singleSeasonV1[key]}
                    onPlayerSelect={onPlayerSelect}
                  />
                ))}
              </div>
            )
          ) : recordsTab === 'career' ? (
            <CareerBoard recordBook={recordBook} onPlayerSelect={onPlayerSelect} />
          ) : (
            <TeamBoard recordBook={recordBook} onTeamSelect={onTeamSelect} />
          )}
          {showRecords ? (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, marginBottom: 0, lineHeight: 1.45 }}>
              {recordBook?.meta?.careerSourceNote ?? 'Career totals include archived seasons stored on each player in this save.'}
              {' '}
              {(recordBook?.meta?.partialCareer || recordBook?.meta?.partialSingleSeason) ? 'Some categories may be incomplete on older saves.' : ''}
            </p>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Franchise records (current user team)">
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {league?.teams?.find((t) => t.id === league?.userTeamId)?.name ?? 'Your team'} franchise-specific record sheets remain on the roadmap; this screen focuses on league-wide book data.
        </div>
      </SectionCard>
    </div>
  );
}
