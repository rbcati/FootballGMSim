import React from 'react';

const POSTURE_STYLE = {
  CONTENDER: { background: 'rgba(255,214,10,0.12)', color: '#FFD60A', border: '1px solid rgba(255,214,10,0.3)', label: 'Contender' },
  REBUILDER:  { background: 'rgba(10,132,255,0.12)', color: '#0A84FF', border: '1px solid rgba(10,132,255,0.3)', label: 'Rebuilder' },
  NEUTRAL:    { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--hairline)', label: 'Neutral' },
};

const VERDICT_STYLE = {
  FAVORABLE:        { color: 'var(--success)',  label: 'Favorable for you' },
  FAIR:             { color: 'var(--success)',  label: 'Fair value' },
  NEEDS_MORE_VALUE: { color: 'var(--warning)',  label: 'Needs more value' },
  UNFAVORABLE:      { color: 'var(--danger)',   label: 'Unfavorable' },
};

const NEED_STYLE = {
  CRITICAL: { color: 'var(--danger)',  label: 'Critical need' },
  MODERATE: { color: 'var(--warning)', label: 'Moderate need' },
  SECURE:   { color: 'var(--success)', label: 'Secure depth' },
  UNKNOWN:  { color: 'var(--text-muted)', label: 'Unknown' },
};

function PostureBadge({ posture }) {
  const s = POSTURE_STYLE[posture] ?? POSTURE_STYLE.NEUTRAL;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.background, color: s.color, border: s.border }}>
      {s.label}
    </span>
  );
}

function ScoreRow({ outgoingScore, incomingScore, verdict }) {
  const vs = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.FAIR;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>Send <strong style={{ color: 'var(--text)' }}>{outgoingScore}</strong></span>
      <span style={{ color: 'var(--text-muted)' }}>↔</span>
      <span style={{ color: 'var(--text-muted)' }}>Get <strong style={{ color: 'var(--text)' }}>{incomingScore}</strong></span>
      <span style={{ fontWeight: 700, color: vs.color }}>{vs.label}</span>
    </div>
  );
}

function PickDecayRows({ decayedPicks }) {
  if (!Array.isArray(decayedPicks) || decayedPicks.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {decayedPicks.map((pk, i) => {
        const decayPct = pk.baseValue > 0 ? Math.round((1 - pk.decayedValue / pk.baseValue) * 100) : 0;
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>{pk.label ?? `R${pk.round}`}</span>
            <span>
              base {pk.baseValue} → {pk.decayedValue}
              {decayPct > 0 ? <span style={{ color: 'var(--warning)', marginLeft: 4 }}>−{decayPct}% decay</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PositionalContextRows({ positionalContexts }) {
  if (!Array.isArray(positionalContexts) || positionalContexts.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {positionalContexts.map((ctx, i) => {
        const ns = NEED_STYLE[ctx.needLevel] ?? NEED_STYLE.UNKNOWN;
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-muted)' }}>{`Their ${ctx.pos} depth`}</span>
            <span style={{ color: ns.color, fontWeight: 600 }}>{ns.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Read-only trade explanation panel.
 * Displays AI reasoning derived from tradeFinderAnalysis buildIdea() explanationMeta.
 * Never calls worker actions, never modifies state, never submits trades.
 */
export default function TradeExplanationPanel({ idea = null }) {
  const meta = idea?.explanationMeta;
  if (!meta) return null;

  const { posture, outgoingScore, incomingScore, verdict, diminishingReturnsApplied, decayedPicks, positionalContexts } = meta;
  const hasPickDecay = Array.isArray(decayedPicks) && decayedPicks.length > 0;
  const hasPositionalContext = Array.isArray(positionalContexts) && positionalContexts.length > 0;

  return (
    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI Reasoning</span>
        <PostureBadge posture={posture} />
      </div>

      <ScoreRow outgoingScore={outgoingScore} incomingScore={incomingScore} verdict={verdict} />

      {hasPickDecay && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 600 }}>Pick Decay</div>
          <PickDecayRows decayedPicks={decayedPicks} />
        </div>
      )}

      {diminishingReturnsApplied && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Multi-asset package: diminishing returns applied.
        </div>
      )}

      {hasPositionalContext && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 600 }}>Their Positional Needs</div>
          <PositionalContextRows positionalContexts={positionalContexts} />
        </div>
      )}
    </div>
  );
}
