/*
 * Simulation Orchestrator (index)
 * ───────────────────────────────
 * The only module that calls the simulation domain modules in sequence. It owns
 * the RNG-sensitive per-game flow (`simGameStats`), the batch runner
 * (`simulateBatch`), and the commit-to-state step (`commitGameResult`). Domain
 * logic lives in the sibling modules; this file wires them together.
 *
 * Decomposed from the original monolithic game-simulator.js. The seeded Utils
 * PRNG call order is preserved byte-for-byte, so play resolution is
 * statistically identical before and after the refactor.
 */

import { Utils as U } from '../utils.js';
import { Constants as C } from '../constants.js';
import { calculateGamePerformance, getCoachingMods, getHCMods, getMedicalStaffInjuryMod } from '../coach-system.js';
import { applyCoachingModifiers } from '../coaching-philosophy-effects.js';
import { normalizeTeamStaff } from '../staff/staffPhilosophy.js';
import { updateAdvancedStats, updatePlayerGameLegacy, calculateMorale } from '../player.js';
import { getStrategyModifiers, computeStrategicEdge } from '../strategy.js';
import { deriveGameReasoningFlags } from '../weeklyNarrativeFlags.js';
import { getEffectiveRating, canPlayerPlay, generateInjury } from '../injury-core.js';
import { calculateTeamRatingWithSchemeFit } from '../scheme-core.js';
import { normalizePlayLogs } from '../gameEvents.js';
import {
  buildDriveSummaryFromSimulation,
  buildQuarterScoresFromScoring,
  buildScoringSummaryFromSimulation,
} from '../gameSummary.js';


function recomputeReconciledQbDependentStats(g = {}) {
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  g.passAtt = Math.max(0, Math.round(n(g.passAtt)));
  g.passComp = Math.max(0, Math.min(g.passAtt, Math.round(n(g.passComp))));
  g.passYd = Math.max(0, Math.round(n(g.passYd)));
  g.passTD = Math.max(0, Math.round(n(g.passTD)));
  g.interceptions = Math.max(0, Math.round(n(g.interceptions)));
  const sacksTaken = Math.max(0, Math.round(n(g.sacked ?? g.sacksTaken ?? g.sacks)));
  g.dropbacks = g.passAtt + sacksTaken;
  if (g.passComp === 0 || g.passYd === 0) g.longestPass = 0;
  else g.longestPass = Math.max(0, Math.min(Math.round(n(g.longestPass)), g.passYd));
  g.completionPct = Math.round((g.passComp / Math.max(1, g.passAtt)) * 1000) / 10;
  const att = Math.max(1, g.passAtt);
  const a = Math.max(0, Math.min(2.375, ((g.passComp / att) - 0.3) / 0.2));
  const b = Math.max(0, Math.min(2.375, ((g.passYd / att) - 3) / 4));
  const c = Math.max(0, Math.min(2.375, (g.passTD / att) / 0.05));
  const d = Math.max(0, Math.min(2.375, 2.375 - (g.interceptions / att) / 0.04));
  g.passerRating = Math.round(((a + b + c + d) / 6) * 100 * 10) / 10;
  if ('yardsPerAttempt' in g) g.yardsPerAttempt = Math.round((g.passYd / Math.max(1, g.passAtt)) * 10) / 10;
  if ('sackPct' in g) g.sackPct = Math.round((sacksTaken / Math.max(1, g.dropbacks)) * 1000) / 10;
  if ('tdRate' in g) g.tdRate = Math.round((g.passTD / Math.max(1, g.passAtt)) * 1000) / 10;
  if ('intRate' in g) g.intRate = Math.round((g.interceptions / Math.max(1, g.passAtt)) * 1000) / 10;
  return g;
}

// ── Domain modules ──────────────────────────────────────────────────────────
import {
  getActiveGroups,
  generateQBStats,
  generateRBStats,
  distributePassingTargets,
  generateReceiverStats,
  generateDBStats,
  generateDLStats,
  generateOLStats,
  generateKickerStats,
  generatePunterStats,
  initializePlayerStats,
  accumulateStats,
  groupPlayersByPosition,
  calculateQuarterbackRating,
} from './statAccumulator.js';
import {
  applyResult,
  updateRivalries,
  updateTeamStandings,
  ensureTeamsMap,
  resolveTouchdownScore,
  resolveFieldGoalScore,
  resolveDefensiveTouchdownScore,
  resolveSafetyScore,
  calculateReturnTDChance,
  buildGameOutcomeState,
} from './scoreKeeper.js';
import { buildDriveBasedSummary, advanceDownDistance } from './driveEngine.js';
import {
  getSimulationSpeedDelay,
  calculateMomentumSwing,
  decideLateGameSequence,
  computeQuarter,
  drivesPerQuarter,
  getQuarterClockMinutes,
  isOvertimeGameOver,
} from './clockManager.js';
import {
  rollInGameInjury,
  applyInjuryToPlayer,
  buildGameInjuryEntry,
  resolveInjurySubstitutionShare,
} from './injuryResolver.js';
import {
  generatePostGameCallbacks,
  transformStatsForBoxScore,
  buildCanonicalTeamStats,
  normalizeGameStatsForBoxScore,
} from './gameSummaryBuilder.js';
import {
  formatPlayerName,
  pickStarterWeighted,
  pickReceiver,
  pickRusher,
  pickDefBack,
  pickTackler,
  pickCoverage,
  classifyOffensivePlay,
} from './playExecution.js';

// ── Re-export the public surface that moved into domain modules so legacy
//    importers (and the game-simulator.js shim) keep working unchanged.
export {
  calculateQuarterbackRating,
  getSimulationSpeedDelay,
  calculateMomentumSwing,
  decideLateGameSequence,
  groupPlayersByPosition,
  initializePlayerStats,
  ensureTeamsMap,
  updateTeamStandings,
  applyResult,
  generatePostGameCallbacks,
  accumulateStats,
};

/**
 * SimulationError — thrown when a game cannot produce a valid (non-zero) result
 * after the allotted retries. Carries a structured `details` payload so the
 * worker can forward team-ratings context to the UI.
 */
export class SimulationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SimulationError';
    this.details = details;
  }
}

/**
 * Throws SimulationError when gameScores is null or both scores are 0.
 */
export function assertGameProducedScoring(gameScores, context = {}) {
  if (!gameScores || (gameScores.homeScore === 0 && gameScores.awayScore === 0)) {
    const homeAbbr = context.home?.abbr ?? '?';
    const awayAbbr = context.away?.abbr ?? '?';
    const week = context.week ?? '?';
    throw new SimulationError(
      `Game produced no scoring for ${homeAbbr} vs ${awayAbbr} in week ${week}. Check team ratings and roster validity.`,
      context,
    );
  }
}

function buildTeamRatingsSnapshot(team) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const ovrs = roster.map((p) => Number(p?.ovr) || 0);
  const avgOvr = ovrs.length ? ovrs.reduce((a, b) => a + b, 0) / ovrs.length : 0;
  return {
    id: team?.id ?? null,
    abbr: team?.abbr ?? null,
    rosterSize: roster.length,
    avgOvr: Math.round(avgOvr * 10) / 10,
    players: roster.slice(0, 25).map((p) => ({ name: p?.name, pos: p?.pos, ovr: Number(p?.ovr) || 0 })),
  };
}

/**
 * Capture the injury-related state of a set of players so a re-run of the sim
 * (e.g. the 0-0 prevention retry loop) can be rolled back without stacking
 * duplicate in-game injuries onto the shared live roster objects.
 */
function snapshotInjuryState(players) {
  const snap = new Map();
  for (const p of players) {
    if (!p) continue;
    snap.set(p, {
      injured: p.injured,
      injuries: Array.isArray(p.injuries) ? p.injuries.map((inj) => ({ ...inj })) : p.injuries,
      injuryWeeksRemaining: p.injuryWeeksRemaining,
      seasonEndingInjury: p.seasonEndingInjury,
      ovr: p.ovr,
    });
  }
  return snap;
}

/** Restore a previously captured injury snapshot onto the same player objects. */
function restoreInjuryState(snap) {
  if (!snap) return;
  for (const [p, state] of snap.entries()) {
    p.injured = state.injured;
    p.injuries = Array.isArray(state.injuries) ? state.injuries.map((inj) => ({ ...inj })) : state.injuries;
    p.injuryWeeksRemaining = state.injuryWeeksRemaining;
    p.seasonEndingInjury = state.seasonEndingInjury;
    p.ovr = state.ovr;
  }
}

/**
 * Calculate how many seasons a player has been with the team (tenure proxy).
 */
function calculateSeasonsWithTeam(player, team) {
  if (player.history && player.history.length > 0) {
    const teamHistory = player.history.filter((h) => h.team === team.abbr);
    return teamHistory.length || 1;
  }
  return 1;
}

/**
 * Returns the team's coaching staff with philosophy fields normalized for the
 * simulation (canonical offensive/defensive philosophy enums + capped traits +
 * guaranteed coordinator slots). normalizeTeamStaff() was previously only used
 * by the UI (TeamHub), so the sim relied on applyCoachingModifiers' internal
 * fallback inference; this makes the normalized philosophy explicit on the sim
 * path. The result is cached per batch on a non-persistent `_cachedSimStaff`
 * field (cleared in simulateBatch alongside _cachedSchemeFit) so we do not
 * re-normalize per game inside a week, and the persistent team.staff record is
 * never mutated (normalizeTeamStaff returns a fresh object).
 */
function getSimStaff(team) {
  if (!team) return {};
  if (!team._cachedSimStaff) {
    team._cachedSimStaff = normalizeTeamStaff(team);
  }
  return team._cachedSimStaff;
}

// ───────────────────────────── orchestration ─────────────────────────────────

export function simulateMatchup(home, away, options = {}) {
  return simGameStats(home, away, options);
}

