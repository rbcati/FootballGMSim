/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ReSignPriorityBadges from '../resign/ReSignPriorityBadges.jsx';

describe('ReSignPriorityBadges — tier labels', () => {
  afterEach(cleanup);

  const tiers = {
    priority_resign: 'Priority Re-sign',
    resign_if_price: 'Re-sign if price holds',
    trade_or_tag: 'Trade / Tag',
    let_walk: 'Let walk',
    replaceable_depth: 'Replaceable depth',
  };

  for (const [tier, label] of Object.entries(tiers)) {
    it(`renders a readable label for tier "${tier}"`, () => {
      const { getByTestId } = render(<ReSignPriorityBadges tier={tier} />);
      expect(getByTestId('resign-priority-badge-tier').textContent).toBe(label);
    });
  }
});

describe('ReSignPriorityBadges — urgency labels and tone classes', () => {
  afterEach(cleanup);

  it('maps high urgency to a readable label and high tone class', () => {
    const { getByTestId } = render(<ReSignPriorityBadges urgency="High" />);
    const el = getByTestId('resign-priority-badge-urgency');
    expect(el.textContent).toBe('High urgency');
    expect(el.className).toContain('resign-priority-badge--high');
  });

  it('maps medium urgency to a readable label and medium tone class', () => {
    const { getByTestId } = render(<ReSignPriorityBadges urgency="medium" />);
    const el = getByTestId('resign-priority-badge-urgency');
    expect(el.textContent).toBe('Mid urgency');
    expect(el.className).toContain('resign-priority-badge--medium');
  });

  it('maps low urgency to a readable label and low tone class', () => {
    const { getByTestId } = render(<ReSignPriorityBadges urgency="Low" />);
    const el = getByTestId('resign-priority-badge-urgency');
    expect(el.textContent).toBe('Low urgency');
    expect(el.className).toContain('resign-priority-badge--low');
  });
});

describe('ReSignPriorityBadges — risk labels and tone classes', () => {
  afterEach(cleanup);

  it('maps high risk to a readable label and high tone class', () => {
    const { getByTestId } = render(<ReSignPriorityBadges risk="High" />);
    const el = getByTestId('resign-priority-badge-risk');
    expect(el.textContent).toBe('High risk');
    expect(el.className).toContain('resign-priority-badge--high');
  });

  it('maps medium risk to a readable label and medium tone class', () => {
    const { getByTestId } = render(<ReSignPriorityBadges risk="Medium" />);
    const el = getByTestId('resign-priority-badge-risk');
    expect(el.textContent).toBe('Med risk');
    expect(el.className).toContain('resign-priority-badge--medium');
  });

  it('maps low risk to a readable label and low tone class', () => {
    const { getByTestId } = render(<ReSignPriorityBadges risk="Low" />);
    const el = getByTestId('resign-priority-badge-risk');
    expect(el.textContent).toBe('Low risk');
    expect(el.className).toContain('resign-priority-badge--low');
  });
});

describe('ReSignPriorityBadges — replacement difficulty labels', () => {
  afterEach(cleanup);

  it('maps high difficulty to "Hard to replace"', () => {
    const { getByTestId } = render(<ReSignPriorityBadges replacementDifficulty="High" />);
    expect(getByTestId('resign-priority-badge-replacement').textContent).toBe('Hard to replace');
  });

  it('maps medium difficulty to "Replaceable"', () => {
    const { getByTestId } = render(<ReSignPriorityBadges replacementDifficulty="Medium" />);
    expect(getByTestId('resign-priority-badge-replacement').textContent).toBe('Replaceable');
  });

  it('maps low difficulty to "Easy to replace"', () => {
    const { getByTestId } = render(<ReSignPriorityBadges replacementDifficulty="Low" />);
    expect(getByTestId('resign-priority-badge-replacement').textContent).toBe('Easy to replace');
  });
});

describe('ReSignPriorityBadges — fallback safety', () => {
  afterEach(cleanup);

  it('falls back safely when all props are missing', () => {
    const { getByTestId, container } = render(<ReSignPriorityBadges />);
    expect(getByTestId('resign-priority-badges')).toBeTruthy();
    expect(getByTestId('resign-priority-badge-tier').textContent).toBe('Unrated');
    expect(getByTestId('resign-priority-badge-urgency').className).toContain('resign-priority-badge--muted');
    expect(container.textContent).not.toMatch(/undefined|null/);
  });

  it('falls back safely for an unrecognized tier/level without exposing raw values', () => {
    const { getByTestId, container } = render(
      <ReSignPriorityBadges tier="mystery_tier" urgency="weird" risk="weird" replacementDifficulty="weird" />,
    );
    expect(getByTestId('resign-priority-badge-tier').textContent).toBe('Unrated');
    expect(container.textContent).not.toMatch(/mystery_tier|weird/);
  });

  it('never renders raw enum values in the DOM for any known tier', () => {
    const tiers = ['priority_resign', 'resign_if_price', 'trade_or_tag', 'let_walk', 'replaceable_depth'];
    for (const tier of tiers) {
      const { container, unmount } = render(<ReSignPriorityBadges tier={tier} urgency="high" risk="medium" replacementDifficulty="low" />);
      expect(container.textContent).not.toMatch(/priority_resign|resign_if_price|trade_or_tag|let_walk|replaceable_depth/);
      unmount();
    }
  });
});

describe('ReSignPriorityBadges — compact mode', () => {
  afterEach(cleanup);

  it('applies the compact modifier class and still renders all badge chips', () => {
    const { getByTestId } = render(
      <ReSignPriorityBadges tier="priority_resign" urgency="high" risk="low" replacementDifficulty="medium" compact />,
    );
    const root = getByTestId('resign-priority-badges');
    expect(root.className).toContain('resign-priority-badges--compact');
    expect(getByTestId('resign-priority-badge-tier')).toBeTruthy();
    expect(getByTestId('resign-priority-badge-urgency')).toBeTruthy();
    expect(getByTestId('resign-priority-badge-risk')).toBeTruthy();
    expect(getByTestId('resign-priority-badge-replacement')).toBeTruthy();
  });
});

describe('ReSignPriorityBadges — no inline styles', () => {
  afterEach(cleanup);

  it('has no inline style attributes on the root or any badge element', () => {
    const { getByTestId } = render(
      <ReSignPriorityBadges
        tier="priority_resign"
        urgency="high"
        risk="medium"
        replacementDifficulty="low"
        shortReason="Priority Re-sign: core player worth protecting"
      />,
    );
    const root = getByTestId('resign-priority-badges');
    expect(root.getAttribute('style')).toBeNull();
    for (const el of root.querySelectorAll('*')) {
      expect(el.getAttribute('style')).toBeNull();
    }
  });
});
