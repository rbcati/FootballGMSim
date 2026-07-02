import React from 'react';

/**
 * NegotiationContextPanel — display-only "Scouting Intel" for re-sign /
 * extension negotiations. Surfaces existing contract-market intelligence;
 * it never computes economics and never affects offers or acceptance.
 *
 * Props (both optional; renders null when neither is provided):
 *
 * @param {object|null} priorityContext — result of `evaluateReSignPriority`:
 *   {
 *     recommendationTier: 'priority_resign'|'resign_if_price'|'trade_or_tag'|'let_walk'|'replaceable_depth',
 *     shortReason: string,
 *     urgencyLevel: 'high'|'medium'|'low',
 *     negotiationRisk: 'high'|'medium'|'low',
 *     likelyReplacementDifficulty: 'high'|'medium'|'low',
 *     profileHeadline: string,
 *   }
 * @param {object|null} decisionTiming — result of `buildDecisionTiming`:
 *   { patienceWeeks: number, ... } — only `patienceWeeks` is displayed.
 */

const TIER_LABEL = {
  priority_resign: 'Priority Re-sign',
  resign_if_price: 'Re-sign if price is right',
  trade_or_tag: 'Trade or tag candidate',
  let_walk: 'Let walk candidate',
  replaceable_depth: 'Replaceable depth',
};

const TIER_TONE = {
  priority_resign: 'high',
  resign_if_price: 'medium',
  trade_or_tag: 'medium',
  let_walk: 'muted',
  replaceable_depth: 'muted',
};

const REPLACEMENT_LABEL = {
  high: 'Hard to replace',
  medium: 'Moderate to replace',
  low: 'Easy to replace',
};

const RISK_LABEL = {
  high: 'High negotiation risk',
  medium: 'Medium negotiation risk',
  low: 'Low negotiation risk',
};

const LEVEL_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

function toneClass(tone) {
  if (tone === 'high') return 'neg-context-value--high';
  if (tone === 'medium') return 'neg-context-value--medium';
  if (tone === 'low') return 'neg-context-value--low';
  return 'neg-context-value--muted';
}

function decisionLabel(patienceWeeks) {
  if (patienceWeeks === 0) return 'Decision imminent';
  if (patienceWeeks === 1) return '1 week left';
  return `${patienceWeeks} weeks`;
}

function decisionTone(patienceWeeks) {
  if (patienceWeeks === 0) return 'high';
  if (patienceWeeks === 1) return 'medium';
  return 'low';
}

function Row({ label, value, tone, testId }) {
  return (
    <div className="neg-context-row">
      <span className="neg-context-label">{label}</span>
      <span className={`neg-context-value ${toneClass(tone)}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export default function NegotiationContextPanel({ priorityContext = null, decisionTiming = null }) {
  if (priorityContext == null && decisionTiming == null) return null;

  const tier = priorityContext?.recommendationTier;
  const tierLabel = TIER_LABEL[tier] ?? null;
  const urgency = priorityContext?.urgencyLevel;
  const urgencyText = LEVEL_LABEL[urgency] ?? null;
  const replacementText = REPLACEMENT_LABEL[priorityContext?.likelyReplacementDifficulty] ?? null;
  const riskLabel = RISK_LABEL[priorityContext?.negotiationRisk] ?? null;
  const headline = priorityContext?.profileHeadline || null;
  const shortReason = priorityContext?.shortReason || null;
  const patienceWeeks = Number.isFinite(decisionTiming?.patienceWeeks)
    ? Math.max(0, Math.round(decisionTiming.patienceWeeks))
    : null;

  return (
    <div className="neg-context-panel" data-testid="negotiation-context-panel">
      <div className="neg-context-header">Scouting Intel</div>
      {headline && <Row label="Motivation" value={headline} tone="muted" />}
      {tierLabel && <Row label="Priority" value={tierLabel} tone={TIER_TONE[tier]} />}
      {urgencyText && (
        <Row
          label="Urgency"
          value={replacementText ? `${urgencyText} · ${replacementText}` : urgencyText}
          tone={urgency}
          testId="negotiation-context-urgency"
        />
      )}
      {patienceWeeks != null && (
        <Row
          label="Decision"
          value={decisionLabel(patienceWeeks)}
          tone={decisionTone(patienceWeeks)}
          testId="negotiation-context-decision"
        />
      )}
      {riskLabel && <Row label="Risk" value={riskLabel} tone={priorityContext?.negotiationRisk} />}
      {shortReason && <div className="neg-context-note">{shortReason}</div>}
    </div>
  );
}
