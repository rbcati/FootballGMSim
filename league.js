// league.js - Core League Generation Logic
'use strict';
import { initializeCoachingStats } from './coaching.js';
import { makePlayer as makePlayerImport } from './player.js';

/**
 * Generates draft picks for a team for the next few years.
 * @param {string|number} teamId - The team's ID.
 * @param {number} startYear - The current league year.
 * @param {number} years - Number of years to generate picks for.
 * @param {Object} Utils - Utils dependency.
 * @returns {Array} Array of draft pick objects.
 */
const generateDraftPicks = (teamId, startYear, years = 3, Utils) => {
    const picks = [];
    // Fallback ID generator if Utils is missing or doesn't have id()
    const genId = Utils?.id || (() => Math.random().toString(36).slice(2, 10));

    for (let y = 0; y < years; y++) {
        for (let r = 1; r <= 7; r++) {
            picks.push({
                id: genId(),
                round: r,
                year: startYear + y,
                originalOwner: teamId,
                isCompensatory: false
            });
        }
    }
    return picks;
};

/**
 * Initializes the roster for a team based on depth needs.
 * @param {Object} team - The team object.
 * @param {Object} Constants - Constants dependency.
 * @param {Object} Utils - Utils dependency.
 * @param {Function} makePlayer - Factory function to create a player.
 * @returns {Array} Array of player objects.
 */
const initializeRoster = (team, Constants, Utils, makePlayer) => {
    if (!Constants?.DEPTH_NEEDS) return [];

    const roster = [];
    const positions = Object.keys(Constants.DEPTH_NEEDS);

    // Track estimated cap usage to avoid going over
    // We can't perfectly predict proration here without cap.js logic,
    // but we can track base salaries.
    let estimatedCapUsed = 0;
    const capLimit = team.capTotal || 220; // Default buffer
    const safeCapLimit = capLimit * 0.95; // Leave 5% buffer

    // Calculate total players needed to reserve budget for depth
    const totalPlayersNeeded = positions.reduce((sum, pos) => sum + Constants.DEPTH_NEEDS[pos], 0);
    let playersCreated = 0;

    positions.forEach(pos => {
        const count = Constants.DEPTH_NEEDS[pos];
        for (let j = 0; j < count; j++) {
            // Logic for rating ranges
            let ovrRange = Constants.POS_RATING_RANGES?.[pos] || [60, 85];

            // First player at position should be better (starter material)
            if (j === 0) {
                ovrRange = [
                    Math.max(70, ovrRange[0]),
                    Math.min(99, ovrRange[1] + 5)
                ];
            }

            const ovr = Utils.rand(ovrRange[0], ovrRange[1]);
            const age = Utils.rand(21, 35);

            const player = makePlayer(pos, age, ovr);
            if (player) {
                player.teamId = team.id;

                // --- Cap Safety Check ---
                const playersRemaining = totalPlayersNeeded - playersCreated - 1;
                // Reserve ~0.8M per remaining player
                const reservedBudget = playersRemaining * 0.8;
                const availableBudget = safeCapLimit - estimatedCapUsed - reservedBudget;

                // If player salary exceeds available budget, clamp it
                if (player.baseAnnual > availableBudget) {
                    // But don't go below minimum (0.75M) unless absolutely necessary
                    // Allow at least 0.8M or availableBudget, whichever is higher (but handled by min() logic)
                    // Actually, if availableBudget is negative, we are in trouble.
                    // Just force to min salary (0.75-1.0)

                    const newSalary = Math.max(0.75, Math.min(player.baseAnnual, availableBudget));

                    // If the reduction is significant (>20%), treat it as a restructure/force
                    if (newSalary < player.baseAnnual * 0.8) {
                        player.baseAnnual = newSalary;
                        player.signingBonus = 0; // Remove bonus to save cap
                    }
                }

                estimatedCapUsed += (player.baseAnnual || 0);
                roster.push(player);
                playersCreated++;
            }
        }
    });
    return roster;
};

/**
 * Main function to generate the league.
 * @param {Array} teams - Array of team objects.
 * @param {Object} dependencies - Optional dependencies (Constants, Utils, etc.).
 * @returns {Object} The generated league object.
 */
