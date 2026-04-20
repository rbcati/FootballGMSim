import { describe, expect, it } from 'vitest';
import { buildNeedsAttentionItems, buildPrimaryAction, getDefaultExpandedSections } from './weeklyHubLayout.js';

describe('weeklyHubLayout helpers', () => {
  it('limits needs-attention list to max items and prioritizes blockers', () => {
    const items = buildNeedsAttentionItems({
      urgentItems: [
        { label: 'info one', level: 'recommendation', tone: 'info', rank: 40 },
        { label: 'blocker one', level: 'blocker', tone: 'warning', rank: 20 },
        { label: 'danger two', level: 'recommendation', tone: 'danger', rank: 90 },
        { label: 'warning three', level: 'recommendation', tone: 'warning', rank: 80 },
        { label: 'warning four', level: 'recommendation', tone: 'warning', rank: 70 },
        { label: 'info five', level: 'recommendation', tone: 'info', rank: 60 },
      ],
    }, { limit: 5 });

    expect(items).toHaveLength(5);
    expect(items[0].label).toBe('blocker one');
  });

  it('builds a navigate primary action from blocker items', () => {
    const action = buildPrimaryAction({
      topNeeds: [{ label: 'Bid Risk', detail: 'Offer may expire', level: 'blocker', tab: 'FA Hub' }],
    });

    expect(action.type).toBe('navigate');
    expect(action.cta).toBe('Resolve now');
    expect(action.tab).toBe('FA Hub');
  });

  it('keeps lower-priority sections collapsed by default', () => {
    const defaults = getDefaultExpandedSections();
    expect(defaults.frontOffice).toBe(false);
    expect(defaults.insights).toBe(false);
  });
});
