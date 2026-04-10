function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function seeded(playerId, salt = 0) {
  const raw = String(playerId ?? '0');
  let h = 2166136261 ^ salt;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 1000) / 1000;
}

const ARCHETYPES = ['money_first', 'contender_chaser', 'loyal_veteran', 'role_seeker', 'ascending_star', 'hometown_comfort', 'ring_chaser', 'stability_first'];

function clamp01(v) {
  return Math.max(0.05, Math.min(0.95, v));
}

function chooseArchetype(player, noiseA, noiseB) {
  const age = safeNum(player?.age, 26);
  const ovr = safeNum(player?.ovr, 70);
  const traits = Array.isArray(player?.traits) ? player.traits.map((t) => String(t).toLowerCase()) : [];
  if (traits.includes('loyal') || traits.includes('mentor')) return 'loyal_veteran';
  if (age >= 31 && ovr >= 80) return noiseA > 0.5 ? 'ring_chaser' : 'stability_first';
  if (age <= 25 && ovr >= 78) return 'ascending_star';
  if (noiseA >= 0.83) return 'money_first';
  if (noiseB >= 0.76) return 'role_seeker';
  if (noiseA <= 0.18) return 'hometown_comfort';
  if (noiseB <= 0.22) return 'contender_chaser';
  return ARCHETYPES[Math.floor((noiseA + noiseB) * 3.5) % ARCHETYPES.length];
}

export function buildPlayerMotivationProfile(player = {}, teamContext = {}) {
  const age = safeNum(player?.age, 26);
  const morale = safeNum(player?.morale, 68);
  const tenureYears = safeNum(teamContext?.tenureYears ?? player?.tenureYears, 0);
  const careerStage = age <= 25 ? 'early' : age <= 29 ? 'prime' : age <= 33 ? 'veteran' : 'late';
  const noiseA = seeded(player?.id, 41);
  const noiseB = seeded(player?.id, 97);
  const archetype = chooseArchetype(player, noiseA, noiseB);

  let weights = {
    moneyPriority: 0.48,
    contenderPriority: 0.42,
    rolePriority: 0.4,
    loyalty: 0.22,
    marketSizeTolerance: 0.5,
    schemeFitPreference: 0.32,
    patience: 0.48,
    securityPriority: 0.44,
  };

  const stageAdj = {
    early: { moneyPriority: 0.08, rolePriority: 0.08, securityPriority: 0.08, contenderPriority: -0.03, loyalty: -0.03 },
    prime: { moneyPriority: 0.04, rolePriority: 0.04 },
    veteran: { contenderPriority: 0.08, securityPriority: -0.06, loyalty: 0.04, patience: -0.04 },
    late: { contenderPriority: 0.12, securityPriority: -0.1, moneyPriority: -0.04, patience: -0.06 },
  };
  for (const [key, val] of Object.entries(stageAdj[careerStage] ?? {})) weights[key] += val;

  if (archetype === 'money_first') weights.moneyPriority += 0.24;
  if (archetype === 'contender_chaser') weights.contenderPriority += 0.22;
  if (archetype === 'loyal_veteran') { weights.loyalty += 0.32; weights.moneyPriority -= 0.1; }
  if (archetype === 'role_seeker') weights.rolePriority += 0.22;
  if (archetype === 'ascending_star') { weights.rolePriority += 0.14; weights.securityPriority += 0.08; weights.patience += 0.08; }
  if (archetype === 'hometown_comfort') { weights.loyalty += 0.2; weights.marketSizeTolerance -= 0.06; }
  if (archetype === 'ring_chaser') { weights.contenderPriority += 0.26; weights.securityPriority -= 0.12; }
  if (archetype === 'stability_first') { weights.securityPriority += 0.18; weights.patience += 0.12; }

  weights.loyalty += Math.min(0.18, tenureYears * 0.03) + (morale >= 78 ? 0.1 : morale <= 55 ? -0.08 : 0);
  weights.moneyPriority += (noiseA - 0.5) * 0.15;
  weights.contenderPriority += (noiseB - 0.5) * 0.12;
  weights.rolePriority += morale <= 58 ? 0.1 : 0;
  weights.schemeFitPreference += (noiseA - 0.5) * 0.14;

  const profile = {
    archetype,
    personalityTag: archetype,
    careerStage,
    moneyPriority: clamp01(weights.moneyPriority),
    contenderPriority: clamp01(weights.contenderPriority),
    rolePriority: clamp01(weights.rolePriority),
    loyalty: clamp01(weights.loyalty),
    marketSizeTolerance: clamp01(weights.marketSizeTolerance),
    schemeFitPreference: clamp01(weights.schemeFitPreference),
    patience: clamp01(weights.patience),
    securityPriority: clamp01(weights.securityPriority),
  };

  return profile;
}

export function summarizePlayerMood(profile = {}, context = {}) {
  const top = [
    ['money', profile.moneyPriority],
    ['contender', profile.contenderPriority],
    ['role', profile.rolePriority],
    ['loyalty', profile.loyalty],
    ['development', safeNum(context?.developmentScore, 50) / 100],
  ].sort((a, b) => b[1] - a[1]);

  const lead = top[0]?.[0] ?? 'money';
  const map = {
    money: 'Prioritizing money over fit',
    contender: 'Wants to stay with a contender',
    role: 'Wants a bigger weekly role',
    loyalty: 'Open to team-friendly terms',
    development: 'Values coaching and development',
  };
  const contractOutlook = profile.loyalty >= 0.6 && profile.moneyPriority <= 0.55
    ? 'Loyal profile; modest hometown discount possible.'
    : profile.moneyPriority >= 0.72
      ? 'Strong market-value stance; discounts are unlikely.'
      : profile.contenderPriority >= 0.68
        ? 'Contender fit can offset a small salary gap.'
        : 'Balanced negotiation profile with room for compromise.';

  return {
    summary: map[lead] ?? 'Balanced priorities',
    contractOutlook,
    priorities: top.slice(0, 3).map(([k]) => k),
  };
}
