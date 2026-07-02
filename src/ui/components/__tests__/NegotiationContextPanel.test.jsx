/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import NegotiationContextPanel from '../contracts/NegotiationContextPanel.jsx';

/**
 * NegotiationContextPanel — display-only Scouting Intel panel.
 *
 * Presentational checks only: labels, tone classes, null-safety. No contract
 * economics, acceptance, or cap logic is exercised here.
 */

function fullPriorityContext(overrides = {}) {
  return {
    recommendationTier: 'priority_resign',
    shortReason: 'Priority Re-sign: productive starter at a thin position',
    urgencyLevel: 'high',
    negotiationRisk: 'medium',
    likelyReplacementDifficulty: 'high',
    profileHeadline: 'Money-focused',
    ...overrides,
  };
}

describe('NegotiationContextPanel — rendering', () => {
  afterEach(cleanup);

  it('renders the panel when a valid priorityContext is provided', () => {
    const { getByTestId, getByText } = render(
      <NegotiationContextPanel priorityContext={fullPriorityContext()} />,
    );
    expect(getByTestId('negotiation-context-panel')).toBeTruthy();
    expect(getByText('Scouting Intel')).toBeTruthy();
    expect(getByText('Money-focused')).toBeTruthy();
    expect(getByText('Priority Re-sign: productive starter at a thin position')).toBeTruthy();
  });

  it('returns null when both props are null', () => {
    const { container } = render(
      <NegotiationContextPanel priorityContext={null} decisionTiming={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders readable labels — raw enum values never appear in the DOM', () => {
    const tiers = ['priority_resign', 'resign_if_price', 'trade_or_tag', 'let_walk', 'replaceable_depth'];
    const expected = {
      priority_resign: 'Priority Re-sign',
      resign_if_price: 'Re-sign if price is right',
      trade_or_tag: 'Trade or tag candidate',
      let_walk: 'Let walk candidate',
      replaceable_depth: 'Replaceable depth',
    };
    for (const tier of tiers) {
      const { container, getByText, unmount } = render(
        <NegotiationContextPanel priorityContext={fullPriorityContext({ recommendationTier: tier, shortReason: '' })} />,
      );
      expect(getByText(expected[tier])).toBeTruthy();
      expect(container.textContent).not.toMatch(/priority_resign|resign_if_price|trade_or_tag|let_walk|replaceable_depth/);
      unmount();
    }
  });
});

describe('NegotiationContextPanel — urgency tone classes', () => {
  afterEach(cleanup);

  it('applies the high tone class when urgency is high', () => {
    const { getByTestId } = render(
      <NegotiationContextPanel priorityContext={fullPriorityContext({ urgencyLevel: 'high' })} />,
    );
    expect(getByTestId('negotiation-context-urgency').className).toContain('neg-context-value--high');
  });

  it('applies the low tone class when urgency is low', () => {
    const { getByTestId } = render(
      <NegotiationContextPanel priorityContext={fullPriorityContext({ urgencyLevel: 'low' })} />,
    );
    expect(getByTestId('negotiation-context-urgency').className).toContain('neg-context-value--low');
  });
});

describe('NegotiationContextPanel — decision timing row', () => {
  afterEach(cleanup);

  it('shows "Decision imminent" when patienceWeeks is 0', () => {
    const { getByTestId } = render(
      <NegotiationContextPanel decisionTiming={{ patienceWeeks: 0 }} />,
    );
    const decision = getByTestId('negotiation-context-decision');
    expect(decision.textContent).toBe('Decision imminent');
    expect(decision.className).toContain('neg-context-value--high');
  });

  it('shows "1 week left" when patienceWeeks is 1', () => {
    const { getByTestId } = render(
      <NegotiationContextPanel decisionTiming={{ patienceWeeks: 1 }} />,
    );
    const decision = getByTestId('negotiation-context-decision');
    expect(decision.textContent).toBe('1 week left');
    expect(decision.className).toContain('neg-context-value--medium');
  });

  it('shows "${n} weeks" when patienceWeeks is 2 or more', () => {
    const { getByTestId } = render(
      <NegotiationContextPanel decisionTiming={{ patienceWeeks: 3 }} />,
    );
    const decision = getByTestId('negotiation-context-decision');
    expect(decision.textContent).toBe('3 weeks');
    expect(decision.className).toContain('neg-context-value--low');
  });

  it('omits the decision row when patienceWeeks is missing', () => {
    const { queryByTestId } = render(
      <NegotiationContextPanel priorityContext={fullPriorityContext()} decisionTiming={{}} />,
    );
    expect(queryByTestId('negotiation-context-decision')).toBeNull();
  });
});

describe('NegotiationContextPanel — resilience', () => {
  afterEach(cleanup);

  it('does not crash when optional fields are missing', () => {
    const { getByTestId } = render(
      <NegotiationContextPanel priorityContext={{ urgencyLevel: 'medium' }} />,
    );
    const panel = getByTestId('negotiation-context-panel');
    expect(panel).toBeTruthy();
    expect(getByTestId('negotiation-context-urgency').textContent).toBe('Medium');
  });

  it('tolerates unknown enum values without exposing them as tier labels', () => {
    const { getByTestId, queryByText } = render(
      <NegotiationContextPanel
        priorityContext={fullPriorityContext({ recommendationTier: 'mystery_tier', urgencyLevel: 'weird' })}
      />,
    );
    expect(getByTestId('negotiation-context-panel')).toBeTruthy();
    expect(queryByText('mystery_tier')).toBeNull();
  });

  it('has no inline styles on the panel root', () => {
    const { getByTestId } = render(
      <NegotiationContextPanel priorityContext={fullPriorityContext()} />,
    );
    expect(getByTestId('negotiation-context-panel').getAttribute('style')).toBeNull();
  });
});
