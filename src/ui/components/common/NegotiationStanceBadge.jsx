import React from 'react';
import { deriveNegotiationContext, NEGOTIATION_STANCES } from '../../selectors/deriveNegotiationContext.js';

/**
 * NegotiationStanceBadge — purely presentational display of a player's
 * derived negotiation stance and plain-language reason labels.
 *
 * It calls the pure `deriveNegotiationContext` selector at render time only.
 * It changes no economics, persists nothing, and never exposes raw reason
 * codes — only `reasonLabels`. Badge colour maps to existing visual tokens:
 *   UNAVAILABLE → muted · EAGER → success · RELUCTANT → warning · NEUTRAL → default
 *
 * @param {object} props
 * @param {object} props.player
 * @param {object} [props.team]
 * @param {object} [props.league]
 * @param {number} [props.maxReasons]   How many reason labels to show (default 2).
 * @param {boolean} [props.showReasons]  Render reason labels beneath the badge (default true).
 * @param {string} [props.testId]
 */
export default function NegotiationStanceBadge({
  player,
  team,
  league,
  maxReasons = 2,
  showReasons = true,
  testId = 'negotiation-stance-badge',
}) {
  const ctx = deriveNegotiationContext({ player, team, league });

  const tone = STANCE_TONE[ctx.stance] ?? STANCE_TONE[NEGOTIATION_STANCES.NEUTRAL];
  const reasonLabels = (ctx.reasonLabels ?? []).slice(0, maxReasons);

  return (
    <div
      data-testid={testId}
      data-stance={ctx.stance}
      style={{ display: 'grid', gap: 3, justifyItems: 'start' }}
    >
      <span
        aria-label={`Negotiation stance: ${ctx.stanceLabel}`}
        style={{
          display: 'inline-block',
          fontSize: 10,
          fontWeight: 700,
          color: tone,
          border: `1px solid ${tone}`,
          background: `${tone}14`,
          borderRadius: 999,
          padding: '0 6px',
          lineHeight: 1.6,
          whiteSpace: 'nowrap',
        }}
      >
        {ctx.stanceLabel}
      </span>
      {showReasons && reasonLabels.length > 0 ? (
        <div style={{ display: 'grid', gap: 1 }}>
          {reasonLabels.map((label) => (
            <div key={label} style={{ fontSize: 10, color: 'var(--text-subtle)', lineHeight: 1.4 }}>
              {label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const STANCE_TONE = Object.freeze({
  [NEGOTIATION_STANCES.EAGER]: 'var(--success)',
  [NEGOTIATION_STANCES.RELUCTANT]: 'var(--warning)',
  [NEGOTIATION_STANCES.UNAVAILABLE]: 'var(--text-muted)',
  [NEGOTIATION_STANCES.NEUTRAL]: 'var(--text-muted)',
});
