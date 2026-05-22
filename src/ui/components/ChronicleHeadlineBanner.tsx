/**
 * ChronicleHeadlineBanner — inject at the top of FranchiseHQ / WeeklyHub.
 *
 * Displays the highest-severity WeeklyHeadline for the current week with
 * color-coded severity variants and a link to the full news ledger.
 */

import React, { useMemo } from 'react';
import type { WeeklyHeadline } from '../../types/history.js';

interface ChronicleHeadlineBannerProps {
  headlines: WeeklyHeadline[];
  currentWeek: number;
  currentYear: number;
  onViewAll?: () => void;
}

const TYPE_ICON: Record<WeeklyHeadline['type'], string> = {
  INJURY: '🚑',
  MILESTONE: '🏆',
  UPSET: '⚡',
  BLOWOUT: '💥',
  COMEBACK: '🔥',
};

const SEVERITY_STYLE: Record<WeeklyHeadline['severity'], React.CSSProperties> = {
  CRITICAL: {
    background: 'rgba(239,68,68,0.1)',
    borderLeft: '3px solid #ef4444',
    color: 'inherit',
  },
  MAJOR: {
    background: 'rgba(245,158,11,0.1)',
    borderLeft: '3px solid #f59e0b',
    color: 'inherit',
  },
  MINOR: {
    background: 'rgba(255,215,0,0.08)',
    borderLeft: '3px solid rgba(255,215,0,0.6)',
    color: 'inherit',
  },
};

const SEVERITY_BADGE: Record<WeeklyHeadline['severity'], { bg: string; color: string; label: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Breaking' },
  MAJOR: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Major' },
  MINOR: { bg: 'rgba(255,215,0,0.12)', color: '#c8991a', label: 'Update' },
};

function HeadlineCard({ headline, onViewAll }: { headline: WeeklyHeadline; onViewAll?: () => void }) {
  const icon = TYPE_ICON[headline.type] ?? '📰';
  const sev = SEVERITY_STYLE[headline.severity];
  const badge = SEVERITY_BADGE[headline.severity];

  return (
    <div
      style={{
        ...sev,
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      data-testid="chronicle-headline-card"
      data-severity={headline.severity}
      data-type={headline.type}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            background: badge.bg,
            color: badge.color,
            borderRadius: 5,
            padding: '1px 7px',
          }}
        >
          {badge.label}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Week {headline.week}
        </span>
      </div>

      <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', lineHeight: 1.35 }}>
        {headline.headlineText}
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {headline.detailText}
      </div>

      {onViewAll && (
        <button
          onClick={onViewAll}
          style={{
            alignSelf: 'flex-start',
            marginTop: 4,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          View full news ledger →
        </button>
      )}
    </div>
  );
}

export default function ChronicleHeadlineBanner({
  headlines,
  currentWeek,
  currentYear,
  onViewAll,
}: ChronicleHeadlineBannerProps) {
  const currentHeadline = useMemo(() => {
    // Show highest-severity headline for current week, fall back to most recent
    const thisWeek = headlines.filter(
      (h) => h.week === currentWeek && h.year === currentYear,
    );

    const prioritize = (list: WeeklyHeadline[]) =>
      [...list].sort((a, b) => {
        const rank = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };
        return rank[a.severity] - rank[b.severity];
      })[0] ?? null;

    return prioritize(thisWeek) ?? prioritize(headlines);
  }, [headlines, currentWeek, currentYear]);

  if (!currentHeadline) return null;

  return (
    <div style={{ marginBottom: 12 }} data-testid="chronicle-headline-banner">
      <HeadlineCard headline={currentHeadline} onViewAll={onViewAll} />
    </div>
  );
}
