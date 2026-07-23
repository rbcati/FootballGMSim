import { cache } from '../db/cache.js';
import { stableIdCompare } from './referenceIntegrity.js';
import { Constants } from './constants.js';
import { Transactions } from '../db/index.js';
import { calculateExtensionDemand } from './player.js';
import { calculateOffensiveSchemeFit, calculateDefensiveSchemeFit } from './scheme-core.js';
import {
    buildContractProfile,
    buildDemandFromProfile,
    computeMarketHeat,
    scoreOffer,
    inferTeamDirection,
    buildDecisionTiming,
} from './contract-market.js';
import { buildAiTeamStrategy } from './aiTeamStrategy.js';
import NewsEngine from './news-engine.js';
import { getTeamContextForNegotiation } from './teamContext/negotiationContext.js';
import { evaluateContractOffer } from './contracts/negotiation.js';
import { isFreeAgent } from './freeAgency/membership.js';
import { evaluateReSigningPriority } from './retention/reSigning.js';
import { buildFreeAgencyMarketAnalysis } from './freeAgency/freeAgencyMarketAnalysis.js';
import { buildContractFromMarket, evaluateContractMarket } from './contractModel.js';
import { evaluatePendingOfferCapReservation } from './pendingOfferCapModel.js';
import { evaluatePlayerMarketRealism, normalizePositionGroup } from './marketRealismModel.js';
import { executeAIOffseasonCuts } from './roster/aiRosterCuts.js';
import { buildTeamCapSnapshot, getActiveCapHit } from './contracts/contractObligations.js';
import { canRestructure, computeRestructure, applyRestructure } from './contracts/restructureEngine.js';
import { executeAIOffseasonExtensions } from './retention/aiRetentionLogic.js';
import { calculateTeamDepthDeficiencies, getNeedLevelForPlayer, POSITION_NEED_LEVEL } from './trades/tradePositionalNeeds.js';
import { buildFranchiseTagContract, buildRFATenderContract, TENDER_CONFIG } from './contracts/tenderLogic.js';


export function buildSortedFreeAgentsMapForOffers(allPlayers = []) {
    const freeAgentsMap = {};
    for (const p of allPlayers) {
        if (isFreeAgent(p)) {
            if (!freeAgentsMap[p.pos]) freeAgentsMap[p.pos] = [];
            freeAgentsMap[p.pos].push(p);
        }
    }
    for (const pos in freeAgentsMap) {
        freeAgentsMap[pos].sort((a, b) => ((b.ovr ?? 0) - (a.ovr ?? 0)) || stableIdCompare(a.id, b.id));
    }
    return freeAgentsMap;
}

function positionRank(pos, order) {
    const idx = order.indexOf(pos);
    return idx >= 0 ? idx : order.length;
}

class AiLogic {
    static NEED_GROUP_TO_POS = Object.freeze({
        QB: ['QB'],
        RB: ['RB'],
        WR: ['WR'],
        TE: ['TE'],
        OL: ['OL', 'OT', 'OG', 'C', 'G', 'T'],
        DL_EDGE: ['DL', 'DE', 'DT', 'EDGE', 'NT'],
        LB: ['LB', 'MLB', 'OLB'],
        CB: ['CB'],
        S: ['S', 'SS', 'FS'],
        KP: ['K', 'P'],
    });

    static _teamNeedsFromStrategy(strategy = null) {
        const needs = {};
        Constants.POSITIONS.forEach((pos) => { needs[pos] = 1.0; });
        if (!strategy || !Array.isArray(strategy.positionalNeeds)) return needs;

        const sevWeight = { critical: 1.0, high: 0.7, medium: 0.45, low: 0.2 };
        for (const row of strategy.positionalNeeds) {
            const group = String(row?.positionGroup ?? '');
            const priority = Number(row?.priority ?? 0);
            const severity = String(row?.severity ?? 'low').toLowerCase();
            const positions = AiLogic.NEED_GROUP_TO_POS[group] ?? [group];
            const multiplier = 1 + ((priority / 100) * (sevWeight[severity] ?? 0.2));
            for (const pos of positions) {
                if (pos in needs) needs[pos] = Math.max(needs[pos], Number(multiplier.toFixed(2)));
            }
        }
        return needs;
    }

    /**
     * Dead-money grace below zero. A team may sit at most this far below the
     * hard cap to absorb dead cap from cuts; any transaction that would drive
     * capRoom below `-DEAD_CAP_ALLOWANCE` must be rejected by the caller.
     */
    static DEAD_CAP_ALLOWANCE = 20;

    /**
     * Single salary-cap authority. Reads the live league economy cap, falling
     * back to the constant hard cap. Replaces the old `?? 255` magic number.
     */
    static _getSalaryCap() {
        const meta = cache.getMeta();
        const economyCap = Number(meta?.economy?.currentSalaryCap);
        if (Number.isFinite(economyCap) && economyCap > 0) return economyCap;
        return Constants.SALARY_CAP.HARD_CAP;
    }

    /**
     * Update a team's cap space based on current contracts.
     * Mirrors logic in worker.js but available for AI moves.
     *
     * @returns {{ok:boolean, capRoom:number, capUsed:number, floor:number, error?:string}}
     *   `ok` is false when the recomputed capRoom is below the dead-cap floor;
     *   callers committing a transaction must treat `ok === false` as a rejection.
     */
    static updateTeamCap(teamId) {
        const players = cache.getPlayersByTeam(teamId);
        const capUsed = players.reduce((sum, p) => {
            const c = p.contract;
            if (!c) return sum;
            // Cap hit = Base + Prorated Bonus
            return sum + (c.baseAnnual ?? 0) + ((c.signingBonus ?? 0) / (c.yearsTotal || 1));
        }, 0);

        const team = cache.getTeam(teamId);
        if (!team) return { ok: false, capRoom: 0, capUsed: 0, floor: -AiLogic.DEAD_CAP_ALLOWANCE, error: 'Team not found' };

        const capTotal = team.capTotal ?? AiLogic._getSalaryCap();
        const deadCap  = team.deadCap  ?? 0;
        const capRoom = Math.round((capTotal - capUsed - deadCap) * 100) / 100;
        const floor = -AiLogic.DEAD_CAP_ALLOWANCE;
        cache.updateTeam(teamId, {
            capUsed: Math.round(capUsed * 100) / 100,
            capRoom,
        });

        if (capRoom < floor) {
            console.warn(`[AiLogic] Team ${teamId} capRoom ${capRoom} is below dead-cap floor ${floor}.`);
            return { ok: false, capRoom, capUsed, floor, error: 'Salary cap exceeded' };
        }
        return { ok: true, capRoom, capUsed, floor };
    }

    /**
     * Minimum players to keep at each position during AI cutdowns so a team can
     * never cut its only kicker/punter (or its QB/OL depth) purely on score.
     */
    static POSITION_FLOOR = Object.freeze({
        QB: 2, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1,
    });

    /**
     * True if cutting `player` would drop the team to (or below) the minimum
     * number of players at his position, given the current roster.
     */
    static isLastAtPosition(roster, player) {
        const pos = player?.pos;
        if (!pos) return false;
        const floor = AiLogic.POSITION_FLOOR[pos] ?? 1;
        const count = (roster ?? []).filter((p) => p?.pos === pos).length;
        return count <= floor;
    }

