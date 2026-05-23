/**
 * ResponsiveDataTable.jsx
 *
 * Thin wrapper that gives any dense <table> or data surface:
 *  - Contained horizontal scroll (never leaks to body)
 *  - iOS momentum scrolling (-webkit-overflow-scrolling)
 *  - An accessible region label so screen readers announce the scrollable area
 *  - Optional sticky first column via the stickyFirstColumn prop
 *  - Safe empty state (children may be null / undefined)
 *
 * No third-party dependencies. No new CSS variables.
 * Existing project classes (responsive-data-wrap, sticky-identity-cell) are
 * defined in src/ui/styles/mobile.css.
 *
 * Usage:
 *   <ResponsiveDataTable label="League leaders">
 *     <table>…</table>
 *   </ResponsiveDataTable>
 *
 *   <ResponsiveDataTable label="Career stats" stickyFirstColumn caption="Career statistics by season">
 *     <table>…</table>
 *   </ResponsiveDataTable>
 */

import React from "react";

export default function ResponsiveDataTable({
  children,
  label,
  caption,
  stickyFirstColumn = false,
  className = "",
  style,
  emptyState = null,
  "data-testid": testId,
}) {
  const hasContent = React.Children.count(children) > 0 && children != null;

  if (!hasContent) {
    return emptyState ?? null;
  }

  const wrapClass = [
    "responsive-data-wrap",
    stickyFirstColumn ? "responsive-data-wrap--sticky-col" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={wrapClass}
      role="region"
      aria-label={label ?? "Data table — scroll horizontally to view all columns"}
      tabIndex={0}
      style={style}
      data-testid={testId}
    >
      {caption ? (
        <span className="sr-only" aria-hidden="false">
          {caption}
        </span>
      ) : null}
      {children}
    </div>
  );
}
