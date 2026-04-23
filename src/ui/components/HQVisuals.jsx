import React from 'react';
import { teamColor } from '../../data/team-utils.js';

const baseIconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function HQIcon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' };
  switch (name) {
    case 'home':
      return <svg {...common}><path {...baseIconProps} d="M3.75 11.5 12 4.75l8.25 6.75v8.25a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-4.5v6h-4.5a1.5 1.5 0 0 1-1.5-1.5z" /></svg>;
    case 'team':
      return <svg {...common}><path {...baseIconProps} d="M12 3.75 4.5 7v5.9c0 4.1 3.2 7.9 7.5 8.95 4.3-1.05 7.5-4.85 7.5-8.95V7z" /></svg>;
    case 'league':
      return <svg {...common}><path {...baseIconProps} d="M12 4.75v14.5M4.75 12h14.5" /><circle {...baseIconProps} cx="12" cy="12" r="7.25" /></svg>;
    case 'news':
      return <svg {...common}><rect {...baseIconProps} x="4.5" y="4.5" width="15" height="15" rx="2.5" /><path {...baseIconProps} d="M8 9.25h8M8 12h8M8 14.75h5" /></svg>;
    case 'more':
      return <svg {...common}><path {...baseIconProps} d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15" /></svg>;
    case 'lineup':
      return <svg {...common}><rect {...baseIconProps} x="6" y="4.75" width="12" height="16" rx="2" /><path {...baseIconProps} d="M9 4.75h6M9 10h6M9 13.5h6M9 17h3" /></svg>;
    case 'gamePlan':
      return <svg {...common}><path {...baseIconProps} d="M4.5 6.5h7l2 2h6v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" /><path {...baseIconProps} d="M9.5 12.25h6M9.5 15.25h4" /></svg>;
    case 'scout':
      return <svg {...common}><circle {...baseIconProps} cx="10.5" cy="10.5" r="4.5" /><path {...baseIconProps} d="m14 14 5.25 5.25M7.75 10.5h5.5" /></svg>;
    case 'injuryNews':
      return <svg {...common}><path {...baseIconProps} d="M5.25 7.5A2.75 2.75 0 0 1 8 4.75h8a2.75 2.75 0 0 1 2.75 2.75v9A2.75 2.75 0 0 1 16 19.25H8a2.75 2.75 0 0 1-2.75-2.75z" /><path {...baseIconProps} d="M9 9.25h6M9 12.25h6M9 15.25h3.5" /></svg>;
    case 'controls':
      return <svg {...common}><path {...baseIconProps} d="M4.75 7.5h8.5m2 0h4M4.75 16.5h4m2 0h8.5" /><circle {...baseIconProps} cx="13.25" cy="7.5" r="1.8" /><circle {...baseIconProps} cx="8.75" cy="16.5" r="1.8" /></svg>;
    case 'lastGame':
      return <svg {...common}><path {...baseIconProps} d="M7 18.5h10M8.5 18.5V8.25M15.5 18.5V8.25M10 8.25h4M8 5.25h8" /></svg>;
    case 'standing':
      return <svg {...common}><path {...baseIconProps} d="M5 17.75 10 12l3.25 3.25 5.75-7" /><path {...baseIconProps} d="M18 8.25h1.75V10" /></svg>;
    case 'arrowRight':
      return <svg {...common}><path {...baseIconProps} d="M5 12h14m-5-5 5 5-5 5" /></svg>;
    default:
      return null;
  }
}

function hexToRgb(hex) {
  const normalized = String(hex ?? '').trim().replace('#', '');
  if (normalized.length !== 6) return { r: 60, g: 92, b: 140 };
  const num = Number.parseInt(normalized, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function TeamIdentityBadge({ team, variant = 'circle', size = 78, emphasize = false }) {
  const abbr = String(team?.abbr ?? 'TM').slice(0, 3).toUpperCase();
  const color = teamColor(abbr);
  const rgb = hexToRgb(color);
  const style = {
    width: size,
    height: size,
    '--badge-rgb': `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    '--badge-color': color,
  };
  return (
    <span className={`app-team-badge variant-${variant} ${emphasize ? 'is-emphasis' : ''}`} style={style} aria-hidden>
      <span>{abbr}</span>
    </span>
  );
}