    /**
     * Execute AI Roster Cutdowns for Preseason.
     * Forces all AI teams to cut down to 53 players.
     */
    static async executeAICutdowns({ includeUserTeam = false } = {}) {
        const meta = cache.getMeta();
        const userTeamId = meta.userTeamId;
        const allTeams = cache.getAllTeams().slice().sort((a, b) => stableIdCompare(a?.id, b?.id));
        const limit = Constants.ROSTER_LIMITS.REGULAR_SEASON;

        for (const team of allTeams) {
            // Skip user team (they normally cut manually). In headless/batch
            // simulation there is no interactive user, so callers may opt the
            // user team in via includeUserTeam so the season can still start.
            if (!includeUserTeam && team.id === userTeamId) continue;

            const roster = cache.getPlayersByTeam(team.id).slice().sort((a, b) => stableIdCompare(a?.id, b?.id));
            if (roster.length <= limit) continue;

            // Score = OVR * 2 + Potential + (Age < 25 ? 10 : 0)
            const scoredPlayers = roster.map(p => {
                let score = (p.ovr ?? 0) * 2 + (p.potential ?? p.ovr ?? 0);
                if ((p.age ?? 30) < 25) score += 10;
                return { ...p, _cutScore: score };
            });

            // Sort ascending by score (lowest score = first to cut)
            scoredPlayers.sort((a, b) => a._cutScore - b._cutScore);

            const cutCount = roster.length - limit;

            // Track live per-position counts so cutting never drops a position
            // below its floor. First pass respects floors; a last-resort pass
            // only triggers if floors alone can't reach the hard roster limit
            // (and even then never leaves a position empty).
            const posCounts = {};
            for (const p of roster) posCounts[p.pos] = (posCounts[p.pos] ?? 0) + 1;

            const toCut = [];
            const cutIds = new Set();
            for (const p of scoredPlayers) {
                if (toCut.length >= cutCount) break;
                if ((posCounts[p.pos] ?? 0) > (AiLogic.POSITION_FLOOR[p.pos] ?? 1)) {
                    toCut.push(p);
                    cutIds.add(p.id);
                    posCounts[p.pos] -= 1;
                }
            }
            // Last resort: roster still over the hard limit — allow protected
            // cuts (lowest score first) but never leave 0 players at a position.
            if (toCut.length < cutCount) {
                for (const p of scoredPlayers) {
                    if (toCut.length >= cutCount) break;
                    if (cutIds.has(p.id)) continue;
                    if ((posCounts[p.pos] ?? 0) > 1) {
                        toCut.push(p);
                        cutIds.add(p.id);
                        posCounts[p.pos] -= 1;
                    }
                }
            }

            for (const p of toCut) {
                // Calculate Dead Cap (post-June 1 rules for preseason)
                const c = p.contract;
                const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
                const yearsRemaining = c?.years || 1;
                const currentYearDead = annualBonus;
                const futureYearsDead = annualBonus * Math.max(0, yearsRemaining - 1);

                // Update Cache (Release)
                cache.updatePlayer(p.id, { teamId: null, status: 'free_agent' });

                // Update Team Dead Cap (Preseason cutdowns are post-June 1)
                const freshTeam = cache.getTeam(team.id);
                if (currentYearDead > 0) {
                    cache.updateTeam(team.id, { deadCap: (freshTeam.deadCap ?? 0) + currentYearDead });
                }
                if (futureYearsDead > 0) {
                    cache.updateTeam(team.id, { deadMoneyNextYear: (freshTeam.deadMoneyNextYear ?? 0) + futureYearsDead });
                }

                // Log Transaction
                await Transactions.add({
                    type: 'RELEASE',
                    seasonId: meta.currentSeasonId,
                    week: meta.currentWeek,
                    teamId: team.id,
                    details: { playerId: p.id, deadCap: currentYearDead }
                });
            }

            // Re-calc active cap (roster changed)
            this.updateTeamCap(team.id);
        }
    }

    /**
     * Deterministic minimum-roster reconciliation for AI/headless rollover.
     * This is a last-mile safety pass after offseason churn: it only fills
     * under-minimum rosters from the existing free-agent pool and never cuts or
     * restructures players.
     */
    static async ensureMinimumRosters({ includeUserTeam = false, minimum = Constants.ROSTER_LIMITS.REGULAR_SEASON } = {}) {
        const meta = cache.getMeta();
        const userTeamId = meta?.userTeamId;
        const allTeams = cache.getAllTeams().slice().sort((a, b) => stableIdCompare(a?.id, b?.id));

        for (const team of allTeams) {
            if (!includeUserTeam && Number(team.id) === Number(userTeamId)) continue;

            let roster = cache.getPlayersByTeam(team.id);
            if (roster.length >= minimum) continue;

            const needs = AiLogic.calculateTeamNeeds(team.id);
            const neededPositions = Object.keys(needs)
                .filter((pos) => Number(needs[pos] ?? 0) > 1)
                .sort((a, b) => (Number(needs[b] ?? 0) - Number(needs[a] ?? 0)) || a.localeCompare(b));
            const positionOrder = [...neededPositions, ...Constants.POSITIONS.filter((pos) => !neededPositions.includes(pos))];

            while (roster.length < minimum) {
                const freshTeam = cache.getTeam(team.id);
                const freeAgents = cache.getAllPlayers()
                    .filter((p) => isFreeAgent(p))
                    .sort((a, b) => {
                        const posDelta = positionRank(a?.pos, positionOrder) - positionRank(b?.pos, positionOrder);
                        if (posDelta !== 0) return posDelta;
                        return (Number(b?.ovr ?? 0) - Number(a?.ovr ?? 0)) || stableIdCompare(a?.id, b?.id);
                    });
                const capSnapshot = buildTeamCapSnapshot({
                    team: freshTeam,
                    roster,
                    salaryCap: freshTeam?.capTotal ?? meta?.economy?.currentSalaryCap,
                });
                const room = Number(capSnapshot?.capRoom ?? freshTeam?.capRoom ?? 0);
                const candidate = freeAgents.find((p) => Number(getActiveCapHit(p) ?? 0) <= room + 0.01);
                if (!candidate) break;

                cache.updatePlayer(candidate.id, { teamId: team.id, status: 'active', offers: [] });
                await Transactions.add({
                    type: 'SIGN',
                    seasonId: meta.currentSeasonId,
                    week: meta.currentWeek,
                    teamId: team.id,
                    playerId: candidate.id,
                    details: { playerId: candidate.id, source: 'minimum_roster_reconciliation' },
                });
                AiLogic.updateTeamCap(team.id);
                roster = cache.getPlayersByTeam(team.id);
            }
        }
    }

    /**
     * Difficulty-based PLANNING buffer ($M below the legal cap). This is a
     * planning target only — it never changes the legal ceiling and must never
     * drive destructive cuts once a team is already legally under the cap.
     */
    static _capPlanningBuffer(difficulty) {
        if (difficulty === 'Hard') return 10;
        if (difficulty === 'Legendary') return 25;
        return 0;
    }

    /**
     * Post-June-1 dead-cap split for a release. Preseason cap management runs in
     * a POST_JUNE1 phase, so only the current year's bonus proration hits the
     * current cap; the remainder defers to deadMoneyNextYear. Mirrors the split
     * used by executeAICutdowns so the two paths agree.
     */
    static _releaseDeadCapSplit(player) {
        const c = player?.contract ?? {};
        const yearsTotal = Math.max(1, Number(c.yearsTotal ?? c.years ?? 1));
        const yearsRemaining = Math.max(0, Number(c.years ?? c.yearsRemaining ?? 1));
        const annualBonus = Math.max(0, Number(c.signingBonus ?? 0)) / yearsTotal;
        const currentYearDead = Math.round(annualBonus * 100) / 100;
        const futureYearsDead = Math.round(annualBonus * Math.max(0, yearsRemaining - 1) * 100) / 100;
        return { currentYearDead, futureYearsDead };
    }

