import { ensureLeagueMemoryMeta } from './league-memory.js';

export const ensureDynastyMeta = (meta) => ensureLeagueMemoryMeta({
  ...meta,
  newsItems: Array.isArray(meta?.newsItems) ? meta.newsItems : [],
  socialFeedEntries: Array.isArray(meta?.socialFeedEntries) ? meta.socialFeedEntries : [],
  ownerGoals: Array.isArray(meta?.ownerGoals) ? meta.ownerGoals : [],
  retiredPlayers: Array.isArray(meta?.retiredPlayers) ? meta.retiredPlayers : [],
  records: meta?.records ?? {
    mostPassingYardsSeason: null,
    mostRushingYardsSeason: null,
    mostWinsSeason: null,
    mostChampionships: null,
    highestOvrPlayer: null,
  },
});

const rewardPool = ["Owner confidence +10", "Scout budget +$2M", "Fan approval +15"];

const goalTemplates = [
  { type: 'win_games', targets: [8, 10, 12], description: (n) => `Win ${n} games` },
  { type: 'win_division', targets: [1], description: () => 'Win the division' },
  { type: 'sign_star', targets: [1], description: () => 'Sign a player OVR 88+' },
  { type: 'draft_starter', targets: [1], description: () => 'Draft a starter (plays 8+ games)' },
  { type: 'stay_under_cap', targets: [1], description: () => 'Finish under $180M cap used' },
  { type: 'win_playoff_game', targets: [1], description: () => 'Win a playoff game' },
  { type: 'develop_player', targets: [1], description: () => 'Improve a player by 3+ OVR' },
];

export const generateOwnerGoals = () => {
  const shuffled = [...goalTemplates].sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled.map((g) => {
    const target = g.targets[Math.floor(Math.random() * g.targets.length)];
    return {
      id: crypto.randomUUID(),
      type: g.type,
      description: g.description(target),
      target,
      current: 0,
      complete: false,
      reward: rewardPool[Math.floor(Math.random() * rewardPool.length)],
    };
  });
};

export const clampApproval = (value) => Math.max(0, Math.min(100, value ?? 50));

export const fanApprovalMessage = (fanApproval) => {
  const value = fanApproval ?? 50;
  if (value < 20) return 'Owner is considering relocation. Win now or risk losing the franchise.';
  if (value <= 39) return 'Fans are frustrated. Attendance is suffering.';
  if (value <= 60) return 'Fans are cautiously optimistic.';
  if (value <= 80) return 'The fanbase is energized.';
  if (value <= 95) return 'This is a dynasty. The city loves you.';
  return '🏆 Dynasty badge unlocked on dashboard';
};

export const applyGameFanApproval = (team, wonGame, lossStreak = 0) => {
  const base = team?.fanApproval ?? 50;
  const winBoostUsed = team?.fanApprovalWinBoostUsed ?? 0;
  let next = base;
  let nextBoostUsed = winBoostUsed;
  if (wonGame && winBoostUsed < 25) {
    next += 5;
    nextBoostUsed += 5;
  }
  if (!wonGame && lossStreak >= 3) {
    next -= 5;
  }
  return {
    fanApproval: clampApproval(next),
    fanApprovalWinBoostUsed: Math.min(25, nextBoostUsed),
  };
};

export const updateGoalsForWin = (ownerGoals) => {
  if (!Array.isArray(ownerGoals)) return [];
  return ownerGoals.map((goal) => {
    if (goal?.type !== 'win_games' || goal?.complete) return goal;
    const current = (goal?.current ?? 0) + 1;
    return { ...goal, current, complete: current >= (goal?.target ?? 0) };
  });
};
