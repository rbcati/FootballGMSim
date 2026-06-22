/**
 * JobSecurityCard.jsx — Owner mandate & hot-seat widget for Franchise HQ
 *
 * Compact card that shows the current owner mandate, hot-seat status, and
 * a 0–100 fill bar. Color-coded by risk band.
 */

import React from 'react';
import { getHotSeatStatus, getMandateLabel } from '../../core/meta/ownerPressureEngine.js';

const BAND_COLORS = Object.freeze({
  secure:     { fill: 'var(--success, #34C759)', label: '✅ Secure',         accent: 'rgba(52,199,89,0.15)' },
  unstable:   { fill: 'var(--warning, #FF9F0A)', label: '⚠️ Unstable',       accent: 'rgba(255,159,10,0.15)' },
  'high-risk':{ fill: 'var(--danger,  #FF453A)', label: '🚨 Hot Seat — High Risk', accent: 'rgba(255,69,58,0.15)' },
});

/**
 * @param {{ ownerProfile: { mandate: string, hotSeatRating: number, seasonsUnderGoal: number }|null }} props
 */
export default function JobSecurityCard({ ownerProfile }) {
  if (!ownerProfile || !ownerProfile.mandate) return null;

  const status  = getHotSeatStatus(ownerProfile);
  const band    = BAND_COLORS[status] ?? BAND_COLORS.secure;
  const rating  = Math.max(0, Math.min(100, Number(ownerProfile.hotSeatRating ?? 25)));
  const mandate = getMandateLabel(ownerProfile.mandate);
  const isHighRisk = status === 'high-risk';

  return (
    <article
      className="hq-twin-card card"
      data-testid="job-security-card"
      aria-label="Job Security"
      style={{ borderColor: isHighRisk ? 'rgba(255,69,58,0.45)' : undefined }}
    >
      <div className="hq-twin-card__head">
        <strong>Job Security</strong>
        <span
          data-testid="hot-seat-status-label"
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: band.fill,
            animation: isHighRisk ? 'hq-deadline-pulse 2.5s ease-in-out infinite' : 'none',
          }}
          aria-label={`Status: ${band.label}`}
        >
          {band.label}
        </span>
      </div>

      <p
        className="hq-twin-card__stat"
        data-testid="job-security-mandate"
        style={{ margin: '4px 0 2px', fontSize: 'var(--text-sm)' }}
      >
        {mandate}
      </p>

      {/* Progress / fill bar */}
      <div
        role="progressbar"
        aria-valuenow={rating}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Hot seat pressure: ${rating} out of 100`}
        data-testid="hot-seat-progress-bar"
        style={{
          position:     'relative',
          height:       6,
          borderRadius: 3,
          background:   'var(--hairline, rgba(255,255,255,0.12))',
          overflow:     'hidden',
          margin:       '6px 0',
        }}
      >
        <div
          style={{
            position:     'absolute',
            left:         0,
            top:          0,
            height:       '100%',
            width:        `${rating}%`,
            background:   band.fill,
            borderRadius: 3,
            transition:   'width 0.3s ease',
          }}
        />
      </div>

      <p
        className="hq-twin-card__detail"
        style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', margin: 0 }}
      >
        {rating}/100 pressure
        {ownerProfile.seasonsUnderGoal > 0
          ? ` · ${ownerProfile.seasonsUnderGoal} season${ownerProfile.seasonsUnderGoal > 1 ? 's' : ''} under goal`
          : ''}
      </p>
    </article>
  );
}
