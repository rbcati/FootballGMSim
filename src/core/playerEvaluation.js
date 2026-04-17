const POSITION_ALIAS = {
  HB: 'RB', FB: 'RB', FL: 'WR', SE: 'WR',
  OT: 'OL', LT: 'OL', RT: 'OL', OG: 'OL', LG: 'OL', RG: 'OL', C: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', IDL: 'DL', EDGE: 'DL',
  MLB: 'LB', OLB: 'LB', ILB: 'LB',
  DB: 'CB', NCB: 'CB', FS: 'S', SS: 'S',
};

function toNum(v, fallback = 50) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function canonicalPos(player) {
  const raw = String(player?.pos ?? player?.position ?? '').toUpperCase();
  return POSITION_ALIAS[raw] ?? raw;
}

function readRating(player, key, fallback = 50) {
  return toNum(player?.attributesV2?.[key] ?? player?.ratings?.[key], fallback);
}

export function getPositionGroup(playerOrPos) {
  const pos = typeof playerOrPos === 'string' ? playerOrPos : canonicalPos(playerOrPos);
  if (['QB'].includes(pos)) return 'QB';
  if (['RB'].includes(pos)) return 'RB';
  if (['WR', 'TE'].includes(pos)) return 'RECEIVER';
  if (['OL'].includes(pos)) return 'OL';
  if (['DL'].includes(pos)) return 'FRONT7';
  if (['LB'].includes(pos)) return 'FRONT7';
  if (['CB', 'S'].includes(pos)) return 'SECONDARY';
  return 'GENERAL';
}

export function deriveAttributeBuckets(player, positionGroup = getPositionGroup(player)) {
  const speed = readRating(player, 'speed');
  const acceleration = readRating(player, 'acceleration');
  const awareness = readRating(player, 'awareness');
  const intelligence = readRating(player, 'intelligence');

  const base = {
    athleticism: Math.round((speed + acceleration) / 2),
    technique: Math.round((readRating(player, 'catchInTraffic') + readRating(player, 'passBlockFootwork')) / 2),
    playmaking: Math.round((readRating(player, 'catching') + readRating(player, 'juking') + readRating(player, 'trucking')) / 3),
    processingIQ: Math.round((awareness + intelligence + readRating(player, 'decisionMaking')) / 3),
    trenchSkills: Math.round((readRating(player, 'passBlock') + readRating(player, 'runBlock') + readRating(player, 'passRushPower') + readRating(player, 'runStop')) / 4),
    ballSkills: Math.round((readRating(player, 'catching') + readRating(player, 'catchInTraffic') + readRating(player, 'ballTracking')) / 3),
    qbMechanics: Math.round((readRating(player, 'throwAccuracy') + readRating(player, 'throwAccuracyShort') + readRating(player, 'throwAccuracyDeep') + readRating(player, 'throwPower') + readRating(player, 'pocketPresence')) / 5),
    frontSevenImpact: Math.round((readRating(player, 'passRush') + readRating(player, 'passRushSpeed') + readRating(player, 'passRushPower') + readRating(player, 'runStop')) / 4),
    coverage: Math.round((readRating(player, 'coverage') + readRating(player, 'pressCoverage') + readRating(player, 'zoneCoverage')) / 3),
  };

  const relevance = {
    QB: ['processingIQ', 'qbMechanics', 'athleticism'],
    RB: ['athleticism', 'playmaking', 'processingIQ'],
    RECEIVER: ['athleticism', 'ballSkills', 'technique', 'playmaking'],
    OL: ['trenchSkills', 'processingIQ', 'technique'],
    FRONT7: ['frontSevenImpact', 'trenchSkills', 'athleticism'],
    SECONDARY: ['coverage', 'athleticism', 'processingIQ', 'ballSkills'],
    GENERAL: ['athleticism', 'processingIQ', 'playmaking'],
  };

  return {
    values: base,
    focus: relevance[positionGroup] ?? relevance.GENERAL,
  };
}

export function derivePlayerArchetype(player, positionGroup = getPositionGroup(player)) {
  const ovr = toNum(player?.ovr, 60);
  const spd = readRating(player, 'speed');
  const cth = readRating(player, 'catching');
  const cit = readRating(player, 'catchInTraffic');
  const trk = readRating(player, 'trucking');
  const jkm = readRating(player, 'juking');
  const cov = readRating(player, 'coverage');
  const prs = Math.max(readRating(player, 'passRush'), readRating(player, 'passRushSpeed'));
  const tha = Math.max(readRating(player, 'throwAccuracy'), readRating(player, 'throwAccuracyDeep'));
  const awr = readRating(player, 'awareness');

  let archetype = 'Balanced Contributor';
  if (positionGroup === 'QB') {
    if (tha >= 78 && readRating(player, 'throwPower') >= 76) archetype = 'Vertical Field General';
    else if (awr >= 76 && readRating(player, 'throwAccuracyShort') >= 74) archetype = 'Timing Distributor';
    else archetype = 'Developmental QB';
  } else if (positionGroup === 'RB') {
    archetype = trk >= jkm + 8 ? 'Power Runner' : jkm >= trk + 8 ? 'Space Creator' : 'Balanced Runner';
  } else if (positionGroup === 'RECEIVER') {
    if (spd >= 84 && readRating(player, 'ballTracking') >= 70) archetype = 'Deep Threat';
    else if (cit >= 78) archetype = 'Possession Target';
    else archetype = 'Route Separator';
  } else if (positionGroup === 'OL') {
    archetype = readRating(player, 'runBlock') >= readRating(player, 'passBlock') + 6 ? 'Road Grader' : 'Pass Protector';
  } else if (positionGroup === 'FRONT7') {
    archetype = prs >= 80 ? 'Edge Speed Rusher' : readRating(player, 'runStop') >= 78 ? 'Run Anchor' : 'Hybrid Front Defender';
  } else if (positionGroup === 'SECONDARY') {
    archetype = cov >= 80 && spd >= 78 ? 'Coverage Corner' : awr >= 78 ? 'Field Communicator' : 'Developmental DB';
  }

  const confidence = clamp(Math.round((ovr * 0.6) + (awr * 0.25) + 15), 35, 97);
  return { archetype, confidence };
}