    /**
     * Build a deterministic, side-effect-free cap-compliance plan for one team.
     *
     * The plan is discovered against clones so nothing is mutated while we are
     * still deciding whether a legal plan exists. Compliance uses the SAME
     * canonical equation as the pre-advance legality gate:
     *
     *   totalCommitted = Σ activeCapHit(roster) + team.deadCap
     *   legal          ⇔ totalCommitted ≤ liveSalaryCap
     *
     * Least-destructive ordering:
     *   1. Restructures (non-destructive) toward the PLANNING TARGET
     *      (legalCap − difficulty buffer). Only actions with proven positive
     *      current-year relief are kept; no player is restructured twice in the
     *      same season.
     *   2. Releases (destructive) ONLY while still over the LEGAL cap — never to
     *      chase the buffer. Ranked by realizable NET current-year relief
     *      (capHit − new current-year dead cap); zero/negative-relief players are
     *      never chosen, and no position is cut below its floor.
     *
     * @returns {{ actions: object[], projected: object, failure: object|null }}
     */
    static buildAiCapCompliancePlan(team, roster, { legalCap, targetBuffer = 0, season = 0 } = {}) {
        const actions = [];
        let workRoster = roster.map((p) => ({ ...p, contract: { ...(p?.contract ?? {}) } }));
        let deadCap = Math.max(0, Number(team?.deadCap ?? 0));
        // Original (pre-restructure) contracts, kept so a restructure can be rolled
        // back if the player later turns out to be the only cap-legal release.
        const originalContracts = new Map();
        const snap = () => buildTeamCapSnapshot({ team: { deadCap }, roster: workRoster, salaryCap: legalCap, targetBuffer });

        // ── Phase 1: restructures toward the planning target ──────────────────
        const touched = new Set();
        let guard = 0;
        while (snap().totalCommitted > snap().targetCommitted && guard++ < 500) {
            const s = snap();
            const candidates = workRoster
                .filter((p) => !touched.has(p.id))
                .filter((p) => Number(p?.contract?.lastRestructuredSeason) !== Number(season))
                .filter((p) => canRestructure(p, { capRoom: s.capRoom, deadCapItems: [] }).eligible)
                .map((p) => ({ p, hit: getActiveCapHit(p) }))
                .sort((a, b) => (b.hit - a.hit) || String(a.p.id).localeCompare(String(b.p.id)));
            if (!candidates.length) break;

            let applied = false;
            for (const { p, hit } of candidates) {
                const yearsLeft = Number(p.contract?.yearsRemaining ?? p.contract?.years ?? 1);
                const preview = computeRestructure(p, hit, yearsLeft, season);
                // Never convert more base than exists — a restructure must not
                // drive base salary negative.
                if (!(preview.conversionAmount > 0) || preview.conversionAmount > Number(p.contract?.baseAnnual ?? 0)) {
                    touched.add(p.id);
                    continue;
                }
                const { updatedPlayer, updatedTeam } = applyRestructure(p, team ?? {}, preview, season);
                const relief = Math.round((getActiveCapHit(p) - getActiveCapHit(updatedPlayer)) * 100) / 100;
                touched.add(p.id);
                if (relief <= 0) continue; // no genuine current-year relief → skip
                const idx = workRoster.findIndex((r) => r.id === p.id);
                if (!originalContracts.has(p.id)) originalContracts.set(p.id, { ...workRoster[idx].contract });
                workRoster[idx] = { ...updatedPlayer, contract: { ...updatedPlayer.contract, lastRestructuredSeason: Number(season) } };
                const newDeadCapItem = Array.isArray(updatedTeam?.deadCapItems)
                    ? updatedTeam.deadCapItems[updatedTeam.deadCapItems.length - 1]
                    : null;
                actions.push({
                    type: 'RESTRUCTURE',
                    playerId: p.id,
                    conversionAmount: preview.conversionAmount,
                    relief,
                    newContract: workRoster[idx].contract,
                    deadCapItem: newDeadCapItem,
                });
                applied = true;
                break;
            }
            if (!applied) break;
        }

        // ── Phase 2a: releases from the NON-restructured pool ──────────────────
        // Prefer cutting players we did NOT restructure. Restructuring converts
        // base to prorated bonus, so a just-restructured player has HIGHER dead
        // cap and LOWER net release relief — restructuring then releasing the same
        // player is wasteful. Keep the players we chose to restructure and cut the
        // rest first.
        const restructuredIds = new Set(
            actions.filter((a) => a.type === 'RESTRUCTURE').map((a) => a.playerId),
        );
        const posCount = {};
        for (const p of workRoster) posCount[p.pos] = (posCount[p.pos] ?? 0) + 1;

        guard = 0;
        while (snap().totalCommitted > legalCap && guard++ < 500) {
            const candidates = workRoster
                .filter((p) => !restructuredIds.has(p.id))
                .map((p) => {
                    const { currentYearDead, futureYearsDead } = AiLogic._releaseDeadCapSplit(p);
                    const netRelief = Math.round((getActiveCapHit(p) - currentYearDead) * 100) / 100;
                    return { p, netRelief, currentYearDead, futureYearsDead };
                })
                .filter((c) => c.netRelief > 0)
                .filter((c) => (posCount[c.p.pos] ?? 0) > (AiLogic.POSITION_FLOOR[c.p.pos] ?? 1))
                .sort((a, b) => (b.netRelief - a.netRelief)
                    || ((a.p.ovr ?? 0) - (b.p.ovr ?? 0))
                    || String(a.p.id).localeCompare(String(b.p.id)));
            if (!candidates.length) break;

            const choice = candidates[0];
            workRoster = workRoster.filter((r) => r.id !== choice.p.id);
            posCount[choice.p.pos] = (posCount[choice.p.pos] ?? 1) - 1;
            deadCap = Math.round((deadCap + choice.currentYearDead) * 100) / 100;
            actions.push({
                type: 'RELEASE',
                playerId: choice.p.id,
                currentYearDead: choice.currentYearDead,
                futureYearsDead: choice.futureYearsDead,
                netRelief: choice.netRelief,
            });
        }

        // ── Phase 2b: rollback releases — LAST resort, only if still over legal ──
        // If cutting the non-restructured pool cannot reach the legal cap, a
        // restructured player may be the only remaining cap-legal release. Rather
        // than restructure AND release him (wasteful) or falsely report no legal
        // plan, ROLL BACK his restructure and release him from his ORIGINAL
        // contract — this both removes the now-pointless restructure and realizes
        // the full original release relief.
        guard = 0;
        while (snap().totalCommitted > legalCap && guard++ < 500) {
            const candidates = workRoster
                .filter((p) => restructuredIds.has(p.id) && originalContracts.has(p.id))
                .map((p) => {
                    const origPlayer = { ...p, contract: originalContracts.get(p.id) };
                    const { currentYearDead, futureYearsDead } = AiLogic._releaseDeadCapSplit(origPlayer);
                    const netRelief = Math.round((getActiveCapHit(origPlayer) - currentYearDead) * 100) / 100;
                    return { p, netRelief, currentYearDead, futureYearsDead };
                })
                .filter((c) => c.netRelief > 0)
                .filter((c) => (posCount[c.p.pos] ?? 0) > (AiLogic.POSITION_FLOOR[c.p.pos] ?? 1))
                .sort((a, b) => (b.netRelief - a.netRelief)
                    || ((a.p.ovr ?? 0) - (b.p.ovr ?? 0))
                    || String(a.p.id).localeCompare(String(b.p.id)));
            if (!candidates.length) break;

            const choice = candidates[0];
            // Roll back the restructure: drop its action (and its void-year dead
            // money) so the committed contract stays original, then release.
            const rIdx = actions.findIndex((a) => a.type === 'RESTRUCTURE' && a.playerId === choice.p.id);
            if (rIdx >= 0) actions.splice(rIdx, 1);
            restructuredIds.delete(choice.p.id);
            workRoster = workRoster.filter((r) => r.id !== choice.p.id);
            posCount[choice.p.pos] = (posCount[choice.p.pos] ?? 1) - 1;
            deadCap = Math.round((deadCap + choice.currentYearDead) * 100) / 100;
            actions.push({
                type: 'RELEASE',
                playerId: choice.p.id,
                currentYearDead: choice.currentYearDead,
                futureYearsDead: choice.futureYearsDead,
                netRelief: choice.netRelief,
                rolledBackRestructure: true,
            });
        }

        const projected = snap();
        const failure = projected.isLegallyCompliant ? null : {
            teamId: team?.id,
            abbr: team?.abbr,
            reason: 'no_legal_plan',
            remainingOverage: projected.overageVsLegal,
            rosterCap: projected.rosterCap,
            deadCap: projected.deadCap,
            totalCommitted: projected.totalCommitted,
            legalCap,
            protectedPositions: Object.keys(AiLogic.POSITION_FLOOR).filter((pos) => (posCount[pos] ?? 0) <= (AiLogic.POSITION_FLOOR[pos] ?? 1)),
        };

        return { actions, projected, failure };
    }

