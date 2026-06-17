import React, { useEffect, useMemo, useState } from 'react';
import { toWorker } from '../../worker/protocol.js';

const NUM_TEAMS = 32;
const MAX_ROUND = 7;

function computePercentileCutoffs(prospects, metric, higherIsBetter) {
  const values = prospects
    .map((p) => p.combineMetrics?.[metric])
    .filter((v) => v != null && Number.isFinite(Number(v)))
    .map(Number)
    .sort((a, b) => a - b);

  if (values.length === 0) return { top: null, bottom: null };

  const cutoffIndex = Math.max(0, Math.ceil(values.length * 0.1) - 1);

  if (higherIsBetter) {
    return {
      top: values[values.length - 1 - cutoffIndex],
      bottom: values[cutoffIndex],
    };
  } else {
    return {
      top: values[cutoffIndex],
      bottom: values[values.length - 1 - cutoffIndex],
    };
  }
}

function getMetricColor(value, cutoffs, higherIsBetter) {
  if (value == null || cutoffs.top == null) return undefined;
  const v = Number(value);
  if (higherIsBetter) {
    if (v >= cutoffs.top) return 'var(--color-success, #34C759)';
    if (v <= cutoffs.bottom) return 'var(--danger, #FF453A)';
  } else {
    if (v <= cutoffs.top) return 'var(--color-success, #34C759)';
    if (v >= cutoffs.bottom) return 'var(--danger, #FF453A)';
  }
  return undefined;
}

function gradeColor(grade) {
  if (grade == null) return undefined;
  if (grade > 8.5) return 'rgba(52,199,89,0.1)';
  if (grade < 4.0) return 'rgba(255,69,58,0.1)';
  return undefined;
}

function gradeHighlight(grade) {
  if (grade == null) return 'normal';
  if (grade > 8.5) return 'freak';
  if (grade < 4.0) return 'bust';
  return 'normal';
}

function projRound(rankIndex) {
  return Math.min(MAX_ROUND, Math.max(1, Math.ceil((rankIndex + 1) / NUM_TEAMS)));
}

const SORT_COLS = ['name', 'pos', 'projRound', 'fortyYardDash', 'benchPressReps', 'combineGrade'];

function getSortValue(prospect, rankIndex, col) {
  switch (col) {
    case 'name': return prospect.name ?? '';
    case 'pos': return prospect.pos ?? '';
    case 'projRound': return rankIndex;
    case 'fortyYardDash': return prospect.combineMetrics?.fortyYardDash ?? Infinity;
    case 'benchPressReps': return prospect.combineMetrics?.benchPressReps ?? -Infinity;
    case 'combineGrade': return prospect.combineMetrics?.combineGrade ?? -Infinity;
    default: return 0;
  }
}

