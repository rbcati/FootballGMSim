import { describe, it, expect } from 'vitest';
import {
  buildBroadcastGameNotes,
  buildAdvancedAttributionNotes,
  buildCultureBroadcastNotes,
  buildMomentumBroadcastNotes,
  rankBroadcastNotes,
  dedupeBroadcastNotes,
  buildRecentCultureEvents,
  normalizeCultureNarrativeItems,
  selectCultureAlerts,
} from '../../src/core/broadcastNarrative.js';

// ── Existing broadcastNarrative tests ──────────────────────────────────────────

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

// ── buildCultureBroadcastNotes: threshold language and PFF guard ───────────────

describe('buildCultureBroadcastNotes', () => {
  it('generates a note when score crosses below 55', () => {
    const notes = buildCultureBroadcastNotes({ previousScore: 60, newScore: 54, teamName: 'Steel City' });
    expect(notes).toHaveLength(1);
    expect(notes[0].category).toBe('culture');
  });

  it('generates a note when score crosses above 85', () => {
    const notes = buildCultureBroadcastNotes({ previousScore: 84, newScore: 87, teamName: 'Steel City' });
    expect(notes).toHaveLength(1);
    expect(notes[0].category).toBe('culture');
  });

  it('generates no note for stable neutral culture (score stays between 55–85)', () => {
    expect(buildCultureBroadcastNotes({ previousScore: 70, newScore: 71, teamName: 'Test FC' })).toEqual([]);
    expect(buildCultureBroadcastNotes({ previousScore: 70, newScore: 70, teamName: 'Test FC' })).toEqual([]);
    expect(buildCultureBroadcastNotes({ previousScore: 60, newScore: 65, teamName: 'Test FC' })).toEqual([]);
  });

  it('generates no note for null or invalid inputs', () => {
    expect(buildCultureBroadcastNotes(null)).toEqual([]);
    expect(buildCultureBroadcastNotes({})).toEqual([]);
    expect(buildCultureBroadcastNotes({ previousScore: 'bad', newScore: 54 })).toEqual([]);
  });

  it('below-55 note contains no PFF grade language', () => {
    const notes = buildCultureBroadcastNotes({ previousScore: 60, newScore: 54, teamName: 'Test FC' });
    const text = notes.map((n) => n.text).join(' ');
    expect(/pff/i.test(text)).toBe(false);
    expect(/\bgrade\b/i.test(text)).toBe(false);
  });

  it('above-85 note contains no PFF grade language', () => {
    const notes = buildCultureBroadcastNotes({ previousScore: 84, newScore: 86, teamName: 'Test FC' });
    const text = notes.map((n) => n.text).join(' ');
    expect(/pff/i.test(text)).toBe(false);
    expect(/\bgrade\b/i.test(text)).toBe(false);
  });
});

// ── buildAdvancedAttributionNotes: tracked stats only ────────────────────────

describe('buildAdvancedAttributionNotes tracked stats', () => {
  it('attribution text references only actual tracked stats (sacks, drops)', () => {
    const notes = buildAdvancedAttributionNotes(
      { 10: { sacksAllowed: 6, drops: 4 } },
      { 10: { name: 'QB One' } },
    );
    const text = notes.map((n) => n.text).join(' ');
    expect(/\d+ sacks/.test(text)).toBe(true);
    expect(/\d+ recorded drops/.test(text)).toBe(true);
    expect(/pff/i.test(text)).toBe(false);
    expect(/\bgrade\b/i.test(text)).toBe(false);
  });

  it('does not emit pressure note without sacks data', () => {
    const notes = buildAdvancedAttributionNotes({ 10: { drops: 2 } }, {});
    const text = notes.map((n) => n.text).join(' ');
    expect(/pressure/i.test(text)).toBe(false);
  });
});

// ── buildRecentCultureEvents ──────────────────────────────────────────────────

describe('buildRecentCultureEvents', () => {
  it('returns empty array for null teamCulture', () => {
    expect(buildRecentCultureEvents(null, 1, [])).toEqual([]);
  });

  it('returns empty array for null teamId', () => {
    expect(buildRecentCultureEvents({ '1': { score: 70 } }, null, [])).toEqual([]);
  });

  it('returns empty array when no culture newsItems exist', () => {
    const result = buildRecentCultureEvents({ '1': { score: 70 } }, 1, []);
    expect(result).toEqual([]);
  });

  it('safe for legacy saves with null/undefined newsItems', () => {
    expect(() => buildRecentCultureEvents({ '1': { score: 70 } }, 1, null)).not.toThrow();
    expect(buildRecentCultureEvents({ '1': { score: 70 } }, 1, null)).toEqual([]);
    expect(buildRecentCultureEvents({ '1': { score: 70 } }, 1, undefined)).toEqual([]);
  });

  it('filters to CULTURE type items for the given team only', () => {
    const items = [
      { id: 'c1', type: 'CULTURE', teamId: 1, season: 1, week: 3, headline: 'Team A culture news' },
      { id: 'c2', type: 'CULTURE', teamId: 2, season: 1, week: 3, headline: 'Team B culture news' },
      { id: 'i1', type: 'INJURY', teamId: 1, season: 1, week: 3, headline: 'Injury news' },
    ];
    const result = buildRecentCultureEvents({ '1': { score: 70 } }, 1, items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  it('sorts by season desc, week desc for deterministic order', () => {
    const items = [
      { id: 'c1', type: 'CULTURE', teamId: 1, season: 1, week: 3 },
      { id: 'c2', type: 'CULTURE', teamId: 1, season: 1, week: 5 },
      { id: 'c3', type: 'CULTURE', teamId: 1, season: 2, week: 1 },
    ];
    const result = buildRecentCultureEvents({ '1': { score: 70 } }, 1, items);
    expect(result[0].id).toBe('c3');
    expect(result[1].id).toBe('c2');
    expect(result[2].id).toBe('c1');
  });

  it('returns max 3 items', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      type: 'CULTURE',
      teamId: 1,
      season: 1,
      week: i + 1,
    }));
    const result = buildRecentCultureEvents({ '1': { score: 70 } }, 1, items);
    expect(result).toHaveLength(3);
  });

  it('is deterministic: same inputs produce same output', () => {
    const items = [
      { id: 'c2', type: 'CULTURE', teamId: 1, season: 1, week: 5 },
      { id: 'c1', type: 'CULTURE', teamId: 1, season: 1, week: 3 },
    ];
    const run1 = buildRecentCultureEvents({ '1': { score: 70 } }, 1, items);
    const run2 = buildRecentCultureEvents({ '1': { score: 70 } }, 1, items);
    expect(run1).toEqual(run2);
  });
});