    /**
     * Execute AI Cap Management before the start of the regular season.
     *
     * Every AI team is brought to a legally cap-compliant state against the LIVE
     * salary cap using the least-destructive plan (restructures first, then
     * net-positive releases). Restructures and releases are committed through the
     * canonical contract helpers so cap state, dead money and transaction records
     * all stay consistent.
     *
     * The interactive user team is NEVER auto-managed. Headless/durability
     * lifecycles pass `autoManageUserCap: true` (gated on the explicit batch-sim
     * capability by the caller) so the franchise can start a season without an
     * interactive front office.
     *
     * @param {{autoManageUserCap?: boolean}} [opts]
     * @returns {Promise<{failures: object[], teamsManaged: number}>}
     */
    static async executeAICapManagement({ autoManageUserCap = false } = {}) {
        const txsToCommit = [];
        const meta        = cache.getMeta();
        const userTeamId  = meta.userTeamId;
        const seasonId    = meta.currentSeasonId;
        const week        = meta.currentWeek;
        const season      = Number(meta?.year ?? 0);
        const legalCap    = AiLogic._getSalaryCap();
        const targetBuffer = AiLogic._capPlanningBuffer(meta.difficulty);
        const allTeams    = cache.getAllTeams();
        const failures    = [];
        let teamsManaged  = 0;

        for (const team of allTeams) {
            if (team.id === userTeamId && !autoManageUserCap) continue;

            this.updateTeamCap(team.id);
            const freshTeam = cache.getTeam(team.id);
            const roster = cache.getPlayersByTeam(team.id);
            const snapshot = buildTeamCapSnapshot({ team: freshTeam, roster, salaryCap: legalCap, targetBuffer });
            if (snapshot.isWithinPlanningTarget) continue;

            const plan = AiLogic.buildAiCapCompliancePlan(freshTeam, roster, { legalCap, targetBuffer, season });

            // If no legal plan exists, do NOT commit partial destructive actions.
            // Committing releases/restructures that cannot eliminate the overage
            // would strip players/contracts for no compliance benefit and leave
            // retries operating on a needlessly mutated roster. Record the
            // structured failure and leave the roster intact instead.
            if (plan.failure) {
                failures.push({ ...plan.failure, legalCap });
                continue;
            }

            if (plan.actions.length === 0) continue;
            teamsManaged += 1;

            for (const action of plan.actions) {
                const player = cache.getPlayer(action.playerId);
                if (!player) continue;

                if (action.type === 'RESTRUCTURE') {
                    cache.updatePlayer(player.id, {
                        contract: { ...action.newContract, lastRestructuredSeason: season },
                    });
                    if (action.deadCapItem) {
                        const t = cache.getTeam(team.id);
                        const existing = Array.isArray(t?.deadCapItems) ? t.deadCapItems : [];
                        cache.updateTeam(team.id, { deadCapItems: [...existing, action.deadCapItem] });
                    }
                    this.updateTeamCap(team.id);
                    txsToCommit.push({
                        type: 'RESTRUCTURE', seasonId, week, teamId: team.id,
                        details: { playerId: player.id, convertAmount: action.conversionAmount, relief: action.relief, aiInitiated: true },
                    });
                } else if (action.type === 'RELEASE') {
                    cache.updatePlayer(player.id, { teamId: null, status: 'free_agent' });
                    const t = cache.getTeam(team.id);
                    if (action.currentYearDead > 0) {
                        cache.updateTeam(team.id, { deadCap: Math.round(((t.deadCap ?? 0) + action.currentYearDead) * 100) / 100 });
                    }
                    const t2 = cache.getTeam(team.id);
                    if (action.futureYearsDead > 0) {
                        cache.updateTeam(team.id, { deadMoneyNextYear: Math.round(((t2.deadMoneyNextYear ?? 0) + action.futureYearsDead) * 100) / 100 });
                    }
                    this.updateTeamCap(team.id);
                    txsToCommit.push({
                        type: 'RELEASE', seasonId, week, teamId: team.id,
                        details: { playerId: player.id, deadCap: action.currentYearDead, aiCapCut: true },
                    });
                }
            }

            // Confirm the live committed result rather than trusting projections.
            this.updateTeamCap(team.id);
            const liveTeam = cache.getTeam(team.id);
            const liveRoster = cache.getPlayersByTeam(team.id);
            const liveSnap = buildTeamCapSnapshot({ team: liveTeam, roster: liveRoster, salaryCap: legalCap });
            if (!liveSnap.isLegallyCompliant) {
                failures.push({
                    teamId: team.id,
                    abbr: team.abbr,
                    remainingOverage: liveSnap.overageVsLegal,
                    rosterCap: liveSnap.rosterCap,
                    deadCap: liveSnap.deadCap,
                    totalCommitted: liveSnap.totalCommitted,
                    legalCap,
                    ...(plan.failure ?? {}),
                });
            }
        }

        if (txsToCommit.length > 0) {
            await Promise.all(txsToCommit.map(tx => Transactions.add(tx)));
        }

        if (failures.length > 0) {
            console.warn(`[AiLogic] executeAICapManagement: ${failures.length} team(s) could not reach a legal cap plan:`,
                failures.map((f) => `${f.abbr}(${f.teamId}) over by $${f.remainingOverage}M`).join(', '));
        }

        return { failures, teamsManaged };
    }

    /**
     * Execute AI offseason roster cuts for all AI-controlled teams.
     *
     * Runs just before the free_agency phase transition so that cap-strapped
     * teams can shed toxic contracts and enter free agency with workable space.
     * Only releases players where Cap Savings > 0 — never worsens the cap.
     * Human-controlled teams are explicitly skipped.
     */
    static async executeOffseasonRosterCuts() {
        const meta = cache.getMeta();
        const userTeamId = meta?.userTeamId;
        const allTeams = cache.getAllTeams().slice().sort((a, b) => stableIdCompare(a?.id, b?.id));
        const year = Number(meta?.year ?? 2025);

        for (const team of allTeams) {
            if (team.id === userTeamId) continue;

            // Refresh cap before evaluation so OVR changes from progression are reflected.
            this.updateTeamCap(team.id);
            const freshTeam = cache.getTeam(team.id);
            const roster = cache.getPlayersByTeam(team.id);

            const cuts = executeAIOffseasonCuts(freshTeam, roster, year);
            if (cuts.length === 0) continue;

            for (const { player: p, capSavings, reason } of cuts) {
                if (!p?.contract) continue;

                const c = p.contract;
                // Pre-June-1 (offseason_resign phase): all remaining prorated bonus hits
                // current-year dead cap — matches handleReleasePlayer's pre-June-1 path.
                const yearsRemaining = Math.max(c.years ?? c.yearsRemaining ?? 1, 1);
                const yearsTotal     = Math.max(c.yearsTotal ?? yearsRemaining, 1);
                const annualBonus    = (c.signingBonus ?? 0) / yearsTotal;
                const deadMoney      = Math.round(annualBonus * yearsRemaining * 100) / 100;

                cache.updatePlayer(p.id, { teamId: null, status: 'free_agent', offers: [] });

                const currentTeam = cache.getTeam(team.id);
                if (deadMoney > 0) {
                    cache.updateTeam(team.id, { deadCap: (currentTeam.deadCap ?? 0) + deadMoney });
                }
                this.updateTeamCap(team.id);

                await Transactions.add({
                    type: 'RELEASE',
                    seasonId: meta.currentSeasonId,
                    week: meta.currentWeek,
                    teamId: team.id,
                    details: { playerId: p.id, capSavings, reason, aiOffseasonCut: true },
                });

                await NewsEngine.logTransaction('RELEASE', { teamId: team.id, playerId: p.id });
            }
        }
    }

