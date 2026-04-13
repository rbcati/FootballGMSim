import { describe, it, expect } from 'vitest';
import { formatPlaybookKnowledge } from '../FreeAgency.jsx';

describe('free agency playbook knowledge display', () => {
  it('formats label and score for UI rows/cards', () => {
    expect(formatPlaybookKnowledge({ label: 'High', score: 88 })).toBe('High (88)');
    expect(formatPlaybookKnowledge(null)).toBe('None (0)');
  });
});