export default function CombineDashboard({ prospects = [], combineInvitesLeft = 0, lastWorkoutCard = null, actions }) {
  const [sortBy, setSortBy] = useState('combineGrade');
  const [sortDir, setSortDir] = useState('desc');
  const [showCard, setShowCard] = useState(false);
  const [cardText, setCardText] = useState('');

  useEffect(() => {
    if (!lastWorkoutCard) return;
    setCardText(lastWorkoutCard);
    setShowCard(true);
    const timer = window.setTimeout(() => setShowCard(false), 6000);
    return () => window.clearTimeout(timer);
  }, [lastWorkoutCard]);

  const fortyCutoffs = useMemo(() => computePercentileCutoffs(prospects, 'fortyYardDash', false), [prospects]);
  const benchCutoffs = useMemo(() => computePercentileCutoffs(prospects, 'benchPressReps', true), [prospects]);
  const gradeCutoffs = useMemo(() => computePercentileCutoffs(prospects, 'combineGrade', true), [prospects]);

  const indexedProspects = useMemo(
    () => prospects.map((p, i) => ({ prospect: p, originalIndex: i })),
    [prospects],
  );

  const sorted = useMemo(() => {
    const copy = [...indexedProspects];
    copy.sort((a, b) => {
      const av = getSortValue(a.prospect, a.originalIndex, sortBy);
      const bv = getSortValue(b.prospect, b.originalIndex, sortBy);
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return copy;
  }, [indexedProspects, sortBy, sortDir]);

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'fortyYardDash' ? 'asc' : 'desc');
    }
  }

  async function handleInvite(prospectId) {
    if (actions?.runCombineWorkout) {
      try {
        const result = await actions.runCombineWorkout(prospectId);
        const card = result?.payload?.performanceCard;
        if (card) {
          setCardText(card);
          setShowCard(true);
          window.setTimeout(() => setShowCard(false), 6000);
        }
      } catch (_e) { /* error already surfaced by worker */ }
    } else {
      actions?.send?.(toWorker.RUN_COMBINE_WORKOUT, { prospectId });
    }
  }

  const invitesLeft = Number.isFinite(combineInvitesLeft) ? combineInvitesLeft : 0;
  const hasInvites = invitesLeft > 0;

  const headerAmber = hasInvites;
  const headerBg = headerAmber ? 'rgba(255,159,10,0.07)' : 'rgba(142,142,147,0.07)';
  const headerBorder = headerAmber ? '1px solid rgba(255,159,10,0.5)' : '1px solid rgba(142,142,147,0.3)';
  const headerLeftBorder = headerAmber ? '3px solid var(--warning, #FF9F0A)' : '3px solid var(--text-muted)';
  const headerColor = headerAmber ? 'var(--warning, #FF9F0A)' : 'var(--text-muted)';

  const thStyle = {
    padding: '6px var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontWeight: 600,
    textAlign: 'left',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--hairline)',
    background: 'none',
    border: 'none',
    width: '100%',
  };

  return (
    <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header status card */}
      <div
        data-testid={headerAmber ? 'combine-header-amber' : 'combine-header-muted'}
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: headerBg,
          border: headerBorder,
          borderLeft: headerLeftBorder,
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <strong style={{ display: 'block', color: headerColor, marginBottom: 2 }}>
          Draft Combine Week is Active
        </strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          Invites Remaining: {invitesLeft} / 6
        </span>
      </div>

      {/* Performance card toast */}
      {showCard && (
        <div
          data-testid="combine-performance-card"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(52,199,89,0.08)',
            border: '1px solid rgba(52,199,89,0.3)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
          }}
        >
          ✅ {cardText}
        </div>
      )}

      {/* Prospect combine table */}
      <div
        data-testid="combine-prospect-table"
        style={{
          overflowX: 'auto',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--hairline)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr>
              {[
                { col: 'name', label: 'Name' },
                { col: 'pos', label: 'Pos' },
                { col: 'projRound', label: 'Proj. Round' },
                { col: 'fortyYardDash', label: '40-Yard' },
                { col: 'benchPressReps', label: 'Bench Reps' },
                { col: 'combineGrade', label: 'Grade' },
                { col: null, label: 'Action' },
              ].map(({ col, label }) => (
                <th
                  key={label}
                  style={{
                    padding: '6px var(--space-3)',
                    fontSize: 'var(--text-xs)',
                    color: col && sortBy === col ? 'var(--text)' : 'var(--text-muted)',
                    fontWeight: 600,
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    borderBottom: '1px solid var(--hairline)',
                    cursor: col ? 'pointer' : 'default',
                    userSelect: 'none',
                    background: 'var(--surface, transparent)',
                  }}
                  onClick={col ? () => handleSort(col) : undefined}
                >
                  {label}
                  {col && sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ prospect, originalIndex }, sortedIndex) => {
              const m = prospect.combineMetrics;
              const grade = m?.combineGrade ?? null;
              const forty = m?.fortyYardDash ?? null;
              const bench = m?.benchPressReps ?? null;
              const rowBg = gradeColor(grade);
              const highlight = gradeHighlight(grade);
              const round = projRound(originalIndex);

              const fortyColor = forty != null ? getMetricColor(forty, fortyCutoffs, false) : undefined;
              const benchColor = bench != null ? getMetricColor(bench, benchCutoffs, true) : undefined;

              return (
                <tr
                  key={prospect.id}
                  data-testid={`combine-row-${prospect.id}`}
                  data-highlight={highlight}
                  style={{
                    background: rowBg,
                    borderBottom: '1px solid var(--hairline)',
                  }}
                >
                  <td style={{ padding: '5px var(--space-3)', color: 'var(--text)', fontWeight: 500 }}>
                    {prospect.name ?? '—'}
                  </td>
                  <td style={{ padding: '5px var(--space-3)', color: 'var(--text-muted)' }}>
                    {prospect.pos ?? '—'}
                  </td>
                  <td style={{ padding: '5px var(--space-3)', color: 'var(--text-muted)' }}>
                    R{round}
                  </td>
                  <td style={{ padding: '5px var(--space-3)', color: fortyColor ?? 'var(--text)' }}>
                    {forty != null ? forty : '—'}
                  </td>
                  <td style={{ padding: '5px var(--space-3)', color: benchColor ?? 'var(--text)' }}>
                    {bench != null ? bench : '—'}
                  </td>
                  <td style={{ padding: '5px var(--space-3)', color: 'var(--text)' }}>
                    {grade != null ? grade.toFixed(1) : '—'}
                  </td>
                  <td
                    data-testid={`combine-action-${prospect.id}`}
                    style={{ padding: '5px var(--space-3)', whiteSpace: 'nowrap' }}
                  >
                    {prospect.workoutCompleted ? (
                      <span
                        data-testid={`combine-verified-${prospect.id}`}
                        style={{
                          color: 'var(--color-success, #34C759)',
                          fontWeight: 600,
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        Verified (OVR: {prospect.trueOvr})
                      </span>
                    ) : hasInvites ? (
                      <button
                        type="button"
                        data-testid={`combine-invite-btn-${prospect.id}`}
                        onClick={() => handleInvite(prospect.id)}
                        style={{
                          fontSize: 'var(--text-xs)',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm, 4px)',
                          border: '1px solid rgba(10,132,255,0.5)',
                          background: 'rgba(10,132,255,0.08)',
                          color: '#0A84FF',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Invite to Private Workout
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid={`combine-invite-disabled-${prospect.id}`}
                        disabled
                        title="No invites remaining"
                        style={{
                          fontSize: 'var(--text-xs)',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm, 4px)',
                          border: '1px solid var(--hairline)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: 'not-allowed',
                          opacity: 0.5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Invite to Private Workout
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: 'var(--space-3)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 'var(--text-xs)' }}
                >
                  No prospects available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
