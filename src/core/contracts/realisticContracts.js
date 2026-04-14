const TAG_TYPES = ['none', 'franchise', 'transition'];

/**
 * @typedef {Object} ContractIncentive
 * @property {string} key
 * @property {string} label
 * @property {number} amount
 * @property {'likely'|'unlikely'} capTreatment
 * @property {number} target
 * @property {string} metric
 */

/**
 * @typedef {Object} ContractDetails
 * @property {number} years
 * @property {number} yearsTotal
 * @property {number} yearsRemaining
 * @property {number} baseAnnual
 * @property {number} signingBonus
 * @property {number} guaranteedPct
 * @property {number} guaranteedMoney
 * @property {number} optionBonus
 * @property {number} optionYear
 * @property {boolean} hasNoTradeClause
 * @property {'none'|'franchise'|'transition'} tagType
 * @property {boolean} rookieScale
 * @property {boolean} fifthYearOptionEligible
 * @property {boolean} fifthYearOptionExercised
 * @property {boolean} restrictedFreeAgent
 * @property {ContractIncentive[]} incentives
 */

/**
 * @typedef {Object} FacilityUpgrade
 * @property {'training'|'medical'|'scouting'} key
 * @property {number} level
 * @property {number} annualCost
 * @property {number} projectedReturn
 */

/**
 * @typedef {Object} Financials
 * @property {number} ticketSales
 * @property {number} merchandise
 * @property {number} broadcasting
 * @property {number} sponsorships
 * @property {number} facilities
 * @property {number} staffPayroll
 * @property {number} playerPayroll
 * @property {number} deadCap
 * @property {number} netCashFlow
 * @property {FacilityUpgrade[]} facilityUpgrades
 */

