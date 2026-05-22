/**
 * LeaguePulseCard — weekly headline digest for Franchise HQ.
 *
 * Shows 3–6 ranked headlines generated after each week advance so the player
 * immediately understands what happened around the league. Positioned above
 * passive stat cards. Mobile-first, no horizontal overflow.
 */

import React, { useMemo } from 'react';

function num(v, fallback = 0) {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

// ── Visual config per headline type ──────────────────────────────────────────

const TYPE_CONFIG = {
  INJURY: {
    icon: '🚑',
    label: 'Injury',
    accent: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
  },
  MILESTONE: {
    icon: '🏆',
    label: 'Milestone',
    accent: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
  },
  UPSET: {
    icon: '⚡',
    label: 'Upset',
    accent: '#8b5cf6',
    bg: 'rgba(139,92,246,0.08)',
  },
  BLOWOUT: {
    icon: '💥',
    label: 'Blowout',
    accent: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
  },
  COMEBACK: {
    icon: '🔥',
    label: 'Comeback',
    accent: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
  },
  OVERTIME: {
    icon: '⏱️',
    label: 'OT Thriller',
    accent: '#06b6d4',
    bg: 'rgba(6,182,212,0.08)',
  },
  STREAK: {
    icon: '📈',
    label: 'Streak',
    accent: '#22c55e',
    bg: 'rgba(34,197,94,0.08)',
  },
  PERFORMANCE: {
    icon: '⭐',
    label: 'Performance',
    accent: '#eab308',
    bg: 'rgba(234,179,8,0.08)',
  },
  DEFENSIVE: {
    icon: '🛡️',
    label: 'Defense',
    accent: '#64748b',
    bg: 'rgba(100,116,139,0.08)',
  },
};

const SEVERITY_BORDER = {
  CRITICAL: '#ef4444',
  MAJOR: '#f59e0b',
  MINOR: 'rgba(255,255,255,0.15)',
};

const FALLBACK_CONFIG = {
  icon: '📰',
  label: 'Update',
  accent: '#6b7280',
  bg: 'rgba(107,114,128,0.08)',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function HeadlinePill({ type }) {
  const cfg = TYPE_CONFIG[type] ?? FALLBACK_CONFIG;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: '0.65rem',
        fontWeight: 700,
        background: cfg.bg,
        color: cfg.accent,
        borderRadius: 5,
        padding: '2px 6px',
        letterSpacing: '0.3px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span aria-hidden="true">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function HeadlineRow({ headline, isTop }) {
  const cfg = TYPE_CONFIG[headline.type] ?? FALLBACK_CONFIG;
  const borderColor = SEVERITY_BORDER[headline.severity] ?? SEVERITY_BORDER.MINOR;

  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        background: isTop ? cfg.bg : 'transparent',
        borderRadius: isTop ? '0 8px 8px 0' : 0,
        padding: isTop ? '10px 12px 10px 10px' : '8px 4px 8px 10px',
        marginBottom: isTop ? 8 : 0,
      }}
      data-testid="league-pulse-headline"
      data-type={headline.type}
      data-severity={headline.severity}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
        <HeadlinePill type={headline.type} />
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.7 }}>
          Wk {headline.week}
        </span>
      </div>
      <div
        style={{
          fontWeight: isTop ? 700 : 600,
          fontSize: isTop ? 'var(--text-sm, 0.85rem)' : 'var(--text-xs, 0.78rem)',
          lineHeight: 1.35,
          color: 'var(--text)',
        }}
      >
        {headline.headlineText}
      </div>
      {isTop && headline.detailText ? (
        <div
          style={{
            fontSize: 'var(--text-xs, 0.75rem)',
            color: 'var(--text-muted)',
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {headline.detailText}
        </div>
      ) : null}
    </div>
  );
}

function QuickLinks({ onNavigate }) {
  const links = [
    { label: 'Standings', route: 'League:Standings' },
    { label: 'Injury Report', route: 'Team:Injuries' },
    { label: 'Results', route: 'League:Results' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        marginTop: 10,
        flexWrap: 'wrap',
      }}
    >
      {links.map((link) => (
        <button
          key={link.route}
          type="button"
          className="btn btn-sm"
          onClick={() => onNavigate?.(link.route)}
          style={{ fontSize: '0.72rem' }}
          aria-label={`Open ${link.label}`}
        >
          {link.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {Array}    props.headlines    - WeeklyHeadline[] from league.weeklyHeadlines
 * @param {number}   props.currentWeek  - league.week
 * @param {number}   props.currentYear  - league.year
 * @param {Function} [props.onNavigate] - Route callback
 * @param {Function} [props.onViewAll]  - "View all news" callback
 */
export default function LeaguePulseCard({
  headlines,
  currentWeek,
  currentYear,
  onNavigate,
  onViewAll,
}) {
  const thisWeekHeadlines = useMemo(() => {
    if (!Array.isArray(headlines)) return [];
    // Show current week first; fall back to most recent week if nothing yet
    const thisWeek = headlines.filter(
      (h) => num(h.week) === num(currentWeek) && num(h.year) === num(currentYear),
    );
    if (thisWeek.length > 0) return thisWeek.slice(0, 6);
    // Fall back to previous week's headlines so HQ never feels empty
    const sorted = [...headlines].sort((a, b) => {
      if (b.year !== a.year) return num(b.year) - num(a.year);
      return num(b.week) - num(a.week);
    });
    return sorted.slice(0, 4);
  }, [headlines, currentWeek, currentYear]);

  if (thisWeekHeadlines.length === 0) return null;

  const topHeadline = thisWeekHeadlines[0];
  const secondaryHeadlines = thisWeekHeadlines.slice(1, 5);
  const hasSecondary = secondaryHeadlines.length > 0;

  return (
    <section
      className="card"
      aria-label="League Pulse — weekly headlines"
      data-testid="league-pulse-card"
      style={{ padding: 'var(--space-2)', marginBottom: 12 }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 'var(--text-sm, 0.85rem)',
              fontWeight: 800,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            League Pulse
          </h2>
          <p
            style={{
              fontSize: 'var(--text-xs, 0.72rem)',
              color: 'var(--text-muted)',
              margin: '2px 0 0',
            }}
          >
            What happened around the league this week
          </p>
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            View all →
          </button>
        ) : null}
      </div>

      {/* Top headline */}
      <HeadlineRow headline={topHeadline} isTop />

      {/* Secondary headlines (compact list) */}
      {hasSecondary ? (
        <div
          style={{
            borderTop: '1px solid var(--hairline)',
            paddingTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {secondaryHeadlines.map((h) => (
            <HeadlineRow key={h.id} headline={h} isTop={false} />
          ))}
        </div>
      ) : null}

      {/* Quick navigation links */}
      <QuickLinks onNavigate={onNavigate} />
    </section>
  );
}
