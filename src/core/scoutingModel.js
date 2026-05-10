/**
 * Prospect scouting context derived only from fields already on the prospect object.
 * Deterministic — no hidden rolls or invented traits.
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function toNum(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function combineSignalsFrom(combine = {}) {
  const out = [];
  const forty = Number(combine.fortyTime);
  const vert = Number(combine.verticalLeap);
  const agility = Number(combine.agility);
  if (Number.isFinite(forty)) {
    if (forty <= 4.55) out.push(`Fast forty (${forty}) for profile.`);
    else if (forty >= 5.05) out.push(`Slow forty (${forty}) — mobility flag for speed roles.`);
  }
  if (Number.isFinite(vert) && vert >= 38) out.push(`Elite vertical (${vert}).`);
  if (Number.isFinite(agility) && agility <= 7.05) out.push(`Quick agility (${agility}).`);
  return out.slice(0, 3);
}

function interviewSignalsFrom(interview = {}) {
  const risk = toNum(interview.riskScore, 40);
  const out = [];
  if (risk <= 28) out.push('Interview profile reads as high-character / low drama.');
  else if (risk >= 58) out.push(`Interview risk elevated (${risk}) — maturity runway matters.`);
  else out.push(`Interview risk score ${risk} — typical variance.`);
  return out.slice(0, 2);
}

function projectedRoleForPos(posU, est, pot) {
  const p = String(posU || '').toUpperCase();
  const avg = (est + pot) / 2;
  if (['QB'].includes(p)) {
    if (avg >= 82) return 'Franchise QB projection';
    if (avg >= 74) return 'Starter-caliber QB projection';
    return 'Development QB / backup path';
  }
  if (['WR', 'TE'].includes(p)) {
    if (avg >= 78) return 'Primary passing-game weapon';
    if (avg >= 70) return 'Starter / rotation contributor';
    return 'Depth / special teams path';
  }
  if (['RB', 'FB'].includes(p)) {
    if (avg >= 76) return 'Lead-back upside';
    return 'Committee / depth runner';
  }
  if (['OL'].includes(p) || ['OT', 'OG', 'C', 'G', 'T'].includes(p)) {
    if (avg >= 76) return 'Plug-and-play line starter potential';
    return 'Developmental lineman';
  }
  if (['DL', 'DE', 'DT', 'EDGE', 'NT', 'LB'].includes(p)) {
    if (avg >= 78) return 'Front-seven impact starter path';
    return 'Rotation / developmental defender';
  }
  if (['CB', 'S', 'FS', 'SS'].includes(p)) {
    if (avg >= 77) return 'Coverage starter upside';
    return 'Depth DB / special teams contributor';
  }
  if (['K', 'P'].includes(p)) return 'Specialist projection';
  return avg >= 74 ? 'Starter-profile athlete' : 'Depth / developmental profile';
}

/**
 * @param {object|null} prospect
 * @param {object} [context]
 * @param {object} [context.team] — optional user team for scheme copy only
 */