export function simGameStats(home, away, options = {}) {
  const verbose = options.verbose === true;
  try {
    if (false) console.log(`[SIM-DEBUG] simGameStats called for ${home?.abbr} vs ${away?.abbr}`);

    // Dependencies (Inject or Import)
    // U and C are imported.

    if (!home?.roster || !away?.roster || !Array.isArray(home.roster) || !Array.isArray(away.roster)) {
      console.error('[SIM-DEBUG] Invalid team roster data');
      return null;
    }

    // --- OPTIMIZATION & INJURY INTEGRATION ---
    // Use cached grouping + injury filtering
    const { active: homeActive, groups: homeGroups } = getActiveGroups(home, options.league);
    const { active: awayActive, groups: awayGroups } = getActiveGroups(away, options.league);

    const calculateStrength = (activeRoster, team) => {
      if (!activeRoster || !activeRoster.length) return 50;

      return activeRoster.reduce((acc, p) => {
        const tenureYears = calculateSeasonsWithTeam(p, team);

        let rating = p.ovr || 50;
        // Use imported getEffectiveRating
        rating = getEffectiveRating(p);

        // Apply weekly training boost (set by CONDUCT_DRILL worker handler)
        if (p.weeklyTrainingBoost) rating = Math.min(99, rating + p.weeklyTrainingBoost);

        // Create proxy player to avoid mutating original
        const proxyPlayer = { ...p, ovr: rating, ratings: { ...(p.ratings || {}), overall: rating } };
        const effectivePerf = calculateGamePerformance(proxyPlayer, tenureYears);

        return acc + effectivePerf;
      }, 0) / activeRoster.length;
    };

    let homeStrength = calculateStrength(homeActive, home);
    let awayStrength = calculateStrength(awayActive, away);

    if (false) console.log(`[SIM-DEBUG] Strength Calculated: ${home.abbr}=${homeStrength.toFixed(1)}, ${away.abbr}=${awayStrength.toFixed(1)}`);

    const calculateDefenseStrength = (groups) => {
      const defensivePositions = ['DL', 'LB', 'CB', 'S'];
      let totalRating = 0;
      let count = 0;

      defensivePositions.forEach(pos => {
        const players = groups[pos] || [];
        players.forEach(p => {
            const r = getEffectiveRating(p);
            totalRating += r;
            count++;
        });
      });

      if (count === 0) return 70;
      return totalRating / count;
    };

    let homeDefenseStrength = calculateDefenseStrength(homeGroups);
    let awayDefenseStrength = calculateDefenseStrength(awayGroups);

    // Apply Scheme Penalty
    // If a team is running a 3-4 but has more DL talent than LB talent (or vice versa), apply a penalty
    const applySchemePenalty = (team, defenseStrength, groups) => {
        const defPlan = team.strategies?.defPlanId;
        // Basic heuristic: check if they are running a mismatch
        // '3-4' logic: Needs strong LBs. If DL > LB (by count of quality players?), penalty.
        // Simplified check: if plan is 3-4 or BLITZ_HEAVY (LB dependent)
        if (defPlan === 'BLITZ_HEAVY' || (team.strategies?.baseDefense === '3-4')) {
             const dlCount = (groups['DL'] || []).filter(p => p.ovr > 75).length;
             const lbCount = (groups['LB'] || []).filter(p => p.ovr > 75).length;

             if (dlCount > lbCount + 1) {
                 // They have DL talent but are forcing a LB scheme
                 return defenseStrength * 0.95; // 5% penalty
             }
        }
        return defenseStrength;
    };

    homeDefenseStrength = applySchemePenalty(home, homeDefenseStrength, homeGroups);
    awayDefenseStrength = applySchemePenalty(away, awayDefenseStrength, awayGroups);

    // --- STAFF PERKS & STRATEGY INTEGRATION ---
    // getCoachingMods builds skill-tree mods (archetype/level based).
    // applyCoachingModifiers layers HC/OC/DC philosophy and staff traits on top
    // — single callsite per team, no philosophy logic scattered below.
    // Philosophy is read from normalizeTeamStaff() output (canonical enums), so
    // the sim consumes the same normalized fields the UI does rather than
    // re-inferring them ad hoc.
    const homeSimStaff = getSimStaff(home);
    const awaySimStaff = getSimStaff(away);
    const homeMods = applyCoachingModifiers(getCoachingMods(home.staff), homeSimStaff.headCoach, homeSimStaff);
    const awayMods = applyCoachingModifiers(getCoachingMods(away.staff), awaySimStaff.headCoach, awaySimStaff);

    // --- HEAD COACH ARCHETYPE MODIFIERS ---
    const homeHCMods = getHCMods(home.staff?.headCoach);
    const awayHCMods = getHCMods(away.staff?.headCoach);

    // HC strength bonus (Strategist archetype)
    if (homeHCMods.strengthBonus) homeStrength += homeHCMods.strengthBonus;
    if (awayHCMods.strengthBonus) awayStrength += awayHCMods.strengthBonus;

    // HC scheme fit multiplier (Strategist) — applied after scheme fit calc below if present
    // Stored on mods for use inside simulateFullGame
    if (homeHCMods.momentumMultiplier) homeMods.momentumMultiplier = homeHCMods.momentumMultiplier;
    if (awayHCMods.momentumMultiplier) awayMods.momentumMultiplier = awayHCMods.momentumMultiplier;
    if (homeHCMods.turnoverReduction) homeMods.turnoverReduction = homeHCMods.turnoverReduction;
    if (awayHCMods.turnoverReduction) awayMods.turnoverReduction = awayHCMods.turnoverReduction;

    // --- MEDICAL STAFF INJURY MODIFIER ---
    // Per-team injury chance multiplier; used when rolling for in-game injuries
    const homeInjuryMod = getMedicalStaffInjuryMod(home.staff?.medStaff);
    const awayInjuryMod = getMedicalStaffInjuryMod(away.staff?.medStaff);

    // Also apply HC Team Builder / Disciplinarian injury mod
    const homeHCInjMod = homeHCMods.injuryChanceMod || 1.0;
    const awayHCInjMod = awayHCMods.injuryChanceMod || 1.0;
    const leagueInjuryFactor = Number.isFinite(Number(options?.injuryFactor)) ? Number(options.injuryFactor) : 1.0;
    const homeTotalInjMod = homeInjuryMod * homeHCInjMod * leagueInjuryFactor;
    const awayTotalInjMod = awayInjuryMod * awayHCInjMod * leagueInjuryFactor;
    // Attach injury modifier to mods so generateStatsForTeam can use it
    homeMods.injuryChanceMod = homeTotalInjMod;
    awayMods.injuryChanceMod = awayTotalInjMod;

    // Determine strategy modifiers
    // New logic: Read directly from team.strategies (supported for both User and AI)
    // Fallback: Read from league.weeklyGamePlan for legacy user setups
    const league = options.league;
    const history = league?.strategyHistory || {};

    const applyStrategy = (team, mods) => {
        // 1. Prefer team.strategies (source of truth)
        if (team.strategies && team.strategies.offPlanId) {
            const { offPlanId, defPlanId, riskId } = team.strategies;
            const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
            if (false) console.log(`[SIM-DEBUG] Strategy Mods (${team.abbr}):`, stratMods);
            Object.assign(mods, stratMods);
            return;
        }

        // 2. Legacy/User Fallback via league.weeklyGamePlan
        const userTeamId = league?.userTeamId;
        if (userTeamId !== undefined && team.id === userTeamId && league?.weeklyGamePlan) {
             const { offPlanId, defPlanId, riskId } = league.weeklyGamePlan;
             const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
             if (false) console.log(`[SIM-DEBUG] Legacy Strategy Mods (${team.abbr}):`, stratMods);
             Object.assign(mods, stratMods);
        }
    };

    applyStrategy(home, homeMods);
    applyStrategy(away, awayMods);

    const applyStaffTacticalEdge = (team, mods) => {
      const tactical = Number(team?.staffBonuses?.tacticalEdgeDelta ?? 0);
      const hcScheme = String(team?.staff?.headCoach?.schemePreference ?? '').toLowerCase();
      const ocScheme = String(team?.staff?.offCoordinator?.schemePreference ?? '').toLowerCase();
      const dcScheme = String(team?.staff?.defCoordinator?.schemePreference ?? '').toLowerCase();
      const blendedScheme = `${hcScheme} ${ocScheme} ${dcScheme}`;
      if (blendedScheme.includes('west coast')) mods.passAccuracy = (mods.passAccuracy ?? 1) * (1 + Math.max(-0.08, tactical * 0.25));
      if (blendedScheme.includes('spread') || blendedScheme.includes('vertical')) mods.passVolume = (mods.passVolume ?? 1) * (1 + Math.max(-0.08, tactical * 0.32));
      if (blendedScheme.includes('smashmouth')) mods.runVolume = (mods.runVolume ?? 1) * (1 + Math.max(-0.08, tactical * 0.3));
      if (blendedScheme.includes('3-4') || blendedScheme.includes('blitz')) mods.sackChance = (mods.sackChance ?? 1) * (1 + Math.max(-0.1, tactical * 0.35));
      if (blendedScheme.includes('4-3') || blendedScheme.includes('nickel')) mods.intChance = (mods.intChance ?? 1) * (1 + Math.max(-0.08, tactical * 0.26));
    };
    applyStaffTacticalEdge(home, homeMods);
    applyStaffTacticalEdge(away, awayMods);

    // --- STRATEGIC RESPONSIVENESS (bounded ±5% schematic execution edge) ---
    // Map each team's weekly tactical inputs against the opponent's strategy
    // profile into a tightly bounded, fully deterministic execution edge.
    // Legacy saves without `team.strategies` resolve to a neutral zero edge.
    const homeStrategicEdge = computeStrategicEdge(home, away);
    const awayStrategicEdge = computeStrategicEdge(away, home);
    homeMods.strategicEdge = homeStrategicEdge.edge;
    awayMods.strategicEdge = awayStrategicEdge.edge;

    if (false) console.log(`[SIM-DEBUG] Mods Applied: Home=${JSON.stringify(homeMods)}, Away=${JSON.stringify(awayMods)}`);
    // --- SCHEME FIT IMPACT ---
    let schemeNote = null;

    if (calculateTeamRatingWithSchemeFit) {
        // Cache scheme fit per team per batch (cleared in simulateBatch between weeks)
        if (!home._cachedSchemeFit) home._cachedSchemeFit = calculateTeamRatingWithSchemeFit(home);
        if (!away._cachedSchemeFit) away._cachedSchemeFit = calculateTeamRatingWithSchemeFit(away);
        const homeFit = home._cachedSchemeFit;
        const awayFit = away._cachedSchemeFit;

        // Get fit percentages (50 = neutral, 100 = perfect, 0 = terrible)
        const hOffFit = homeFit.offensiveSchemeFit || 50;
        const hDefFit = homeFit.defensiveSchemeFit || 50;
        const aOffFit = awayFit.offensiveSchemeFit || 50;
        const aDefFit = awayFit.defensiveSchemeFit || 50;

        // Calculate multipliers (0.9 to 1.1 range)
        // 100 fit = 1.1x, 0 fit = 0.9x
        const getMod = (fit) => 0.9 + ((fit / 100) * 0.2);

        const homeOffMod = getMod(hOffFit);
        const homeDefMod = getMod(hDefFit);
        const awayOffMod = getMod(aOffFit);
        const awayDefMod = getMod(aDefFit);

        // Apply to strengths (Assuming strength is roughly 0-100)
        // Adjust home/away strength based on their aggregate fit
        // Weighted slightly towards offense for narrative clarity
        const homeFitBonus = ((homeOffMod + homeDefMod) / 2);
        const awayFitBonus = ((awayOffMod + awayDefMod) / 2);

        // Directly modify strength for score calculation
        homeStrength *= homeFitBonus;
        awayStrength *= awayFitBonus;

        // Check for major mismatch to generate narrative
        const homeTotalFit = hOffFit + hDefFit;
        const awayTotalFit = aOffFit + aDefFit;
        const diff = homeTotalFit - awayTotalFit;

        if (Math.abs(diff) >= 30) {
            const betterTeam = diff > 0 ? home.abbr : away.abbr;
            const worseTeam = diff > 0 ? away.abbr : home.abbr;
            schemeNote = `Scheme Advantage: ${betterTeam}'s roster fit perfectly with their systems, exploiting ${worseTeam}'s mismatches.`;
        } else if (hOffFit < 40) {
            schemeNote = `Scheme Issue: ${home.abbr} offense struggled due to poor roster fit.`;
        } else if (aOffFit < 40) {
            schemeNote = `Scheme Issue: ${away.abbr} offense struggled due to poor roster fit.`;
        }

        if (false) console.log(`[SIM-DEBUG] Scheme Mods: Home ${homeFitBonus.toFixed(2)}, Away ${awayFitBonus.toFixed(2)}`);
    }

    // --- MORALE IMPACT ---
    const calculateTeamMorale = (activeRoster, team) => {
        if (!activeRoster || !activeRoster.length) return 75;
        let totalMorale = 0;
        activeRoster.forEach(p => {
             // Assuming active players are happy to be playing (treated as starters for calculation simplicity)
             const morale = calculateMorale(p, team, true);
             totalMorale += morale;
        });
        return totalMorale / activeRoster.length;
    };

    // Cache morale per team per batch (only changes weekly, not per-game)
    if (home._cachedMorale === undefined) home._cachedMorale = calculateTeamMorale(homeActive, home);
    if (away._cachedMorale === undefined) away._cachedMorale = calculateTeamMorale(awayActive, away);
    // Apply HC morale bonus (Motivator / Team Builder archetypes)
    let homeMorale = Math.min(100, home._cachedMorale + (homeHCMods.moraleBonus || 0));
    let awayMorale = Math.min(100, away._cachedMorale + (awayHCMods.moraleBonus || 0));

    // Revenge bump: if a notable player or head coach recently came from this opponent,
    // they are extra motivated for this matchup. We detect this via optional fields;
    // if the data is missing these checks are simply no-ops.
    const hasRevengeAngle = (team, opponent) => {
        try {
            // Players who used to be on the opponent
            if (Array.isArray(team.roster)) {
                for (const p of team.roster) {
                    if (
                        p.previousTeamId === opponent.id ||
                        p.lastTeamId === opponent.id ||
                        p.formerTeamId === opponent.id ||
                        p.draftedBy === opponent.id && p.yearsWithTeam === 0
                    ) {
                        return true;
                    }
                }
            }
            // Head coach who used to work for the opponent
            const hc = team.staff?.headCoach;
            if (hc && (
                hc.previousTeamId === opponent.id ||
                hc.lastTeamId === opponent.id ||
                (Array.isArray(hc.pastTeams) && hc.pastTeams.includes(opponent.id))
            )) {
                return true;
            }
        } catch {
            // Defensive: if older saves lack any of these fields, ignore.
        }
        return false;
    };

    if (hasRevengeAngle(home, away)) {
        homeMorale = Math.min(100, homeMorale + 3);
    }
    if (hasRevengeAngle(away, home)) {
        awayMorale = Math.min(100, awayMorale + 3);
    }

    // Morale Mod: 50 is neutral. 100 is +2%, 0 is -2% strength impact
    // Formula: 1.0 + ((morale - 50) / 50) * 0.02
    const getMoraleMod = (m) => 1.0 + ((m - 50) / 50) * 0.02;

    const homeMoraleMod = getMoraleMod(homeMorale);
    const awayMoraleMod = getMoraleMod(awayMorale);

    homeStrength *= homeMoraleMod;
    awayStrength *= awayMoraleMod;

    if (false) console.log(`[SIM-DEBUG] Morale Mods: Home ${homeMoraleMod.toFixed(3)} (${Math.round(homeMorale)}), Away ${awayMoraleMod.toFixed(3)} (${Math.round(awayMorale)})`);

    // =================================================================
    // ENHANCED NFL SCORING ENGINE v2
    // Drive-by-drive simulation with momentum, weather, turnovers,
    // defensive/special teams TDs, and clutch mechanics.
    // Average NFL game: ~22 points per team, range 0-50+ realistic.
    // =================================================================

    const HOME_ADVANTAGE = C.SIMULATION?.HOME_ADVANTAGE || C.HOME_ADVANTAGE || 3;

    // Rivalry variance boost
    let varianceBoost = 0;
    if (home.rivalries && away.rivalries) {
        const homeRiv = home.rivalries[away.id]?.score || 0;
        const awayRiv = away.rivalries[home.id]?.score || 0;
        const intensity = Math.max(homeRiv, awayRiv);
        if (intensity > 50) varianceBoost = 3;
        else if (intensity > 25) varianceBoost = 1.5;
    }
    if (options.stakes && options.stakes > 75) varianceBoost += 2;

    const strengthDiff = (homeStrength - awayStrength) + HOME_ADVANTAGE;

    // --- WEATHER SYSTEM ---
    // Weather affects passing, kicking, and turnover rates
    const WEATHER_TYPES = [
      { id: 'clear', weight: 40, passMod: 1.0, kickMod: 1.0, turnoverMod: 1.0, runMod: 1.0 },
      { id: 'dome', weight: 15, passMod: 1.05, kickMod: 1.02, turnoverMod: 0.92, runMod: 1.0 },
      { id: 'rain', weight: 15, passMod: 0.88, kickMod: 0.90, turnoverMod: 1.35, runMod: 1.08 },
      { id: 'snow', weight: 8, passMod: 0.82, kickMod: 0.82, turnoverMod: 1.45, runMod: 1.12 },
      { id: 'wind', weight: 12, passMod: 0.90, kickMod: 0.80, turnoverMod: 1.15, runMod: 1.05 },
      { id: 'cold', weight: 10, passMod: 0.95, kickMod: 0.92, turnoverMod: 1.10, runMod: 1.02 },
    ];
    // Determine game weather
    const isDome = home.stadium?.dome === true;
    let weather;
    if (isDome) {
      weather = WEATHER_TYPES[1]; // dome
    } else {
      const weatherWeights = WEATHER_TYPES.map(w => w.weight);
      weather = WEATHER_TYPES[U.weightedChoice(weatherWeights)];
    }

    const computeTeamEfficiencyProfile = (groups = {}) => {
        const starterQB = (groups['QB'] || [])[0] || null;
        const leadRB = (groups['RB'] || [])[0] || null;
        const ol = groups['OL'] || [];
        const passRush = [...(groups['DL'] || []), ...(groups['LB'] || [])];
        const dbs = [...(groups['CB'] || []), ...(groups['S'] || [])];

        const qbRating = (() => {
            if (!starterQB) return 78;
            const r = starterQB.ratings || {};
            const awareness = r.awareness || 70;
            const accuracy = r.throwAccuracy || 70;
            const power = r.throwPower || 70;
            return U.clamp(35 + (accuracy * 0.44) + (awareness * 0.33) + (power * 0.2), 55, 125);
        })();

        const rushYpc = (() => {
            const rbOvr = leadRB?.ovr || 68;
            const rbRatings = leadRB?.ratings || {};
            const runSkill = ((rbRatings.speed || 70) * 0.35) + ((rbRatings.trucking || 70) * 0.3) + ((rbRatings.juking || 70) * 0.35);
            const olRun = ol.length
                ? ol.reduce((sum, p) => sum + ((p.ratings?.runBlock || p.ovr || 70)), 0) / ol.length
                : 70;
            return U.clamp(2.7 + ((rbOvr - 70) * 0.02) + ((runSkill - 70) * 0.015) + ((olRun - 70) * 0.014), 2.8, 6.5);
        })();

        const passBlock = ol.length
            ? ol.reduce((sum, p) => sum + ((p.ratings?.passBlock || p.ovr || 70)), 0) / ol.length
            : 70;
        const passRushStrength = passRush.length
            ? passRush.reduce((sum, p) => sum + (p.ovr || 70), 0) / passRush.length
            : 70;
        const coverageStrength = dbs.length
            ? dbs.reduce((sum, p) => sum + (p.ovr || 70), 0) / dbs.length
            : 70;

        return {
            qbRating: U.round(qbRating, 1),
            rushYpc: U.round(rushYpc, 2),
            passBlock: U.round(passBlock, 1),
            passRushStrength: U.round(passRushStrength, 1),
            coverageStrength: U.round(coverageStrength, 1),
        };
    };

    const homeProfile = computeTeamEfficiencyProfile(homeGroups);
    const awayProfile = computeTeamEfficiencyProfile(awayGroups);

    /**
     * Full game simulation with alternating possessions, momentum, and
     * defensive/special teams scoring.
     *
     * Returns results for BOTH teams simultaneously to model interaction.
     */
    const simulateFullGame = (homeStr, awayStr, homeDefStr, awayDefStr, diff, hMods, aMods, options, hGroups, aGroups) => {
        const result = {
          playLogs: [],
          home: { score: 0, touchdowns: 0, field_goals: 0, xpMade: 0, twoPtMade: 0,
                  defensiveTDs: 0, turnoversForced: 0, safeties: 0 },
          away: { score: 0, touchdowns: 0, field_goals: 0, xpMade: 0, twoPtMade: 0,
                  defensiveTDs: 0, turnoversForced: 0, safeties: 0 },
        };

        // ── Tactical Tendency (User Influence Layer) ──────────────────────
        // Marginal ±10% probability shifts; does not guarantee outcomes.
        const _userTendency = String(options?.userTendency || 'BALANCED').toUpperCase();
        const _userTeamId   = Number(options?.league?.userTeamId || options?.userTeamId || 0);
        const _homeId       = Number(home?.id || 0);
        const _awayId       = Number(away?.id || 0);
        // ─────────────────────────────────────────────────────────────────

        // Momentum tracker: -100 (away hot) to +100 (home hot)
        let momentum = 0;

        // ── Player selection helpers (owned by playExecution.js) ───────────
        // Bound to the seeded Utils PRNG; thin aliases keep the live-log loop
        // readable while the selection math lives in the play-execution module.
        const _pick = (groups, pos) => pickStarterWeighted(groups, pos, U);
        const _pickRec = (groups) => pickReceiver(groups, U);
        const _pickRusher = (groups) => pickRusher(groups, U);
        const _pickDB = (groups) => pickDefBack(groups, U);
        const _pickTackler = (groups) => pickTackler(groups, U);
        const _pickCoverage = (groups) => pickCoverage(groups, U);
        const _n = (p) => formatPlayerName(p);

        // Live per-play stat fields (accumulated over logs for live display)
        const liveStats = {};
        const _addStat = (p, key, amt = 1) => {
            if (!p) return;
            const id = String(p.id);
            if (!liveStats[id]) liveStats[id] = { id: p.id, name: p.name, pos: p.pos };
            liveStats[id][key] = (liveStats[id][key] || 0) + amt;
        };
        // ── end player helpers ─────────────────────────────────────────────

        // NFL game: ~22 total possessions (11 per team)
        const totalDrives = U.rand(20, 26);
        let possession = U.random() < 0.5 ? 'home' : 'away';

        // Track consecutive scores/stops for momentum
        let lastScoringTeam = null;
        let scoringStreak = 0;

        for (let d = 0; d < totalDrives; d++) {
            const isHome = possession === 'home';
            const offStr = isHome ? homeStr : awayStr;
            const defStr = isHome ? awayDefStr : homeDefStr;
            const mods = isHome ? hMods : aMods;
            const defMods = isHome ? aMods : hMods;
            const offTeam = isHome ? result.home : result.away;
            const defTeam = isHome ? result.away : result.home;
            const advantage = isHome ? diff : -diff;

            const offFactor = (offStr - 50) / 40;
            const defFactor = (defStr - 50) / 40;
            const offProfile = isHome ? homeProfile : awayProfile;
            const defProfile = isHome ? awayProfile : homeProfile;
            const qbEfficiencyEdge = (offProfile.qbRating - defProfile.coverageStrength) / 160;
            const rushEfficiencyEdge = (offProfile.rushYpc - 4.2) * 0.13;
            const netQuality = offFactor - defFactor + (advantage / 50) + qbEfficiencyEdge + rushEfficiencyEdge;

            // Momentum modifier: ±5% scoring probability
            const momentumMod = isHome
              ? U.clamp(momentum / 2000, -0.05, 0.05)
              : U.clamp(-momentum / 2000, -0.05, 0.05);

            // Game script: trailing team gets more aggressive in later drives
            const scoreDiffNow = result.home.score - result.away.score;
            const trailingMod = (d >= totalDrives * 0.6) ? (
              (isHome && scoreDiffNow < -10) ? 0.06 :
              (!isHome && scoreDiffNow > 10) ? 0.06 : 0
            ) : 0;

            // Garbage time: leading team runs more, scores less efficiently late
            const garbageMod = (d >= totalDrives * 0.75 && Math.abs(scoreDiffNow) >= 21) ? -0.08 : 0;

            const varianceMod = (mods.variance || 1.0);
            const upsetChance = varianceBoost * 0.012;
            const rzFactor = (offStr - 60) * 0.004;

            // Scoring probability per drive
            let scoreProb = 0.33 + netQuality * 0.18 + upsetChance + momentumMod + trailingMod + garbageMod;
            scoreProb *= weather.passMod * 0.3 + 0.7; // weather has partial effect on scoring
            scoreProb = U.clamp(scoreProb, 0.10, 0.60);

            // TD share within scoring drives
            let tdShare = 0.55 + rzFactor;
            if (mods.passVolume && mods.passVolume > 1.1) tdShare += 0.05;
            if (mods.runVolume && mods.runVolume > 1.1) tdShare -= 0.05;
            if (mods.redZoneMod && mods.redZoneMod !== 1.0) tdShare *= mods.redZoneMod;
            tdShare = U.clamp(tdShare, 0.35, 0.75);

            // ── User Tendency: marginal drive-level influence ─────────────
            const isUserPossession = _userTeamId > 0 &&
                ((isHome && _homeId === _userTeamId) || (!isHome && _awayId === _userTeamId));
            if (isUserPossession) {
                if (_userTendency === 'AGGRESSIVE') {
                    scoreProb = Math.min(0.65, scoreProb + 0.04);
                    tdShare   = Math.min(0.80, tdShare   + 0.06);
                } else if (_userTendency === 'CONSERVATIVE') {
                    scoreProb = Math.max(0.10, scoreProb - 0.02);
                    tdShare   = Math.max(0.30, tdShare   - 0.04);
                }
            }
            // ─────────────────────────────────────────────────────────────

            // ── Strategic Responsiveness: bounded ±5% schematic edge ──────
            // The offense's schematic leverage minus the defense's, hard-capped
            // at ±5 percentage points so roster quality stays the primary driver.
            // Applied AFTER the RNG-free probability build and BEFORE driveRoll
            // is drawn, so the seeded RNG stream is byte-for-byte unchanged —
            // only the comparison threshold shifts.
            const stratEdge = U.clamp((mods.strategicEdge || 0) - (defMods.strategicEdge || 0), -0.05, 0.05);
            scoreProb = U.clamp(scoreProb + stratEdge, 0.10, 0.65);

            const driveRoll = U.random();

            // Play-by-play log helper (shared by scoring and non-scoring drives)
            const logDrive = options && options.generateLogs;
            const offAbbr = isHome ? (options.homeAbbr || 'HOME') : (options.awayAbbr || 'AWAY');
            const defAbbr = isHome ? (options.awayAbbr || 'AWAY') : (options.homeAbbr || 'HOME');
            // Quarter + clock derivation owned by clockManager (RNG-free).
            const qtr = computeQuarter(d, totalDrives);
            const drivesPerQtr = drivesPerQuarter(totalDrives);
            const driveInQtr = d % drivesPerQtr;
            const clockMins = getQuarterClockMinutes(driveInQtr, drivesPerQtr);
            const clockSecs = U.rand(0, 5) * 10;
            const clockStr = `${clockMins}:${String(clockSecs).padStart(2, '0')}`;

            // Track field position through the drive
            let yardLine = U.rand(20, 35); // starting field position
            let currentDown = 1;
            let yardsToGo = 10;

            const addLog = (text, extraYardLine, playType, playerRef, extraFields) => {
                const yl = extraYardLine != null ? extraYardLine : yardLine;
                // Infer yards gained from text if not provided
                const yardsMatch = text.match(/for\s+(-?\d+)\s+yds?/i);
                const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : 0;
                // Infer type from text
                const lc = text.toLowerCase();
                const type = playType || (
                    lc.includes('touchdown') ? 'touchdown' :
                    lc.includes('field goal') ? 'field_goal' :
                    lc.includes('interception') ? 'interception' :
                    lc.includes('fumble') ? 'fumble' :
                    lc.includes('sack') ? 'sack' :
                    lc.includes('safety') ? 'safety' :
                    lc.includes('punt') ? 'punt' : 'play'
                );
                // Win probability: simple logistic from score diff + quarter
                const scoreDiff = result.home.score - result.away.score;
                const qtrFactor = qtr / 4;
                const rawWP = 0.5 + scoreDiff * 0.02 * (0.5 + qtrFactor * 0.5);
                const homeWinProb = Math.max(0.03, Math.min(0.97, rawWP));

                result.playLogs.push({
                    // Score fields — new names (SeasonSimViewer) + legacy aliases (LiveGameViewer)
                    homeScore: result.home.score,
                    awayScore: result.away.score,
                    scoreHome: result.home.score,   // LiveGameViewer alias
                    scoreAway: result.away.score,   // LiveGameViewer alias
                    quarter: qtr,
                    timeLeft: clockStr,
                    clock: clockStr,
                    // Field / play metadata
                    fieldPosition: yl,
                    yardLine: yl,
                    down: currentDown,
                    distance: yardsToGo,
                    yards,
                    possession,
                    type,
                    text,
                    playText: text,                 // LiveGameViewer alias
                    homeWinProb,
                    // Player-specific fields (Priority 1 + 2)
                    player: playerRef || null,
                    ...(extraFields || {}),
                });
            };

            if (driveRoll < scoreProb) {
                // --- SCORING DRIVE ---
                const typeRoll = U.random();
                if (logDrive) {
                    // Resolve player groups for this possession
                    const offGrp = isHome ? hGroups : aGroups;
                    const defGrp = isHome ? aGroups : hGroups;
                    // Simulate a realistic multi-play drive
                    // Tendency-adjusted pass/run split (scoring drives)
                    const _sPassT = isUserPossession && _userTendency === 'AGGRESSIVE' ? 0.55
                        : isUserPossession && _userTendency === 'CONSERVATIVE' ? 0.35 : 0.45;
                    const _sRunT  = isUserPossession && _userTendency === 'AGGRESSIVE' ? 0.80
                        : isUserPossession && _userTendency === 'CONSERVATIVE' ? 0.70 : 0.75;
                    const numPlays = U.rand(3, 8);
                    for (let i = 0; i < numPlays; i++) {
                        const gain = U.rand(-2, 18);
                        const catchYds = Math.max(0, gain);
                        const playRoll = U.random();
                        const qb = _pick(offGrp, 'QB');
                        // Branch boundaries owned by playExecution.classifyOffensivePlay.
                        const playType = classifyOffensivePlay(playRoll, [
                            { limit: _sPassT, type: 'pass' },
                            { limit: _sRunT, type: 'run' },
                            { limit: _sRunT + 0.07, type: 'incomplete' },
                            { limit: 0.88, type: 'sack' },
                            { limit: 0.93, type: 'penalty' },
                        ], 'screen');
                        if (playType === 'pass') {
                            const rec = _pickRec(offGrp);
                            if (qb && rec) {
                                _addStat(qb, 'passAtt'); _addStat(qb, 'passComp'); _addStat(qb, 'passYds', catchYds);
                                _addStat(rec, 'targets'); _addStat(rec, 'receptions'); _addStat(rec, 'recYds', catchYds);
                                addLog(`${_n(qb)} finds ${_n(rec)} for ${catchYds} yds.`, null, 'pass', rec,
                                    { passer: qb, passYds: catchYds, completed: true });
                            } else {
                                addLog(`${offAbbr} pass complete for ${catchYds} yds.`);
                            }
                        } else if (playType === 'run') {
                            const rb = _pick(offGrp, 'RB') || qb;
                            const tackler = _pickTackler(defGrp);
                            if (rb) {
                                _addStat(rb, 'rushAtt'); _addStat(rb, 'rushYds', catchYds);
                                if (tackler) _addStat(tackler, 'tackles');
                                const tackleText = tackler ? `, tackled by ${_n(tackler)}` : '';
                                addLog(`${_n(rb)} rushes for ${catchYds} yds${tackleText}.`, null, 'run', rb,
                                    { rushYds: catchYds, tackler });
                            } else {
                                addLog(`${offAbbr} runs for ${catchYds} yds.`);
                            }
                        } else if (playType === 'incomplete') {
                            const rec = _pickRec(offGrp);
                            const coverage = _pickCoverage(defGrp);
                            if (qb) {
                                _addStat(qb, 'passAtt'); if (rec) _addStat(rec, 'targets');
                                if (coverage) _addStat(coverage, 'passDefls');
                                const defText = coverage ? `, broken up by ${_n(coverage)}` : '';
                                addLog(`${_n(qb)} incomplete${rec ? ` toward ${_n(rec)}` : ''}${defText}.`, null, 'pass', qb,
                                    { passer: qb, completed: false, defender: coverage });
                            } else { addLog(`${offAbbr} pass incomplete.`); }
                        } else if (playType === 'sack') {
                            const rusher = _pickRusher(defGrp);
                            const sackYds = U.rand(3, 10);
                            if (rusher && qb) {
                                _addStat(rusher, 'sacks');
                                _addStat(qb, 'sacked', 1);
                                addLog(`${_n(rusher)} sacks ${_n(qb)}! Loss of ${sackYds} yds.`, null, 'sack', rusher,
                                    { sackedQB: qb });
                            } else { addLog(`${defAbbr} sack! Loss of ${sackYds} yds.`); }
                        } else if (playType === 'penalty') {
                            addLog(`Penalty on ${U.random() > 0.5 ? offAbbr : defAbbr}: ${U.rand(5, 15)} yds.`);
                        } else {
                            const rec = _pickRec(offGrp);
                            if (qb && rec) {
                                _addStat(qb, 'passAtt'); _addStat(qb, 'passComp'); _addStat(qb, 'passYds', catchYds);
                                _addStat(rec, 'targets'); _addStat(rec, 'receptions'); _addStat(rec, 'recYds', catchYds);
                                addLog(`${_n(qb)} dumps off to ${_n(rec)} for ${catchYds} yds.`, null, 'pass', rec,
                                    { passer: qb, passYds: catchYds, completed: true });
                            } else { addLog(`${offAbbr} screen pass for ${catchYds} yds.`); }
                        }
                        // Down/distance/field-position machine (driveEngine).
                        const _dd = advanceDownDistance({ down: currentDown, distance: yardsToGo, yardLine }, gain);
                        yardLine = _dd.yardLine;
                        yardsToGo = _dd.distance;
                        currentDown = Math.min(_dd.down, 4);
                    }
                    // Scoring play — tendency shifts TD pass probability and depth
                    const _tdPassProb = isUserPossession && _userTendency === 'AGGRESSIVE' ? 0.75
                        : isUserPossession && _userTendency === 'CONSERVATIVE' ? 0.50 : 0.65;
                    const _tdYardsMin = isUserPossession && _userTendency === 'AGGRESSIVE' ? 15 : 3;
                    const _tdYardsMax = isUserPossession && _userTendency === 'AGGRESSIVE' ? 55 : 42;
                    if (typeRoll < tdShare) {
                        const qb = _pick(offGrp, 'QB');
                        const isTDPass = U.random() < _tdPassProb && qb;
                        const tdYds = U.rand(_tdYardsMin, _tdYardsMax);
                        if (isTDPass) {
                            const rec = _pickRec(offGrp);
                            if (rec) {
                                _addStat(qb, 'passAtt'); _addStat(qb, 'passComp'); _addStat(qb, 'passYds', tdYds);
                                _addStat(qb, 'passTDs');
                                _addStat(rec, 'targets'); _addStat(rec, 'receptions'); _addStat(rec, 'recYds', tdYds);
                                _addStat(rec, 'recTDs');
                                addLog(`TOUCHDOWN! ${_n(rec)} catches ${tdYds}-yard TD pass from ${_n(qb)}!`, 100, 'touchdown', rec,
                                    { passer: qb, passYds: tdYds, recYds: tdYds, isTouchdown: true, tdType: 'pass' });
                            } else {
                                _addStat(qb, 'passTDs');
                                addLog(`TOUCHDOWN! ${offAbbr} passing TD!`, 100, 'touchdown', qb, { isTouchdown: true, tdType: 'pass' });
                            }
                        } else {
                            const rb = _pick(offGrp, 'RB') || qb;
                            if (rb) {
                                _addStat(rb, 'rushAtt'); _addStat(rb, 'rushYds', tdYds); _addStat(rb, 'rushTDs');
                                addLog(`TOUCHDOWN! ${_n(rb)} punches it in from ${tdYds} yards out!`, 100, 'touchdown', rb,
                                    { rushYds: tdYds, isTouchdown: true, tdType: 'rush' });
                            } else {
                                addLog(`${offAbbr} TOUCHDOWN!`, 100, 'touchdown');
                            }
                        }
                    } else {
                        addLog(`${offAbbr} field goal attempt... GOOD!`, yardLine, 'field_goal');
                    }
                }


                if (typeRoll < tdShare) {
                    // Touchdown + PAT (scoring handler owned by scoreKeeper)
                    const td = resolveTouchdownScore(U.random(), weather.kickMod);
                    offTeam.score += td.points;
                    offTeam.xpMade += td.xpMade;
                    offTeam.twoPtMade += td.twoPtMade;
                    offTeam.touchdowns++;
                } else {
                    // Field goal (weather affects accuracy); a miss yields no points.
                    const fg = resolveFieldGoalScore(U.random(), weather.kickMod);
                    if (fg.made) {
                        offTeam.score += fg.points;
                        offTeam.field_goals++;
                    }
                }

                // Momentum shift towards scoring team
                // HC Motivator archetype amplifies momentum swings
                const momentumMult = mods.momentumMultiplier || 1.0;
                if (lastScoringTeam === possession) {
                    scoringStreak++;
                    momentum += (isHome ? 12 : -12) * Math.min(scoringStreak, 3) * momentumMult;
                } else {
                    scoringStreak = 1;
                    lastScoringTeam = possession;
                    momentum += (isHome ? 10 : -10) * momentumMult;
                }
            } else {
                // --- NON-SCORING DRIVE ---
                // Check for turnover (fumble, INT)
                const baseTurnoverRate = 0.14 * weather.turnoverMod;
                let turnoverChance = baseTurnoverRate;
                turnoverChance *= (1 + U.clamp((defProfile.passRushStrength - offProfile.passBlock) / 220, -0.12, 0.18));
                if (mods.intChance) turnoverChance *= (mods.intChance - 1) * 0.3 + 1;
                if (defMods.defIntChance) turnoverChance *= (defMods.defIntChance - 1) * 0.3 + 1;
                if (defMods.defPressure) turnoverChance *= 1 + (defMods.defPressure - 1) * 0.15;
                // HC Disciplinarian reduces own turnovers (applied to OFFENSIVE team's chance)
                if (mods.turnoverReduction) turnoverChance *= mods.turnoverReduction;

                let driveEndedInTurnover = false;
                let driveEndedInSafety = false;
                let driveEndedInDefTD = false;

                if (U.random() < turnoverChance) {
                    defTeam.turnoversForced++;
                    driveEndedInTurnover = true;

                    // Defensive/Special Teams TD chance (pick-six, fumble return, scoop-and-score)
                    // NFL average: ~5% of turnovers returned for TD
                    const defTDChance = 0.05 + (defStr - 70) * 0.002;
                    if (U.random() < defTDChance) {
                        defTeam.defensiveTDs++;
                        driveEndedInDefTD = true;
                        const defTd = resolveDefensiveTouchdownScore(U.random());
                        defTeam.score += defTd.points;
                        defTeam.xpMade += defTd.xpMade;

                        // Huge momentum swing on defensive TD
                        momentum += isHome ? -25 : 25;
                    } else {
                        // Normal turnover — moderate momentum swing
                        momentum += isHome ? -8 : 8;
                    }
                }

                // Safety chance (~0.5% of drives in NFL)
                if (U.random() < 0.005 + (defStr - offStr) * 0.0001) {
                    defTeam.score += resolveSafetyScore().points;
                    defTeam.safeties++;
                    driveEndedInSafety = true;
                    momentum += isHome ? -15 : 15;
                }

                // Generate non-scoring drive logs
                if (logDrive) {
                    const offGrp = isHome ? hGroups : aGroups;
                    const defGrp = isHome ? aGroups : hGroups;
                    // Tendency-adjusted pass/run split (non-scoring drives)
                    const _nsPassT = isUserPossession && _userTendency === 'AGGRESSIVE' ? 0.50
                        : isUserPossession && _userTendency === 'CONSERVATIVE' ? 0.30 : 0.40;
                    const _nsRunT  = isUserPossession && _userTendency === 'AGGRESSIVE' ? 0.72
                        : isUserPossession && _userTendency === 'CONSERVATIVE' ? 0.58 : 0.65;
                    const numPlays = U.rand(2, 5);
                    for (let i = 0; i < numPlays; i++) {
                        const gain = U.rand(-3, 12);
                        const catchYds = Math.max(0, gain);
                        const playRoll = U.random();
                        const qb = _pick(offGrp, 'QB');
                        // Branch boundaries owned by playExecution.classifyOffensivePlay.
                        const playType = classifyOffensivePlay(playRoll, [
                            { limit: _nsPassT, type: 'pass' },
                            { limit: _nsRunT, type: 'run' },
                            { limit: _nsRunT + 0.08, type: 'incomplete' },
                            { limit: _nsRunT + 0.18, type: 'sack' },
                        ], 'penalty');
                        if (playType === 'pass') {
                            const rec = _pickRec(offGrp);
                            if (qb && rec) {
                                _addStat(qb, 'passAtt'); _addStat(qb, 'passComp'); _addStat(qb, 'passYds', catchYds);
                                _addStat(rec, 'targets'); _addStat(rec, 'receptions'); _addStat(rec, 'recYds', catchYds);
                                addLog(`${_n(qb)} connects with ${_n(rec)} for ${catchYds} yds.`, null, 'pass', rec,
                                    { passer: qb, passYds: catchYds, completed: true });
                            } else { addLog(`${offAbbr} pass complete for ${catchYds} yds.`); }
                        } else if (playType === 'run') {
                            const rb = _pick(offGrp, 'RB') || qb;
                            const tackler = _pickTackler(defGrp);
                            if (rb) {
                                _addStat(rb, 'rushAtt'); _addStat(rb, 'rushYds', catchYds);
                                if (tackler) _addStat(tackler, 'tackles');
                                const tackleText = tackler ? `, tackled by ${_n(tackler)}` : '';
                                addLog(`${_n(rb)} carries for ${catchYds} yds${tackleText}.`, null, 'run', rb,
                                    { rushYds: catchYds, tackler });
                            } else { addLog(`${offAbbr} runs for ${catchYds} yds.`); }
                        } else if (playType === 'incomplete') {
                            const rec = _pickRec(offGrp);
                            const coverage = _pickCoverage(defGrp);
                            if (qb) {
                                _addStat(qb, 'passAtt'); if (rec) _addStat(rec, 'targets');
                                if (coverage) _addStat(coverage, 'passDefls');
                                const defText = coverage ? `, broken up by ${_n(coverage)}` : '';
                                addLog(`${_n(qb)} incomplete${rec ? ` toward ${_n(rec)}` : ''}${defText}.`, null, 'pass', qb,
                                    { completed: false, defender: coverage });
                            } else { addLog(`${offAbbr} pass incomplete.`); }
                        } else if (playType === 'sack') {
                            const rusher = _pickRusher(defGrp);
                            const sackYds = U.rand(3, 8);
                            if (rusher && qb) {
                                _addStat(rusher, 'sacks');
                                _addStat(qb, 'sacked', 1);
                                addLog(`${_n(rusher)} sacks ${_n(qb)}! Loss of ${sackYds} yds.`, null, 'sack', rusher,
                                    { sackedQB: qb });
                            } else { addLog(`${defAbbr} sack! Loss of ${sackYds} yds.`); }
                        } else {
                            addLog(`Penalty: ${U.rand(5, 15)} yds.`);
                        }
                        // Down/distance/field-position machine (driveEngine).
                        const _dd = advanceDownDistance({ down: currentDown, distance: yardsToGo, yardLine }, gain);
                        yardLine = _dd.yardLine;
                        yardsToGo = _dd.distance;
                        currentDown = Math.min(_dd.down, 4);
                    }
                    // Drive ending plays
                    const _offGrp = isHome ? hGroups : aGroups;
                    const _defGrp = isHome ? aGroups : hGroups;
                    if (driveEndedInSafety) {
                        addLog(`SAFETY! ${defAbbr} scores 2 points!`, null, 'safety');
                    } else if (driveEndedInDefTD) {
                        const isInt = U.random() > 0.5;
                        const offQB = _pick(_offGrp, 'QB');
                        const defPlayer = isInt ? _pickDB(_defGrp) : _pickRusher(_defGrp);
                        const retYds = U.rand(25, 98);
                        if (isInt && defPlayer && offQB) {
                            _addStat(defPlayer, 'ints'); _addStat(defPlayer, 'intTDs');
                            _addStat(offQB, 'interceptions', 1);
                            addLog(`INTERCEPTION by ${_n(defPlayer)}! Picks off ${_n(offQB)} and takes it ${retYds} yards for a TOUCHDOWN!`,
                                null, 'touchdown', defPlayer, { isTouchdown: true, tdType: 'int_return', intedQB: offQB });
                        } else if (defPlayer) {
                            _addStat(defPlayer, 'fumbleRecs');
                            addLog(`FUMBLE recovered by ${_n(defPlayer)}! Returned ${retYds} yards for a TOUCHDOWN!`,
                                null, 'touchdown', defPlayer, { isTouchdown: true, tdType: 'fumble_return' });
                        } else {
                            addLog(`${U.random() > 0.5 ? 'INTERCEPTION' : 'FUMBLE'} returned for a TOUCHDOWN by ${defAbbr}!`,
                                null, 'touchdown');
                        }
                    } else if (driveEndedInTurnover) {
                        const isInt = U.random() > 0.5;
                        const offQB = _pick(_offGrp, 'QB');
                        if (isInt) {
                            const db = _pickDB(_defGrp);
                            if (db && offQB) {
                                _addStat(db, 'ints');
                                _addStat(offQB, 'interceptions', 1);
                                addLog(`INTERCEPTION by ${_n(db)}! Picks off ${_n(offQB)}. ${defAbbr} ball.`,
                                    null, 'interception', db, { intedQB: offQB });
                            } else { addLog(`INTERCEPTION! ${defAbbr} takes over.`, null, 'interception'); }
                        } else {
                            const rb = _pick(_offGrp, 'RB');
                            const dl = _pickRusher(_defGrp);
                            if (rb) {
                                if (dl) { _addStat(dl, 'forcedFumbles'); _addStat(dl, 'fumbleRecs'); }
                                const forcedText = dl ? ` Forced and recovered by ${_n(dl)}.` : '';
                                addLog(`FUMBLE by ${_n(rb)}!${forcedText} ${defAbbr} takes over.`,
                                    null, 'fumble', rb, { defender: dl, forcedFumble: dl });
                            } else { addLog(`FUMBLE! ${defAbbr} takes over.`, null, 'fumble'); }
                        }
                    } else if (isUserPossession && _userTendency === 'AGGRESSIVE' && U.random() < 0.25) {
                        addLog(`${offAbbr} goes for it on 4th down!`, yardLine, 'play');
                    } else {
                        addLog(`${offAbbr} punts.`, null, 'punt');
                    }
                }

                // Momentum decays towards neutral on non-scoring drives
                momentum *= 0.92;
            }

            // Clamp momentum
            momentum = U.clamp(momentum, -100, 100);

            // Alternate possession
            possession = isHome ? 'away' : 'home';
        }

        // --- SPECIAL TEAMS SCORING (Kick/Punt Return TDs) ---
        // NFL average: ~2-3 return TDs per team per season (~0.15/game)
        const checkReturnTD = (team, oppDefStr) => {
            const str = team === result.home ? homeStr : awayStr;
            const returnTDChance = calculateReturnTDChance(str);
            if (U.random() < returnTDChance) {
                team.score += 7;
                team.touchdowns++;
                team.xpMade++;
            }
        };
        checkReturnTD(result.home, awayDefStr);
        checkReturnTD(result.away, homeDefStr);

        result.liveStats = liveStats;
        return result;
    };

    const fullGameResult = simulateFullGame(
        homeStrength, awayStrength, homeDefenseStrength, awayDefenseStrength,
        strengthDiff, homeMods, awayMods, options, homeGroups, awayGroups
    );

    const homeRes = fullGameResult.home;
    const awayRes = fullGameResult.away;

    const driveSummary = buildDriveBasedSummary({
      season: options?.league?.seasonId ?? options?.league?.year ?? 0,
      week: options?.league?.week ?? 1,
      home,
      away,
      homeOff: homeStrength,
      awayOff: awayStrength,
      homeDef: homeDefenseStrength,
      awayDef: awayDefenseStrength,
      homeFieldAdv: 0.03,
      homeStrategicEdge: homeStrategicEdge.edge,
      awayStrategicEdge: awayStrategicEdge.edge,
      globalSeed: Number(options?.league?.globalSeed) || 0,
    });

    let homeScore = Math.max(0, driveSummary?.homeScore ?? homeRes.score);
    let awayScore = Math.max(0, driveSummary?.awayScore ?? awayRes.score);
    // The drive engine is the single authoritative source for BOTH the score and
    // the scoring-play breakdown, so the box score always sums to the scoreboard
    // (7*TDs + 3*FGs == score). Fall back to engine A only if the drive summary
    // is unavailable.
    let homeTDs = driveSummary?.homeTDs ?? homeRes.touchdowns;
    let awayTDs = driveSummary?.awayTDs ?? awayRes.touchdowns;
    let homeFGs = driveSummary?.homeFGs ?? homeRes.field_goals;
    let awayFGs = driveSummary?.awayFGs ?? awayRes.field_goals;
    let homeXPs = driveSummary?.homeXPs ?? homeRes.xpMade;
    let awayXPs = driveSummary?.awayXPs ?? awayRes.xpMade;

    // --- OVERTIME LOGIC WITH CLUTCH MECHANICS ---
    // If tied at end of regulation, simulate OT
    // Clutch trait on QB gives a scoring boost in OT
    if (homeScore === awayScore) {
        if (false) console.log(`[SIM-DEBUG] Regulation tied at ${homeScore}. Entering OT...`);
        const isPlayoff = options.isPlayoff === true;
        const overtimeFormat = String(options?.overtimeFormat ?? 'nfl');
        const allowTies = overtimeFormat === 'college' ? false : (!isPlayoff && (options.allowTies !== false));

        // Calculate clutch bonuses from QB traits and personality
        const getClutchBonus = (groups) => {
            const qbs = groups['QB'] || [];
            if (qbs.length === 0) return 0;
            const qb = qbs[0];
            let bonus = 0;
            // Clutch personality trait
            if (qb.personality?.traits?.includes('Clutch')) bonus += 0.06;
            // High awareness helps in pressure situations
            if ((qb.ratings?.awareness || 70) >= 85) bonus += 0.03;
            // X-Factor dev trait
            if (qb.devTrait === 'X-Factor') bonus += 0.04;
            else if (qb.devTrait === 'Superstar') bonus += 0.02;
            return bonus;
        };

        const homeClutch = getClutchBonus(homeGroups);
        const awayClutch = getClutchBonus(awayGroups);

        let gameOver = false;
        let possession = U.random() < 0.5 ? 'home' : 'away';
        let possessions = 0;

        const maxPossessions = allowTies ? 8 : 50;
        const HARD_ITERATION_CAP = 50;

        while (!gameOver && possessions < maxPossessions && possessions < HARD_ITERATION_CAP) {
            possessions++;
            const offStrength = possession === 'home' ? homeStrength : awayStrength;
            const defStrength = possession === 'home' ? awayStrength : homeStrength;
            const clutchBonus = possession === 'home' ? homeClutch : awayClutch;

            const diff = offStrength - defStrength;
            const scoreChance = 0.35 + (diff / 200) + clutchBonus;

            let drivePoints = 0;
            if (U.rand(0, 100) / 100 < scoreChance) {
                if (U.rand(0, 100) < 60) {
                    // Touchdown
                    drivePoints = 6;
                    let xp = 0;
                    if (U.rand(0,100) < 95) {
                        drivePoints += 1;
                        xp = 1;
                    }
                    if (possession === 'home') { homeTDs++; homeXPs += xp; }
                    else { awayTDs++; awayXPs += xp; }
                } else {
                    // Field Goal
                    drivePoints = 3;
                    if (possession === 'home') homeFGs++;
                    else awayFGs++;
                }
            }

            if (false) console.log(`[SIM-DEBUG] OT Drive ${possessions}: ${possession} scores ${drivePoints}`);

            // Apply score
            if (drivePoints > 0) {
                if (possession === 'home') {
                    homeScore += drivePoints;
                } else {
                    awayScore += drivePoints;
                }
            }

            // End-of-game decision (NFL 2024+ / college rules) owned by clockManager.
            if (isOvertimeGameOver({ overtimeFormat, possessions, homeScore, awayScore, allowTies })) {
                gameOver = true;
            }

            possession = possession === 'home' ? 'away' : 'home';
        }

        if (possessions >= HARD_ITERATION_CAP) {
            console.warn(`[SIM-DEBUG] OT hit hard iteration cap (${HARD_ITERATION_CAP}). Forcing end.`);
            // Force a winner if still tied after safety cap
            if (homeScore === awayScore) {
                if (U.random() < 0.5) homeScore += 3;
                else awayScore += 3;
            }
        }

        if (false) console.log(`[SIM-DEBUG] OT Final: ${homeScore}-${awayScore}`);
    }

    if (false) console.log(`[SIM-DEBUG] Scores Generated: ${home.abbr} ${homeScore} - ${away.abbr} ${awayScore}`);

    const generateStatsForTeam = (team, score, oppScore, oppDefenseStrength, oppOffenseStrength, groups, mods, actualTDs, actualFGs, actualXPs, actualTwoPts) => {
      // Helper to handle positional injuries (QB/RB/WR)
      // Returns { stats, injury }
      const processPositionGroup = (players, generateStatsFn, shareDistribution = [1.0], ...args) => {
          if (!players || players.length === 0) return;

          // Only check injury for the starter (index 0) for now, or iterate
          // Simpler: iterate provided players and apply shares

          // Special logic for QB/RB/WR starters getting injured mid-game
          const starter = players[0];
          let starterShare = shareDistribution[0] || 1.0;
          let backupShare = 0;
          let injury = null;

          // Roll for injury on starter (mods.injuryChanceMod from medical staff / HC).
          // Injury rolls + mutations owned by injuryResolver.
          if (starter) {
             injury = rollInGameInjury(
                 starter,
                 { injuryChanceMod: mods.injuryChanceMod || 1.0 },
                 { generateInjury, canPlayerPlay },
             );

             if (injury) {
                 // They got hurt. Determine when (10% to 90% of game played).
                 const playedShare = 0.1 + (U.random() * 0.8);
                 const sub = resolveInjurySubstitutionShare(shareDistribution[0] || 1.0, playedShare);
                 starterShare = sub.starterShare;
                 backupShare = sub.backupShare;

                 applyInjuryToPlayer(starter, injury);
                 gameInjuries.push(buildGameInjuryEntry(starter, team.id, injury));
             }
          }

          // Process Starter
          if (starter) {
              const stats = generateStatsFn(starter, ...args, starterShare);
              // Zero out random TDs (handled later)
              if (stats.passTD !== undefined) stats.passTD = 0;
              if (stats.rushTD !== undefined) stats.rushTD = 0;
              if (stats.recTD !== undefined) stats.recTD = 0;
              Object.assign(starter.stats.game, stats);
          }

          // Process Backup if needed (either due to injury or rotation)
          const backup = players[1];
          // Normal rotation share + extra form injury
          let rotationShare = shareDistribution[1] || 0;
          let totalBackupShare = rotationShare + backupShare;

          if (backup && totalBackupShare > 0.05) {
               const stats = generateStatsFn(backup, ...args, totalBackupShare);
               if (stats.passTD !== undefined) stats.passTD = 0;
               if (stats.rushTD !== undefined) stats.rushTD = 0;
               if (stats.recTD !== undefined) stats.recTD = 0;
               Object.assign(backup.stats.game, stats);
          }
      };

       team.roster.forEach(player => {
        initializePlayerStats(player);
        player.stats.game = {};
      });

      const qbs = groups['QB'] || [];
      let totalPassAttempts = 30;

      // QB Injury/Stats Logic
      if (qbs.length > 0) {
          processPositionGroup(qbs,
            (p, s, os, d, u, m, share) => generateQBStats(p, s, os, d, u, m, share),
            [1.0], // 100% share for starter normally
            score, oppScore, oppDefenseStrength, U, mods
          );

          // Update totalPassAttempts based on whoever played
          const starterStats = qbs[0].stats.game;
          const backupStats = qbs[1] ? qbs[1].stats.game : {};
          totalPassAttempts = (starterStats.passAtt || 0) + (backupStats.passAtt || 0) || 30;

          // Assign Win/Loss to starter
          if (qbs[0]) {
             if (score > oppScore) qbs[0].stats.game.wins = 1;
             else if (score < oppScore) qbs[0].stats.game.losses = 1;
          }
      }

      const rbs = (groups['RB'] || []).slice(0, 3);
      // RB Injury/Stats Logic
      // 70/30 split normally
      processPositionGroup(rbs,
        (p, s, os, d, u, m, share) => generateRBStats(p, s, os, d, u, m, share),
        [0.7, 0.3],
        score, oppScore, oppDefenseStrength, U, mods
      );

      const wrs = (groups['WR'] || []).slice(0, 5);
      const tes = (groups['TE'] || []).slice(0, 2);
      const receiverTargetsPool = Math.round(totalPassAttempts * 0.85);
      const allReceivers = [...wrs, ...tes];

      // Check WR/TE In-Game Injuries
      // Save original OVRs so injury does NOT permanently mutate player objects
      const originalReceiverOvrs = new Map();
      allReceivers.forEach(rec => originalReceiverOvrs.set(rec.id, rec.ovr));

      allReceivers.forEach(rec => {
          if (generateInjury && canPlayerPlay(rec)) {
              const recInjChance = 0.015 * (mods.injuryChanceMod || 1.0);
              if (!rec.injured && U.random() < recInjChance) {
                   const injury = generateInjury(rec, { injuryChanceMod: 1.0 }); // already pre-multiplied above
                   if (injury) {
                       applyInjuryToPlayer(rec, injury);

                       // Temporarily reduce OVR for target distribution weight only
                       rec.ovr = (originalReceiverOvrs.get(rec.id) || rec.ovr) * 0.5;

                       gameInjuries.push(buildGameInjuryEntry(rec, team.id, injury));
                   }
              }
          }
      });

      // Pass starTargetId from strategies
      const starTargetId = team.strategies?.starTargetId;
      const distributedTargets = distributePassingTargets(allReceivers, receiverTargetsPool, U, starTargetId);

      distributedTargets.forEach(item => {
        const wrStats = generateReceiverStats(item.player, item.targets, score, oppDefenseStrength, U);
        // Zero out random TDs
        wrStats.recTD = 0;
        Object.assign(item.player.stats.game, wrStats);
      });

      // Restore original OVRs after target distribution (injury reduced them temporarily)
      allReceivers.forEach(rec => {
        const origOvr = originalReceiverOvrs.get(rec.id);
        if (origOvr !== undefined) rec.ovr = origOvr;
      });

      // ── Reconcile the passing game to its receivers ─────────────────────────
      // generateQBStats and generateReceiverStats/generateRBStats each draw their
      // own yardage, so the QB's completions/yards diverge from the receivers who
      // actually caught the passes (a ~100-yard "hidden gap"). Re-derive each
      // passing QB's completions and passing yards from the real receiving
      // production so the canonical box score reconciles exactly:
      //   sum(all receptions) == sum(QB passComp)
      //   sum(all recYd)      == sum(QB passYd)
      // Pure/deterministic: no RNG draws — only reassignment of already-generated
      // values. Derived rate fields are nulled so the box-score normalizer
      // recomputes completionPct/passerRating from the reconciled line.
      {
        let teamReceptions = 0;
        let teamRecYd = 0;
        team.roster.forEach((p) => {
          const g = p?.stats?.game;
          if (!g || p.pos === 'QB') return;
          teamReceptions += g.receptions || 0;
          teamRecYd += g.recYd || 0;
        });
        const passingQbs = qbs
          .filter((q) => q?.stats?.game && (q.stats.game.passAtt || 0) > 0)
          .sort((a, b) => (b.stats.game.passAtt || 0) - (a.stats.game.passAtt || 0));
        if (passingQbs.length > 0) {
          const totalGenComp = passingQbs.reduce((acc, q) => acc + (q.stats.game.passComp || 0), 0);
          let assignedRec = 0;
          let assignedYd = 0;
          passingQbs.forEach((q, i) => {
            const g = q.stats.game;
            const frac = totalGenComp > 0 ? (g.passComp || 0) / totalGenComp : (i === 0 ? 1 : 0);
            g.passComp = Math.max(0, Math.round(teamReceptions * frac));
            g.passYd = Math.max(0, Math.round(teamRecYd * frac));
            assignedRec += g.passComp;
            assignedYd += g.passYd;
          });
          // Assign any rounding remainder to the starter (highest attempts).
          const starter = passingQbs[0].stats.game;
          starter.passComp = Math.max(0, starter.passComp + (teamReceptions - assignedRec));
          starter.passYd = Math.max(0, starter.passYd + (teamRecYd - assignedYd));
          // A QB can't complete more passes than they attempted.
          passingQbs.forEach((q) => {
            const g = q.stats.game;
            if ((g.passAtt || 0) < g.passComp) g.passAtt = g.passComp;
            recomputeReconciledQbDependentStats(g);
          });
        }
      }

      const ols = (groups['OL'] || []).slice(0, 5);
      ols.forEach(ol => {
        Object.assign(ol.stats.game, generateOLStats(ol, oppDefenseStrength, U));
      });

      const dbs = [...(groups['CB'] || []), ...(groups['S'] || [])];
      dbs.forEach(db => {
         Object.assign(db.stats.game, generateDBStats(db, oppOffenseStrength, U, mods));
      });

      const defenders = [...(groups['DL'] || []), ...(groups['LB'] || [])];
      defenders.forEach(def => {
         Object.assign(def.stats.game, generateDLStats(def, oppOffenseStrength, U, mods));
      });

      const kickers = groups['K'] || [];
      if (kickers.length > 0) {
        const k = kickers[0];
        // Pass drive-engine results directly; no post-hoc patching needed
        const kStats = generateKickerStats(k, actualFGs, actualXPs, U);
        Object.assign(k.stats.game, kStats);
      }

      const punters = groups['P'] || [];
      if (punters.length > 0) {
        Object.assign(punters[0].stats.game, generatePunterStats(punters[0], score, U));
      }

      // --- DISTRIBUTE TOUCHDOWNS ---
      // Enhanced: QB can now score rush TDs, and defensive TDs are tracked.
      // NFL average: ~55-60% of offensive TDs are passing TDs.
      let tdsToAssign = actualTDs;
      let totalRecTDs = 0;

      const scorers = [];

      // QBs are eligible for rushing TDs (dual-threat)
      qbs.forEach(p => {
          if (p.stats && p.stats.game && (p.stats.game.rushYd || 0) > 0) {
              const qbSpeed = (p.ratings?.speed || 60);
              // Weight by rush yards and mobility
              const w = Math.max(1, (p.stats.game.rushYd || 0) * (qbSpeed > 75 ? 1.5 : 0.5));
              scorers.push({ p, weight: w, type: 'QB' });
          }
      });

      // RBs are eligible
      rbs.forEach(p => {
          if (p.stats && p.stats.game) {
              const w = (p.stats.game.rushYd || 0) + (p.stats.game.recYd || 0);
              scorers.push({ p, weight: Math.max(1, w), type: 'RB' });
          }
      });

      // Receivers are eligible
      distributedTargets.forEach(item => {
          if (item.player.stats && item.player.stats.game) {
              const w = (item.player.stats.game.recYd || 0);
              scorers.push({ p: item.player, weight: Math.max(1, w), type: 'WR' });
          }
      });

      const receiverScorers = scorers.filter(s => s.type === 'WR');

      if (scorers.length > 0) {
          // Step 1: Guarantee a minimum of 50% of TDs go to receivers (pass TDs)
          const passTdFloor = receiverScorers.length > 0
              ? Math.min(tdsToAssign, Math.round(actualTDs * 0.50))
              : 0;

          for (let i = 0; i < passTdFloor; i++) {
              const weights = receiverScorers.map(s => s.weight);
              const idx = U.weightedChoice(weights);
              const winner = receiverScorers[idx];
              winner.p.stats.game.recTD = (winner.p.stats.game.recTD || 0) + 1;
              totalRecTDs++;
              tdsToAssign--;
          }

          // Step 2: Distribute remaining TDs among all scorers (QBs + RBs + receivers)
          while (tdsToAssign > 0) {
              const weights = scorers.map(s => s.weight);
              const idx = U.weightedChoice(weights);
              const winner = scorers[idx];

              if (winner.type === 'QB') {
                  // QB rushing TD
                  winner.p.stats.game.rushTD = (winner.p.stats.game.rushTD || 0) + 1;
              } else if (winner.type === 'RB') {
                  // Bias towards rush TD if rush yards > rec yards
                  const rushY = winner.p.stats.game.rushYd || 0;
                  const recY = winner.p.stats.game.recYd || 0;
                  const rushChance = rushY / Math.max(1, rushY + recY);

                  if (U.random() < rushChance) {
                      winner.p.stats.game.rushTD = (winner.p.stats.game.rushTD || 0) + 1;
                  } else {
                      winner.p.stats.game.recTD = (winner.p.stats.game.recTD || 0) + 1;
                      totalRecTDs++;
                  }
              } else {
                  winner.p.stats.game.recTD = (winner.p.stats.game.recTD || 0) + 1;
                  totalRecTDs++;
              }
              tdsToAssign--;
          }
      }

      // --- DISTRIBUTE 2-POINT CONVERSIONS ---
      if (actualTwoPts > 0) {
          let ptsToAssign = actualTwoPts;

          if (scorers.length > 0) {
              while (ptsToAssign > 0) {
                  const tdScorers = scorers.filter(s => (s.p.stats.game.rushTD > 0 || s.p.stats.game.recTD > 0));
                  const pool = tdScorers.length > 0 ? tdScorers : scorers;

                  const weights = pool.map(s => s.weight);
                  const idx = U.weightedChoice(weights);
                  const winner = pool[idx];

                  if (winner && winner.p && winner.p.stats && winner.p.stats.game) {
                      winner.p.stats.game.twoPtMade = (winner.p.stats.game.twoPtMade || 0) + 1;
                  }
                  ptsToAssign--;
              }
          }
      }

      // Assign Pass TDs to the QB(s) who threw them. A passing TD equals a
      // receiving TD, so the team's passing-TD total is `totalRecTDs`. Split it
      // across the passing QBs using the SAME deterministic workload basis
      // (reconciled completions) already used for attempts/completions/yards, so
      // an injury-substituted backup receives a proportional share rather than
      // the starter being credited with a backup's touchdowns.
      const passingQbsForTD = qbs
        .filter((q) => q?.stats?.game && (q.stats.game.passAtt || 0) > 0)
        .sort((a, b) => (b.stats.game.passAtt || 0) - (a.stats.game.passAtt || 0));
      if (passingQbsForTD.length > 0) {
        const totalComp = passingQbsForTD.reduce((acc, q) => acc + (q.stats.game.passComp || 0), 0);
        let assignedTD = 0;
        passingQbsForTD.forEach((q, i) => {
          const frac = totalComp > 0 ? (q.stats.game.passComp || 0) / totalComp : (i === 0 ? 1 : 0);
          q.stats.game.passTD = Math.round(totalRecTDs * frac);
          assignedTD += q.stats.game.passTD;
        });
        // Rounding remainder to the starter (highest attempts).
        passingQbsForTD[0].stats.game.passTD += (totalRecTDs - assignedTD);
        if (passingQbsForTD[0].stats.game.passTD < 0) passingQbsForTD[0].stats.game.passTD = 0;
      }


// In-game injuries handled within position groups
    };

    // Pass the mods to the team generation.
    // The drive engine is authoritative for the score AND its scoring-play
    // breakdown (see homeTDs/homeFGs/homeXPs above), so 2-pt conversions
    // must come from the same driveSummary source. Fall back to engine A
    // only when the drive summary is unavailable, mirroring the TD/FG/XP
    // fallback pattern above.
    const homeTwoPts = driveSummary?.homeStats?.twoPointMade ?? (homeRes.twoPtMade || 0);
    const awayTwoPts = driveSummary?.awayStats?.twoPointMade ?? (awayRes.twoPtMade || 0);

    // Collect all injuries for this game
    const gameInjuries = [];

    // CORRECTED: Pass the OPPONENT'S defense strength when generating stats for a team.
    // generateStatsForTeam(team, score, oppScore, oppDefenseStrength, ...)
    generateStatsForTeam(home, homeScore, awayScore, awayDefenseStrength, awayStrength, homeGroups, homeMods, homeTDs, homeFGs, homeXPs, homeTwoPts);
    generateStatsForTeam(away, awayScore, homeScore, homeDefenseStrength, homeStrength, awayGroups, awayMods, awayTDs, awayFGs, awayXPs, awayTwoPts);

    // Situational stats (unaffected by perks for now)
    const generateTeamStats = (team, score, strength, oppStrength) => {
        if (!team.stats) team.stats = { game: {}, season: {} };
        if (!team.stats.game) team.stats.game = {};

        const baseAttempts = 12 + U.rand(-2, 4);
        const conversionRate = 0.35 + (strength - oppStrength) / 200;
        const conversions = Math.round(baseAttempts * Math.max(0.1, Math.min(0.8, conversionRate)));

        const trips = Math.round(score / 6 + U.rand(0, 2));
        const redZoneTDs = Math.min(trips, Math.round(trips * (0.5 + (strength - oppStrength) / 200)));

        team.stats.game.thirdDownAttempts = baseAttempts;
        team.stats.game.thirdDownConversions = conversions;
        team.stats.game.redZoneTrips = trips;
        team.stats.game.redZoneTDs = redZoneTDs;
    };

    generateTeamStats(home, homeScore, homeStrength, awayStrength);
    generateTeamStats(away, awayScore, awayStrength, homeStrength);

    const homeOut = driveSummary?.homeStats ?? null;
    const awayOut = driveSummary?.awayStats ?? null;
    const homeTo = homeOut?.turnovers ?? 0;
    const awayTo = awayOut?.turnovers ?? 0;
    const homeSacks = homeOut?.sacks ?? 0;
    const awaySacks = awayOut?.sacks ?? 0;
    // Three-way result: only a strictly higher score is a win. A tie is neither
    // a home win nor an away win.
    const { tie: isTie, winnerIsHome = false } = buildGameOutcomeState({ homeScore, awayScore });
    const winnerAbbr = winnerIsHome ? home.abbr : away.abbr;
    const loserAbbr = winnerIsHome ? away.abbr : home.abbr;
    const winnerScore = winnerIsHome ? homeScore : awayScore;
    const loserScore = winnerIsHome ? awayScore : homeScore;
    const reasonLine = (Math.abs(homeTo - awayTo) >= 1)
      ? `${winnerAbbr} finished +${Math.abs(homeTo - awayTo)} in turnovers.`
      : (Math.abs((homeOut?.rushYPC ?? 0) - (awayOut?.rushYPC ?? 0)) >= 0.5)
        ? `${winnerAbbr} owned the ground game at ${(winnerIsHome ? homeOut?.rushYPC : awayOut?.rushYPC) ?? 0} YPC.`
        : `${winnerAbbr} controlled pressure with ${(winnerIsHome ? homeSacks : awaySacks)} sacks.`;
    const decisiveLine = `A late fourth-quarter ${winnerAbbr} drive sealed a ${winnerScore}-${loserScore} finish over ${loserAbbr}.`;
    const recapText = isTie
      ? `${home.abbr} and ${away.abbr} play to a ${homeScore}-${awayScore} tie.`
      : `${winnerAbbr} edges ${loserAbbr} ${winnerScore}-${loserScore}. ${reasonLine} ${decisiveLine}`;

    const summaryContext = {
      homeId: home?.id,
      awayId: away?.id,
      homeAbbr: home?.abbr,
      awayAbbr: away?.abbr,
    };
    const normalizedPlayLogs = normalizePlayLogs(fullGameResult.playLogs || [], summaryContext);
    const scoringSummary = buildScoringSummaryFromSimulation(normalizedPlayLogs, summaryContext);
    const driveSummaryRows = buildDriveSummaryFromSimulation(normalizedPlayLogs, summaryContext);
    const quarterScores = buildQuarterScoresFromScoring(scoringSummary, summaryContext);

    // --- EXECUTIVE POSTGAME DIAGNOSTICS (gameReasoningFlags) ---
    // Detect whether in-game attrition forced a clearly lower-rated backup into
    // a high-leverage starting role for a given side. Pure & deterministic:
    // it only reads the already-resolved injury list + position depth charts.
    const PREMIUM_DEPTH_POS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];
    const computeDepthImpact = (team, groups) => {
        const teamInjuries = gameInjuries.filter((inj) => inj && inj.teamId === team.id);
        if (teamInjuries.length === 0) return { occurred: false, gap: 0 };
        let maxGap = 0;
        let forced = false;
        for (const inj of teamInjuries) {
            for (const pos of PREMIUM_DEPTH_POS) {
                const pool = groups[pos] || [];
                const idx = pool.findIndex((p) => p && String(p.id) === String(inj.playerId));
                if (idx === -1) continue;
                const starter = pool[idx];
                const backup = pool[idx + 1] || null;
                const gap = backup ? (Number(starter?.ovr ?? 0) - Number(backup?.ovr ?? 0)) : Number(starter?.ovr ?? 0) - 60;
                if (gap >= 8 || !backup) forced = true;
                if (gap > maxGap) maxGap = gap;
                break;
            }
        }
        // Two or more in-game injuries is itself a depth event regardless of gap.
        if (teamInjuries.length >= 2) forced = true;
        return { occurred: forced, gap: Math.max(0, maxGap) };
    };

    const gameReasoningFlags = deriveGameReasoningFlags({
      home: { id: home?.id, abbr: home?.abbr },
      away: { id: away?.id, abbr: away?.abbr },
      homeScore,
      awayScore,
      trenches: {
        homeOL: homeProfile.passBlock,
        awayDL: awayProfile.passRushStrength,
        awayOL: awayProfile.passBlock,
        homeDL: homeProfile.passRushStrength,
      },
      redZone: {
        home: { trips: home.stats?.game?.redZoneTrips ?? 0, tds: home.stats?.game?.redZoneTDs ?? 0 },
        away: { trips: away.stats?.game?.redZoneTrips ?? 0, tds: away.stats?.game?.redZoneTDs ?? 0 },
      },
      turnovers: { home: homeTo, away: awayTo },
      strategicEdge: { home: homeStrategicEdge.edge, away: awayStrategicEdge.edge },
      schematicCounter: { home: homeStrategicEdge.countered, away: awayStrategicEdge.countered },
      depth: {
        home: computeDepthImpact(home, homeGroups),
        away: computeDepthImpact(away, awayGroups),
      },
    });

    return {
      gameReasoningFlags,
      homeScore, awayScore, schemeNote, injuries: gameInjuries,
      weather: weather.id,
      homeDefTDs: homeRes.defensiveTDs || 0,
      awayDefTDs: awayRes.defensiveTDs || 0,
      homeSafeties: homeRes.safeties || 0,
      awaySafeties: awayRes.safeties || 0,
      homeTurnoversForced: homeRes.turnoversForced || 0,
      awayTurnoversForced: awayRes.turnoversForced || 0,
      simFactors: {
        home: homeProfile,
        away: awayProfile,
        matchup: {
          ovrDelta: U.round(homeStrength - awayStrength, 2),
          homeFieldAdvantage: HOME_ADVANTAGE,
        },
      },
      playLogs: normalizedPlayLogs,
      liveStats: fullGameResult.liveStats || {},
      teamDriveStats: {
        home: homeOut,
        away: awayOut,
      },
      driveSummary: driveSummaryRows,
      scoringSummary,
      quarterScores,
      recapText,
      simSeed: driveSummary?.seed ?? null,
    };

  } catch (error) {
    console.error('[SIM-DEBUG] Error in simGameStats:', error);
    return null;
  }
}

