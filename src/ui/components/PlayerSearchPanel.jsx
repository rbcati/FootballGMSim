import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { filterPlayerPool } from '../utils/playerSearchFilterEngine';

const FILTER_SECTIONS = [
  {
    label: 'Receiving',
    fields: [
      { key: 'minTargets', label: 'Targets ≥' },
      { key: 'maxTargets', label: 'Targets ≤' },
      { key: 'minDrops', label: 'Drops ≥' },
      { key: 'maxDrops', label: 'Drops ≤' },
    ],
  },
  {
    label: 'Pass Protection',
    fields: [
      { key: 'minSacksAllowed', label: 'Sacks Allowed ≥' },
      { key: 'maxSacksAllowed', label: 'Sacks Allowed ≤' },
    ],
  },
  {
    label: 'Pass Rush',
    fields: [
      { key: 'minSacksMade', label: 'Sacks Made ≥' },
      { key: 'maxSacksMade', label: 'Sacks Made ≤' },
      { key: 'minBattedPasses', label: 'Batted Passes ≥' },
      { key: 'maxBattedPasses', label: 'Batted Passes ≤' },
    ],
  },
  {
    label: 'Coverage',
    fields: [
      { key: 'minCoverageTargets', label: 'Coverage Targets ≥' },
      { key: 'maxCoverageTargets', label: 'Coverage Targets ≤' },
      { key: 'minReceptionsAllowed', label: 'Receptions Allowed ≥' },
      { key: 'maxReceptionsAllowed', label: 'Receptions Allowed ≤' },
      { key: 'minCoverageCompletionsAllowed', label: 'Completions Allowed ≥' },
      { key: 'maxCoverageCompletionsAllowed', label: 'Completions Allowed ≤' },
    ],
  },
];

const RESULT_COLS = [
  { key: 'name',  label: 'Name',    get: (p) => p.name  ?? '—' },
  { key: 'pos',   label: 'Pos',     get: (p) => p.pos   ?? '—' },
  { key: 'ovr',   label: 'OVR',     get: (p) => p.ovr   ?? '—' },
  { key: 'team',  label: 'Team',    get: (p) => p.teamAbbr ?? p.team?.abbr ?? '—' },
];

/** Extract season keys from the sparse archive, sorted newest-first. */
function extractSeasonKeys(archive) {
  const keys = new Set();
  if (!archive || typeof archive !== 'object') return [];
  for (const [pid, playerYears] of Object.entries(archive)) {
    if (pid === '__meta' || !playerYears || typeof playerYears !== 'object') continue;
    for (const yearKey of Object.keys(playerYears)) {
      if (yearKey !== '__meta') keys.add(yearKey);
    }
  }
  return [...keys].sort((a, b) => Number(b) - Number(a));
}

const inputStyle = {
  width: '100%',
  fontSize: 'var(--text-sm)',
  padding: '4px 8px',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
};

const sectionLabelStyle = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--muted)',
  marginBottom: 'var(--space-1)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

/**
 * Collapsible panel for filtering a player pool by advanced stat thresholds.
 *
 * Props:
 *   players   – array of player objects (must have id/playerId)
 *   archive   – sparse advanced stats store { [playerId]: { [year]: AdvancedStats } }
 *   seasons   – optional explicit season-key list; extracted from archive when omitted
 *   title     – panel heading (default "Advanced Stat Finder")
 *   maxResults – cap on displayed rows (default 100)
 */
export default function PlayerSearchPanel({
  players = [],
  archive = {},
  seasons,
  title = 'Advanced Stat Finder',
  maxResults = 100,
}) {
  const [open, setOpen] = useState(false);
  const [seasonMode, setSeasonMode] = useState('career');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [inputs, setInputs] = useState({});

  const availableSeasons = useMemo(
    () => (Array.isArray(seasons) ? seasons : extractSeasonKeys(archive)),
    [seasons, archive],
  );

  const criteria = useMemo(() => {
    const c = { seasonMode };
    if (seasonMode === 'season' && selectedSeason) c.season = selectedSeason;
    for (const [k, v] of Object.entries(inputs)) {
      if (v === '' || v == null) continue;
      const n = Number(v);
      if (Number.isFinite(n)) c[k] = n;
    }
    return c;
  }, [seasonMode, selectedSeason, inputs]);

  const results = useMemo(
    () => filterPlayerPool(players, archive, criteria),
    [players, archive, criteria],
  );

  const activeCount = useMemo(
    () => Object.values(inputs).filter((v) => v !== '' && v != null).length,
    [inputs],
  );

  const handleInput = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearAll = useCallback(() => {
    setInputs({});
    setSeasonMode('career');
    setSelectedSeason('');
  }, []);

  const displayResults = results.slice(0, maxResults);

  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          {activeCount > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 999, background: 'var(--surface-strong)' }}>
              {activeCount} filter{activeCount !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }} aria-hidden>
            {open ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* ── Filter drawer ── */}
      {open && (
        <div style={{ padding: 'var(--space-3)', borderTop: '1px solid var(--hairline)' }}>

          {/* Season mode row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Mode</label>
            <select
              value={seasonMode}
              onChange={(e) => { setSeasonMode(e.target.value); setSelectedSeason(''); }}
              style={{ fontSize: 'var(--text-sm)', padding: '4px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}
            >
              <option value="career">Career Totals</option>
              <option value="season">Single Season</option>
            </select>

            {seasonMode === 'season' && (
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                style={{ fontSize: 'var(--text-sm)', padding: '4px 8px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}
              >
                <option value="">— All seasons —</option>
                {availableSeasons.map((s) => (
                  <option key={s} value={String(s)}>{s}</option>
                ))}
              </select>
            )}
          </div>

          {/* Threshold inputs — flex-wrap for ≥375 px safety */}
          {FILTER_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginBottom: 'var(--space-3)' }}>
              <div style={sectionLabelStyle}>{section.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {section.fields.map(({ key, label }) => (
                  <label
                    key={key}
                    style={{ display: 'flex', flexDirection: 'column', flex: '1 1 120px', minWidth: 120, maxWidth: 180 }}
                  >
                    <span style={{ fontSize: 'var(--text-xs)', marginBottom: 2 }}>{label}</span>
                    <input
                      type="number"
                      min={0}
                      value={inputs[key] ?? ''}
                      onChange={(e) => handleInput(key, e.target.value)}
                      placeholder="—"
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Actions row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <Button
              variant="ghost"
              onClick={clearAll}
              disabled={activeCount === 0 && seasonMode === 'career'}
            >
              Clear filters
            </Button>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {open && (
        <div style={{ padding: 'var(--space-3)', borderTop: '1px solid var(--hairline)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 'var(--space-2)' }}>
            {results.length} player{results.length !== 1 ? 's' : ''} match{results.length === 1 ? 'es' : ''}
            {results.length > maxResults && ` · showing first ${maxResults}`}
          </div>

          {displayResults.length > 0 && (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                <thead>
                  <tr>
                    {RESULT_COLS.map((col) => (
                      <th
                        key={col.key}
                        style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--hairline)', fontWeight: 600, whiteSpace: 'nowrap' }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayResults.map((player, i) => (
                    <tr key={player.id ?? player.playerId ?? i}>
                      {RESULT_COLS.map((col) => (
                        <td key={col.key} style={{ padding: '4px 8px', borderBottom: '1px solid var(--hairline)' }}>
                          {col.get(player)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
