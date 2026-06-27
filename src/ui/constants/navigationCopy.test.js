import { describe, it, expect } from 'vitest';
import {
  PAGE_ORIENTATION,
  SECTION_SUBTITLES,
  TAB_DISPLAY_LABELS,
  getPageOrientation,
  getSectionSubtitle,
  getTabDisplayLabel,
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
