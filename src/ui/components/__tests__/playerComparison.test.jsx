import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PlayerComparison, { buildComparisonViewModel } from '../PlayerComparison.jsx';

const playerA = {
  id: 1,
  name: 'A QB',
  pos: 'QB',
  ovr: 83,
  age: 26,
  contract: { baseAnnual: 21, yearsRemaining: 3 },
  ratings: { throwAccuracy: 84, throwPower: 82, awareness: 79 },
};
const playerB = {
  id: 2,
  name: 'B QB',
  pos: 'QB',
  ovr: 79,
  age: 30,
  contract: { baseAnnual: 17, yearsRemaining: 2 },
  ratings: { throwAccuracy: 78, throwPower: 80, awareness: 75 },
};

describe('PlayerComparison evaluation rendering', () => {
  it('builds tactical comparison model', () => {
    const model = buildComparisonViewModel(playerA, playerB);
    expect(model.evalA.archetype.archetype).toBeTruthy();
    expect(model.groupedRows.length).toBeGreaterThan(0);
  });

  it('renders tactical sections in markup', () => {
    const html = renderToStaticMarkup(<PlayerComparison playerA={playerA} playerB={playerB} onClose={() => {}} />);
    expect(html).toContain('Tactical Comparison');
    expect(html).toContain('Attribute Buckets');
  });
});
