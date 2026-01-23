// league.js - Core League Generation Logic
'use strict';
import { initializeCoachingStats } from './coaching.js';

window.makeLeague = function(
    teams,
    {
        Constants = window.Constants,
        Utils = window.Utils,
        makePlayer = window.makePlayer,
        makeSchedule = window.makeSchedule
    } = {}
) {
    const missingDependencies = [];
    if (!Constants) missingDependencies.push('Constants');
    if (!Utils) missingDependencies.push('Utils');
    if (!makePlayer) missingDependencies.push('makePlayer');
    if (!makeSchedule) missingDependencies.push('makeSchedule');

    if (missingDependencies.length > 0) {
        console.error('Critical dependencies missing for league creation:', missingDependencies);
        return null;
    }

    const currentYear =
        typeof window.state === 'object' && window.state?.year ? window.state.year : 2025;
    const C = Constants;
    const U = Utils;

    const L = {
        teams: [],
        year: currentYear,
        season: 1,
        week: 1,
        schedule: null,
        resultsByWeek: [],
        transactions: [] // Track trades/signings
    };

    // 1. Initialize Teams, Roster, Picks, and Staff
    L.teams = teams.map((t, i) => {
        const team = { ...t };
        team.id = i;

        // Basic Stats
        team.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
        team.history = [];

        // --- A. Generate Roster ---
        team.roster = [];

        if (C.DEPTH_NEEDS) {
            Object.keys(C.DEPTH_NEEDS).forEach(pos => {
                const count = C.DEPTH_NEEDS[pos];
                for (let j = 0; j < count; j++) {
                    let ovrRange = C.POS_RATING_RANGES?.[pos] || [60, 85];

                    if (j === 0) {
                        ovrRange = [
                            Math.max(70, ovrRange[0]),
                            Math.min(99, ovrRange[1] + 5)
                        ];
                    }

                    const ovr = U.rand(ovrRange[0], ovrRange[1]);
                    const age = U.rand(21, 35);

                    if (makePlayer) {
                        const player = makePlayer(pos, age, ovr);
                        if (player) {
                            player.teamId = team.id;
                            team.roster.push(player);
                        }
                    }
                }
            });
        }

        // --- B. Calculate Salary Cap ---
        team.capTotal = C.SALARY_CAP?.BASE || 220; // Use constant from SALARY_CAP.BASE
        team.deadCap = 0;
        team.deadCapBook = {}; // Initialize dead cap book
        team.capRollover = 0; // Initialize rollover

        // FIXED: Use proper cap calculation function
        // This must be called AFTER all players are created
        // We'll recalculate after roster is complete
        if (window.recalcCap) {
          // Use the proper recalcCap function which handles prorated bonuses correctly
          window.recalcCap(L, team);
          
          // If team is way over cap, log warning and adjust
          if (team.capUsed > team.capTotal * 1.2) {
            console.warn(`⚠️ Team ${team.name || team.abbr} is over cap: $${team.capUsed.toFixed(1)}M / $${team.capTotal.toFixed(1)}M`);
            console.warn(`   Roster size: ${team.roster.length} players`);
            console.warn(`   Average cap hit: $${(team.capUsed / team.roster.length).toFixed(2)}M per player`);
          }
        } else {
          // Fallback calculation
          team.capUsed = team.roster.reduce((total, p) => {
            const hit = window.capHitFor ? window.capHitFor(p, 0) : (p.baseAnnual || 0);
            return total + hit;
          }, 0);
          team.capRoom = team.capTotal - team.capUsed;
        }

        // --- C. Generate Draft Picks (Next 3 Years) ---
        team.picks = [];
        const yearsToGen = 3;
        for (let y = 0; y < yearsToGen; y++) {
            for (let r = 1; r <= 7; r++) {
                team.picks.push({
                    id: U.id(),
                    round: r,
                    year: currentYear + y,
                    originalOwner: team.id,
                    isCompensatory: false
                });
            }
        }

        // --- D. Generate Coaching Staff ---
        if (window.generateInitialStaff) {
            team.staff = window.generateInitialStaff();
        } else {
            team.staff = {
                headCoach: { name: 'Interim HC', ovr: 70 },
                offCoordinator: { name: 'Interim OC', ovr: 70 },
                defCoordinator: { name: 'Interim DC', ovr: 70 },
                scout: { name: 'Head Scout', ovr: 70 }
            };
        }

        // --- E. Set Team Strategies (Playbooks) ---
        team.strategies = team.strategies || {
            offense: U.choice(['Pass Heavy', 'Run Heavy', 'Balanced', 'West Coast', 'Vertical']),
            defense: U.choice(['4-3', '3-4', 'Nickel', 'Aggressive', 'Conservative'])
        };

        return team;
    });

    console.log('✅ Teams created. Generating schedule...');
    
    // Recalculate cap for all teams after rosters are complete
    // This ensures prorated bonuses are calculated correctly
    if (window.recalcAllTeamCaps) {
        window.recalcAllTeamCaps(L);
    } else if (window.recalcCap) {
        L.teams.forEach(team => {
            try {
                window.recalcCap(L, team);
            } catch (error) {
                console.error(`Error recalculating cap for ${team.name || team.abbr}:`, error);
            }
        });
    }
    
    
    // Log cap summary for debugging
    L.teams.forEach((team, idx) => {
        if (idx < 3) { // Log first 3 teams as sample
            const avgCapHit = team.roster?.length > 0 ? (team.capUsed / team.roster.length) : 0;
            console.log(`📊 ${team.name || team.abbr}: $${team.capUsed?.toFixed(1) || '0.0'}M / $${team.capTotal?.toFixed(1) || '0.0'}M (${team.roster?.length || 0} players, avg $${avgCapHit.toFixed(2)}M/player)`);
        }
    });

    // 2. Generate Schedule
    if (makeSchedule) {
        L.schedule = makeSchedule(L.teams);
    } else {
        console.warn('⚠️ makeSchedule not found. Schedule is empty.');
    }

    // 3. Initialize Derived Stats (Coaching & Team Ratings)
    if (initializeCoachingStats) {
        L.teams.forEach(t => {
            if (t.staff?.headCoach) initializeCoachingStats(t.staff.headCoach);
        });
    }

    if (typeof window.state === 'object' && window.state !== null) {
        window.state.league = L;
        window.state.year = L.year;
        window.state.season = L.season;
        window.state.week = L.week;
    } else {
        window.state = {
            league: L,
            year: L.year,
            season: L.season,
            week: L.week
        };
    }

    if (window.updateAllTeamRatings) {
        window.updateAllTeamRatings(L);
    } else {
        L.teams.forEach(t => {
            if (t.roster.length) {
                const totalOvr = t.roster.reduce((acc, p) => acc + p.ovr, 0);
                t.ovr = Math.round(totalOvr / t.roster.length);
            } else {
                t.ovr = 75;
            }
        });
    }

    console.log('✨ League creation complete!');
    return L;
};
