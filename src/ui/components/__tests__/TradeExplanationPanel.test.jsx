import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import TradeExplanationPanel from '../TradeExplanationPanel.jsx';

const BASE_META = {
  posture: 'NEUTRAL',
  outgoingScore: 120,
  incomingScore: 140,
  verdict: 'NEEDS_MORE_VALUE',
  diminishingReturnsApplied: false,
  decayedPicks: [],
  positionalContexts: null,
};

function makeIdea(overrides = {}) {
  return { explanationMeta: { ...BASE_META, ...overrides } };
}

describe('TradeExplanationPanel', () => {
  it('renders null when idea is null', () => {
    const html = renderToString(<TradeExplanationPanel idea={null} />);
    expect(html).toBe('');
  });

  it('renders null when idea has no explanationMeta', () => {
    const html = renderToString(<TradeExplanationPanel idea={{ id: 'x' }} />);
    expect(html).toBe('');
  });

  it('renders AI Reasoning header', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea()} />);
    expect(html).toContain('AI Reasoning');
  });

  it('displays outgoing and incoming scores', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ outgoingScore: 155, incomingScore: 200 })} />);
    expect(html).toContain('155');
    expect(html).toContain('200');
  });

  it('shows Favorable verdict for FAVORABLE', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ verdict: 'FAVORABLE' })} />);
    expect(html).toContain('Favorable for you');
  });

  it('shows Fair value verdict for FAIR', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ verdict: 'FAIR' })} />);
    expect(html).toContain('Fair value');
  });

  it('shows Needs more value verdict for NEEDS_MORE_VALUE', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ verdict: 'NEEDS_MORE_VALUE' })} />);
    expect(html).toContain('Needs more value');
  });

  it('shows Unfavorable verdict for UNFAVORABLE', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ verdict: 'UNFAVORABLE' })} />);
    expect(html).toContain('Unfavorable');
  });

  it('renders CONTENDER posture badge', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ posture: 'CONTENDER' })} />);
    expect(html).toContain('Contender');
  });

  it('renders REBUILDER posture badge', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ posture: 'REBUILDER' })} />);
    expect(html).toContain('Rebuilder');
  });

  it('renders NEUTRAL posture badge', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ posture: 'NEUTRAL' })} />);
    expect(html).toContain('Neutral');
  });

  it('renders pick decay rows when picks are present', () => {
    const decayedPicks = [
      { label: '2026 Round 1', round: 1, year: 2026, baseValue: 175, decayedValue: 161 },
    ];
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ decayedPicks })} />);
    expect(html).toContain('Pick Decay');
    expect(html).toContain('2026 Round 1');
    expect(html).toContain('175');
    expect(html).toContain('161');
    expect(html).toContain('decay');
  });

  it('does not render pick decay section when no picks', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ decayedPicks: [] })} />);
    expect(html).not.toContain('Pick Decay');
  });

  it('does not show decay percentage when baseValue is 0', () => {
    const decayedPicks = [{ label: 'R1', round: 1, year: 2026, baseValue: 0, decayedValue: 0 }];
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ decayedPicks })} />);
    expect(html).not.toContain('decay');
  });

  it('renders diminishing returns note when flag is true', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ diminishingReturnsApplied: true })} />);
    expect(html).toContain('diminishing returns');
  });

  it('does not render diminishing returns note when false', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ diminishingReturnsApplied: false })} />);
    expect(html).not.toContain('diminishing returns');
  });

  it('renders positional context when present', () => {
    const positionalContexts = [
      { pos: 'QB', needLevel: 'CRITICAL' },
      { pos: 'WR', needLevel: 'SECURE' },
    ];
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ positionalContexts })} />);
    expect(html).toContain('Their Positional Needs');
    expect(html).toContain('Their QB depth');
    expect(html).toContain('Critical need');
    expect(html).toContain('Their WR depth');
    expect(html).toContain('Secure depth');
  });

  it('does not render positional context section when null', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ positionalContexts: null })} />);
    expect(html).not.toContain('Their Positional Needs');
  });

  it('handles unknown need level gracefully', () => {
    const positionalContexts = [{ pos: 'K', needLevel: 'UNKNOWN' }];
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ positionalContexts })} />);
    expect(html).toContain('Their K depth');
    expect(html).toContain('Unknown');
  });

  it('handles missing posture gracefully by defaulting to Neutral', () => {
    const html = renderToString(<TradeExplanationPanel idea={makeIdea({ posture: undefined })} />);
    expect(html).toContain('Neutral');
  });

  it('does not mutate the idea prop', () => {
    const idea = makeIdea({ outgoingScore: 100 });
    const before = JSON.stringify(idea);
    renderToString(<TradeExplanationPanel idea={idea} />);
    expect(JSON.stringify(idea)).toBe(before);
  });
});
