import { describe, expect, it } from 'vitest';
import { getDisplayableNotifications, getNotificationMessage } from './notificationsDisplay.js';

describe('notificationsDisplay', () => {
  it('keeps notifications that have a real message', () => {
    const list = [
      { id: 'a', message: 'Week 3 complete' },
      { id: 'b', text: 'Injury update' },
    ];
    expect(getDisplayableNotifications(list)).toHaveLength(2);
  });

  it('drops notifications with empty or whitespace-only content (no blank dismissible pill)', () => {
    const list = [
      { id: 'a', message: 'Real message' },
      { id: 'b', message: '' },
      { id: 'c', message: '   ' },
      { id: 'd' },
      { id: 'e', text: null },
    ];
    const result = getDisplayableNotifications(list);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('is safe for non-array input', () => {
    expect(getDisplayableNotifications(null)).toEqual([]);
    expect(getDisplayableNotifications(undefined)).toEqual([]);
  });

  it('normalizes message resolution across message/text fields', () => {
    expect(getNotificationMessage({ message: 'hi' })).toBe('hi');
    expect(getNotificationMessage({ text: 'yo' })).toBe('yo');
    expect(getNotificationMessage({})).toBe('');
    expect(getNotificationMessage(null)).toBe('');
  });
});
