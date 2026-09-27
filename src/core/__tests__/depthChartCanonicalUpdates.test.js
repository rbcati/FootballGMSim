import { describe, expect, it } from 'vitest';
import { buildCanonicalDepthUpdates } from '../depthChart.js';

const player = (id, pos, rowKey) => ({ id, pos, depthChart: { rowKey, order: 1 } });

describe('buildCanonicalDepthUpdates', () => {
  it('preserves canonical rows inside composite presentation groups', () => {
    const roster = [
      player(1, 'DE', 'EDGE'), player(2, 'DT', 'IDL'),
      player(3, 'CB', 'CB'), player(4, 'FS', 'S'),
      player(5, 'K', 'K'), player(6, 'P', 'P'),
      player(7, 'QB', 'QB'), player(8, 'WR', 'WR'), player(9, 'LT', 'OL'),
    ];
    const updates = buildCanonicalDepthUpdates({
      DL: [2, 1], DB: [4, 3], ST: [6, 5], QB: [7], WR: [8], OL: [9],
    }, roster);
    expect(new Set(updates.map((update) => update.rowKey))).toEqual(new Set(['EDGE', 'IDL', 'CB', 'S', 'K', 'P', 'QB', 'WR', 'OL']));
    expect(updates.map((update) => update.rowKey)).not.toEqual(expect.arrayContaining(['DL', 'DB', 'ST']));
  });
});
