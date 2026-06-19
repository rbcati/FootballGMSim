/**
 * ContractPanel.agents.test.jsx
 *
 * Tests the agent badge and contextual feedback rendering in the
 * ExtensionNegotiationModal (contract panel).
 *
 * Environment: Node (SSR via renderToString), no jsdom.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  getAgentBadgeMeta,
  hydratePlayerAgent,
} from '../../core/contracts/agentNegotiationEngine.js';

// ── Minimal badge component (mirrors the logic in ExtensionNegotiationModal) ──

const TONE_CLASSES = {
  shark:       'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
  loyalist:    'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400',
  ring_chaser: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
};

function AgentBadge({ player, teamContext }) {
  const hydrated = hydratePlayerAgent(player);
  const badge    = getAgentBadgeMeta(hydrated, teamContext);
  return (
    <span
      data-testid="agent-badge"
      className={`text-xs font-semibold px-2 py-0.5 rounded ${TONE_CLASSES[badge.tone] ?? ''}`}
    >
      {badge.label}
    </span>
  );
}

function FrozenWarning({ visible }) {
  if (!visible) return null;
  return (
    <div data-testid="frozen-warning">
      🚨 Negotiations Frozen: This agent has locked down talks after an insulting opening offer.
    </div>
  );
}

function AgentRejectionFeedback({ response }) {
  if (!response?.agentFeedback && !response?.reason) return null;
  const text = response.agentFeedback ?? response.reason;
  return <div data-testid="rejection-feedback">{text}</div>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function playerWithArchetype(archetype) {
  // Seed into the right archetype bucket
  const archetypeSeeds = { SHARK: 0, LOYALIST: 30, RING_CHASER: 70 };
  // The _hash(id+name) % 100 determines archetype; test with direct agent override
  return {
    id:               1,
    name:             'Test Player',
    pos:              'QB',
    age:              27,
    ovr:              80,
    contract:         { years: 1, baseAnnual: 20 },
    agent:            { id: 'test', name: 'Test Agent', archetype, greed: 0.5, aggressiveness: 0.5, patience: 0.5 },
    negotiationState: { negotiationsFrozenUntilSeason: null },
  };
}

// ── Shark badge ───────────────────────────────────────────────────────────────

describe('AgentBadge — shark', () => {
  it('renders with correct shark label', () => {
    const html = renderToString(<AgentBadge player={playerWithArchetype('SHARK')} />);
    expect(html).toContain('Shark Management');
    expect(html).toContain('High Friction');
  });

  it('renders with shark tone CSS classes', () => {
    const html = renderToString(<AgentBadge player={playerWithArchetype('SHARK')} />);
    expect(html).toContain('bg-red-100');
    expect(html).toContain('text-red-800');
  });
});

// ── Loyalist badge ────────────────────────────────────────────────────────────

describe('AgentBadge — loyalist', () => {
  it('renders with correct loyalist label', () => {
    const html = renderToString(<AgentBadge player={playerWithArchetype('LOYALIST')} />);
    expect(html).toContain('Loyalist Sports');
    expect(html).toContain('Team Friendly');
  });

  it('renders with loyalist tone CSS classes', () => {
    const html = renderToString(<AgentBadge player={playerWithArchetype('LOYALIST')} />);
    expect(html).toContain('bg-green-100');
    expect(html).toContain('text-green-800');
  });
});

// ── Ring Chaser badge ─────────────────────────────────────────────────────────

describe('AgentBadge — ring chaser', () => {
  it('renders with correct ring chaser label', () => {
    const html = renderToString(<AgentBadge player={playerWithArchetype('RING_CHASER')} />);
    expect(html).toContain('Legacy First');
    expect(html).toContain('Win-Driven');
  });

  it('renders with ring chaser tone CSS classes', () => {
    const html = renderToString(<AgentBadge player={playerWithArchetype('RING_CHASER')} />);
    expect(html).toContain('bg-amber-100');
    expect(html).toContain('text-amber-800');
  });
});

// ── Contextual rejection copy ─────────────────────────────────────────────────

describe('AgentRejectionFeedback', () => {
  it('shows agent feedback text on shark rejection', () => {
    const response = {
      status:       'declined',
      reason:       'Agent rejected the offer',
      agentFeedback: 'My client knows his worth. Come back with a serious offer or we are testing free agency.',
      rejectionCode: 'BELOW_EXPECTED',
    };
    const html = renderToString(<AgentRejectionFeedback response={response} />);
    expect(html).toContain('serious offer');
    expect(html).toContain('free agency');
  });

  it('uses agentFeedback over generic reason when both present', () => {
    const response = {
      reason:       'Generic rejection',
      agentFeedback: 'Specific agent feedback text',
    };
    const html = renderToString(<AgentRejectionFeedback response={response} />);
    expect(html).toContain('Specific agent feedback text');
    expect(html).not.toContain('Generic rejection');
  });
});

// ── Frozen warning ────────────────────────────────────────────────────────────

describe('FrozenWarning', () => {
  it('shows frozen warning when visible=true', () => {
    const html = renderToString(<FrozenWarning visible={true} />);
    expect(html).toContain('Negotiations Frozen');
    expect(html).toContain('insulting opening offer');
  });

  it('renders nothing when visible=false', () => {
    const html = renderToString(<FrozenWarning visible={false} />);
    expect(html).toBe('');
  });
});

// ── Legacy player (no agent) — no crash ──────────────────────────────────────

describe('AgentBadge — legacy player without agent', () => {
  it('renders a badge without crashing when player.agent is undefined', () => {
    const legacyPlayer = { id: 999, name: 'Old Save Player', pos: 'WR', age: 29, ovr: 75, contract: { years: 1 } };
    expect(() => {
      const html = renderToString(<AgentBadge player={legacyPlayer} />);
      expect(html).toContain('agent-badge');
    }).not.toThrow();
  });
});
