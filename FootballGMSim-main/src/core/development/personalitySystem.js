import { Utils as U } from '../utils.js';

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, Number(v) || 0));

const COLLEGE_ARCHETYPES = {
  'Alabama': { workEthic: 8, leadership: 6, discipline: 8 },
  'Georgia': { workEthic: 7, leadership: 5, discipline: 8 },
  'Ohio State': { workEthic: 6, leadership: 6, discipline: 5, diva: 4 },
  'LSU': { riskTaker: 6, leadership: 3, diva: 5 },
  'USC': { diva: 7, riskTaker: 4, workEthic: -2 },
  'Notre Dame': { leadership: 8, discipline: 8, workEthic: 6 },
  'Michigan': { discipline: 7, leadership: 5, workEthic: 5 },
  'Clemson': { workEthic: 5, leadership: 4, discipline: 4 },
};

export const PERSONALITY_TOOLTIPS = {
  workEthic: 'Higher values accelerate offseason growth and lower bust odds.',
  leadership: 'Higher values improve mentorship strength and locker-room morale stability.',
  diva: 'Higher values increase holdout/contract friction and morale volatility.',
  riskTaker: 'Higher values increase variance: bigger highs and lower weekly floor.',
  discipline: 'Higher values reduce off-field event risk and improve coach relationship.',
  coachability: 'Higher values improve coach interactions and scheme adoption speed.',
};

export function generatePersonalityProfile({ college = 'Unknown University', age = 22 } = {}) {
  const base = {
    workEthic: U.rand(35, 90),
    leadership: U.rand(20, 85),
    diva: U.rand(5, 70),
    riskTaker: U.rand(10, 80),
    discipline: U.rand(30, 90),
    coachability: U.rand(35, 90),
  };
  const collegeBias = COLLEGE_ARCHETYPES[college] ?? {};
  Object.entries(collegeBias).forEach(([k, bump]) => {
    base[k] = clamp(base[k] + Number(bump || 0));
  });
  if (age >= 29) {
    base.leadership = clamp(base.leadership + 6);
    base.coachability = clamp(base.coachability + 4);
  }
  return {
    ...base,
    holdoutRisk: clamp(18 + (base.diva * 0.42) - (base.workEthic * 0.22) - (base.discipline * 0.14), 0, 100),
    consistency: clamp(52 + (base.workEthic * 0.22) + (base.discipline * 0.2) - (base.riskTaker * 0.2), 0, 100),
    offFieldRisk: clamp(15 + (base.riskTaker * 0.26) + (base.diva * 0.2) - (base.discipline * 0.25), 0, 100),
  };
}

export function ensurePersonalityProfile(player = {}) {
  const existing = player?.personalityProfile ?? player?.personality?.profile ?? null;
  if (existing) {
    return {
      ...existing,
      workEthic: clamp(existing.workEthic ?? 65),
      leadership: clamp(existing.leadership ?? 55),
      diva: clamp(existing.diva ?? 35),
      riskTaker: clamp(existing.riskTaker ?? 40),
      discipline: clamp(existing.discipline ?? 60),
      coachability: clamp(existing.coachability ?? 62),
      holdoutRisk: clamp(existing.holdoutRisk ?? (20 + (Number(existing.diva ?? 35) * 0.3))),
      consistency: clamp(existing.consistency ?? 65),
      offFieldRisk: clamp(existing.offFieldRisk ?? 25),
    };
  }
  return generatePersonalityProfile({ college: player?.college, age: player?.age });
}

export function buildMentorshipMap(players = [], teamId) {
  const teamPlayers = players.filter((p) => Number(p?.teamId) === Number(teamId));
  const byMentor = new Map();
  for (const p of teamPlayers) {
    const mentorId = p?.mentorship?.mentorId;
    if (!mentorId) continue;
    if (!byMentor.has(mentorId)) byMentor.set(mentorId, []);
    byMentor.get(mentorId).push(p);
  }
  return byMentor;
}

export function mentorshipBonusForPlayer(player = {}, roster = []) {
  const mentorId = player?.mentorship?.mentorId;
  if (!mentorId) return { development: 0, morale: 0, bustRisk: 0, applied: false };
  const mentor = roster.find((p) => String(p.id) === String(mentorId));
  if (!mentor) return { development: 0, morale: 0, bustRisk: 0, applied: false };
  const profile = ensurePersonalityProfile(mentor);
  if ((mentor.age ?? 0) < 28 || profile.leadership < 65) return { development: 0, morale: 0, bustRisk: 0, applied: false };
  const slots = Number(mentor?.mentorship?.maxMentees ?? 2);
  const rosterMentees = roster.filter((p) => String(p?.mentorship?.mentorId ?? '') === String(mentor.id));
  if (rosterMentees.length > slots) return { development: 0, morale: 0, bustRisk: 0, applied: false };
  const dev = Math.round((0.08 + (profile.leadership - 60) * 0.002 + (profile.workEthic - 60) * 0.0015) * 1000) / 1000;
  return {
    development: Math.max(0, Math.min(0.22, dev)),
    morale: Math.max(0, Math.min(8, Math.round((profile.leadership - 55) * 0.12))),
    bustRisk: Math.max(0, Math.min(0.18, Math.round((profile.discipline - 50) * 0.002 * 1000) / 1000)),
    applied: true,
    mentorId: mentor.id,
    mentorName: mentor.name,
  };
}

export function contractPersonalityModifier(profile = {}) {
  const diva = Number(profile?.diva ?? 35);
  const workEthic = Number(profile?.workEthic ?? 65);
  const leadership = Number(profile?.leadership ?? 55);
  return {
    annualDemandMultiplier: 1 + (diva - 40) / 300 - (leadership - 50) / 600,
    holdoutRisk: clamp((profile?.holdoutRisk ?? 20) + (diva - workEthic) * 0.22, 0, 100),
    inSeasonNegotiationPenalty: diva >= 70 ? 1 : 0,
  };
}

export function consistencyModifier(profile = {}) {
  const consistency = Number(profile?.consistency ?? 65);
  return Math.max(0.82, Math.min(1.12, 0.9 + (consistency / 100) * 0.25));
}
