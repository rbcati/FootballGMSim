import { describe, it, expect } from 'vitest';
import {
  generateLeaguePulseItems,
  mergeLeaguePulseItems,
  buildLeaguePulseDedupeKey,
  rankLeaguePulseItems,
  PULSE_TYPES,
  PULSE_IMPORTANCE
} from '../leaguePulse.js';

describe('leaguePulse.js', () => {
  describe('buildLeaguePulseDedupeKey', () => {
    it('creates deterministic keys', () => {
      const item = { season: 1, week: 5, type: 'gameResult', relatedTeamId: '10', headline: 'Win' };
      const key1 = buildLeaguePulseDedupeKey(item);
      const key2 = buildLeaguePulseDedupeKey({ ...item, unrelated: true });
      expect(key1).toEqual(key2);
      expect(key1).toBe('1-5-gameResult-10-X-Win');
    });
  });

  describe('mergeLeaguePulseItems', () => {
    it('dedupes and prunes correctly', () => {
      const existing = [
        { dedupeKey: 'A', season: 1, week: 1, importance: 50 },
        { dedupeKey: 'B', season: 1, week: 2, importance: 50 }
      ];
      const newItems = [
        { dedupeKey: 'A', season: 1, week: 1, importance: 50 }, // Duplicate
        { dedupeKey: 'C', season: 1, week: 3, importance: 100 }
      ];

      const merged = mergeLeaguePulseItems(existing, newItems, { maxTimelineLength: 2 });

      expect(merged.length).toBe(2);
      expect(merged[0].dedupeKey).toBe('C'); // Week 3, highest priority
      expect(merged[1].dedupeKey).toBe('B'); // Week 2
      // 'A' was dropped due to limit of 2, despite dedupe working.
    });
  });

  describe('rankLeaguePulseItems', () => {
    it('prioritizes user team stories but respects critical league events', () => {
      const items = [
        { id: 1, importance: PULSE_IMPORTANCE.LOW, relatedTeamId: 'USER', season: 1, week: 1 }, // Score: 25 + 35 = 60
        { id: 2, importance: PULSE_IMPORTANCE.CRITICAL, relatedTeamId: 'AI', season: 1, week: 1 }, // Score: 100
        { id: 3, importance: PULSE_IMPORTANCE.HIGH, relatedTeamId: 'AI', season: 1, week: 1 }, // Score: 75
        { id: 4, importance: PULSE_IMPORTANCE.MEDIUM, relatedTeamId: 'USER', season: 1, week: 1 } // Score: 50 + 35 = 85
      ];

      const ranked = rankLeaguePulseItems(items, 'USER');
      expect(ranked[0].id).toBe(2); // CRITICAL league event
      expect(ranked[1].id).toBe(4); // MEDIUM user event (boosted)
      expect(ranked[2].id).toBe(3); // HIGH league event
      expect(ranked[3].id).toBe(1); // LOW user event
    });
  });

  describe('generateLeaguePulseItems', () => {
    it('handles empty data safely', () => {
      const meta = { userTeamId: '10' };
      const items = generateLeaguePulseItems(meta, {});
      expect(items).toEqual([]);
    });

    it('generates game result stories', () => {
      const meta = { season: 1, week: 3, userTeamId: '10' };
      const data = {
        games: [{ home: '10', away: '11', played: true, score: { home: 24, away: 10 } }]
      };
      const items = generateLeaguePulseItems(meta, data);
      expect(items.length).toBe(1);
      expect(items[0].headline).toBe('Statement Victory');
      expect(items[0].type).toBe(PULSE_TYPES.GAME_RESULT);
    });

    it('generates standings pressure stories', () => {
      const meta = { season: 1, week: 4, userTeamId: '10' };
      const data = {
        standings: [{ tid: '10', w: 0, l: 4 }]
      };
      const items = generateLeaguePulseItems(meta, data);
      expect(items.length).toBe(1);
      expect(items[0].headline).toBe('Winless Start');
    });
  });
});