function n(v, fb = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : fb;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeIncentives(incentives = []) {
  if (!Array.isArray(incentives)) return [];
  return incentives
    .map((row, idx) => ({
      key: String(row?.key ?? `inc_${idx}`),
      label: String(row?.label ?? 'Performance milestone'),
      amount: Math.max(0, n(row?.amount, 0)),
      capTreatment: row?.capTreatment === 'unlikely' ? 'unlikely' : 'likely',
      target: Math.max(0, n(row?.target, 0)),
      metric: String(row?.metric ?? 'season_award'),
    }))
    .slice(0, 8);
}

export function normalizeContractDetails(contract = {}, player = {}) {
  const yearsTotal = Math.max(1, Math.round(n(contract?.yearsTotal ?? contract?.years ?? player?.yearsTotal ?? player?.years, 1)));
  const yearsRemaining = clamp(Math.round(n(contract?.yearsRemaining ?? contract?.years ?? player?.years ?? yearsTotal, yearsTotal)), 1, yearsTotal);
  const baseAnnual = Math.max(0, n(contract?.baseAnnual ?? player?.baseAnnual ?? contract?.salary ?? player?.salary, 0));
  const signingBonus = Math.max(0, n(contract?.signingBonus ?? player?.signingBonus, 0));
  const guaranteedPct = clamp(n(contract?.guaranteedPct ?? player?.guaranteedPct, 0), 0, 1);
  const guaranteedMoney = Math.max(0, n(contract?.guaranteedMoney, (baseAnnual * yearsTotal + signingBonus) * guaranteedPct));
  const optionYear = clamp(Math.round(n(contract?.optionYear, 0)), 0, yearsTotal);
  const tagType = TAG_TYPES.includes(contract?.tagType) ? contract.tagType : (player?.isTagged ? 'franchise' : 'none');

  return {
    years: yearsRemaining,
    yearsTotal,
    yearsRemaining,
    baseAnnual,
    signingBonus,
    guaranteedPct,
    guaranteedMoney,
    optionBonus: Math.max(0, n(contract?.optionBonus, 0)),
    optionYear,
    hasNoTradeClause: !!contract?.hasNoTradeClause,
    tagType,
    rookieScale: !!contract?.rookieScale,
    fifthYearOptionEligible: !!contract?.fifthYearOptionEligible,
    fifthYearOptionExercised: !!contract?.fifthYearOptionExercised,
    restrictedFreeAgent: !!contract?.restrictedFreeAgent,
    incentives: normalizeIncentives(contract?.incentives),
  };
}

export function calculateContractCapHit(contract = {}, { includeLikelyIncentives = true } = {}) {
  const c = normalizeContractDetails(contract);
  const proratedBonus = c.signingBonus / Math.max(1, c.yearsTotal);
  const likelyIncentives = c.incentives
    .filter((inc) => inc.capTreatment === 'likely')
    .reduce((sum, inc) => sum + inc.amount, 0);
  return Math.round((c.baseAnnual + proratedBonus + (includeLikelyIncentives ? likelyIncentives : 0)) * 100) / 100;
}

export function estimateHoldoutRisk(player = {}, teamContext = {}) {
  const c = normalizeContractDetails(player?.contract ?? {}, player);
  const personalityRisk = n(player?.personalityProfile?.holdoutRisk ?? player?.personality?.holdoutRisk, 20);
  const morale = clamp(n(player?.morale, 60), 0, 100);
  const marketValue = Math.max(c.baseAnnual, n(player?.extensionAsk?.baseAnnual, c.baseAnnual));
  const underpaidGap = Math.max(0, marketValue - c.baseAnnual);
  const successPressure = clamp(n(teamContext?.wins, 8) / 17, 0, 1);
  const score = clamp(
    personalityRisk * 0.6 +
    underpaidGap * 3.6 +
    (100 - morale) * 0.35 +
    successPressure * 12,
    0,
    100,
  );
  return {
    score: Math.round(score),
    tier: score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low',
    shouldHoldout: score >= 78 && underpaidGap >= 3,
  };
}

export function calculateTeamPayroll({ roster = [], staffPayroll = 0, deadCap = 0, capFloor = 0, capLimit = 0 } = {}) {
  const playerPayroll = roster.reduce((sum, p) => sum + calculateContractCapHit(p?.contract ?? p, { includeLikelyIncentives: true }), 0);
  const totalPayroll = playerPayroll + Math.max(0, n(staffPayroll, 0)) + Math.max(0, n(deadCap, 0));
  return {
    playerPayroll: Math.round(playerPayroll * 100) / 100,
    staffPayroll: Math.max(0, n(staffPayroll, 0)),
    deadCap: Math.max(0, n(deadCap, 0)),
    totalPayroll: Math.round(totalPayroll * 100) / 100,
    overCap: capLimit > 0 ? totalPayroll > capLimit : false,
    belowFloor: capFloor > 0 ? totalPayroll < capFloor : false,
    capSpace: capLimit > 0 ? Math.round((capLimit - totalPayroll) * 100) / 100 : 0,
  };
}

export function projectTeamFinancials({ marketSize = 1, wins = 8, fanApproval = 50, payroll = 0, facilityLevels = {} } = {}) {
  const market = clamp(n(marketSize, 1), 0.7, 1.4);
  const winBoost = clamp(n(wins, 8) / 17, 0, 1.1);
  const fanBoost = clamp(n(fanApproval, 50) / 100, 0.4, 1.2);
  const training = clamp(n(facilityLevels?.trainingLevel, 1), 1, 5);
  const medical = clamp(n(facilityLevels?.medicalLevel ?? facilityLevels?.trainingLevel, 1), 1, 5);
  const scouting = clamp(n(facilityLevels?.scoutingLevel, 1), 1, 5);

  const ticketSales = (95 * market) * (0.7 + winBoost * 0.45) * fanBoost;
  const merchandise = (38 * market) * (0.6 + winBoost * 0.5) * fanBoost;
  const broadcasting = 120 * (0.95 + market * 0.08);
  const sponsorships = (44 * market) * (0.8 + fanBoost * 0.4);
  const facilities = 6 + training * 2.2 + medical * 2 + scouting * 1.8;
  const netCashFlow = ticketSales + merchandise + broadcasting + sponsorships - payroll - facilities;

  return {
    ticketSales: round2(ticketSales),
    merchandise: round2(merchandise),
    broadcasting: round2(broadcasting),
    sponsorships: round2(sponsorships),
    facilities: round2(facilities),
    staffPayroll: 0,
    playerPayroll: round2(payroll),
    deadCap: 0,
    netCashFlow: round2(netCashFlow),
    facilityUpgrades: [
      { key: 'training', level: training, annualCost: round2(training * 2.2), projectedReturn: round2(training * 1.5) },
      { key: 'medical', level: medical, annualCost: round2(medical * 2), projectedReturn: round2(medical * 1.3) },
      { key: 'scouting', level: scouting, annualCost: round2(scouting * 1.8), projectedReturn: round2(scouting * 1.2) },
    ],
  };
}

function round2(v) {
  return Math.round(n(v, 0) * 100) / 100;
}