export function buildProspectScoutingReport(prospect = null, context = {}) {
  if (!prospect || typeof prospect !== 'object') {
    return {
      playerId: null,
      name: null,
      pos: null,
      projectedRole: 'Unknown',
      scoutingGrade: null,
      confidence: 'unknown',
      riskLevel: 'normal',
      upsideLabel: 'unknown',
      floorLabel: 'unknown',
      traits: [],
      redFlags: [],
      combineSignals: [],
      interviewSignals: [],
      schemeFitSummary: 'No prospect data.',
      bestFitTeams: [],
      summary: 'No prospect loaded.',
      reasons: ['Missing prospect'],
    };
  }

  const reasons = [];
  const traits = [];
  const redFlags = [];

  const playerId = prospect.id ?? null;
  const name = prospect.name ?? null;
  const pos = String(prospect.pos ?? '').toUpperCase() || null;
  const potential = toNum(prospect.potential ?? prospect.truePotential, 65);
  const estimated = toNum(
    prospect.ovr ?? prospect.scoutedOvr ?? prospect.trueOvr,
    potential - 4,
  );
  const schemeFit = toNum(prospect.schemeFit, 65);
  const combine = prospect.combineResults ?? {};
  const interview = prospect.interviewReport ?? {};
  const riskScore = toNum(interview.riskScore, 40);
  const collegeBoost = toNum(prospect.collegeProductionScore, 0);

  const hcScheme = String(context.team?.staff?.headCoach?.schemePreference ?? '').toLowerCase();
  const archeTag = String(prospect.archetypeTag ?? '').toLowerCase();
  let schemeFitSummary = `Listed scheme fit ${schemeFit}/100.`;
  if (hcScheme && archeTag.includes(hcScheme)) {
    schemeFitSummary = `Archetype aligns with your HC preference (${hcScheme}); listed fit ${schemeFit}.`;
    traits.push('Coach-scheme alignment (tag match)');
  } else if (hcScheme) {
    schemeFitSummary = `HC favors ${hcScheme}; compare to archetype tags vs listed fit ${schemeFit}.`;
  }

  const combineSignals = combineSignalsFrom(combine);
  const interviewSignals = interviewSignalsFrom(interview);

  let signalScore = 0;
  if (Object.keys(combine).length > 0 && combine.fortyTime != null) signalScore += 2;
  else if (Object.keys(combine).length > 0) signalScore += 1;
  if (interview && Object.keys(interview).length > 0) signalScore += 2;
  if (prospect.potential != null || prospect.truePotential != null) signalScore += 1;
  if (prospect.ovr != null || prospect.scoutedOvr != null || prospect.trueOvr != null) signalScore += 1;
  if (collegeBoost > 0) signalScore += 1;

  /** @type {'high'|'medium'|'low'|'unknown'} */
  let confidence = 'medium';
  if (signalScore >= 6) confidence = 'high';
  else if (signalScore <= 2) confidence = 'low';
  if (!prospect.id && signalScore <= 1) confidence = 'unknown';

  /** @type {'safe'|'normal'|'volatile'|'boom_bust'|'injury_or_age_risk'} */
  let riskLevel = 'normal';
  if (riskScore >= 62 && potential - estimated >= 10) riskLevel = 'boom_bust';
  else if (riskScore >= 55) riskLevel = 'volatile';
  else if (riskScore <= 30 && Math.abs(potential - estimated) <= 8) riskLevel = 'safe';

  const age = toNum(prospect.age, 21);
  if (pos === 'RB' && age >= 23) {
    riskLevel = riskLevel === 'safe' ? 'injury_or_age_risk' : riskLevel;
    redFlags.push('RB age curve — rookie contract runway shorter than premium positions.');
    reasons.push('Age/context adds roster-risk nuance for RB profiles.');
  }

  /** @type {'franchise_cornerstone'|'high-end_starter'|'starter_upside'|'role_player'|'depth'} */
  let upsideLabel = 'role_player';
  if (potential >= 92) upsideLabel = 'franchise_cornerstone';
  else if (potential >= 86) upsideLabel = 'high-end_starter';
  else if (potential >= 78) upsideLabel = 'starter_upside';
  else if (potential >= 70) upsideLabel = 'role_player';
  else upsideLabel = 'depth';

  /** @type {'franchise_cornerstone'|'high-end_starter'|'starter_upside'|'role_player'|'depth'} */
  let floorLabel = 'depth';
  if (estimated >= 82) floorLabel = 'high-end_starter';
  else if (estimated >= 76) floorLabel = 'starter_upside';
  else if (estimated >= 68) floorLabel = 'role_player';
  else floorLabel = 'depth';

  const gradeNum = clamp(Math.round(estimated * 0.55 + potential * 0.35 + schemeFit * 0.08 + collegeBoost * 0.02), 40, 99);
  let letter = 'C';
  if (gradeNum >= 90) letter = 'A+';
  else if (gradeNum >= 85) letter = 'A';
  else if (gradeNum >= 80) letter = 'B+';
  else if (gradeNum >= 75) letter = 'B';
  else if (gradeNum >= 70) letter = 'C+';
  else if (gradeNum >= 64) letter = 'C';
  else if (gradeNum >= 58) letter = 'D';
  else letter = 'F';

  const scoutingGrade = `${letter} (${gradeNum})`;

  const projectedRole = projectedRoleForPos(pos, estimated, potential);

  if (potential - estimated >= 14) {
    traits.push('Large OVR-to-potential gap — boom/bust variance');
    reasons.push('Wide projection band based on listed ratings only.');
  }
  if (collegeBoost >= 18) traits.push('Strong college production signal');

  const summary = `${name ?? 'Prospect'} — ${upsideLabel.replace(/_/g, ' ')} upside vs ${floorLabel.replace(/_/g, ' ')} floor read (${confidence} confidence).`;

  reasons.push('Grade blends listed OVR/scouted estimate, potential, scheme fit, and production score only.');

  return {
    playerId,
    name,
    pos,
    projectedRole,
    scoutingGrade,
    confidence,
    riskLevel,
    upsideLabel,
    floorLabel,
    traits: traits.slice(0, 6),
    redFlags: redFlags.slice(0, 4),
    combineSignals,
    interviewSignals,
    schemeFitSummary,
    bestFitTeams: [],
    summary,
    reasons: reasons.slice(0, 8),
  };
}
