import React from 'react';

/**
 * ReSignPriorityBadges — presentational-only priority/risk/urgency/replacement
 * chips for expiring-contract list rows (Financials + Roster). Renders already
 * computed recommendation data; never evaluates contract economics itself.
 *
 * Accepts capitalized ('High') or lowercase ('high') level strings since
 * different surfaces normalize case differently upstream.
 */

const TIER_LABEL = {
  priority_resign: 'Priority Re-sign',
  resign_if_price: 'Re-sign if price holds',
  trade_or_tag: 'Trade / Tag',
  let_walk: 'Let walk',
  replaceable_depth: 'Replaceable depth',
};

const TIER_TONE = {
  priority_resign: 'high',
  resign_if_price: 'medium',
  trade_or_tag: 'medium',
  let_walk: 'muted',
  replaceable_depth: 'muted',
};

const URGENCY_LABEL = { high: 'High urgency', medium: 'Mid urgency', low: 'Low urgency' };
const RISK_LABEL = { high: 'High risk', medium: 'Med risk', low: 'Low risk' };
const REPLACEMENT_LABEL = { high: 'Hard to replace', medium: 'Replaceable', low: 'Easy to replace' };

function normalizeLevel(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'high' || s === 'medium' || s === 'low' ? s : null;
}

function toneClass(tone) {
  if (tone === 'high') return 'resign-priority-badge--high';
  if (tone === 'medium') return 'resign-priority-badge--medium';
  if (tone === 'low') return 'resign-priority-badge--low';
  return 'resign-priority-badge--muted';
}

function Badge({ label, tone, extraClass = '', testId }) {
  return (
    <span
      className={`resign-priority-badge ${toneClass(tone)} ${extraClass}`.trim()}
      data-testid={testId}
    >
      {label}
    </span>
  );
}

export default function ReSignPriorityBadges({
  tier = null,
  urgency = null,
  risk = null,
  replacementDifficulty = null,
  shortReason = null,
  compact = false,
}) {
  const tierLabel = TIER_LABEL[tier] ?? 'Unrated';
  const tierTone = TIER_TONE[tier] ?? 'muted';

  const urgencyLevel = normalizeLevel(urgency);
  const urgencyLabel = urgencyLevel ? URGENCY_LABEL[urgencyLevel] : 'Urgency unknown';

  const riskLevel = normalizeLevel(risk);
  const riskLabel = riskLevel ? RISK_LABEL[riskLevel] : 'Risk unknown';

  const replacementLevel = normalizeLevel(replacementDifficulty);
  const replacementLabel = replacementLevel ? REPLACEMENT_LABEL[replacementLevel] : 'Replacement unknown';

  return (
    <div
      className={`resign-priority-badges${compact ? ' resign-priority-badges--compact' : ''}`}
      data-testid="resign-priority-badges"
    >
      <div className="resign-priority-badge-row">
        <Badge label={tierLabel} tone={tierTone} extraClass="resign-priority-badge--tier" testId="resign-priority-badge-tier" />
        <Badge label={urgencyLabel} tone={urgencyLevel} testId="resign-priority-badge-urgency" />
        <Badge label={riskLabel} tone={riskLevel} testId="resign-priority-badge-risk" />
        <Badge label={replacementLabel} tone={replacementLevel} testId="resign-priority-badge-replacement" />
      </div>
      {shortReason && <div className="resign-priority-reason">{shortReason}</div>}
    </div>
  );
}