// ── normalizeCultureNarrativeItems ────────────────────────────────────────────

describe('normalizeCultureNarrativeItems', () => {
  it('returns empty array for non-array inputs', () => {
    expect(normalizeCultureNarrativeItems(null)).toEqual([]);
    expect(normalizeCultureNarrativeItems(undefined)).toEqual([]);
    expect(normalizeCultureNarrativeItems('not-array')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeCultureNarrativeItems([])).toEqual([]);
  });

  it('dedupes items by id', () => {
    const items = [
      { id: 'a', headline: 'Event A', season: 1, week: 2 },
      { id: 'a', headline: 'Event A dup', season: 1, week: 3 },
      { id: 'b', headline: 'Event B', season: 1, week: 1 },
    ];
    const result = normalizeCultureNarrativeItems(items);
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('sorts by season desc, week desc, id asc (deterministic)', () => {
    const items = [
      { id: 'b', headline: 'B', season: 1, week: 1 },
      { id: 'a', headline: 'A', season: 1, week: 1 },
      { id: 'c', headline: 'C', season: 2, week: 1 },
    ];
    const result = normalizeCultureNarrativeItems(items);
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('a');
    expect(result[2].id).toBe('b');
  });

  it('is deterministic: same inputs produce same output', () => {
    const items = [
      { id: 'z', headline: 'Z', season: 1, week: 3 },
      { id: 'a', headline: 'A', season: 2, week: 1 },
      { id: 'm', headline: 'M', season: 1, week: 5 },
    ];
    expect(normalizeCultureNarrativeItems(items)).toEqual(normalizeCultureNarrativeItems(items));
  });

  it('skips null items safely', () => {
    const items = [null, { id: 'a', headline: 'Good', season: 1, week: 1 }, null];
    const result = normalizeCultureNarrativeItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });
});

// ── selectCultureAlerts ───────────────────────────────────────────────────────

describe('selectCultureAlerts', () => {
  it('returns empty for non-array input', () => {
    expect(selectCultureAlerts(null)).toEqual([]);
    expect(selectCultureAlerts(undefined)).toEqual([]);
  });

  it('returns empty for empty alerts', () => {
    expect(selectCultureAlerts([])).toEqual([]);
  });

  it('enforces max 3 league-wide culture headlines per week by default', () => {
    const alerts = Array.from({ length: 8 }, (_, i) => ({
      teamId: String(i + 1),
      isThreshold: false,
    }));
    expect(selectCultureAlerts(alerts)).toHaveLength(3);
  });

  it('respects custom maxAlerts', () => {
    const alerts = Array.from({ length: 5 }, (_, i) => ({ teamId: String(i), isThreshold: false }));
    expect(selectCultureAlerts(alerts, 2)).toHaveLength(2);
    expect(selectCultureAlerts(alerts, 0)).toHaveLength(0);
  });

  it('threshold crossings sort before large-shift-only alerts', () => {
    const alerts = [
      { teamId: '10', isThreshold: false },
      { teamId: '3', isThreshold: true },
      { teamId: '7', isThreshold: false },
      { teamId: '1', isThreshold: true },
    ];
    const result = selectCultureAlerts(alerts, 4);
    expect(result[0].isThreshold).toBe(true);
    expect(result[1].isThreshold).toBe(true);
    expect(result[2].isThreshold).toBe(false);
    expect(result[3].isThreshold).toBe(false);
  });

  it('ties broken deterministically by teamId string sort', () => {
    const alerts = [
      { teamId: '5', isThreshold: true },
      { teamId: '2', isThreshold: true },
      { teamId: '8', isThreshold: true },
    ];
    const result = selectCultureAlerts(alerts, 3);
    expect(result.map((a) => a.teamId)).toEqual(['2', '5', '8']);
  });

  it('is deterministic: same inputs produce same output', () => {
    const alerts = [
      { teamId: 'z', isThreshold: false },
      { teamId: 'a', isThreshold: true },
      { teamId: 'm', isThreshold: false },
      { teamId: 'b', isThreshold: true },
    ];
    expect(selectCultureAlerts(alerts, 3)).toEqual(selectCultureAlerts(alerts, 3));
  });
});
