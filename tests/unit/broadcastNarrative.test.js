import { describe, it, expect } from 'vitest';
import {
  buildBroadcastGameNotes,
  buildAdvancedAttributionNotes,
  buildCultureBroadcastNotes,
  buildMomentumBroadcastNotes,
  rankBroadcastNotes,
  dedupeBroadcastNotes,
} from '../../src/core/broadcastNarrative.js';

describe('broadcastNarrative', () => {
  it('returns empty for missing data', () => {
    expect(buildBroadcastGameNotes(null)).toEqual([]);
    expect(buildAdvancedAttributionNotes(null)).toEqual([]);
  });

  it('creates sacks and drops notes', () => {
    const notes = buildAdvancedAttributionNotes({
      10: { sacksAllowed: 6, drops: 4 },
    }, { 10: { name: 'QB One' } });
    expect(notes.some((n) => /6 sacks/.test(n.text))).toBe(true);
    expect(notes.some((n) => /Drops stalled drives/.test(n.text))).toBe(true);
  });

  it('creates culture threshold notes', () => {
    expect(buildCultureBroadcastNotes({ previousScore: 60, newScore: 54, teamName: 'Test' }).length).toBe(1);
    expect(buildCultureBroadcastNotes({ previousScore: 84, newScore: 86, teamName: 'Test' }).length).toBe(1);
  });

  it('creates momentum note for lead-change-heavy games', () => {
    const notes = buildMomentumBroadcastNotes({ turningPoints: [{ type: 'lead_change' }, { type: 'lead_change' }] });
    expect(notes.length).toBe(1);
  });

  it('dedupes and ranks deterministically with max cap', () => {
    const notes = [
      { id: 'b', text: 'Same note', score: 50 },
      { id: 'a', text: 'same note', score: 90 },
      { id: 'c', text: 'Other note', score: 60 },
    ];
    const deduped = dedupeBroadcastNotes(notes);
    expect(deduped.length).toBe(2);
    const ranked = rankBroadcastNotes(deduped, { maxNotes: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].text.toLowerCase()).toContain('other note');
    const out1 = buildBroadcastGameNotes({ advancedAttribution: { 1: { sacksAllowed: 5 } }, gameFlowSummary: {} });
    const out2 = buildBroadcastGameNotes({ advancedAttribution: { 1: { sacksAllowed: 5 } }, gameFlowSummary: {} });
    expect(out1).toEqual(out2);
  });
});
