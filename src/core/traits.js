// src/core/traits.js

export const TRAITS = {
  // Offensive Skill
  POCKET_PRESENCE: {
    id: 'POCKET_PRESENCE',
    name: 'Pocket Presence',
    description: 'Senses pressure effectively, reducing sack rate by 20%.',
    icon: '🛡️',
    positions: ['QB'],
    effects: { sackRate: 0.8 }
  },
  DEEP_THREAT: {
    id: 'DEEP_THREAT',
    name: 'Deep Threat',
    description: 'Excels at stretching the field, increasing yards per catch by 10%.',
    icon: '🚀',
    positions: ['WR'],
    effects: { ypc: 1.1, longest: 1.15 }
  },
  ROUTE_RUNNER: {
    id: 'ROUTE_RUNNER',
    name: 'Route Runner',
    description: 'Precise cuts lead to more separation and a 10% higher catch rate.',
    icon: '👣',
    positions: ['WR', 'TE'],
    effects: { catchRate: 1.1 }
  },
  WORKHORSE: {
    id: 'WORKHORSE',
    name: 'Workhorse',
    description: 'Built for heavy usage, reducing fatigue impact and fumbles by 30%.',
    icon: '🐂',
    positions: ['RB'],
    effects: { fumbleRate: 0.7, fatigue: 0.8 }
  },
  STONE_WALL: {
    id: 'STONE_WALL',
    name: 'Stone Wall',
    description: 'Elite pass protector, reducing sacks allowed by 25%.',
    icon: '🧱',
    positions: ['OL'],
    effects: { sackAllowedRate: 0.75 }
  },

  // Defensive Skill
  SPEED_RUSHER: {
    id: 'SPEED_RUSHER',
    name: 'Speed Rusher',
    description: 'Explosive first step increases sack rate by 20%.',
    icon: '⚡',
    positions: ['DL', 'LB'],
    effects: { sackRate: 1.2 }
  },
  BALLHAWK: {
    id: 'BALLHAWK',
    name: 'Ballhawk',
    description: 'Excellent instincts lead to a 25% higher interception rate.',
    icon: '🦅',
    positions: ['CB', 'S'],
    effects: { intRate: 1.25 }
  },
  RUN_STUFFER: {
    id: 'RUN_STUFFER',
    name: 'Run Stuffer',
    description: 'Sheds blocks easily to stop the run, increasing TFLs by 20%.',
    icon: '🛑',
    positions: ['DL', 'LB'],
    effects: { tflRate: 1.2 }
  },
  SHUTDOWN: {
    id: 'SHUTDOWN',
    name: 'Shutdown',
    description: 'Tight coverage reduces completions allowed by 10%.',
    icon: '🔒',
    positions: ['CB'],
    effects: { completionAllowed: 0.9 }
  },

  // Special Teams / General
  CLUTCH_KICKER: {
    id: 'CLUTCH_KICKER',
    name: 'Clutch Kicker',
    description: 'Nerves of steel increase accuracy by 10% in high-pressure situations.',
    icon: '❄️',
    positions: ['K'],
    effects: { accuracy: 1.1 }
  },
  IRONMAN: {
    id: 'IRONMAN',
    name: 'Ironman',
    description: 'Exceptionally durable, reducing injury probability by 50%.',
    icon: '🦾',
    positions: ['ALL'], // Applies to anyone
    effects: { injuryChance: 0.5 }
  },
  MENTOR: {
    id: 'MENTOR',
    name: 'Mentor',
    description: 'Veteran leadership boosts XP gain for younger players at the same position.',
    icon: '🎓',
    positions: ['ALL'],
    effects: { xpShare: 1.15 } // Not implemented in sim yet, but good for future
  }
};

/**
 * Get a random set of traits for a player based on their position and OVR.
 * @param {string} pos - Player position
 * @param {number} ovr - Player overall rating
 * @param {number} count - Number of traits to generate (optional, overrides logic)
 * @returns {Array} Array of trait IDs
 */
export function generateTraits(pos, ovr, count = null) {
  const allTraits = Object.values(TRAITS).filter(t =>
    t.positions.includes('ALL') || t.positions.includes(pos)
  );

  if (allTraits.length === 0) return [];

  // Determine count based on OVR if not provided
  let numTraits = 0;
  if (count !== null) {
    numTraits = count;
  } else {
    // Probability curve
    const rand = Math.random();
    if (ovr >= 90) {
      if (rand < 0.4) numTraits = 2;
      else if (rand < 0.8) numTraits = 1;
      else numTraits = 3; // 20% chance of 3
    } else if (ovr >= 80) {
      if (rand < 0.6) numTraits = 1;
      else if (rand < 0.9) numTraits = 2;
      else numTraits = 0;
    } else if (ovr >= 70) {
      if (rand < 0.3) numTraits = 1;
      else numTraits = 0;
    } else {
      if (rand < 0.05) numTraits = 1; // Rare for low OVR
    }
  }

  if (numTraits === 0) return [];

  // Shuffle and pick
  const shuffled = allTraits.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, numTraits).map(t => t.id);
}

export function getTrait(id) {
  return TRAITS[id];
}