function fitTier(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 68) return 'Strong';
  if (score >= 55) return 'Neutral';
  return 'Poor';
}

export function deriveSchemeFit(player, teamContext = {}, gamePlan = {}, depthChartNeeds = []) {
  const position = canonicalPos(player);
  const group = getPositionGroup(position);
  const baseFit = toNum(player?.schemeFit, 50);
  const tendencies = {
    passRate: toNum(gamePlan?.passRate ?? gamePlan?.passRatio ?? teamContext?.passRate, 50),
    runRate: toNum(gamePlan?.runRate ?? (100 - toNum(gamePlan?.passRate ?? gamePlan?.passRatio, 50)), 50),
    blitzRate: toNum(gamePlan?.blitzRate, 50),
    manCoverageRate: toNum(gamePlan?.manCoverageRate, 50),
  };

  const archetype = derivePlayerArchetype(player, group).archetype;
  let score = baseFit;
  if (group === 'QB' || group === 'RECEIVER') score += tendencies.passRate >= 55 ? 8 : -2;
  if (group === 'RB' || group === 'OL') score += tendencies.runRate >= 52 ? 7 : -2;
  if (group === 'FRONT7') score += tendencies.blitzRate >= 55 ? 6 : 1;
  if (group === 'SECONDARY') score += tendencies.manCoverageRate >= 55 ? 6 : 1;

  if (Array.isArray(depthChartNeeds) && depthChartNeeds.includes(position)) score += 10;
  const teamNeedList = teamContext?.needs ?? teamContext?.needsNow ?? [];
  if (Array.isArray(teamNeedList) && teamNeedList.some((n) => (n?.pos ?? n) === position)) score += 8;

  const strengths = [];
  const weaknesses = [];
  const buckets = deriveAttributeBuckets(player, group);
  buckets.focus.forEach((key) => {
    const v = buckets.values[key] ?? 50;
    if (v >= 76) strengths.push(key);
    else if (v <= 58) weaknesses.push(key);
  });

  score = clamp(Math.round(score));
  return {
    score,
    tier: fitTier(score),
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 2),
    archetype,
    tendencies,
  };
}

export function derivePlayerRoleProjection(player, rosterContext = {}) {
  const ovr = toNum(player?.ovr, 60);
  const age = toNum(player?.age, 27);
  const position = canonicalPos(player);
  const roster = Array.isArray(rosterContext?.roster) ? rosterContext.roster : [];
  const peers = roster.filter((p) => canonicalPos(p) === position).sort((a, b) => toNum(b?.ovr, 0) - toNum(a?.ovr, 0));
  const starter = peers[0];
  const backup = peers[1];
  const starterOvr = toNum(starter?.ovr, 0);
  const backupOvr = toNum(backup?.ovr, 0);

  let role = 'Depth';
  let replaceContext = 'Redundant depth';
  if (ovr >= starterOvr + 2 || !starter) {
    role = 'Starter';
    replaceContext = starter ? `Upgrades current starter by +${Math.max(1, Math.round(ovr - starterOvr))} OVR` : 'Fills starter vacancy';
  } else if (ovr >= backupOvr + 2 || !backup) {
    role = 'Rotation';
    replaceContext = backup ? 'Upgrades rotation unit' : 'Fills injury/backup gap';
  } else if (age <= 24 && (toNum(player?.potential, ovr + 4) - ovr) >= 5) {
    role = 'Development';
    replaceContext = 'Long-term development candidate';
  }

  return {
    role,
    replaceContext,
    starterDelta: Math.round(ovr - starterOvr),
    backupDelta: Math.round(ovr - backupOvr),
  };
}

export function derivePlayerSimImpactSummary(player, positionGroup = getPositionGroup(player)) {
  const ovr = toNum(player?.ovr, 60);
  const fit = toNum(player?.schemeFit, 50);
  const readiness = toNum(player?.readinessScore ?? player?.morale, 72);
  const impact = clamp(Math.round((ovr * 0.52) + (fit * 0.28) + (readiness * 0.2)));
  const lane = impact >= 78 ? 'high-leverage' : impact >= 64 ? 'situational' : 'depth-only';
  return {
    impactScore: impact,
    summary: `${lane} ${positionGroup.toLowerCase()} contributor with ${fit >= 70 ? 'clean' : 'volatile'} scheme translation`,
  };
}

export function buildPlayerEvaluation(player, context = {}) {
  const positionGroup = getPositionGroup(player);
  const archetype = derivePlayerArchetype(player, positionGroup);
  const schemeFit = deriveSchemeFit(player, context.teamContext, context.gamePlan, context.depthChartNeeds);
  const roleProjection = derivePlayerRoleProjection(player, context.rosterContext);
  const simImpact = derivePlayerSimImpactSummary(player, positionGroup);
  const buckets = deriveAttributeBuckets(player, positionGroup);
  return {
    positionGroup,
    archetype,
    schemeFit,
    roleProjection,
    simImpact,
    attributeBuckets: buckets,
  };
}
