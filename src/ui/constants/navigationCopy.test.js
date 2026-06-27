import { describe, it, expect } from 'vitest';
import {
  PAGE_ORIENTATION,
  SECTION_SUBTITLES,
  TAB_DISPLAY_LABELS,
  HQ_NEXT_ACTIONS,
  getPageOrientation,
  getSectionSubtitle,
  getTabDisplayLabel,
  getNextActionLabel,
} from './navigationCopy.js';

// Pages that must carry honest "where am I / what is this for" orientation copy.
const KEY_PAGES = [
  'HQ',
  'Schedule',
  'Weekly Results',
  'Roster Hub',
  'Depth Chart',
  'Transactions',
  'Free Agency',
  'Stats',
  'Standings',
  'Draft',
  'History Hub',
  'Awards & Records',
  'Hall of Fame',
];

describe('navigation page orientation copy', () => {
  it('provides a clear title and subtitle for every key page', () => {
    for (const tab of KEY_PAGES) {
      const orientation = getPageOrientation(tab);
      expect(orientation, `missing orientation for ${tab}`).toBeTruthy();
      expect(typeof orientation.title).toBe('string');
      expect(orientation.title.length).toBeGreaterThan(0);
      expect(typeof orientation.subtitle).toBe('string');
      expect(orientation.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('returns null for unknown destinations rather than throwing', () => {
    expect(getPageOrientation('Not A Real Tab')).toBeNull();
    expect(getPageOrientation(undefined)).toBeNull();
  });

  it('keeps the orientation map frozen and self-consistent', () => {
    expect(Object.isFrozen(PAGE_ORIENTATION)).toBe(true);
    // The Trade Center page is oriented as a trade page, not a vague "transactions" bucket.
    expect(PAGE_ORIENTATION.Transactions.title.toLowerCase()).toContain('trade');
  });
});

describe('section subtitles', () => {
  it('describes the purpose of each primary nav section', () => {
    for (const section of ['hq', 'team', 'league', 'news']) {
      expect(getSectionSubtitle(section).length).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(SECTION_SUBTITLES)).toBe(true);
  });

  it('returns an empty string for unknown sections', () => {
    expect(getSectionSubtitle('nope')).toBe('');
  });
});

describe('tab display labels', () => {
  it('clarifies vague tab ids so the label matches the destination', () => {
    expect(getTabDisplayLabel('Transactions')).toBe('Trade');
    expect(getTabDisplayLabel('History Hub')).toBe('History');
    expect(getTabDisplayLabel('💰 Cap')).toBe('Salary Cap');
    expect(Object.isFrozen(TAB_DISPLAY_LABELS)).toBe(true);
  });

  it('passes through ids that already read clearly', () => {
    expect(getTabDisplayLabel('Standings')).toBe('Standings');
    expect(getTabDisplayLabel('Free Agency')).toBe('Free Agency');
  });
});

describe('HQ next-action cues', () => {
  it('phrases the weekly-loop quick links as verb-first actions', () => {
    expect(Object.isFrozen(HQ_NEXT_ACTIONS)).toBe(true);
    expect(getNextActionLabel('Weekly Results')).toMatch(/review/i);
    expect(getNextActionLabel('Roster Hub')).toMatch(/check roster/i);
    expect(getNextActionLabel('Depth Chart')).toMatch(/depth chart/i);
    expect(getNextActionLabel('Free Agency')).toMatch(/free agent/i);
    expect(getNextActionLabel('Transactions')).toMatch(/trade/i);
    expect(getNextActionLabel('Standings')).toMatch(/standings/i);
  });

  it('falls back to the display label for tabs without an action cue', () => {
    // No action cue defined -> reuse the clarified display label, not a raw id.
    expect(getNextActionLabel('History Hub')).toBe('History');
    expect(getNextActionLabel('Draft')).toBe('Draft');
  });

  it('only references tabs that also carry page orientation copy', () => {
    for (const tab of Object.keys(HQ_NEXT_ACTIONS)) {
      expect(getPageOrientation(tab), `missing orientation for HQ action ${tab}`).toBeTruthy();
    }
  });
});
