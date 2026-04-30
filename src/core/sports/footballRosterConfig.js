export const SPORT = 'football';
export const FOOTBALL_ROSTER_CONFIG = {
  sport: SPORT,
  positionGroups: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'],
  groupConfig: {
    QB: { label: 'Quarterbacks', starterCountExpected: 1, depthSlots: 2, weights: { starter: 0.65, depth: 0.2, age: 0.05, injury: 0.05, scheme: 0.05 }, priority: 1.2 },
    RB: { label: 'Running Backs', starterCountExpected: 1, depthSlots: 3, weights: { starter: 0.35, depth: 0.35, age: 0.15, injury: 0.1, scheme: 0.05 }, priority: 0.95, ageThreshold: 27 },
    WR: { label: 'Wide Receivers', starterCountExpected: 3, depthSlots: 5, weights: { starter: 0.45, depth: 0.35, age: 0.05, injury: 0.1, scheme: 0.05 }, priority: 1.05 },
    TE: { label: 'Tight Ends', starterCountExpected: 1, depthSlots: 2, weights: { starter: 0.45, depth: 0.35, age: 0.05, injury: 0.1, scheme: 0.05 }, priority: 0.9 },
    OL: { label: 'Offensive Line', starterCountExpected: 5, depthSlots: 7, weights: { starter: 0.4, depth: 0.35, age: 0.08, injury: 0.1, scheme: 0.07 }, priority: 1.15 },
    DL: { label: 'Defensive Line', starterCountExpected: 4, depthSlots: 6, weights: { starter: 0.45, depth: 0.3, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1 },
    LB: { label: 'Linebackers', starterCountExpected: 3, depthSlots: 5, weights: { starter: 0.45, depth: 0.3, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1 },
    CB: { label: 'Cornerbacks', starterCountExpected: 3, depthSlots: 5, weights: { starter: 0.45, depth: 0.3, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1.05 },
    S: { label: 'Safeties', starterCountExpected: 2, depthSlots: 4, weights: { starter: 0.5, depth: 0.25, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1 },
    K: { label: 'Kickers', starterCountExpected: 1, depthSlots: 1, weights: { starter: 0.8, depth: 0.05, age: 0.05, injury: 0.05, scheme: 0.05 }, priority: 0.5 },
    P: { label: 'Punters', starterCountExpected: 1, depthSlots: 1, weights: { starter: 0.8, depth: 0.05, age: 0.05, injury: 0.05, scheme: 0.05 }, priority: 0.5 },
  },
  ageRiskThresholds: { default: 28, RB: 27 },
  coreGroups: ['QB', 'OL', 'DL', 'LB', 'CB', 'S', 'WR'],
  lowPriorityGroups: ['K', 'P'],
};