/**
 * Commits a game result to the authoritative league state.
 * REPLACES finalizeGameResult.
 * @param {object} league - The league object (must be the authoritative one).
 * @param {object} gameData - Contains { homeTeamId, awayTeamId, homeScore, awayScore, stats, isPlayoff, preGameContext }
 * @param {object} options - Options object { persist: boolean (default true) }
 * @returns {object} The created result object or throws error on failure.
 */
export function commitGameResult(league, gameData, options = { persist: true }) {
    if (!league || !gameData) {
        throw new Error("Invalid arguments: league or gameData missing");
    }

    const { homeTeamId, awayTeamId, homeScore, awayScore, stats, injuries } = gameData;
    let home, away;
    if (league._teamsMap) {
        home = league._teamsMap[homeTeamId];
        away = league._teamsMap[awayTeamId];
    } else {
        league._teamsMap = {};
        for (let i = 0; i < league.teams.length; i++) {
            const t = league.teams[i];
            if (t && t.id !== undefined) league._teamsMap[t.id] = t;
        }
        home = league._teamsMap[homeTeamId];
        away = league._teamsMap[awayTeamId];
    }

    if (!home || !away) {
        throw new Error(`Teams not found: ${homeTeamId}, ${awayTeamId}`);
    }

    // 1. Update Schedule (Find the game)
    const weekIndex = (league.week || 1) - 1;
    let scheduledGame = null;

    if (league._scheduleMap) {
        scheduledGame = league._scheduleMap[`${homeTeamId}-${awayTeamId}`];
    } else {
        const scheduleWeeks = league.schedule?.weeks || league.schedule || [];

        // Strategy 1: Look in current week (if structured with weeks)
        // Use .find() by week property first, fall back to array index
        const weekSchedule = scheduleWeeks.find?.(w => w && w.week === league.week) || scheduleWeeks[weekIndex];
        if (weekSchedule && weekSchedule.games) {
            scheduledGame = weekSchedule.games.find(g =>
                g && g.home !== undefined && g.away !== undefined &&
                (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
                (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
            );
        }

        // Strategy 2: Look in flat array (if schedule is flat array of games)
        if (!scheduledGame && Array.isArray(scheduleWeeks)) {
            scheduledGame = scheduleWeeks.find(g =>
                g && g.home !== undefined && g.away !== undefined &&
                (g.week === league.week) &&
                (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
                (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
            );
        }

        // Strategy 3: Global search (fallback)
        if (!scheduledGame && league.schedule) {
            if (!league._globalScheduleMap) {
                league._globalScheduleMap = {};
                if (league.schedule.weeks) {
                    for (const w of league.schedule.weeks) {
                        if (w.games) {
                            for (let i = 0; i < w.games.length; i++) {
                                const g = w.games[i];
                                if (g && g.home !== undefined && g.away !== undefined) {
                                    const hId = typeof g.home === 'object' ? g.home.id : g.home;
                                    const aId = typeof g.away === 'object' ? g.away.id : g.away;
                                    if (!league._globalScheduleMap[`${hId}-${aId}`]) {
                                        league._globalScheduleMap[`${hId}-${aId}`] = g;
                                    }
                                }
                            }
                        }
                    }
                } else if (Array.isArray(league.schedule)) {
                    for (let i = 0; i < league.schedule.length; i++) {
                        const g = league.schedule[i];
                        if (g && g.home !== undefined && g.away !== undefined) {
                            const hId = typeof g.home === 'object' ? g.home.id : g.home;
                            const aId = typeof g.away === 'object' ? g.away.id : g.away;
                            if (!league._globalScheduleMap[`${hId}-${aId}`]) {
                                league._globalScheduleMap[`${hId}-${aId}`] = g;
                            }
                        }
                    }
                }
            }
            scheduledGame = league._globalScheduleMap[`${homeTeamId}-${awayTeamId}`];
        }
    }

    if (scheduledGame) {
        scheduledGame.played = true;
        scheduledGame.finalized = true;
        scheduledGame.homeScore = homeScore;
        scheduledGame.awayScore = awayScore;

    }

    // 2. Update Standings / Team Records
    const isPlayoff = gameData.isPlayoff || false;
    if (!isPlayoff) {
        applyResult(league, { home, away }, homeScore, awayScore);
    }

    // 3. Update Player Stats (mutates roster objects)
    if (stats) {
        const commitGameId = gameData.gameId ?? gameData.id ?? null;
        // Lazily attach a runtime-only Set of game ids already accumulated into a
        // player's totals, so a retry/resim of the same game can't double-count.
        const getProcessedGameIds = (p) => {
            if (!p._processedGameIds) {
                Object.defineProperty(p, '_processedGameIds', {
                    value: new Set(), enumerable: false, writable: true, configurable: true,
                });
            }
            return p._processedGameIds;
        };
        const updateRosterStats = (team, teamStats) => {
            if (!teamStats || !teamStats.players) return;
            team.roster.forEach(p => {
                // Use String(p.id) to match the stringified keys written by capturePlayerStats.
                const pid = String(p.id);
                const pStats = teamStats.players[pid] ?? teamStats.players[p.id];
                if (pStats) {
                    initializePlayerStats(p);
                    let rawGame = {};
                    if (pStats.stats && typeof pStats.stats === 'object') {
                        rawGame = { ...pStats.stats };
                    } else {
                        const {
                            name: _n, pos: _p, teamId: _tid, playerId: _pid, stats: _s, ...rest
                        } = pStats;
                        rawGame = rest;
                    }
                    p.stats.game = normalizeGameStatsForBoxScore(rawGame);

                    const processedGameIds = getProcessedGameIds(p);
                    if (isPlayoff) {
                        if (!p.stats.playoffs) p.stats.playoffs = {};
                        const counted = accumulateStats(p.stats.game, p.stats.playoffs, commitGameId, processedGameIds);
                        if (counted) {
                            if (!p.stats.playoffs.gamesPlayed) p.stats.playoffs.gamesPlayed = 0;
                            p.stats.playoffs.gamesPlayed++;
                        }
                    } else {
                        const counted = accumulateStats(p.stats.game, p.stats.season, commitGameId, processedGameIds);
                        if (counted) {
                            if (!p.stats.season.gamesPlayed) p.stats.season.gamesPlayed = 0;
                            p.stats.season.gamesPlayed++;

                            if (updateAdvancedStats) {
                                updateAdvancedStats(p, p.stats.season);
                            }
                        }
                    }

                    if (updatePlayerGameLegacy) {
                         const gameContext = {
                            year: league.year || 2025,
                            week: league.week || 1,
                            teamWon: (team.id === homeTeamId ? homeScore > awayScore : awayScore > homeScore),
                            isPlayoff: isPlayoff,
                            opponent: (team.id === homeTeamId ? away.name : home.name)
                        };
                        updatePlayerGameLegacy(p, p.stats.game, gameContext);
                    }
                }
            });
        };

        updateRosterStats(home, stats.home);
        updateRosterStats(away, stats.away);

        // Update Team Season Stats
        const updateTeamSeasonStats = (team, teamStats) => {
             if (!team.stats) team.stats = { season: {} };
             if (!team.stats.season) team.stats.season = {};

             if (teamStats.team) {
                 Object.keys(teamStats.team).forEach(k => {
                     team.stats.season[k] = (team.stats.season[k] || 0) + teamStats.team[k];
                 });
             }
             team.stats.season.gamesPlayed = (team.stats.season.gamesPlayed || 0) + 1;
        };
        updateTeamSeasonStats(home, stats.home);
        updateTeamSeasonStats(away, stats.away);
    }

    // 4. Update Rivalries
    updateRivalries(home, away, homeScore, awayScore, isPlayoff);

    // 5. Create Result Object
    const homeBoxScore = transformStatsForBoxScore(stats?.home?.players, home.roster, homeTeamId);
    const awayBoxScore = transformStatsForBoxScore(stats?.away?.players, away.roster, awayTeamId);
    const teamStats = buildCanonicalTeamStats({
        home: homeBoxScore,
        away: awayBoxScore,
        teamDriveStats: gameData.teamDriveStats,
        rawTeamStats: {
            home: stats?.home?.team,
            away: stats?.away?.team,
        },
    });

    const gameOutcome = buildGameOutcomeState({ homeScore, awayScore });
    const resultObj = {
        id: `g_final_${Date.now()}_${U.id()}`,
        gameId: gameData.gameId ?? null,
        home: homeTeamId,
        away: awayTeamId,
        homeId: homeTeamId,
        awayId: awayTeamId,
        scoreHome: homeScore,
        scoreAway: awayScore,
        homeScore,
        awayScore,
        homeWin: gameOutcome.homeWin,
        awayWin: gameOutcome.awayWin,
        tie: gameOutcome.tie,
        homeTeamName: home.name,
        awayTeamName: away.name,
        homeTeamAbbr: home.abbr,
        awayTeamAbbr: away.abbr,
        boxScore: {
            home: homeBoxScore,
            away: awayBoxScore
        },
        playerStats: {
            home: homeBoxScore,
            away: awayBoxScore,
        },
        teamStats,
        stats: {
            home: homeBoxScore,
            away: awayBoxScore,
            players: {
                home: homeBoxScore,
                away: awayBoxScore,
            },
            team: teamStats,
            playLogs: gameData.playLogs || [],
        },
        injuries: injuries || [],
        week: league.week,
        year: league.year,
        isPlayoff: isPlayoff,
        weather: gameData.weather || null,
        simFactors: gameData.simFactors || null,
        defensiveTDs: {
            home: gameData.homeDefTDs || 0,
            away: gameData.awayDefTDs || 0
        },
        playLogs: gameData.playLogs || [],
        teamDriveStats: gameData.teamDriveStats || null,
        driveSummary: gameData.driveSummary || [],
        scoringSummary: gameData.scoringSummary || [],
        quarterScores: gameData.quarterScores || null,
        recapText: gameData.recapText || null,
        simSeed: gameData.simSeed ?? null,
        gameReasoningFlags: Array.isArray(gameData.gameReasoningFlags) ? gameData.gameReasoningFlags : [],
    };

    if (scheduledGame) {
        scheduledGame.scoreHome = homeScore;
        scheduledGame.scoreAway = awayScore;
        scheduledGame.playerStats = resultObj.playerStats;
        scheduledGame.teamStats = resultObj.teamStats;
        scheduledGame.boxScore = resultObj.boxScore;
        scheduledGame.scoringSummary = resultObj.scoringSummary;
        scheduledGame.quarterScores = resultObj.quarterScores;
        scheduledGame.driveSummary = resultObj.driveSummary;
        scheduledGame.playLogs = resultObj.playLogs;
        scheduledGame.playLog = resultObj.playLogs;
        scheduledGame.recapText = resultObj.recapText;
        scheduledGame.gameReasoningFlags = resultObj.gameReasoningFlags;
    }

    if (gameData.preGameContext) {
        const callbacks = generatePostGameCallbacks(gameData.preGameContext, stats, homeScore, awayScore);
        if (callbacks && callbacks.length > 0) {
            resultObj.callbacks = callbacks;
        }
    }

    // 6. Store in resultsByWeek (Persistence)
    if (!league.resultsByWeek) league.resultsByWeek = {};
    if (!league.resultsByWeek[weekIndex]) league.resultsByWeek[weekIndex] = [];

    // Idempotency check (O(1) optimization)
    // Create transient Map for fast lookups if it doesn't exist
    if (!league._resultsIndexByWeek) {
        Object.defineProperty(league, '_resultsIndexByWeek', {
            value: {},
            enumerable: false,
            writable: true,
            configurable: true
        });
    }

    if (!league._resultsIndexByWeek[weekIndex]) {
        league._resultsIndexByWeek[weekIndex] = new Map();
        // Populate the Map with existing results
        league.resultsByWeek[weekIndex].forEach((r, idx) => {
            league._resultsIndexByWeek[weekIndex].set(`${r.home}_${r.away}`, idx);
        });
    }

    const gameKey = `${homeTeamId}_${awayTeamId}`;
    const existingIndex = league._resultsIndexByWeek[weekIndex].get(gameKey);

    if (existingIndex !== undefined) {
        league.resultsByWeek[weekIndex][existingIndex] = resultObj;
    } else {
        league.resultsByWeek[weekIndex].push(resultObj);
        // Cache the new result index
        league._resultsIndexByWeek[weekIndex].set(gameKey, league.resultsByWeek[weekIndex].length - 1);
    }

    return resultObj;
}

// Deprecated alias for backward compatibility until refactor complete
export const finalizeGameResult = commitGameResult;

/**
 * Simulates a batch of games.
 *
 * BATCHING OPTIMIZATION:
 * This function collects all game results into an in-memory buffer (array) and returns them.
 * It does NOT perform individual database transactions per game. The caller (worker.js)
 * is responsible for applying these results to the state cache and performing a single
 * bulk flush via flushDirty().
 *
 * @param {Array} games - Array of game objects {home, away, ...}
 * @param {Object} options - Simulation options {verbose: boolean, overrideResults: Array, league: Object}
 * @returns {Array} Array of result objects
 */
export function simulateBatch(games, options = {}) {
    const results = [];
    const verbose = options.verbose === true;
    const overrideResults = Array.isArray(options.overrideResults) ? options.overrideResults : [];
    const overrideLookup = new Map(
      overrideResults
        .filter(result => result && Number.isInteger(result.home) && Number.isInteger(result.away))
        .map(result => [`${result.home}-${result.away}`, result])
    );

    if (!games || !Array.isArray(games)) return [];

    // Use passed league object or fail
    const league = options.league;
    if (!league) {
        console.error('No league provided to simulateBatch');
        return [];
    }

    // Clear per-batch caches so scheme fit and morale are recalculated fresh each week
    if (league.teams) {
        for (const t of league.teams) {
            if (t) { delete t._cachedSchemeFit; delete t._cachedMorale; delete t._cachedSimStaff; }
        }
    }

    // OPTIMIZATION: create maps for fast lookups during commit
    ensureTeamsMap(league);

    if (league.schedule && !league._scheduleMap) {
        league._scheduleMap = {};
        const currentWeek = league.week || 1;
        const scheduleWeeks = league.schedule?.weeks || league.schedule || [];
        // Use .find() by week property instead of array index — safer for non-sequential weeks
        const weekSchedule = Array.isArray(scheduleWeeks)
          ? scheduleWeeks.find(w => w && w.week === currentWeek) || scheduleWeeks[currentWeek - 1]
          : null;
        if (weekSchedule && weekSchedule.games) {
            for (let i = 0; i < weekSchedule.games.length; i++) {
                const g = weekSchedule.games[i];
                if (g && g.home !== undefined && g.away !== undefined) {
                    const hId = typeof g.home === 'object' ? g.home.id : g.home;
                    const aId = typeof g.away === 'object' ? g.away.id : g.away;
                    league._scheduleMap[`${hId}-${aId}`] = g;
                }
            }
        }
    }

    games.forEach((pair, index) => {
        try {
            if (false) console.log(`[SIM-DEBUG] Processing pairing ${index + 1}/${games.length}: Home=${pair.home?.abbr}, Away=${pair.away?.abbr}`);

            // Handle bye weeks
            if (pair.bye !== undefined) {
                results.push({
                    id: `b${pair.bye}`,
                    bye: pair.bye
                });
                return;
            }

            const home = pair.home;
            const away = pair.away;

            if (!home || !away) {
                console.warn('Invalid team objects in pairing:', pair);
                return;
            }

            // CHECK IF GAME IS ALREADY FINALIZED
            const weekIndex = (pair.week || 1) - 1;
            if (league.resultsByWeek && league.resultsByWeek[weekIndex]) {
                 const existing = league.resultsByWeek[weekIndex].find(r => r.home === home.id && r.away === away.id);
                 if (existing) {
                     if (false) console.log(`[SIM-DEBUG] Game ${home.abbr} vs ${away.abbr} already finalized. Using existing result.`);
                     results.push(existing);
                     return;
                 }
            }

            const overrideResult = overrideLookup.get(`${home.id}-${away.id}`);
            let sH;
            let sA;
            let homePlayerStats = {};
            let awayPlayerStats = {};

            let schemeNote = null;
            let gameInjuries = [];
            let simFactors = null;
            // Declared here (not inside else) so it's accessible when building gameData below
            let gameScores = null;

            if (overrideResult) {
                sH = overrideResult.scoreHome;
                sA = overrideResult.scoreAway;
                homePlayerStats = overrideResult.boxScore?.home || {};
                awayPlayerStats = overrideResult.boxScore?.away || {};
            } else {
                // 0-0 Prevention Loop
                let attempts = 0;
                const stakes = pair.preGameContext?.stakes || 0;
                // simulateMatchup mutates injury state on the shared roster objects.
                // Snapshot it once so each retry rolls back the prior attempt's
                // mutations — otherwise a rare 0-0 re-sim stacks duplicate injuries.
                const injurySnapshot = snapshotInjuryState([
                    ...(Array.isArray(home.roster) ? home.roster : []),
                    ...(Array.isArray(away.roster) ? away.roster : []),
                ]);
                do {
                    if (attempts > 0) restoreInjuryState(injurySnapshot);
                    // Use simulateMatchup (unified function)
                    // Pass league for scheme fit calculations
                    gameScores = simulateMatchup(home, away, { verbose, stakes, league, isPlayoff: options.isPlayoff, generateLogs: options.generateLogs, homeAbbr: home.abbr, awayAbbr: away.abbr, overtimeFormat: options.overtimeFormat, userTendency: options.userTendency });
                    attempts++;
                } while ((!gameScores || (gameScores.homeScore === 0 && gameScores.awayScore === 0)) && attempts < 3);

                if (!gameScores || (gameScores.homeScore === 0 && gameScores.awayScore === 0)) {
                    const ratingsSnapshot = {
                        week: league?.week ?? null,
                        attempts,
                        home: buildTeamRatingsSnapshot(home),
                        away: buildTeamRatingsSnapshot(away),
                    };
                    console.error(
                        `[SimulationError] Game produced no scoring for ${home.abbr} vs ${away.abbr} (week ${ratingsSnapshot.week}). Team ratings snapshot:`,
                        ratingsSnapshot
                    );
                    assertGameProducedScoring(gameScores, ratingsSnapshot);
                }

                sH = gameScores.homeScore;
                sA = gameScores.awayScore;
                schemeNote = gameScores.schemeNote;
                if (gameScores.injuries) gameInjuries = gameScores.injuries;
                simFactors = gameScores.simFactors || null;

                // Store weather and defensive scoring data for the result
                pair._weather = gameScores.weather || null;
                pair._homeDefTDs = gameScores.homeDefTDs || 0;
                pair._awayDefTDs = gameScores.awayDefTDs || 0;
                pair._liveStats = gameScores.liveStats || {};
                pair._teamDriveStats = gameScores.teamDriveStats || null;
                pair._driveSummary = gameScores.driveSummary || [];
                pair._scoringSummary = gameScores.scoringSummary || [];
                pair._quarterScores = gameScores.quarterScores || null;
                pair._recapText = gameScores.recapText || null;
                pair._simSeed = gameScores.simSeed ?? null;
                pair._gameReasoningFlags = Array.isArray(gameScores.gameReasoningFlags) ? gameScores.gameReasoningFlags : [];

                // Capture stats for box score.
                // Always key by String(player.id) so numeric and string IDs
                // (legacy saves vs. new base-36 IDs) produce consistent keys.
                const capturePlayerStats = (roster) => {
                    const playerStats = {};
                    for (let i = 0; i < roster.length; i++) {
                        const player = roster[i];
                        if (player && player.stats && player.stats.game) {
                            const normalizedStats = normalizeGameStatsForBoxScore(player.stats.game);
                            playerStats[String(player.id)] = {
                                name: player.name,
                                pos: player.pos,
                                stats: normalizedStats,
                            };
                        }
                    }
                    return playerStats;
                };

                homePlayerStats = capturePlayerStats(home.roster);
                awayPlayerStats = capturePlayerStats(away.roster);
            }


            // -- Feats Check --
            const checkFeats = (teamStats, teamAbbr, oppAbbr) => {
                const feats = [];
                const num = (row, key) => {
                    if (!row || typeof row !== 'object') return 0;
                    const s = row.stats && typeof row.stats === 'object' ? row.stats : row;
                    const v = s?.[key];
                    const n = Number(v);
                    return Number.isFinite(n) ? n : 0;
                };
                for (const [pid, p] of Object.entries(teamStats)) {
                    const featList = [];
                    const row = p;
                    // Passing
                    if (num(row, 'passYd') >= 400 || num(row, 'passTD') >= 5) {
                        const sub = [];
                        if (num(row, 'passYd') >= 400) sub.push(`${num(row, 'passYd')} passing yards`);
                        if (num(row, 'passTD') >= 5) sub.push(`${num(row, 'passTD')} passing TDs`);
                        featList.push(sub.join(' and '));
                    }
                    // Rushing
                    if (num(row, 'rushYd') >= 150 || num(row, 'rushTD') >= 3) {
                        const sub = [];
                        if (num(row, 'rushYd') >= 150) sub.push(`${num(row, 'rushYd')} rushing yards`);
                        if (num(row, 'rushTD') >= 3) sub.push(`${num(row, 'rushTD')} rushing TDs`);
                        featList.push(sub.join(' and '));
                    }
                    // Receiving
                    if (num(row, 'recYd') >= 200 || num(row, 'receptions') >= 12 || num(row, 'recTD') >= 3) {
                        const sub = [];
                        if (num(row, 'recYd') >= 200) sub.push(`${num(row, 'recYd')} receiving yards`);
                        if (num(row, 'receptions') >= 12) sub.push(`${num(row, 'receptions')} receptions`);
                        if (num(row, 'recTD') >= 3) sub.push(`${num(row, 'recTD')} receiving TDs`);
                        featList.push(sub.join(', '));
                    }
                    // Defense
                    if (num(row, 'sacks') >= 3.0 || num(row, 'interceptions') >= 2 || num(row, 'defTD') > 0 || num(row, 'defTDs') > 0) {
                        const sub = [];
                        if (num(row, 'sacks') >= 3.0) sub.push(`${num(row, 'sacks')} sacks`);
                        if (num(row, 'interceptions') >= 2) sub.push(`${num(row, 'interceptions')} interceptions`);
                        if (num(row, 'defTD') > 0 || num(row, 'defTDs') > 0) sub.push(`${num(row, 'defTD') || num(row, 'defTDs')} defensive TDs`);
                        featList.push(sub.join(' and '));
                    }
                    // Special Teams
                    if (num(row, 'longestFG') >= 55) {
                        featList.push(`a ${num(row, 'longestFG')}-yard field goal`);
                    }
                    if (num(row, 'returnTD') > 0 || num(row, 'returnTDs') > 0) {
                        featList.push('a return TD');
                    }

                    if (featList.length > 0) {
                        const displayName = row?.name ?? 'Unknown';
                        const displayPos = row?.pos ?? '';
                        feats.push({
                            playerId: pid,
                            name: displayName,
                            pos: displayPos,
                            teamAbbr: teamAbbr,
                            opponentAbbr: oppAbbr,
                            featDescription: featList.join(', '),
                        });
                    }
                }
                return feats;
            };

            const homeFeats = checkFeats(homePlayerStats, home.abbr, away.abbr);
            const awayFeats = checkFeats(awayPlayerStats, away.abbr, home.abbr);
            const allFeats = [...homeFeats, ...awayFeats];

            // Defensive Shutout (Team Feat)
            if (sA === 0) allFeats.push({ name: `${home.abbr} Defense`, teamAbbr: home.abbr, opponentAbbr: away.abbr, featDescription: 'a defensive shutout', statValue: '' });
            if (sH === 0) allFeats.push({ name: `${away.abbr} Defense`, teamAbbr: away.abbr, opponentAbbr: home.abbr, featDescription: 'a defensive shutout', statValue: '' });

            // Finalize Game Result via Commit
            const gameData = {
                gameId: pair.gameId ?? pair.id ?? null,
                homeTeamId: (home.id !== undefined) ? home.id : pair.home,
                awayTeamId: (away.id !== undefined) ? away.id : pair.away,
                homeScore: sH,
                awayScore: sA,
                isPlayoff: options.isPlayoff || false,
                preGameContext: pair.preGameContext, // PASS CONTEXT
                stats: {
                    home: { players: homePlayerStats },
                    away: { players: awayPlayerStats }
                },
                injuries: gameInjuries,
                weather: pair._weather,
                homeDefTDs: pair._homeDefTDs || 0,
                awayDefTDs: pair._awayDefTDs || 0,
                simFactors,
                playLogs: gameScores?.playLogs || [],
                liveStats: pair._liveStats || {},
                teamDriveStats: pair._teamDriveStats || null,
                driveSummary: pair._driveSummary || [],
                scoringSummary: pair._scoringSummary || [],
                quarterScores: pair._quarterScores || null,
                recapText: pair._recapText || null,
                simSeed: pair._simSeed ?? null,
                gameReasoningFlags: pair._gameReasoningFlags || [],
            };

            let resultObj;
            try {
                resultObj = commitGameResult(league, gameData, { persist: false });
            } catch (commitErr) {
                console.error(`[SIM] commitGameResult threw for ${home?.abbr} vs ${away?.abbr}:`, commitErr?.message);
                // Fallback: create a minimal result object so the game isn't lost
                const fallbackOutcome = buildGameOutcomeState({ homeScore: sH, awayScore: sA });
                resultObj = {
                    id: `g_fallback_${Date.now()}_${index}`,
                    home: home.id,
                    away: away.id,
                    scoreHome: sH,
                    scoreAway: sA,
                    homeWin: fallbackOutcome.homeWin,
                    awayWin: fallbackOutcome.awayWin,
                    tie: fallbackOutcome.tie,
                    homeTeamName: home.name,
                    awayTeamName: away.name,
                    homeTeamAbbr: home.abbr,
                    awayTeamAbbr: away.abbr,
                    boxScore: { home: homePlayerStats, away: awayPlayerStats },
                    injuries: gameInjuries,
                    week: league.week,
                    year: league.year,
                    isPlayoff: options.isPlayoff || false,
                    simFactors,
                    playLogs: gameScores?.playLogs || [],
                    liveStats: pair._liveStats || {},
                    teamDriveStats: pair._teamDriveStats || null,
                    driveSummary: pair._driveSummary || [],
                    scoringSummary: pair._scoringSummary || [],
                    quarterScores: pair._quarterScores || null,
                    recapText: pair._recapText || null,
                    simSeed: pair._simSeed ?? null,
                    gameReasoningFlags: pair._gameReasoningFlags || [],
                };
            }
            if (resultObj) {
                resultObj.feats = allFeats;
                if (schemeNote) resultObj.schemeNote = schemeNote;
                if (pair._weather) resultObj.weather = pair._weather;
                results.push(resultObj);
            } else {
                console.warn(`[SIM] commitGameResult returned null for game ${index}: ${home?.abbr ?? '?'} vs ${away?.abbr ?? '?'}`);
            }

        } catch (error) {
            // A SimulationError signals an unrecoverable root cause (bad ratings /
            // invalid roster) — propagate it so the worker can report it to the UI
            // instead of silently dropping the game.
            if (error instanceof SimulationError) throw error;
            console.error(`[SIM] Error simulating game ${index} (${pair?.home?.abbr ?? '?'} vs ${pair?.away?.abbr ?? '?'}):`, error?.message, error?.stack);
        }
    });

    if (league._teamsMap) {
        delete league._teamsMap;
    }
    if (league._scheduleMap) {
        delete league._scheduleMap;
    }
    if (league._globalScheduleMap) {
        delete league._globalScheduleMap;
    }

    return results;
}

/**
 * Validates the league state after simulation.
 * @param {Object} league - The league object.
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateLeagueState(league) {
    const errors = [];
    if (!league) return { valid: false, errors: ['No league object provided'] };

    if (!league.teams || !Array.isArray(league.teams)) {
        errors.push('Missing or invalid teams array');
    } else {
        // Check teams have required fields
        league.teams.forEach((team, i) => {
            if (!team) {
                errors.push(`Team at index ${i} is null`);
            } else if (!team.roster || !Array.isArray(team.roster)) {
                errors.push(`Team ${team.abbr || i} has missing or invalid roster`);
            }
        });
    }

    // Check for finalized games with invalid scores
    if (league.resultsByWeek) {
        Object.entries(league.resultsByWeek).forEach(([week, results]) => {
            if (Array.isArray(results)) {
                results.forEach(game => {
                    if (game.scoreHome === 0 && game.scoreAway === 0 && !game.bye) {
                        errors.push(`0-0 game found in week ${week}: ${game.homeTeamAbbr} vs ${game.awayTeamAbbr}`);
                    }
                });
            }
        });
    }

    return { valid: errors.length === 0, errors };
}

// Default export
export default {
    simGameStats,
    simulateMatchup, // Unified function alias
    applyResult,
    initializePlayerStats,
    groupPlayersByPosition,
    accumulateStats,
    simulateBatch,
    commitGameResult,
    updateTeamStandings,
    validateLeagueState
};