    /**
     * Calculate positional needs for a team based on its roster.
     * Returns a map of Position -> Multiplier.
     * High Need (> 1.5): Empty starter slot or starter < 75 OVR.
     * Low Need (< 0.8): Starter > 85 OVR.
     */
    static calculateTeamNeeds(teamId) {
        const team = cache.getTeam(teamId);
        const roster = cache.getPlayersByTeam(teamId);
        const meta = cache.getMeta();
        const strategy = buildAiTeamStrategy({
            team,
            roster,
            league: { year: meta?.year, phase: meta?.phase },
            phase: meta?.phase,
            year: meta?.year,
        });
        return this._teamNeedsFromStrategy(strategy);
    }

    /**
     * Evaluate a draft prospect's value to a specific team.
     */
    static evaluateDraftPick(prospect, teamId) {
        const needs = this.calculateTeamNeeds(teamId);
        const multiplier = needs[prospect.pos] || 1.0;
        return (prospect.ovr ?? 0) * multiplier;
    }

    /**
     * Process contract extensions for a team's core players during offseason_resign.
     * Delegates prioritization and cap math to the pure executeAIOffseasonExtensions
     * utility, then applies each accepted extension to cache.
     * Call this before Free Agency / Draft.
     */
    static async processExtensions(teamId) {
        const team = cache.getTeam(teamId);
        if (!team) return;

        this.updateTeamCap(teamId);

        const roster = cache.getPlayersByTeam(teamId);
        const meta   = cache.getMeta();
        const allPlayers = cache.getAllPlayers().slice().sort((a, b) => stableIdCompare(a.id, b.id));
        const freeAgents = allPlayers.filter((p) => isFreeAgent(p));

        const extensions = executeAIOffseasonExtensions(
            team,
            roster,
            { freeAgents, phase: meta?.phase, season: meta?.year },
        );

        const transactionPayloads = [];

        for (const { player, contract } of extensions) {
            const newContract = { ...contract, startYear: meta?.year };

            cache.updatePlayer(player.id, {
                contract: newContract,
                negotiationStatus: 'SIGNED',
                extensionDecision: 'extended',
            });

            this.updateTeamCap(teamId);

            transactionPayloads.push({
                type: 'EXTEND',
                seasonId: meta?.currentSeasonId,
                week: meta?.currentWeek,
                teamId,
                details: { playerId: player.id, contract: newContract },
            });

            await NewsEngine.logTransaction('EXTEND', {
                teamId,
                playerId: player.id,
                contract: newContract,
            });
        }

        if (transactionPayloads.length > 0) {
            await Transactions.addBulk(transactionPayloads);
        }
    }

