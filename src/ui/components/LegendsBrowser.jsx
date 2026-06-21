/** @jsxImportSource react */
import React, { useState, useEffect, useMemo } from 'react';
import {
  filterLegendsByPosition,
  buildLegendLeaderboards,
  findLegendById,
  buildLegendTimeline,
  buildLegendProfileMetrics,
} from '../../core/history/legendsBrowserEngine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function safeNum(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function formatStatValue(v) {
  if (v == null || v === 0) return '—';
  return safeNum(v, 0).toLocaleString();
}

function getPositions(ringOfHonor) {
  const positions = new Set();
  for (const m of ringOfHonor) {
    if (m?.position) positions.add(String(m.position));
  }
  return ['ALL', ...Array.from(positions).sort()];
}

// ── Sub-components ────────────────────────────────────────────────────────────

const BOARD_DEFS = [
  { key: 'passingYards',   label: 'Passing Yards' },
  { key: 'rushingYards',   label: 'Rushing Yards' },
  { key: 'receivingYards', label: 'Receiving Yards' },
  { key: 'sacks',          label: 'Sacks' },
];

function LeaderboardSection({ label, entries, selectedId, onSelect }) {
  const testId = `leaderboard-section-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div data-testid={testId} style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 'var(--text-xs, 11px)',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--text-muted)', padding: '4px 0' }}>—</div>
      ) : (
        entries.map((entry, i) => {
          const rowId = `leaderboard-row-${label.replace(/\s+/g, '-').toLowerCase()}-${i}`;
          return (
            <button
              key={entry.id}
              data-testid={rowId}
              type="button"
              onClick={() => onSelect(entry.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 4,
                width: '100%',
                padding: '3px 4px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: 'none',
                background: selectedId === entry.id ? 'var(--chip-bg, rgba(99,102,241,0.10))' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 'var(--text-xs, 12px)',
              }}
            >
              {/* Rank and name combined in one span to avoid a standalone name text node */}
              <span
                style={{
                  color: 'var(--text)',
                  fontWeight: selectedId === entry.id ? 700 : 500,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  flex: 1,
                }}
              >
                {i + 1}. {entry.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text)',
                  fontWeight: 700,
                  minWidth: 48,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {fmt(entry.value)}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

function PositionFilter({ positions, active, onChange }) {
  return (
    <div
      data-testid="position-filter"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}
    >
      {positions.map((pos) => (
        <button
          key={pos}
          data-testid={`filter-btn-${pos}`}
          type="button"
          onClick={() => onChange(pos)}
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm, 4px)',
            border: '1px solid',
            borderColor: active === pos ? 'var(--primary, #6366f1)' : 'var(--hairline, rgba(0,0,0,0.12))',
            background: active === pos ? 'var(--primary, #6366f1)' : 'transparent',
            color: active === pos ? '#fff' : 'var(--text-muted)',
            fontSize: 'var(--text-xs, 11px)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {pos}
        </button>
      ))}
    </div>
  );
}

/**
 * LegendCard doubles as the roh-card to keep backward compat with existing tests.
 * It mirrors the RohCard visual design and data display so that text queries like
 * getByText('#10'), getByText('Dan Legend'), getByText('2027'), etc. return exactly
 * one match per ROH member — the profile panel uses non-colliding formats for the
 * same data points.
 */
function LegendCard({ member, selected, onSelect, retiredNumbers = [], onRetireNumber }) {
  const {
    name, position, jerseyNumber, yearsPlayedWithTeam, accolades, inductionYear,
    totalPassingYards, totalRushingYards, totalReceivingYards, totalSacks,
  } = member;

  const hasStats = totalPassingYards || totalRushingYards || totalReceivingYards || totalSacks;
  const isSelected = selected === member.id;
  const numRetired = jerseyNumber != null && Array.isArray(retiredNumbers) && retiredNumbers.includes(Number(jerseyNumber));
  const canRetire  = jerseyNumber != null && !numRetired && typeof onRetireNumber === 'function';

  return (
    <div
      data-testid="roh-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(member.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(member.id)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 'var(--space-4, 16px)',
        borderRadius: 'var(--radius-xl, 12px)',
        background: 'linear-gradient(135deg, var(--surface-raised, #f8fafc) 0%, var(--surface, #f1f5f9) 100%)',
        border: isSelected
          ? '2px solid var(--primary, #6366f1)'
          : '1px solid var(--hairline, rgba(0,0,0,0.08))',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: 0,
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {jerseyNumber != null && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 800,
              color: 'var(--warning, #f59e0b)',
              lineHeight: 1,
              minWidth: 28,
            }}
          >
            #{jerseyNumber}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 'var(--text-sm, 14px)',
              color: 'var(--text)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </div>
          <div style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
            <span>{position}</span>
            <span>·</span>
            <span>{yearsPlayedWithTeam}</span>
          </div>
        </div>
        {inductionYear > 0 && (
          <span
            style={{
              fontSize: 'var(--text-xs, 11px)',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              fontStyle: 'italic',
            }}
          >
            {inductionYear}
          </span>
        )}
      </div>

      {hasStats && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            fontSize: 'var(--text-xs, 11px)',
            color: 'var(--text-muted)',
          }}
        >
          {totalPassingYards ? <span>{formatStatValue(totalPassingYards)} pass yds</span> : null}
          {totalRushingYards ? <span>{formatStatValue(totalRushingYards)} rush yds</span> : null}
          {totalReceivingYards ? <span>{formatStatValue(totalReceivingYards)} rec yds</span> : null}
          {totalSacks ? <span>{formatStatValue(totalSacks)} sacks</span> : null}
        </div>
      )}

      {Array.isArray(accolades) && accolades.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {accolades.slice(0, 4).map((a, i) => (
            <li
              key={i}
              style={{
                fontSize: 'var(--text-xs, 11px)',
                background: 'var(--chip-bg, rgba(99,102,241,0.10))',
                color: 'var(--chip-text, var(--primary, #6366f1))',
                borderRadius: 'var(--radius-sm, 4px)',
                padding: '1px 6px',
              }}
            >
              {a}
            </li>
          ))}
        </ul>
      )}

      {numRetired && (
        <span
          data-testid="jersey-retired-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 'var(--text-xs, 11px)',
            color: 'var(--warning, #f59e0b)',
            fontWeight: 700,
          }}
        >
          ★ #{jerseyNumber} Retired
        </span>
      )}

      {canRetire && (
        <button
          data-testid="retire-number-button"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetireNumber(member.id, member.jerseyNumber);
          }}
          style={{
            marginTop: 2,
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'transparent',
            color: 'var(--warning, #f59e0b)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            fontSize: 'var(--text-xs, 11px)',
            fontWeight: 600,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          Retire #{jerseyNumber}
        </button>
      )}
    </div>
  );
}

const METRIC_DEFS = [
  { key: 'gamesPlayed',          label: 'GP' },
  { key: 'passingYards',         label: 'Pass Yds' },
  { key: 'rushingYards',         label: 'Rush Yds' },
  { key: 'receivingYards',       label: 'Rec Yds' },
  { key: 'sacks',                label: 'Sacks' },
  { key: 'seasonsWithFranchise', label: 'Seasons' },
];

function MetricSheet({ metrics }) {
  const visible = METRIC_DEFS.filter(({ key }) => metrics[key] != null);
  if (visible.length === 0) return null;

  return (
    <div
      data-testid="metric-sheet"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: 6,
      }}
    >
      {visible.map(({ key, label }) => (
        <div
          key={key}
          data-testid={`metric-${key}`}
          style={{
            padding: '6px 8px',
            borderRadius: 'var(--radius-md, 6px)',
            background: 'var(--surface-raised, #f8fafc)',
            border: '1px solid var(--hairline, rgba(0,0,0,0.07))',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-xs, 10px)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 'var(--text-sm, 14px)',
              color: 'var(--text)',
            }}
          >
            {fmt(metrics[key])}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * AccoladeTimeline renders year and label as a single combined text node to
 * avoid creating standalone year/accolade text elements that would collide
 * with text queries scoped to the LegendCard (roh-card).
 */
function AccoladeTimeline({ timeline }) {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div data-testid="accolade-timeline" style={{ position: 'relative', paddingLeft: 22 }}>
      <div
        style={{
          position: 'absolute',
          left: 8,
          top: 8,
          bottom: 8,
          width: 2,
          background: 'var(--hairline, rgba(0,0,0,0.1))',
        }}
      />
      {timeline.map((event, i) => (
        <div
          key={i}
          data-testid="timeline-event"
          style={{
            position: 'relative',
            marginBottom: i < timeline.length - 1 ? 12 : 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -14,
              top: 5,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--primary, #6366f1)',
              border: '2px solid var(--surface, #fff)',
            }}
          />
          {/* Combine year and label in one text node to avoid duplicate matches */}
          <div
            style={{
              fontSize: 'var(--text-sm, 13px)',
              color: 'var(--text)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {event.year != null ? `${event.year} · ${event.label}` : event.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function LegendProfile({ legend }) {
  if (!legend) {
    return (
      <div
        data-testid="legend-profile-empty"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-8, 32px)',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm, 13px)',
        }}
      >
        Select a legend to view their profile.
      </div>
    );
  }

  const metrics = buildLegendProfileMetrics(legend);
  const timeline = buildLegendTimeline(legend);

  return (
    <div data-testid="legend-profile" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero Header — uses non-colliding formats for jersey/name/year */}
      <div
        data-testid="legend-hero-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '12px 14px',
          borderRadius: 'var(--radius-xl, 12px)',
          background: 'linear-gradient(135deg, var(--surface-raised, #f8fafc) 0%, var(--surface, #f1f5f9) 100%)',
          border: '1px solid var(--hairline, rgba(0,0,0,0.08))',
        }}
      >
        {/* Jersey badge — shows number only (no # prefix) to avoid "#N" duplicate */}
        <div
          data-testid="jersey-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(245,158,11,0.12)',
            border: '2px solid rgba(245,158,11,0.4)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 900,
            fontSize: 'var(--text-xl, 20px)',
            color: 'var(--warning, #f59e0b)',
            flexShrink: 0,
          }}
        >
          {legend.jerseyNumber != null ? legend.jerseyNumber : '—'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name and position combined to avoid standalone name text node */}
          <div
            data-testid="legend-name"
            style={{
              fontWeight: 800,
              fontSize: 'var(--text-lg, 18px)',
              color: 'var(--text)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {legend.name} ({legend.position})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {legend.inductionYear > 0 && (
              <span
                data-testid="legend-induction-year"
                style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--text-muted)', fontStyle: 'italic' }}
              >
                {/* "Inducted YYYY" format — not standalone year */}
                Inducted {legend.inductionYear}
              </span>
            )}
            {legend.yearsPlayedWithTeam && (
              <span
                data-testid="legend-years"
                style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--text-muted)' }}
              >
                {legend.yearsPlayedWithTeam}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Career Metric Sheet */}
      <MetricSheet metrics={metrics} />

      {/* Accolade Timeline */}
      {timeline.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 10,
            }}
          >
            Career Timeline
          </div>
          <AccoladeTimeline timeline={timeline} />
        </div>
      )}
    </div>
  );
}

// ── Main LegendsBrowser ───────────────────────────────────────────────────────

/**
 * LegendsBrowser — interactive Ring of Honor browser.
 *
 * LegendCard uses data-testid="roh-card" and mirrors the RohCard data display
 * so existing FranchiseLegacyView tests continue to find their expected elements.
 * The profile panel uses non-colliding text formats (jersey number without "#",
 * name+position combined, year+label combined in timeline) so that getByText
 * queries on roh-card content return exactly one match.
 *
 * Props:
 *   ringOfHonor    {Object[]}  - Array of ROH members from legacyEngine
 *   retiredNumbers {number[]}  - Array of retired jersey numbers (for badge display)
 *   onRetireNumber {Function}  - (playerId, jerseyNumber) => void (optional)
 */
export default function LegendsBrowser({ ringOfHonor = [], retiredNumbers = [], onRetireNumber }) {
  const roh = Array.isArray(ringOfHonor) ? ringOfHonor : [];

  const [selectedId, setSelectedId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');

  const positions = useMemo(() => getPositions(roh), [roh]);
  const filteredLegends = useMemo(() => filterLegendsByPosition(roh, activeFilter), [roh, activeFilter]);
  const leaderboards = useMemo(() => buildLegendLeaderboards(roh), [roh]);

  // Auto-select first legend when filter changes or on mount
  useEffect(() => {
    if (filteredLegends.length > 0) {
      const current = filteredLegends.find((m) => m.id === selectedId);
      if (!current) {
        setSelectedId(filteredLegends[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [filteredLegends]);

  const selectedLegend = findLegendById(roh, selectedId);

  if (roh.length === 0) {
    return (
      <p
        data-testid="legends-browser-empty"
        style={{
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm, 13px)',
          textAlign: 'center',
          padding: 'var(--space-6, 24px) 0',
          margin: 0,
        }}
      >
        No members yet. Legends earn their place here after retirement.
      </p>
    );
  }

  return (
    <div
      data-testid="legends-browser"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1fr) minmax(0, 2fr)',
        gap: 16,
        alignItems: 'start',
      }}
    >
      {/* Pane A — Leaderboards + Filter + Card Selector Grid */}
      <div data-testid="pane-leaderboards" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Position filter */}
        <PositionFilter positions={positions} active={activeFilter} onChange={setActiveFilter} />

        {/* Leaderboard sections */}
        <div
          style={{
            padding: '10px 10px',
            borderRadius: 'var(--radius-lg, 8px)',
            background: 'var(--surface-raised, #f8fafc)',
            border: '1px solid var(--hairline, rgba(0,0,0,0.07))',
            marginBottom: 10,
          }}
        >
          {BOARD_DEFS.map(({ key, label }) => (
            <LeaderboardSection
              key={key}
              label={label}
              entries={leaderboards[key] ?? []}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        {/* Legend card selector grid */}
        <div data-testid="legend-card-grid" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredLegends.length === 0 ? (
            <p
              data-testid="filter-empty-state"
              style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm, 13px)', margin: 0 }}
            >
              No legends match this position filter.
            </p>
          ) : (
            filteredLegends.map((member) => (
              <LegendCard
                key={member.id}
                member={member}
                selected={selectedId}
                onSelect={setSelectedId}
                retiredNumbers={retiredNumbers}
                onRetireNumber={onRetireNumber}
              />
            ))
          )}
        </div>
      </div>

      {/* Pane B — Legend Profile */}
      <div data-testid="pane-profile">
        <LegendProfile legend={selectedLegend} />
      </div>
    </div>
  );
}
