import React from 'react';
import { getPageOrientation } from '../constants/navigationCopy.js';

/**
 * PageOrientationHeader
 *
 * Compact "where am I / what is this page for" header rendered above page content
 * on both desktop and mobile. It is purely presentational — no navigation or data
 * side effects.
 *
 * HQ owns its own rich header, so it is intentionally skipped here to avoid a
 * duplicate title. Returns null when there is no orientation copy for the active
 * tab, so unknown destinations render nothing rather than an empty box.
 */
export default function PageOrientationHeader({ tab }) {
  if (tab === 'HQ') return null;
  const orientation = getPageOrientation(tab);
  if (!orientation) return null;

  return (
    <div data-testid="page-orientation" className="page-orientation">
      <div className="page-orientation__title">{orientation.title}</div>
      <div className="page-orientation__subtitle">{orientation.subtitle}</div>
    </div>
  );
}
