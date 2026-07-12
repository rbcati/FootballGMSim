import { cache } from '../db/cache.js';
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
import { executeAIOffseasonExtensions } from './retention/aiRetentionLogic.js';
import { calculateTeamDepthDeficiencies, getNeedLevelForPlayer, POSITION_NEED_LEVEL } from './trades/tradePositionalNeeds.js';
import { buildFranchiseTagContract, buildRFATenderContract, TENDER_CONFIG } from './contracts/tenderLogic.js';

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
    static async executeAICutdowns() {
        const meta = cache.getMeta();
        const userTeamId = meta.userTeamId;
        const allTeams = cache.getAllTeams();
        const limit = Constants.ROSTER_LIMITS.REGULAR_SEASON;

        for (const team of allTeams) {
            // Skip user team (they must cut manually)
            if (team.id === userTeamId) continue;

            const roster = cache.getPlayersByTeam(team.id);
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
     * Execute AI Cap Management for the start of the regular season.
     *
     * If a team is over the $301.2M hard cap after cutdowns, the AI will:
     *   1. First try to restructure the highest-paid star players (OVR ≥ 80)
     *      by converting 50% of their base salary to prorated bonus.
     *   2. If still over cap, cut the most "cap-inefficient" veterans:
     *      players with the worst (cap hit / OVR) ratio, skipping essential
     *      starters (OVR ≥ 85) if possible.
     *
     * This runs for all AI teams; the user's team must manage its own cap.
     */
    static async executeAICapManagement() {
        const txsToCommit = [];
        const meta        = cache.getMeta();
        const userTeamId  = meta.userTeamId;
        let targetCap = Constants.SALARY_CAP.HARD_CAP;
        // On higher difficulties, AI targets a lower cap utilization to preserve space for free agency
        if (meta.difficulty === 'Hard') targetCap = Constants.SALARY_CAP.HARD_CAP - 10; // Target $10M buffer
        if (meta.difficulty === 'Legendary') targetCap = Constants.SALARY_CAP.HARD_CAP - 25; // Target $25M buffer
        const hardCap = targetCap;
        const allTeams    = cache.getAllTeams();

        for (const team of allTeams) {
            if (team.id === userTeamId) continue;

            this.updateTeamCap(team.id);
            let freshTeam = cache.getTeam(team.id);
            if ((freshTeam.capUsed ?? 0) <= hardCap) continue;

            const roster = cache.getPlayersByTeam(team.id);

            // ── Step 1: Restructure star players (OVR ≥ 80, ≥ 2 yrs remaining) ──
            const restructureCandidates = roster
                .filter(p => (p.ovr ?? 0) >= 80 && (p.contract?.years ?? 1) >= 2)
                .sort((a, b) => {
                    const hitA = (a.contract?.baseAnnual ?? 0) + ((a.contract?.signingBonus ?? 0) / (a.contract?.yearsTotal || 1));
                    const hitB = (b.contract?.baseAnnual ?? 0) + ((b.contract?.signingBonus ?? 0) / (b.contract?.yearsTotal || 1));
                    return hitB - hitA; // highest cap hit first
                });

            for (const p of restructureCandidates) {
                freshTeam = cache.getTeam(team.id);
                if ((freshTeam.capUsed ?? 0) <= hardCap) break;

                const c = p.contract;
                if (!c) continue;
                const yearsRemaining  = Math.max(c.years ?? 1, 2);
                const base            = c.baseAnnual ?? 0;
                const convertAmount   = Math.round(base * Constants.SALARY_CAP.RESTRUCTURE_MAX_CONVERT_PCT * 100) / 100;
                if (convertAmount <= 0) continue;

                const newBase         = Math.round((base - convertAmount) * 100) / 100;
                const addedBonusTotal = convertAmount * yearsRemaining;
                const newSigningBonus = Math.round(((c.signingBonus ?? 0) + addedBonusTotal) * 100) / 100;

                cache.updatePlayer(p.id, {
                    contract: { ...c, baseAnnual: newBase, signingBonus: newSigningBonus },
                });
                this.updateTeamCap(team.id);

                txsToCommit.push({
                    type: 'RESTRUCTURE', seasonId: meta.currentSeasonId,
                    week: meta.currentWeek, teamId: team.id,
                    details: { playerId: p.id, convertAmount, aiInitiated: true },
                });
            }

            // ── Step 2: Cut cap-inefficient veterans if still over cap ──────────
            freshTeam = cache.getTeam(team.id);
            if ((freshTeam.capUsed ?? 0) <= hardCap) continue;

            // Score by inefficiency = cap hit / OVR  (higher = more inefficient)
            const cutCandidates = roster
                .filter(p => {
                    // Don't cut essential starters or rookies
                    const ovr = p.ovr ?? 0;
                    const age = p.age ?? 28;
                    return ovr < 85 && age >= 27;
                })
                .map(p => {
                    const base  = p.contract?.baseAnnual  ?? p.baseAnnual  ?? 0;
                    const bonus = p.contract?.signingBonus ?? p.signingBonus ?? 0;
                    const yrs   = p.contract?.yearsTotal   ?? p.yearsTotal   ?? 1;
                    const capHit = base + bonus / (yrs || 1);
                    const ovr   = p.ovr ?? 50;
                    return { ...p, _capHit: capHit, _inefficiency: ovr > 0 ? capHit / ovr : capHit };
                })
                .sort((a, b) => b._inefficiency - a._inefficiency); // most inefficient first

            for (const p of cutCandidates) {
                freshTeam = cache.getTeam(team.id);
                if ((freshTeam.capUsed ?? 0) <= hardCap) break;

                // Calculate dead cap (Preseason is Post-June 1)
                const c           = p.contract;
                const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
                const yearsRemaining = c?.years || 1;
                const currentYearDead = annualBonus;
                const futureYearsDead = annualBonus * Math.max(0, yearsRemaining - 1);

                cache.updatePlayer(p.id, { teamId: null, status: 'free_agent' });
                const t = cache.getTeam(team.id);
                if (currentYearDead > 0) {
                    cache.updateTeam(team.id, { deadCap: (t.deadCap ?? 0) + currentYearDead });
                }
                if (futureYearsDead > 0) {
                    cache.updateTeam(team.id, { deadMoneyNextYear: (t.deadMoneyNextYear ?? 0) + futureYearsDead });
                }
                this.updateTeamCap(team.id);

                txsToCommit.push({
                    type: 'RELEASE', seasonId: meta.currentSeasonId,
                    week: meta.currentWeek, teamId: team.id,
                    details: { playerId: p.id, deadCap: currentYearDead, aiCapCut: true },
                });
            }
        }

        if (txsToCommit.length > 0) {
            await Promise.all(txsToCommit.map(tx => Transactions.add(tx)));
        }
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
        const allTeams = cache.getAllTeams();
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
        const allPlayers = cache.getAllPlayers();
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
        const allPlayers = cache.getAllPlayers();
        const freeAgentsMap = {};
        for (const p of allPlayers) {
            if (isFreeAgent(p)) {
                if (!freeAgentsMap[p.pos]) freeAgentsMap[p.pos] = [];
                freeAgentsMap[p.pos].push(p);
            }
        }
        for (const pos in freeAgentsMap) {
            freeAgentsMap[pos].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
        }

        // 1. AI Teams Make Offers
        const allTeams = cache.getAllTeams();
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
