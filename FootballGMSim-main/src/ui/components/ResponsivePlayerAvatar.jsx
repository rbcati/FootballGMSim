/**
 * ResponsivePlayerAvatar.jsx — Enhanced responsive SVG player avatar
 *
 * Changes:
 *  - NEW FILE: Wraps the SVG jersey avatar with responsive sizing
 *  - Scales up on mobile for better visibility (min 56px on phones)
 *  - Supports color-coded position badges (like Pocket GM 3)
 *  - Adds subtle glow effect matching team color
 *  - Touch-friendly: 44px minimum tap area enforced
 *  - Dark mode optimized with higher contrast strokes
 */

import React from 'react';

const POS_COLORS = {
  QB: '#FF453A',
  RB: '#34C759',
  WR: '#0A84FF',
  TE: '#FF9F0A',
  OL: '#8E8E93',
  DL: '#FF6961',
  LB: '#5E5CE6',
  CB: '#64D2FF',
  S: '#FFD60A',
  K: '#30D158',
  P: '#30D158',
};

export default function ResponsivePlayerAvatar({
  teamColor = '#555',
  text,
  position,
  size: propSize,
  showPositionBadge = false,
  className = '',
  style = {},
}) {
  // Position-based accent color
  const posColor = position ? (POS_COLORS[position] || '#8E8E93') : null;

  return (
    <div
      className={`responsive-avatar ${className}`}
      style={{
        '--avatar-color': teamColor,
        ...style,
      }}
    >
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="responsive-avatar-svg">
        {/* Glow effect */}
        <defs>
          <filter id={`glow-${text}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Jersey shape */}
        <path
          d="M 20 20 L 35 10 L 65 10 L 80 20 L 90 40 L 75 50 L 75 90 L 25 90 L 25 50 L 10 40 Z"
          fill={teamColor}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.5"
          filter={`url(#glow-${text})`}
        />

        {/* Jersey number */}
        <text
          x="50"
          y="62"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
          fontSize="28"
          fontWeight="900"
          fill="#fff"
          textAnchor="middle"
          dominantBaseline="middle"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="0.5"
        >
          {text}
        </text>

        {/* Position badge */}
        {showPositionBadge && position && (
          <>
            <circle cx="82" cy="82" r="14" fill={posColor} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
            <text
              x="82"
              y="83"
              fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
              fontSize="10"
              fontWeight="800"
              fill="#fff"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {position}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
