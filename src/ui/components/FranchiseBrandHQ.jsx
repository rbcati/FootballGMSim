/** @jsxImportSource react */
import React from 'react';

// ── Championship Wall ─────────────────────────────────────────────────────────

function ChampionshipBadge({ year }) {
  return (
    <span
      data-testid="championship-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: '8px',
        background: 'rgba(245, 158, 11, 0.10)',
        border: '1px solid rgba(245, 158, 11, 0.20)',
        color: 'var(--warning, #f59e0b)',
        fontSize: 'var(--text-sm, 13px)',
        fontWeight: 700,
        letterSpacing: '0.04em',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">🏆</span>
      {year}
    </span>
  );
}

function ChampionshipWall({ championshipYears }) {
  const years = Array.isArray(championshipYears) ? championshipYears : [];

  return (
    <div data-testid="championship-wall">
      <div
        style={{
          fontSize: 'var(--text-xs, 11px)',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}
      >
        Championship Wall
      </div>
      {years.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {years.map((year) => (
            <ChampionshipBadge key={year} year={year} />
          ))}
        </div>
      ) : (
        <p
          data-testid="championship-wall-empty"
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs, 12px)',
            fontStyle: 'italic',
          }}
        >
          No championships yet.
        </p>
      )}
    </div>
  );
}

// ── Main FranchiseBrandHQ ─────────────────────────────────────────────────────

/**
 * FranchiseBrandHQ — Championship wall for the top of Franchise HQ.
 *
 * Props:
 *   championshipYears  {number[]} - Seasons the franchise won the title
 */
export default function FranchiseBrandHQ({ championshipYears = [] }) {
  const years = Array.isArray(championshipYears) ? championshipYears : [];

  if (years.length === 0) return null;

  return (
    <div
      data-testid="franchise-brand-hq"
      style={{
        padding: '10px 16px',
        borderRadius: '10px',
        background: 'rgba(245, 158, 11, 0.04)',
        border: '1px solid rgba(245, 158, 11, 0.12)',
        marginBottom: 4,
      }}
    >
      <ChampionshipWall championshipYears={years} />
    </div>
  );
}
