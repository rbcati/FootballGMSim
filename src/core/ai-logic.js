import { cache } from '../db/cache.js';
import { Constants } from './constants.js';
import { Transactions } from '../db/index.js';
import { calculateExtensionDemand } from './player.js';
import { calculateOffensiveSchemeFit, calculateDefensiveSchemeFit } from './scheme-core.js';
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
                // Calculate Dead Cap
                const c = p.contract;
                const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
                const deadCap = annualBonus * (c?.years || 1);

                // Update Cache (Release)
                cache.updatePlayer(p.id, { teamId: null, status: 'free_agent' });

                // Update Team Dead Cap
                if (deadCap > 0) {
                    const freshTeam = cache.getTeam(team.id);
                    const newDead = (freshTeam.deadCap ?? 0) + deadCap;
                    cache.updateTeam(team.id, { deadCap: newDead });
                }

                // Log Transaction
                await Transactions.add({
                    type: 'RELEASE',
                    seasonId: meta.currentSeasonId,
                    week: meta.currentWeek,
                    teamId: team.id,
                    details: { playerId: p.id, deadCap }
                });
            }

            // Re-calc active cap (roster changed)
            this.updateTeamCap(team.id);
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
     * Calculate and rank positional needs for a team.
     * Returns sorted array of need objects { pos, rank, score, starterOvr }.
     */
    static getRankedTeamNeeds(teamId) {
        const needsMap = this.calculateTeamNeeds(teamId);
        const roster = cache.getPlayersByTeam(teamId);
        const STARTERS = Constants.LEAGUE_GEN_CONFIG.STARTERS_COUNT;

        // Find best player at each position to display as "current starter"
        const bestAtPos = {};
        roster.forEach(p => {
            if (!bestAtPos[p.pos] || (p.ovr > bestAtPos[p.pos].ovr)) {
                bestAtPos[p.pos] = p;
            }
        });

        const rankedNeeds = Object.keys(STARTERS).map(pos => {
            const multiplier = needsMap[pos] || 1.0;
            // Base need score on multiplier (1.0 = normal, >1.5 = high)
            // Score formula: gap from baseline 80 ovr

            const starter = bestAtPos[pos];
            const starterOvr = starter ? starter.ovr : 0;
            const targetOvr = 80;

            return {
                pos,
                score: multiplier,
                starterOvr,
                displayScore: Math.max(0, targetOvr - starterOvr) // Simple "points under 80" metric
            };
        });

        // Sort by Score descending (highest need first)
        rankedNeeds.sort((a, b) => b.score - a.score);

        // Add Rank index
        return rankedNeeds.map((item, index) => ({
            ...item,
            rank: index + 1
        }));
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
            const decision = this.evaluateOffers(player);

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

                    if ((player.ovr ?? 0) > 75) {
                        await NewsEngine.logTransaction('SIGN', {
                            teamId,
                            playerId: player.id,
                            contract: offer.contract
                        });
                    }
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
     * Player Decision Matrix.
     * Scores offers based on Money (70%), Winning (20%), Scheme (10%).
     * Returns { signed: boolean, offer: Object | null }
     */

    static evaluateOffers(player) {
        if (!player.offers || player.offers.length === 0) return { signed: false, offer: null };

        let bestScore = -1;
        let bestOffer = null;

        // Calculate baseline demand value for comparison
        // Simple Total Value for now: (Base * Years) + Bonus
        // Guaranteed money weight mentioned in prompt, but let's stick to Total Value for simplicity first
        // or: Annual * 0.5 + Guaranteed * 0.5?

        for (const offer of player.offers) {
            const team = cache.getTeam(offer.teamId);
            if (!team) continue;

            // 1. Financial Value (Weight: 70%)
            // Score normalized to ~0-100 range roughly
            const c = offer.contract;
            const totalValue = (c.baseAnnual * c.yearsTotal) + c.signingBonus;
            const guaranteed = (totalValue * (c.guaranteedPct || 0.5)); // Approx

            // Heuristic: 1M = 1 point roughly?
            // A 5yr/00M deal = 100 points.
            // A 1yr/M deal = 5 points.
            const moneyScore = totalValue;

            // 2. Team Contender Status (Weight: 20%)
            // Based on OVR (0-100)
            const teamOvr = team.ovr || 75;
            const winScore = teamOvr; // 0-100

            // 3. Scheme Fit (Weight: 10%)
            let fitScore = 50;
            if (team.staff && team.staff.headCoach) {
                const hc = team.staff.headCoach;
                const isOff = ['QB','RB','WR','TE','OL','K'].includes(player.pos);
                if (isOff) fitScore = calculateOffensiveSchemeFit(player, hc.offScheme || 'Balanced');
                else fitScore = calculateDefensiveSchemeFit(player, hc.defScheme || '4-3');
            }

            // Weighted Sum
            // We need to normalize money score to be comparable to 0-100 ratings
            // Max contract roughly 50M?
            // Let's just use raw values and weights that make sense.
            // Money is dominant.

            // Weight 70% -> Money factor
            // Weight 20% -> Win factor
            // Weight 10% -> Fit factor

            // If Money is ~50 (50M deal), Win is ~80, Fit is ~80.
            // 50 * 3.0 = 150
            // 80 * 0.5 = 40
            // 80 * 0.2 = 16

            const score = (moneyScore * 3.0) + (winScore * 0.5) + (fitScore * 0.2);

            if (score > bestScore) {
                bestScore = score;
                bestOffer = offer;
            }
        }

        // Decision to sign?
        // If we are late in FA (Day 3+), sign the best offer.
        // If we are early (Day 1-2), only sign if it blows us away (e.g. > expected market value).
        // For Phase 16, let's keep it simple:
        // If bestOffer exists and beats a "patience threshold", sign.
        // Or simplified: Always sign the best offer available today?
        // Prompt says: "If an offer exceeds their internal threshold, they sign. If not, they wait for the next day."

        // Calculate internal threshold based on "Ask"
        // Ask ~ OVR * PosMult
        const ask = calculateExtensionDemand(player);
        const askTotalValue = (ask.baseAnnual * ask.yearsTotal) + ask.signingBonus;
        const askScore = (askTotalValue * 3.0); // Baseline money score

        // Threshold lowers as days pass?
        // We don't pass 'day' here easily without context, but we can assume simple logic:
        // Threshold = 95% of Ask Score + Baseline expectation for Team/Fit
        // Baseline extras: Average Team (75 OVR) * 0.5 + Average Fit (50) * 0.2 = 37.5 + 10 = 47.5
        const baselineExtras = 47.5;
        const threshold = (askScore + baselineExtras) * 0.95;

        // Also, if it's the User's offer, we might want to be stricter or looser?
        // Let's just use the score.

        if (bestScore >= threshold) {
            return { signed: true, offer: bestOffer };
        }

        // If 'day' context was available we could force sign on Day 5.
        // For now, return false (wait).
        // But we need a way to ensure they eventually sign.
        // Let's pass 'day' or handle forced signing in the caller if day == max.
        // We'll modify processFreeAgencyDay to handle forced signing.

        return { signed: false, offer: bestOffer }; // Wait
    }
}

export default AiLogic;
