/**
 * Leaders.jsx
 *
 * ZenGM-style comprehensive leaderboard tab.
 * Displays Season Leaders or All-Time Records, grouped by statistical category.
 * Fetches data silently so it never blocks the Advance button.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { useWorker } from '../hooks/useWorker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function posColor(pos) {
  const map = {
    QB: '#0A84FF', RB: '#34C759', WR: '#FF9F0A', TE: '#5E5CE6',
    OL: '#64D2FF', OT: '#64D2FF', OG: '#64D2FF', C: '#64D2FF',
    DL: '#FF453A', DE: '#FF453A', DT: '#FF453A', EDGE: '#FF453A',
    LB: '#FFD60A', CB: '#30D158', S: '#30D158', SS: '#30D158', FS: '#30D158',
    K: '#AEC6CF', P: '#AEC6CF',
  };
  return map[pos?.toUpperCase()] ?? 'var(--text-muted)';
}

const CATEGORY_LABELS = {
  passing:   'Passing',
  rushing:   'Rushing',
  receiving: 'Receiving',
  defense:   'Defense',
};

const STAT_LABELS = {
  // Passing
  passYards:    { label: 'Pass Yards',    abbr: 'Yds'  },
  passTDs:      { label: 'Passing TDs',   abbr: 'TD'   },
  passerRating: { label: 'Passer Rating', abbr: 'RTG'  },
  completions:  { label: 'Completions',   abbr: 'Cmp'  },
  // Rushing
  rushYards:    { label: 'Rush Yards',    abbr: 'Yds'  },
  rushTDs:      { label: 'Rush TDs',      abbr: 'TD'   },
  rushAttempts: { label: 'Carries',       abbr: 'Car'  },
  // Receiving
  recYards:     { label: 'Rec. Yards',    abbr: 'Yds'  },
  recTDs:       { label: 'Receiving TDs', abbr: 'TD'   },
  receptions:   { label: 'Receptions',   abbr: 'Rec'  },
  yac:          { label: 'Yards After Catch', abbr: 'YAC' },
  // Defense
  sacks:        { label: 'Sacks',         abbr: 'Sacks' },
  tackles:      { label: 'Tackles',       abbr: 'Tkl'  },
  interceptions:{ label: 'Interceptions', abbr: 'INT'  },
  forcedFumbles:{ label: 'Forced Fmbl.',  abbr: 'FF'   },
  pressures:    { label: 'Pressures',     abbr: 'Pres' },
};

// ── Single leaderboard table ──────────────────────────────────────────────────

function LeaderTable({ title, rows, onPlayerSelect }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--surface-strong)',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)',
        }}>{title}</span>
      </div>
      <div style={{ padding: 'var(--space-1) 0' }}>
        {rows.map((row, i) => (
          <div
            key={row.playerId ?? i}
            onClick={() => onPlayerSelect?.(row.playerId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
              cursor: onPlayerSelect && row.playerId != null ? 'pointer' : 'default',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (onPlayerSelect) e.currentTarget.style.background = 'var(--surface-strong)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
          >
            {/* Rank */}
            <span style={{
              width: 20, textAlign: 'center', fontWeight: 700,
              fontSize: 'var(--text-sm)',
              color: i === 0 ? '#FFD60A' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-subtle)',
            }}>
              {i + 1}
            </span>

            {/* POS badge */}
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px',
              borderRadius: 'var(--radius-pill)', color: '#fff',
              background: posColor(row.pos), minWidth: 28, textAlign: 'center',
            }}>
              {row.pos ?? '?'}
            </span>

            {/* Name */}
            <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name ?? `Player ${row.playerId}`}
            </span>

            {/* Value */}
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--text)' }}>
              {typeof row.value === 'number' ? row.value.toLocaleString() : row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({ catKey, stats, onPlayerSelect }) {
  const entries = Object.entries(stats || {});
  if (entries.length === 0) return null;
  return (
    <section>
      <h3 style={{
        margin: '0 0 var(--space-4)', fontSize: 'var(--text-lg)', fontWeight: 700,
        borderBottom: '2px solid var(--accent)', paddingBottom: 'var(--space-2)',
        display: 'inline-block',
      }}>
        {CATEGORY_LABELS[catKey] ?? catKey}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {entries.map(([statKey, rows]) => (
          <LeaderTable
            key={statKey}
            title={STAT_LABELS[statKey]?.label ?? statKey}
            rows={rows}
            onPlayerSelect={onPlayerSelect}
          />
        ))}
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Leaders({ onPlayerSelect }) {
  const { actions } = useWorker();

  const [mode, setMode]       = useState('season');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [activeCategory, setActiveCategory] = useState('passing');

  useEffect(() => {
    setLoading(true);
    setError(null);
    actions.getLeagueLeaders(mode)
      .then(resp => {
        setData(resp.payload ?? resp);
        setLoading(false);
      })
      .catch(err => {
        console.error('Leaders fetch failed:', err);
        setError(err.message ?? 'Failed to load leaders');
        setLoading(false);
      });
  }, [mode]);

  const categories = data?.categories ?? {};
  const categoryKeys = Object.keys(categories);

  // Determine whether there is any real data
  const hasData = categoryKeys.some(k =>
    Object.values(categories[k] ?? {}).some(rows => rows?.length > 0)
  );

  return (
    <div>
      {/* ── Controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        {/* Mode toggle */}
        <div className="standings-tabs">
          {[
            { key: 'season',  label: 'Season Leaders' },
            { key: 'alltime', label: 'All-Time Records' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`standings-tab${mode === key ? ' active' : ''}`}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {data?.year && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {mode === 'season' ? `${data.year} Season` : 'All Seasons Combined'}
          </span>
        )}
      </div>

      {/* ── Category nav ── */}
      {!loading && hasData && (
        <div className="standings-tabs" style={{ marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
          {categoryKeys.map(k => (
            <button
              key={k}
              className={`standings-tab${activeCategory === k ? ' active' : ''}`}
              onClick={() => setActiveCategory(k)}
            >
              {CATEGORY_LABELS[k] ?? k}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--text-muted)' }}>
          Loading leaders…
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding: 'var(--space-6)', textAlign: 'center', color: 'var(--danger)',
          background: 'rgba(255,69,58,0.07)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--danger)',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && !hasData && (
        <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>📊</div>
          <div>No stats available yet — play through a season to see leaders appear.</div>
        </div>
      )}

      {!loading && !error && hasData && (
        <CategorySection
          catKey={activeCategory}
          stats={categories[activeCategory]}
          onPlayerSelect={onPlayerSelect}
        />
      )}
    </div>
  );
}
