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
import NewsEngine from './news-engine.js';

class AiLogic {

    /**
     * Update a team's cap space based on current contracts.
     * Mirrors logic in worker.js but available for AI moves.
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
        if (!team) return;

        const capTotal = team.capTotal ?? 255;
        const deadCap  = team.deadCap  ?? 0;
        cache.updateTeam(teamId, {
            capUsed: Math.round(capUsed * 100) / 100,
            capRoom: Math.round((capTotal - capUsed - deadCap) * 100) / 100,
        });
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
            const toCut = scoredPlayers.slice(0, cutCount);

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

                await Transactions.add({
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

                await Transactions.add({
                    type: 'RELEASE', seasonId: meta.currentSeasonId,
                    week: meta.currentWeek, teamId: team.id,
                    details: { playerId: p.id, deadCap: currentYearDead, aiCapCut: true },
                });
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
        const roster = cache.getPlayersByTeam(teamId);
        const needs = {};
        const STARTERS = Constants.LEAGUE_GEN_CONFIG.STARTERS_COUNT;

        // Default multiplier is 1.0
        Constants.POSITIONS.forEach(pos => {
            needs[pos] = 1.0;
        });

        // Group roster by position, sorted by OVR desc
        const playersByPos = {};
        roster.forEach(p => {
            if (!playersByPos[p.pos]) playersByPos[p.pos] = [];
            playersByPos[p.pos].push(p);
        });

        Object.keys(playersByPos).forEach(pos => {
            playersByPos[pos].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
        });

        // Evaluate each position
        Object.keys(STARTERS).forEach(pos => {
            const count = STARTERS[pos];
            const players = playersByPos[pos] || [];

            // Check top N players (starters)
            let weakStarters = 0;
            let strongStarters = 0;
            let missingStarters = Math.max(0, count - players.length);

            for (let i = 0; i < count; i++) {
                if (i < players.length) {
                    const p = players[i];
                    if ((p.ovr ?? 0) < 75) weakStarters++;
                    if ((p.ovr ?? 0) > 85) strongStarters++;
                }
            }

            // Logic for multiplier
            let multiplier = 1.0;

            if (missingStarters > 0) {
                // Desperate need
                multiplier = 2.0 + (missingStarters * 0.5);
            } else if (weakStarters > 0) {
                // High need
                multiplier = 1.5 + (weakStarters * 0.2);
            } else if (strongStarters === count) {
                // Low need (all starters imply strength)
                multiplier = 0.5;
            } else if (strongStarters > 0) {
                // Moderate need / strength mix
                multiplier = 0.8;
            }

            needs[pos] = multiplier;
        });

        return needs;
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
     * Process contract extensions for a team's core players.
     * Call this before Free Agency / Draft.
     */
    static async processExtensions(teamId) {
        const team = cache.getTeam(teamId);
        if (!team) return;

        // Re-calc cap first to be safe
        this.updateTeamCap(teamId);

        const roster = cache.getPlayersByTeam(teamId);
        const expiring = roster.filter(p => p.contract && p.contract.years === 1);

        for (const p of expiring) {
            // Extension Criteria:
            // 1. High OVR (> 80)
            // 2. Core Age (< 30) or QB (< 32)
            // 3. Not already negotiated (check negotiationStatus if exists, otherwise assume open)

            const isQB = p.pos === 'QB';
            const maxAge = isQB ? 32 : 30;

            if ((p.ovr ?? 0) >= 80 && (p.age ?? 25) <= maxAge) {
                const demand = calculateExtensionDemand(p);
                if (!demand) continue;

                // Check affordability
                // New Cap Hit = Base + (Bonus / Years)
                // We need to check if this fits into NEXT year's cap, but for simplicity
                // we check current cap room buffer. A strict check would project next year.
                // Let's assume we need at least 5M + new hit in room.

                const newCapHit = demand.baseAnnual + (demand.signingBonus / demand.yearsTotal);
                const currentCapHit = (p.contract.baseAnnual || 0) + ((p.contract.signingBonus || 0) / (p.contract.yearsTotal || 1));
                const netChange = newCapHit - currentCapHit;

                // Allow if we have room for the increase + 2M buffer
                if (team.capRoom > (netChange + 2)) {
                    // EXTEND PLAYER
                    const newContract = {
                        ...demand,
                        years: demand.years,
                        yearsTotal: demand.yearsTotal,
                        startYear: cache.getMeta().year
                    };

                    cache.updatePlayer(p.id, {
                        contract: newContract,
                        negotiationStatus: 'SIGNED'
                    });

                    // Update Cap
                    this.updateTeamCap(teamId);

                    // Add Transaction
                    await Transactions.add({
                        type: 'SIGN',
                        seasonId: cache.getMeta().currentSeasonId,
                        week: cache.getMeta().currentWeek,
                        teamId,
                        details: { playerId: p.id, contract: newContract }
                    });

                    // Log News
                    await NewsEngine.logTransaction('SIGN', {
                        teamId,
                        playerId: p.id,
                        contract: newContract
                    });

                    // Refresh team object for next iteration
                    const updatedTeam = cache.getTeam(teamId);
                    team.capRoom = updatedTeam.capRoom;
                }
            }
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

        // 1. Identify Needs
        const needs = this.calculateTeamNeeds(teamId);
        const highNeedPositions = Object.keys(needs).filter(pos => needs[pos] >= 1.2);

        if (highNeedPositions.length === 0) return;

        // 2. Get Available FAs (use map if provided, otherwise build it inefficiently)
        let getCandidates = (pos) => {
             const allPlayers = cache.getAllPlayers();
             return allPlayers
                .filter(p => (!p.teamId || p.status === 'free_agent') && p.pos === pos)
                .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
        };

        if (freeAgentsMap) {
            getCandidates = (pos) => freeAgentsMap[pos] || [];
        }

        // 3. Attempt to fill each high need position
        for (const pos of highNeedPositions) {
            // Get FAs at this pos, sorted by OVR
            const candidates = getCandidates(pos);

            if (!candidates || candidates.length === 0) continue;

            // Try to offer to the best affordable one
            for (const fa of candidates) {
                // Skip if OVR is too low
                const minOvr = needs[pos] > 2.0 ? 60 : 70;
                if ((fa.ovr ?? 0) < minOvr) break;

                // Check if we already have an active offer out to this player
                if (fa.offers && fa.offers.find(o => o.teamId === teamId)) continue;

                // Check if we have too many pending offers for this position?
                // For simplicity, allow multiple offers, but maybe limit total pending cap?
                // Ignoring complex pending cap logic for Phase 1.

                // Calculate Ask / Offer
                const demand = calculateExtensionDemand(fa);
                if (!demand) continue;

                const capHit = demand.baseAnnual + (demand.signingBonus / demand.yearsTotal);

                // Check Cap
                if (team.capRoom > (capHit + 1)) {
                    // MAKE OFFER
                    const offer = {
                        teamId,
                        teamName: team.name, // Snapshot name
                        contract: {
                            ...demand,
                            startYear: cache.getMeta().year
                        },
                        timestamp: Date.now()
                    };

                    // Push to player's offer list (in cache)
                    // We must clone the player offers array to trigger update if we were strictly reactive,
                    // but here we are mutating the object reference in cache.
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
            if (!p.teamId || p.status === 'free_agent') {
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
        const freeAgents = allPlayers.filter(p => (!p.teamId || p.status === 'free_agent') && p.offers && p.offers.length > 0);

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
                    cache.updatePlayer(player.id, {
                        teamId,
                        status: 'active',
                        contract: offer.contract,
                        offers: [] // Clear offers
                    });

                    this.updateTeamCap(teamId);

                    await Transactions.add({
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
        const allFreeAgents = cache.getAllPlayers().filter((p) => (!p.teamId || p.status === 'free_agent') && p.pos === player.pos);
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
            const score = scoreOffer(player, offer, {
                team,
                direction,
                roleOpportunity,
                fit: fitScore,
                loyaltyBoost: Number(team.id) === Number(player.teamId) ? 0.35 : 0,
            }, { profile, askTotalValue: askTotal });

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
            return { signed: true, offer: bestOffer };
        }

        return { signed: false, offer: bestOffer }; // Short review window
    }
}

export default AiLogic;