    /**
     * Execute the Franchise Tag and RFA Tender sweep for an AI team.
     * Must be called AFTER processExtensions — targets expiring players who
     * did not receive (or accept) a contract extension.
     *
     * Pass 1 — Franchise Tag:
     *   The highest-OVR expiring player at a critical-need position is tagged.
     *   Tagged players receive a 1-year fully-guaranteed contract at the
     *   market average of the top-5 salaries at their position.
     *   contract.tag = 'franchise' prevents the player entering the FA pool.
     *
     * Pass 2 — RFA Tenders:
     *   Remaining eligible drafted players receive a tender valued by their
     *   original draft round.  contract.tender records the pick-compensation
     *   tier owed if another team signs the player away.
     */
    static async processTagsAndTenders(teamId) {
        const team = cache.getTeam(teamId);
        if (!team) return;

        this.updateTeamCap(teamId);

        const meta       = cache.getMeta();
        const allPlayers = cache.getAllPlayers();
        const roster     = cache.getPlayersByTeam(teamId);
        const year       = Number(meta?.year ?? 2025);

        const isExpiring = (p) => {
            const yrs = Number(
                p?.contract?.years ?? p?.contract?.yearsRemaining ?? p?.contract?.yearsLeft ?? 1,
            );
            return yrs <= 1;
        };

        // Expiring players who weren't extended and haven't already been tagged/tendered
        const unsigned = roster.filter(
            (p) =>
                isExpiring(p) &&
                p?.negotiationStatus !== 'SIGNED' &&
                !p?.contract?.tag &&
                !p?.contract?.tender,
        );

        if (unsigned.length === 0) return;

        const needs = this.calculateTeamNeeds(teamId);

        // ── Pass 1: Franchise Tag ─────────────────────────────────────────────
        const tagCandidates = unsigned
            .filter((p) => {
                const ovr = Number(p?.ovr ?? 0);
                const pos = String(p?.pos ?? '');
                return (
                    ovr >= TENDER_CONFIG.MIN_OVR_FOR_FRANCHISE_TAG &&
                    (needs[pos] ?? 1.0) >= 1.2
                );
            })
            .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));

        if (tagCandidates.length > 0) {
            const target      = tagCandidates[0];
            const tagContract = buildFranchiseTagContract(target, allPlayers, year);
            const freshTeam   = cache.getTeam(teamId);
            const capAfter    = (freshTeam?.capRoom ?? 0) - tagContract.baseAnnual;

            if (capAfter >= TENDER_CONFIG.MIN_CAP_BUFFER_AFTER_TAG) {
                cache.updatePlayer(target.id, {
                    contract:          tagContract,
                    isTagged:          true,
                    negotiationStatus: 'TAGGED',
                    extensionDecision: 'franchise_tagged',
                });
                this.updateTeamCap(teamId);

                const tagTeam  = cache.getTeam(teamId);
                const tagged   = cache.getPlayer(target.id);
                if (tagTeam && tagged) {
                    await NewsEngine.logNews(
                        'TRANSACTION',
                        `${tagTeam.abbr} placed the Franchise Tag on ${tagged.pos} ${tagged.name} ($${tagContract.baseAnnual.toFixed(1)}M).`,
                        teamId,
                        { playerId: target.id, priority: tagged.ovr >= 80 ? 'high' : undefined },
                    );
                }

                await Transactions.add({
                    type:     'FRANCHISE_TAG',
                    seasonId: meta?.currentSeasonId,
                    week:     meta?.currentWeek,
                    teamId,
                    details:  { playerId: target.id, contract: tagContract },
                });
            }
        }

        // ── Pass 2: RFA Tenders ───────────────────────────────────────────────
        // Re-fetch roster so the tagged player is excluded via the contract.tag check
        const rosterNow = cache.getPlayersByTeam(teamId);
        const tenderCandidates = rosterNow.filter(
            (p) =>
                isExpiring(p) &&
                p?.negotiationStatus !== 'SIGNED' &&
                !p?.contract?.tag &&
                !p?.contract?.tender &&
                Number(p?.ovr ?? 0) >= TENDER_CONFIG.MIN_OVR_FOR_RFA_TENDER &&
                Number(p?.draftRound ?? 0) >= 1, // only drafted players qualify as RFAs
        );

        for (const player of tenderCandidates) {
            const tenderContract = buildRFATenderContract(player, year);
            const currentTeam   = cache.getTeam(teamId);
            const capAfter      = (currentTeam?.capRoom ?? 0) - tenderContract.baseAnnual;

            if (capAfter < TENDER_CONFIG.MIN_CAP_BUFFER_AFTER_TAG) continue;

            cache.updatePlayer(player.id, {
                contract:          tenderContract,
                negotiationStatus: 'TENDERED',
                extensionDecision: 'rfa_tendered',
            });
            this.updateTeamCap(teamId);

            await Transactions.add({
                type:     'RFA_TENDER',
                seasonId: meta?.currentSeasonId,
                week:     meta?.currentWeek,
                teamId,
                details:  {
                    playerId:        player.id,
                    contract:        tenderContract,
                    compensationPick: tenderContract.compensationPick,
                },
            });
        }
    }

    /**
     * Execute AI Free Agency logic for a team.
     * Fills roster holes with available Free Agents.
     * @deprecated Use processFreeAgencyDay loop instead.
     */
    static async executeAIFreeAgency(teamId) {
        // ... kept for compatibility or fallback, but logic moved to makeFreeAgencyOffers
        await this.makeFreeAgencyOffers(teamId);
    }

    /**
     * AI submits offers to free agents based on needs.
     * Does NOT sign players immediately; pushes to player.offers.
     *
     * OPTIMIZATION: Now accepts an optional pre-filtered freeAgentsMap to avoid
     * iterating all players for every team.
     * @param {number} teamId
     * @param {Object} [freeAgentsMap] - Optional map of pos -> sorted array of free agents
     */
    static async makeFreeAgencyOffers(teamId, freeAgentsMap = null) {
        const team = cache.getTeam(teamId);
        if (!team) return;
        const meta = cache.getMeta();
        const roster = cache.getPlayersByTeam(teamId);
        const strategy = buildAiTeamStrategy({
            team,
            roster,
            league: { year: meta?.year, phase: meta?.phase },
            phase: meta?.phase,
            year: meta?.year,
        });
        // Positional need sync: classify per-position depth quality to gate bidding decisions.
        const depthDeficiencies = calculateTeamDepthDeficiencies(roster);

        // 1. Identify Needs (prioritize highest gaps; contenders focus on a few real upgrades per day)
        const needs = this._teamNeedsFromStrategy(strategy);
        let highNeedPositions = Object.keys(needs).filter(pos => needs[pos] >= 1.2);
        const needSortScore = (pos) => Number(needs[pos] ?? 0) + (pos === 'QB' ? 0.72 : 0);
        highNeedPositions.sort((a, b) => needSortScore(b) - needSortScore(a));
        const arch = strategy?.archetype;
        const maxNeedSlots = arch === 'contender' || arch === 'playoff_hunt'
          ? 3
          : arch === 'rebuild' || arch === 'development'
            ? 6
            : 4;
        highNeedPositions = highNeedPositions.slice(0, maxNeedSlots);
        // Prune positions the team already has at SECURE quality (avgStarterOvr >= 80).
        // Prevents the AI from burning cap on positions that don't genuinely need help.
        highNeedPositions = highNeedPositions.filter(
            (pos) => getNeedLevelForPlayer({ pos }, depthDeficiencies) !== POSITION_NEED_LEVEL.SECURE,
        );
        // QB force-add: only if QB depth is not already SECURE.
        const qbDepthNeedLevel = getNeedLevelForPlayer({ pos: 'QB' }, depthDeficiencies);
        if (Number(needs.QB ?? 0) >= 1.12 && !highNeedPositions.includes('QB') && qbDepthNeedLevel !== POSITION_NEED_LEVEL.SECURE) {
          highNeedPositions = ['QB', ...highNeedPositions].slice(0, maxNeedSlots);
        }

        if (highNeedPositions.length === 0) return;

        // 2. When we have a shared freeAgentsMap (from processFreeAgencyDay),
        // build a richer market analysis so AI can reason about fit, bargains,
        // and cap pressure instead of sorting purely by OVR.
        let marketByPos = null;
        const demandByPlayerId = new Map();
        if (freeAgentsMap) {
            const flatFreeAgents = Object.values(freeAgentsMap).flat().filter(Boolean);
            if (flatFreeAgents.length > 0) {
                const analyzedFreeAgents = flatFreeAgents.map((fa) => {
                    const demand = calculateExtensionDemand(fa);
                    if (demand) {
                        demandByPlayerId.set(fa.id, demand);
                        return { ...fa, contractDemand: demand };
                    }
                    return fa;
                });
                const analysis = buildFreeAgencyMarketAnalysis({
                    team,
                    roster,
                    freeAgents: analyzedFreeAgents,
                    cap: { capRoom: team.capRoom },
                });
                marketByPos = analysis?.marketRows?.reduce((acc, row) => {
                    if (!row?.pos) return acc;
                    if (!acc[row.pos]) acc[row.pos] = [];
                    acc[row.pos].push(row);
                    return acc;
                }, {}) || null;
                if (marketByPos) {
                    for (const pos of Object.keys(marketByPos)) {
                        marketByPos[pos].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
                    }
                }
            }
        }

        // 3. Get Available FAs (fallback to legacy behaviour if needed)
        const legacyGetCandidates = (pos) => {
            const allPlayers = cache.getAllPlayers();
            return allPlayers
                .filter(p => isFreeAgent(p) && p.pos === pos)
                .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
        };

        const getCandidatesForPos = (pos) => {
            if (marketByPos && marketByPos[pos]?.length) {
                return marketByPos[pos]
                    .filter(
                        (row) =>
                            row.recommendation !== 'avoid' &&
                            (row.capFit !== 'expensive' || row.costSource === 'staleContract'),
                    )
                    .map(row => row._player)
                    .filter(Boolean);
            }
            if (freeAgentsMap) {
                return freeAgentsMap[pos] || [];
            }
            return legacyGetCandidates(pos);
        };


        const hasDuplicateExpensivePendingOffer = (pos, proposedCapHit) => {
            if (pos === 'QB' || proposedCapHit < 10 || !freeAgentsMap) return false;
            const group = normalizePositionGroup(pos);
            return Object.values(freeAgentsMap)
                .flat()
                .filter(Boolean)
                .some((player) => {
                    if (normalizePositionGroup(player?.pos) !== group) return false;
                    return Array.isArray(player?.offers) && player.offers.some((offer) => {
                        if (Number(offer?.teamId) !== Number(teamId)) return false;
                        const c = offer?.contract ?? {};
                        const years = Math.max(1, Number(c.yearsTotal ?? c.years ?? 1));
                        const annual = Number(c.baseAnnual ?? 0) + (Number(c.signingBonus ?? 0) / years);
                        return annual >= 10;
                    });
                });
        };

        // 4. Attempt to fill each high need position
        for (const pos of highNeedPositions) {
            const candidates = getCandidatesForPos(pos);

            if (!candidates || candidates.length === 0) continue;

            // Try to offer to the best affordable one
            for (const fa of candidates) {
                // Skip if OVR is too low
                const urgentPos = needs[pos] >= 1.7;
                const minOvr = urgentPos ? 62 : 70;
                if ((fa.ovr ?? 0) < minOvr) continue;

                // Check if we already have an active offer out to this player
                if (fa.offers && fa.offers.find(o => o.teamId === teamId)) continue;

                // Depth-need gate: skip candidates whose position is already SECURE.
                // Target evaluation score multiplier: CRITICAL → 1.5×, MODERATE → 1.1×, others → 1.0×.
                const faDepthNeedLevel = getNeedLevelForPlayer({ pos: fa.pos }, depthDeficiencies);
                if (faDepthNeedLevel === POSITION_NEED_LEVEL.SECURE) continue;
                const depthNeedMultiplier =
                    faDepthNeedLevel === POSITION_NEED_LEVEL.CRITICAL ? 1.5 :
                    faDepthNeedLevel === POSITION_NEED_LEVEL.MODERATE ? 1.1 : 1.0;

                // Calculate Ask / Offer through the V1 contract model.
                const demand = demandByPlayerId.get(fa.id) ?? calculateExtensionDemand(fa);
                if (!demand) continue;
                const market = evaluateContractMarket(fa, {
                    team,
                    strategy,
                    teamArchetype: strategy?.archetype,
                    capHealth: strategy?.capHealth,
                    teamCapRoom: team.capRoom,
                    positionalNeed: needs[pos] ?? 1,
                });
                const marketRiskTags = Array.isArray(market.riskTags) ? market.riskTags : [];
                const age = Number(fa?.age ?? 27);
                const isVeteran = age >= 30;
                const demandAnnual = Number(demand?.baseAnnual ?? market.suggestedAnnual ?? 0);
                const modelAnnualForRisk = Number(market?.annualCapHit ?? market?.suggestedAnnual ?? demandAnnual);
                const oldExpensiveNonQb = isVeteran && fa.pos !== 'QB' && modelAnnualForRisk >= 10;
                const oldExpensiveQbRebuild = fa.pos === 'QB' && age >= 33 && demandAnnual >= 14 && ['rebuild', 'development'].includes(strategy?.archetype);
                if ((['rebuild', 'development'].includes(strategy?.archetype) && oldExpensiveNonQb) || oldExpensiveQbRebuild) continue;
                if (strategy?.archetype === 'retool' && age >= 31 && oldExpensiveNonQb) continue;
                if (marketRiskTags.includes('long veteran commitment') && ['rebuild', 'development', 'retool'].includes(strategy?.archetype)) continue;

                const qbDesperate = pos === 'QB' && Number(needs.QB ?? 0) >= 1.12;
                const realism = evaluatePlayerMarketRealism({
                    player: fa,
                    team,
                    roster: strategy?.roster ?? roster,
                    strategy,
                    positionalNeed: needs[pos] ?? 1,
                    capRoom: team.capRoom,
                    proposedAnnual: modelAnnualForRisk,
                    action: 'free_agency',
                });
                if (realism.shouldAvoid && !realism.flags.includes('qb_need_exception') && !qbDesperate) continue;

                const demandYears = Math.max(1, Number(demand?.yearsTotal ?? demand?.years ?? market.suggestedYears ?? 1));
                const modelAnnual = Number(market.suggestedAnnual ?? demandAnnual);
                const baseAnnual = Math.round(Math.min(modelAnnual, demandAnnual * 1.08) * 10) / 10;
                const years = Math.max(1, Math.min(Number(market.suggestedYears ?? demandYears), demandYears));
                const bonusRatio = demandAnnual > 0 ? Math.min(0.22, Number(demand?.signingBonus ?? 0) / Math.max(1, demandAnnual * demandYears)) : 0;
                const offerContract = buildContractFromMarket({
                    ...market,
                    suggestedAnnual: baseAnnual,
                    suggestedYears: years,
                    signingBonus: Math.round(baseAnnual * years * bonusRatio * 10) / 10,
                }, { startYear: cache.getMeta().year });
                offerContract.years = offerContract.yearsTotal;

                const capHit = offerContract.baseAnnual + (offerContract.signingBonus / offerContract.yearsTotal);
                if (hasDuplicateExpensivePendingOffer(pos, capHit)) continue;

                const pendingCap = evaluatePendingOfferCapReservation({
                    team,
                    freeAgents: freeAgentsMap ? Object.values(freeAgentsMap).flat().filter(Boolean) : [],
                    teamId,
                    currentCapRoom: team.capRoom,
                    proposedOffer: { player: fa, offer: { teamId, contract: offerContract } },
                });
                const pendingAfter = Number(pendingCap?.estimatedCapRoomAfterPending ?? team.capRoom);
                const pendingStatus = pendingCap?.capReservationStatus;
                const pendingBlocks = ['overcommitted'].includes(pendingStatus) || pendingAfter < 0;
                const pendingQbException = pos === 'QB' && Number(needs.QB ?? 0) >= 1.12 && pendingAfter >= -2;
                if (pendingBlocks && !pendingQbException) continue;

                const capHealth = Number(strategy?.capHealth ?? 55);
                let capLimit = strategy?.archetype === 'contender'
                    ? 0.74
                    : ['rebuild', 'development'].includes(strategy?.archetype)
                        ? 0.42
                        : strategy?.archetype === 'middle'
                          ? 0.58
                          : 0.62;
                if (capHealth < 28) capLimit *= 0.68;
                else if (capHealth < 40) capLimit *= 0.86;
                // Widen the cap ceiling for genuine roster holes (CRITICAL → 1.5×, MODERATE → 1.1×).
                capLimit = Math.min(0.88, capLimit * depthNeedMultiplier);
                const maxAllowedHit = Math.max(3, Number(team.capRoom ?? 0) * capLimit);
                if (!urgentPos && capHit > maxAllowedHit) {
                    const qbException = qbDesperate && (market.controlledException || realism.flags.includes('qb_need_exception')) && capHit <= maxAllowedHit * 1.8;
                    if (!qbException) continue;
                }

                // Check Cap
                if ((team.capRoom ?? 0) > (capHit + 1)) {
                    // MAKE OFFER
                    const offer = {
                        teamId,
                        teamName: team.name, // Snapshot name
                        contract: offerContract,
                        contractModel: {
                            marketTier: market.marketTier,
                            capFit: market.capFit,
                            riskTags: market.riskTags,
                            reasons: [...new Set([...(market.reasons ?? []), ...(realism.reasons ?? [])])],
                            depthNeedLevel: faDepthNeedLevel,
                            depthNeedMultiplier,
                            marketRealism: {
                                marketDemandScore: realism.marketDemandScore,
                                fitScore: realism.fitScore,
                                capRisk: realism.capRisk,
                                ageRisk: realism.ageRisk,
                                contractBurden: realism.contractBurden,
                                teamFitTier: realism.teamFitTier,
                                flags: realism.flags,
                            },
                        },
                        timestamp: Date.now()
                    };

                    // Push to player's offer list (in cache)
                    if (!fa.offers) fa.offers = [];
                    fa.offers.push(offer);

                    // Persist the offer (mark player as dirty)
                    cache.updatePlayer(fa.id, { offers: fa.offers });

                    // We don't deduct cap yet, but ideally we should track "reserved" cap.
                    // For now, we update team cap only on signing.
                    break; // One offer per need position per day
                }
            }
        }
    }

    /**
     * Process one "Day" of Free Agency.
     * 1. AI Teams make offers.
     * 2. Players evaluate offers and decide.
     */
    static async processFreeAgencyDay(day) {
        const meta = cache.getMeta();
        const userTeamId = meta.userTeamId;

        // OPTIMIZATION: Build freeAgentsMap once for all AI teams
        const allPlayers = cache.getAllPlayers().slice().sort((a, b) => stableIdCompare(a.id, b.id));
        const freeAgentsMap = buildSortedFreeAgentsMapForOffers(allPlayers);

        // 1. AI Teams Make Offers
        const allTeams = cache.getAllTeams().slice().sort((a, b) => stableIdCompare(a.id, b.id));
        for (const team of allTeams) {
            if (team.id !== userTeamId) {
                await this.makeFreeAgencyOffers(team.id, freeAgentsMap);
            }
        }

        // 2. Players Evaluate Offers
        const freeAgents = allPlayers.filter(p => isFreeAgent(p) && p.offers && p.offers.length > 0);

        const txsToCommit = [];
        for (const player of freeAgents) {
            const decision = this.evaluateOffers(player, day);

            if (decision.signed && decision.offer) {
                // SIGN PLAYER
                const { offer } = decision;
                const teamId = offer.teamId;

                // Verify team still has cap space (race condition check)
                const team = cache.getTeam(teamId);
                const capHit = offer.contract.baseAnnual + (offer.contract.signingBonus / offer.contract.yearsTotal);

                if (team && team.capRoom >= capHit) {
                    const oldTeamId = player.teamId;
                    const priorContract = player.contract;
                    const priorTeamId = player.teamId;
                    const priorStatus = player.status;
                    cache.updatePlayer(player.id, {
                        teamId,
                        status: 'active',
                        contract: offer.contract,
                        offers: [] // Clear offers
                    });

                    // Enforce the dead-cap floor: if committing this signing pushed
                    // the team below the floor, roll the signing back and skip it.
                    const capResult = AiLogic.updateTeamCap(teamId);
                    if (!capResult.ok) {
                        cache.updatePlayer(player.id, {
                            teamId: priorTeamId,
                            status: priorStatus,
                            contract: priorContract,
                        });
                        AiLogic.updateTeamCap(teamId);
                        player.offers = (player.offers || []).filter(o => o.teamId !== teamId);
                        continue;
                    }

                    const metaSnapshot = cache.getMeta() ?? {};
                    if (metaSnapshot.phase === 'free_agency' && oldTeamId != null && Number(oldTeamId) !== Number(teamId)) {
                        const existing = Array.isArray(metaSnapshot?.offseasonFaMovements) ? metaSnapshot.offseasonFaMovements : [];
                        const years = Math.max(1, Number(offer?.contract?.yearsTotal ?? offer?.contract?.years ?? 1) || 1);
                        const aav = Number(offer?.contract?.baseAnnual ?? 0) + (Number(offer?.contract?.signingBonus ?? 0) / years);
                        const qualifies = aav >= 2.5 && years >= 2 && Number(player?.ovr ?? 0) >= 66;
                        cache.setMeta({
                            offseasonFaMovements: [...existing, {
                                id: `${metaSnapshot.year}-${player.id}-${teamId}-${Date.now()}`,
                                playerId: Number(player.id),
                                playerName: player.name,
                                pos: player.pos,
                                prevTeamId: Number(oldTeamId),
                                newTeamId: Number(teamId),
                                contract: {
                                    yearsTotal: years,
                                    years: Number(offer?.contract?.years ?? years),
                                    baseAnnual: Number(offer?.contract?.baseAnnual ?? 0),
                                    signingBonus: Number(offer?.contract?.signingBonus ?? 0),
                                },
                                aav,
                                years,
                                ovrAtDeparture: Number(player?.ovr ?? 65),
                                qualifying: qualifies,
                                externalSigning: true,
                                source: 'ai_fa_signing',
                                compSeason: Number(metaSnapshot?.year ?? 0),
                            }].slice(-260),
                        });
                    }

                    this.updateTeamCap(teamId);

                    txsToCommit.push({
                        type: 'SIGN',
                        seasonId: meta.currentSeasonId,
                        week: meta.currentWeek,
                        teamId,
                        details: { playerId: player.id, contract: offer.contract }
                    });

                    // Broadcast FA signing news: "[Player] signs a [X]-year, $[Y]M deal with the [Team]"
                    const signingTeam = cache.getTeam(teamId);
                    const totalDealValue = Math.round(((offer.contract.baseAnnual * offer.contract.yearsTotal) + (offer.contract.signingBonus || 0)) * 10) / 10;
                    const signingText = `${player.name} signs a ${offer.contract.yearsTotal}-year, $${totalDealValue}M deal with the ${signingTeam ? signingTeam.name : 'Unknown'}.`;
                    await NewsEngine.logNews('TRANSACTION', signingText, teamId, {
                        playerId: player.id,
                        priority: (player.ovr ?? 0) >= 80 ? 'high' : undefined,
                    });
                } else {
                    // Offer rejected due to cap change (team spent money elsewhere)
                    // Remove this offer
                    player.offers = player.offers.filter(o => o.teamId !== teamId);
                }
            }
            // else: player waits for more offers
        }

        if (txsToCommit.length > 0) {
            if (typeof Transactions.addBulk === 'function') {
                await Transactions.addBulk(txsToCommit);
            } else {
                for (const tx of txsToCommit) {
                    await Transactions.add(tx);
                }
            }
        }
    }

    /**
     * Player Decision Matrix — Bidding War edition.
     *
     * Evaluation factors:
     *  1. Total Contract Value (normalized 0-100)
     *  2. Prestige Modifier — teams with more wins last season get a boost
     *  3. Scheme Fit — 0-100
     *
     * Position-specific money sensitivity adjusts the weights.
     * "Divisive" players ignore prestige entirely and strictly chase money.
     * Threshold decreases by 5% per day after day 2 so players eventually commit.
     *
     * @param {object} player
     * @param {number} [day=1] - FA day (1-indexed). Threshold decreases after day 2.
     */
    static evaluateOffers(player, day = 1) {
        if (!player.offers || player.offers.length === 0) return { signed: false, offer: null };
        const allFreeAgents = cache.getAllPlayers().filter((p) => isFreeAgent(p) && p.pos === player.pos);
        const heat = computeMarketHeat(player.pos, allFreeAgents);
        const profile = buildContractProfile(player);
        const ask = buildDemandFromProfile(player, profile, {
            marketHeat: heat,
            morale: player.morale ?? 68,
            fit: 65,
            teamSuccess: 0.5,
        });
        const askTotal = (ask.baseAnnual * ask.yearsTotal) + (ask.signingBonus || 0);

        let bestScore = -1;
        let bestOffer = null;

        for (const offer of player.offers) {
            const team = cache.getTeam(offer.teamId);
            if (!team) continue;

            const c = offer.contract;
            const fitScore = ['QB','RB','WR','TE','OL','K'].includes(player.pos)
                ? calculateOffensiveSchemeFit(player, team?.staff?.headCoach?.offScheme || 'Balanced')
                : calculateDefensiveSchemeFit(player, team?.staff?.headCoach?.defScheme || '4-3');
            const direction = inferTeamDirection(team, Number(cache.getMeta()?.currentWeek ?? 1));
            const roleOpportunity = (this.calculateTeamNeeds(team.id)?.[player.pos] ?? 1) / 2.2;
            const legacyScore = scoreOffer(player, offer, {
                team,
                direction,
                roleOpportunity,
                fit: fitScore,
                loyaltyBoost: Number(team.id) === Number(player.teamId) ? 0.35 : 0,
            }, { profile, askTotalValue: askTotal });
            const teamContext = getTeamContextForNegotiation(player, team, null, {
                teamDirection: direction,
                needsAtPosition: this.calculateTeamNeeds(team.id)?.[player.pos] ?? 1,
                rosterAtPosition: cache.getPlayersByTeam(team.id).filter((p) => p?.pos === player?.pos),
            });
            const offerEval = evaluateContractOffer(player, {
                ...teamContext,
                schemeFitScore: fitScore,
                franchiseDirectionScore: direction === 'contender' ? 78 : direction === 'rebuilding' ? 44 : 58,
            }, offer, { profile, askTotalValue: askTotal, askAnnual: ask.baseAnnual, askYears: ask.yearsTotal });
            const score = legacyScore * 55 + (offerEval.score / 100) * 45;

            if (score > bestScore) {
                bestScore = score;
                bestOffer = offer;
            }
        }

        if (!bestOffer) return { signed: false, offer: null };
        const bestValue = (bestOffer.contract.baseAnnual * bestOffer.contract.yearsTotal) + (bestOffer.contract.signingBonus || 0);
        const waitCycles = Math.max(0, Number(day) - 1);
        const timing = buildDecisionTiming(player, heat, player.offers.length, 'free_agency', { waitCycles });
        const coolingDrop = Math.min(0.14, waitCycles * 0.07);
        const threshold = askTotal * Math.max(0.7, 0.88 - coolingDrop);
        const weakOffer = bestValue < threshold * 0.84;
        if (!weakOffer && (timing.resolveNow || day >= 2)) {
            return { signed: true, offer: bestOffer };
        }

        if (timing.atWaitCap || day >= 3) {
            // Market V2: clearly-below-demand offers no longer auto-sign when
            // patience runs out — the player keeps waiting and the offer is
            // rejected/expired by the pending-offer ledger instead.
            if (weakOffer) return { signed: false, offer: bestOffer, heldOutWeak: true };
            return { signed: true, offer: bestOffer };
        }

        return { signed: false, offer: bestOffer }; // Short review window
    }
}

export default AiLogic;
