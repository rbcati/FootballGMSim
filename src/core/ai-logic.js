import { cache } from '../db/cache.js';
import { Constants } from './constants.js';
import { Transactions } from '../db/index.js';
import { calculateExtensionDemand } from './player.js';
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
        cache.updateTeam(teamId, {
            capUsed: Math.round(capUsed * 100) / 100,
            capRoom: Math.round((capTotal - capUsed) * 100) / 100,
        });
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
     */
    static async executeAIFreeAgency(teamId) {
        const team = cache.getTeam(teamId);
        if (!team) return;

        // 1. Identify Needs
        const needs = this.calculateTeamNeeds(teamId);
        const highNeedPositions = Object.keys(needs).filter(pos => needs[pos] >= 1.5);

        if (highNeedPositions.length === 0) return;

        // 2. Get Available FAs
        const allPlayers = cache.getAllPlayers();
        const freeAgents = allPlayers.filter(p => !p.teamId || p.status === 'free_agent');

        // 3. Attempt to fill each high need position
        for (const pos of highNeedPositions) {
            // Get FAs at this pos, sorted by OVR
            const candidates = freeAgents
                .filter(p => p.pos === pos)
                .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));

            if (candidates.length === 0) continue;

            // Try to sign the best affordable one
            for (const fa of candidates) {
                // Skip if OVR is too low to be worth it (unless desperate)
                // If need is > 2.0 (empty), take anyone > 60.
                // If need is 1.5 (weak), take > 75.
                const minOvr = needs[pos] > 2.0 ? 60 : 75;
                if ((fa.ovr ?? 0) < minOvr) break; // Sorted desc, so subsequent ones are worse

                // Calculate Ask (reuse extension demand logic or generate new contract)
                // Free agents usually demand market rate.
                const demand = calculateExtensionDemand(fa) || {
                    baseAnnual: 1, years: 1, signingBonus: 0, yearsTotal: 1
                };

                const capHit = demand.baseAnnual + (demand.signingBonus / demand.yearsTotal);

                // Check Cap
                if (team.capRoom > (capHit + 1)) {
                    // SIGN
                    const contract = {
                        ...demand,
                        startYear: cache.getMeta().year
                    };

                    cache.updatePlayer(fa.id, {
                        teamId,
                        status: 'active',
                        contract
                    });

                    this.updateTeamCap(teamId);

                    // Add Transaction
                    await Transactions.add({
                        type: 'SIGN',
                        seasonId: cache.getMeta().currentSeasonId,
                        week: cache.getMeta().currentWeek,
                        teamId,
                        details: { playerId: fa.id, contract }
                    });

                    // Log if significant
                    if ((fa.ovr ?? 0) > 80) {
                        await NewsEngine.logTransaction('SIGN', {
                            teamId,
                            playerId: fa.id,
                            contract
                        });
                    }

                    // Remove from FA pool for this loop
                    const index = freeAgents.indexOf(fa);
                    if (index > -1) freeAgents.splice(index, 1);

                    break; // Position filled (for now)
                }
            }
        }
    }
}

export default AiLogic;