function makeLeague(teams, dependencies = {}) {
    // Destructure dependencies with fallbacks to window
    const {
        Constants = (typeof window !== 'undefined' ? window.Constants : null),
        Utils = (typeof window !== 'undefined' ? window.Utils : null),
        makePlayer = makePlayerImport || (typeof window !== 'undefined' ? window.makePlayer : null),
        makeSchedule = (typeof window !== 'undefined' ? window.makeSchedule : null),
        recalcCap = (typeof window !== 'undefined' ? window.recalcCap : null),
        generateInitialStaff = (typeof window !== 'undefined' ? window.generateInitialStaff : null)
    } = dependencies;

    const missingDependencies = [];
    if (!Constants) missingDependencies.push('Constants');
    if (!Utils) missingDependencies.push('Utils');
    if (!makePlayer) missingDependencies.push('makePlayer');
    // makeSchedule, recalcCap, generateInitialStaff are optional/handled gracefully

    if (missingDependencies.length > 0) {
        console.error('Critical dependencies missing for league creation:', missingDependencies);
        return null;
    }

    const leagueYear = (typeof window !== 'undefined' && window.state?.year) || 2025;

    const league = {
        teams: [],
        year: leagueYear,
        season: 1,
        week: 1,
        schedule: null,
        resultsByWeek: [],
        transactions: []
    };

    // Main Orchestration Loop
    league.teams = teams.map((teamData, index) => {
        const team = {
            ...teamData,
            id: index,
            // Explicitly initialize standings properties
            wins: 0,
            losses: 0,
            ties: 0,
            ptsFor: 0,
            ptsAgainst: 0,
            // Legacy record object for compatibility
            record: { w: 0, l: 0, t: 0, pf: 0, pa: 0 },
            stats: { season: {}, game: {} },
            history: [],
            capTotal: Constants.SALARY_CAP?.BASE || 220,
            deadCap: 0,
            capRollover: 0,
            capUsed: 0,
            capRoom: Constants.SALARY_CAP?.BASE || 220
        };

        // Delegate tasks to specialized functions
        team.roster = initializeRoster(team, Constants, Utils, makePlayer);
        team.picks = generateDraftPicks(team.id, leagueYear, 3, Utils);

        if (generateInitialStaff) {
            team.staff = generateInitialStaff();
        } else {
             // Fallback staff generation
             team.staff = {
                headCoach: { name: 'Interim HC', ovr: 70 },
                offCoordinator: { name: 'Interim OC', ovr: 70 },
                defCoordinator: { name: 'Interim DC', ovr: 70 },
                scout: { name: 'Head Scout', ovr: 70 }
            };
        }

        // Initialize Coaching Stats
        if (initializeCoachingStats) {
             if (team.staff?.headCoach) initializeCoachingStats(team.staff.headCoach);
        }

        // Set Strategies
        team.strategies = {
            offense: Utils.choice(['Pass Heavy', 'Run Heavy', 'Balanced', 'West Coast', 'Vertical']),
            defense: Utils.choice(['4-3', '3-4', 'Nickel', 'Aggressive', 'Conservative'])
        };

        // Initial Cap Check
        if (recalcCap) {
            recalcCap(league, team);
            
            // Log warning if still over cap (sanity check)
            if (team.capUsed > team.capTotal) {
                console.warn(`⚠️ Team ${team.name || team.abbr} created over cap: $${team.capUsed.toFixed(1)}M / $${team.capTotal.toFixed(1)}M`);
            }
        } else {
             // Fallback simple calc
             team.capUsed = team.roster.reduce((sum, p) => sum + (p.baseAnnual || 0), 0);
             team.capRoom = team.capTotal - team.capUsed;
        }

        return team;
    });

    // Final Setup
    if (makeSchedule) {
        league.schedule = makeSchedule(league.teams);
    } else {
        console.warn('⚠️ makeSchedule not provided. Schedule is empty.');
    }

    // Update state only once at the end
    if (typeof window !== 'undefined') {
        if (!window.state) window.state = {};
        window.state.league = league;
        window.state.year = league.year;
        window.state.season = league.season;
        window.state.week = league.week;

        // Update ratings if function exists
        if (window.updateAllTeamRatings) {
            window.updateAllTeamRatings(league);
        } else {
            // Simple rating calculation fallback
            league.teams.forEach(t => {
                if (t.roster.length) {
                    const totalOvr = t.roster.reduce((acc, p) => acc + p.ovr, 0);
                    t.ovr = Math.round(totalOvr / t.roster.length);
                } else {
                    t.ovr = 75;
                }
            });
        }
    }

    console.log('✨ League creation complete and modularized!');
    return league;
}

// Make available globally and export
if (typeof window !== 'undefined') {
    window.makeLeague = makeLeague;
}

export { makeLeague };
