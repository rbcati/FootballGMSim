import React, { useMemo, useState } from 'react';
import {
  compareNumbers,
  COMPARE_RATING_KEYS,
  getCompareRatingLabel,
  getPlayerRatingValue,
  getPlayerStatValue,
  resolveCompareStatSections,
  shouldShowGroupForPosition,
} from '../../core/footballCompare';
import { buildPlayerEvaluation, deriveAttributeBuckets, getPositionGroup } from '../../core/playerEvaluation.js';

function formatContract(player) {
  const amount = Number(player?.contract?.baseAnnual ?? player?.contractAmount ?? player?.askingPrice ?? 0);
  const years = player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.contract?.yearsTotal;
  if (!amount && !years) return '—';
  return `$${amount.toFixed(1)}M${years ? ` · ${years}y` : ''}`;
}

function getDisplayName(player) {
  return player?.name ?? `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim() ?? 'Unknown';
}

function ValueCell({ value, winner }) {
  return (
    <div style={{ fontWeight: winner ? 800 : 500, color: winner ? 'var(--accent)' : 'var(--text-muted)' }}>
      {value ?? '—'}
    </div>
  );
}

function Row({ label, a, b, lowerIsBetter = false }) {
  const outcome = compareNumbers(typeof a === 'number' ? a : null, typeof b === 'number' ? b : null, lowerIsBetter);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}>
      <ValueCell value={a} winner={outcome === 'a'} />
      <div style={{ color: 'var(--text-subtle)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ textAlign: 'right' }}><ValueCell value={b} winner={outcome === 'b'} /></div>
    </div>
  );
}

export function buildComparisonViewModel(playerA, playerB) {
  if (!playerA || !playerB) return null;
  const evalA = buildPlayerEvaluation(playerA, { rosterContext: { roster: [] } });
  const evalB = buildPlayerEvaluation(playerB, { rosterContext: { roster: [] } });
  const groupA = deriveAttributeBuckets(playerA, getPositionGroup(playerA));
  const groupB = deriveAttributeBuckets(playerB, getPositionGroup(playerB));
  return {
    evalA,
    evalB,
    groupedRows: Array.from(new Set([...(groupA.focus ?? []), ...(groupB.focus ?? [])])).map((key) => ({
      key,
      a: groupA.values?.[key] ?? null,
      b: groupB.values?.[key] ?? null,
    })),
  };
}

export default function PlayerComparison({ playerA, playerB, onClose }) {
  const [showAllStats, setShowAllStats] = useState(false);

  const sections = useMemo(() => resolveCompareStatSections(playerA, playerB, showAllStats), [playerA, playerB, showAllStats]);

  const ratings = useMemo(() => COMPARE_RATING_KEYS
    .map((key) => ({
      key,
      label: getCompareRatingLabel(key),
      a: getPlayerRatingValue(playerA, key),
      b: getPlayerRatingValue(playerB, key),
    }))
    .filter((row) => row.a != null || row.b != null), [playerA, playerB]);
  const evalModel = useMemo(() => buildComparisonViewModel(playerA, playerB), [playerA, playerB]);

  if (!playerA || !playerB) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: 'min(980px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--surface-strong)', zIndex: 2, borderBottom: '1px solid var(--hairline)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Compare Players</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ padding: 14 }}>
          <h4 style={{ margin: '0 0 8px 0' }}>Bio</h4>
          <Row label="Name" a={getDisplayName(playerA)} b={getDisplayName(playerB)} />
          <Row label="Team" a={playerA?.teamAbbrev ?? playerA?.team?.abbr ?? 'FA'} b={playerB?.teamAbbrev ?? playerB?.team?.abbr ?? 'FA'} />
          <Row label="Position" a={playerA?.pos ?? '—'} b={playerB?.pos ?? '—'} />
          <Row label="Age" a={playerA?.age ?? '—'} b={playerB?.age ?? '—'} lowerIsBetter />
          <Row label="College" a={playerA?.college ?? '—'} b={playerB?.college ?? '—'} />
          <Row label="Experience" a={playerA?.experience ?? playerA?.exp ?? '—'} b={playerB?.experience ?? playerB?.exp ?? '—'} />
          <Row label="Contract" a={formatContract(playerA)} b={formatContract(playerB)} />
          <Row label="Draft" a={playerA?.draft?.year ? `${playerA.draft.year} R${playerA.draft.round ?? '?'} P${playerA.draft.pick ?? '?'}` : '—'} b={playerB?.draft?.year ? `${playerB.draft.year} R${playerB.draft.round ?? '?'} P${playerB.draft.pick ?? '?'}` : '—'} />

          <h4 style={{ margin: '14px 0 8px 0' }}>Ratings</h4>
          {ratings.map((rating) => (
            <Row key={rating.key} label={rating.label} a={rating.a ?? '—'} b={rating.b ?? '—'} />
          ))}

          <h4 style={{ margin: '14px 0 8px 0' }}>Tactical Comparison</h4>
          <Row label="Archetype" a={evalModel?.evalA?.archetype?.archetype ?? '—'} b={evalModel?.evalB?.archetype?.archetype ?? '—'} />
          <Row label="Scheme Fit" a={`${evalModel?.evalA?.schemeFit?.score ?? '—'} (${evalModel?.evalA?.schemeFit?.tier ?? '—'})`} b={`${evalModel?.evalB?.schemeFit?.score ?? '—'} (${evalModel?.evalB?.schemeFit?.tier ?? '—'})`} />
          <Row label="Projected Role" a={evalModel?.evalA?.roleProjection?.role ?? '—'} b={evalModel?.evalB?.roleProjection?.role ?? '—'} />
          <Row label="Starter Context" a={evalModel?.evalA?.roleProjection?.replaceContext ?? '—'} b={evalModel?.evalB?.roleProjection?.replaceContext ?? '—'} />
          <Row label="Sim Impact" a={evalModel?.evalA?.simImpact?.summary ?? '—'} b={evalModel?.evalB?.simImpact?.summary ?? '—'} />

          <h4 style={{ margin: '14px 0 8px 0' }}>Attribute Buckets</h4>
          {evalModel?.groupedRows?.map((row) => (
            <Row key={row.key} label={row.key} a={row.a ?? '—'} b={row.b ?? '—'} />
          ))}

          <h4 style={{ margin: '14px 0 8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <span>Production</span>
            <button className="btn" onClick={() => setShowAllStats((v) => !v)} style={{ fontSize: 11 }}>{showAllStats ? 'Position-focused' : 'All stats'}</button>
          </h4>
          {sections.filter((section) => showAllStats || shouldShowGroupForPosition(section.key, playerA?.pos) || shouldShowGroupForPosition(section.key, playerB?.pos)).map((section) => (
            <div key={section.key} style={{ marginBottom: 10, padding: 10, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{section.title}</div>
              {section.rows.map((row) => (
                <Row
                  key={`${section.key}-${row.key}`}
                  label={row.label}
                  a={getPlayerStatValue(playerA, row.key) ?? '—'}
                  b={getPlayerStatValue(playerB, row.key) ?? '—'}
                  lowerIsBetter={row.lowerIsBetter}
                />
              ))}
            </div>
          ))}
          {sections.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No shared stat history available for this pairing yet.</div>}
        </div>
      </div>
    </div>
  );
}
