// coach-system.js
import { Utils } from './utils.js';
import { Constants } from './constants.js';

// --- RPG Skill Trees ---
export const COACH_SKILL_TREES = {
    OC: {
        'Air Raid': {
            description: 'Heavy focus on passing volume and deep shots.',
            levels: [
                { mods: { passVolume: 1.05 } },
                { mods: { passVolume: 1.10 } },
                { mods: { passVolume: 1.15 } },
                { mods: { passVolume: 1.18, passAccuracy: 1.02 } },
                { mods: { passVolume: 1.20, passAccuracy: 1.05 } }
            ]
        },
        'Ground & Pound': {
             description: 'Run-first offense to control the clock.',
             levels: [
                { mods: { runVolume: 1.05 } },
                { mods: { runVolume: 1.10 } },
                { mods: { runVolume: 1.15 } },
                { mods: { runVolume: 1.18, passVolume: 0.95 } },
                { mods: { runVolume: 1.25, passVolume: 0.90 } }
            ]
        },
        'Balanced': {
            description: 'A mix of run and pass, focusing on efficiency.',
            levels: [
                { mods: { passAccuracy: 1.02 } },
                { mods: { passAccuracy: 1.04 } },
                { mods: { passAccuracy: 1.05 } },
                { mods: { passAccuracy: 1.06, runVolume: 1.02, passVolume: 1.02 } },
                { mods: { passAccuracy: 1.08, runVolume: 1.05, passVolume: 1.05 } }
            ]
        },
        'West Coast': {
            description: 'Short, horizontal passing game focusing on high completion percentage.',
            levels: [
                { mods: { passAccuracy: 1.05 } },
                { mods: { passAccuracy: 1.08, passVolume: 1.02 } },
                { mods: { passAccuracy: 1.12, passVolume: 1.05 } },
                { mods: { passAccuracy: 1.15, runVolume: 0.95 } },
                { mods: { passAccuracy: 1.18, passVolume: 1.10 } }
            ]
        },
        'Zone Run': {
            description: 'Agile blocking scheme emphasizing vision and cutbacks.',
            levels: [
                { mods: { runVolume: 1.02, runBlock: 1.05 } },
                { mods: { runVolume: 1.05, runBlock: 1.08 } },
                { mods: { runVolume: 1.08, runBlock: 1.12 } },
                { mods: { runVolume: 1.10, runBlock: 1.15, passBlock: 1.02 } },
                { mods: { runVolume: 1.12, runBlock: 1.20, passBlock: 1.05 } }
            ]
        }
    },
    DC: {
        'Blitz Happy': {
            description: 'Aggressive pressure packages.',
            levels: [
                { mods: { sackChance: 1.05 } },
                { mods: { sackChance: 1.10 } },
                { mods: { sackChance: 1.20 } },
                { mods: { sackChance: 1.25 } },
                { mods: { sackChance: 1.30 } }
            ]
        },
        'No Fly Zone': {
            description: 'Elite secondary coverage.',
            levels: [
                 { mods: { intChance: 1.05 } },
                 { mods: { intChance: 1.10 } },
                 { mods: { intChance: 1.20 } },
                 { mods: { intChance: 1.25 } },
                 { mods: { intChance: 1.30 } }
            ]
        },
        'Bend Dont Break': {
            description: 'Conservative defense focusing on preventing big plays.',
            levels: [
                 { mods: { intChance: 0.9, sackChance: 0.9 } }, // Placeholder for now
                 { mods: { intChance: 1.0 } },
                 { mods: { intChance: 1.0 } },
                 { mods: { intChance: 1.0 } },
                 { mods: { intChance: 1.0 } }
            ]
        },
        'Man Coverage': {
            description: 'Physical man-to-man defense requiring elite cornerbacks.',
            levels: [
                { mods: { passDefended: 1.05 } },
                { mods: { passDefended: 1.10, intChance: 1.02 } },
                { mods: { passDefended: 1.15, intChance: 1.05 } },
                { mods: { passDefended: 1.20, sackChance: 1.05 } },
                { mods: { passDefended: 1.25, intChance: 1.10 } }
            ]
        },
        'Tampa 2': {
            description: 'Zone defense that relies on linebackers dropping into coverage.',
            levels: [
                { mods: { intChance: 1.02, runStop: 1.02 } },
                { mods: { intChance: 1.05, runStop: 1.05 } },
                { mods: { intChance: 1.08, runStop: 1.08 } },
                { mods: { intChance: 1.10, runStop: 1.10, sackChance: 0.95 } },
                { mods: { intChance: 1.15, runStop: 1.15 } }
            ]
        }
    }
};

/**
 * Gets the cumulative modifiers for a staff member based on their archetype and level.
 * @param {Object} staff - The staff member object.
 * @returns {Object} A map of modifiers (e.g., { passVolume: 1.1 }).
 */
export function getStaffModifiers(staff) {
    if (!staff || (!staff.archetype && !staff.perk)) return {};

    // Legacy support: if 'perk' is set but no 'archetype', use perk as archetype
    const archetype = staff.archetype || staff.perk;
    if (!archetype) return {};

    // Determine category based on position
    let category = null;
    if (staff.position === 'OC') category = 'OC';
    if (staff.position === 'DC') category = 'DC';

    if (!category || !COACH_SKILL_TREES[category]) return {};

    const tree = COACH_SKILL_TREES[category][archetype];
    if (!tree) return {};

    // Get level (clamp to 1-5)
    const level = Math.max(1, Math.min(5, staff.level || 1));
    const tier = tree.levels[level - 1];

    return tier ? tier.mods : {};
}

/**
 * Gets combined modifiers for an entire coaching staff.
 * @param {Object} staffList - The team.staff object containing { offCoordinator, defCoordinator, etc. }
 * @returns {Object} Combined modifiers.
 */
export function getCoachingMods(staffList) {
    const mods = {};
    if (!staffList) return mods;

    const apply = (m) => {
        for (const [key, val] of Object.entries(m)) {
            // Multiplicative stacking
            if (mods[key]) {
                mods[key] = mods[key] * val;
            } else {
                mods[key] = val;
            }
        }
    };

    if (staffList.offCoordinator) {
        apply(getStaffModifiers(staffList.offCoordinator));
    }
    if (staffList.defCoordinator) {
        apply(getStaffModifiers(staffList.defCoordinator));
    }
    // Head coach? (Future expansion)
    if (staffList.headCoach) {
        apply(getStaffModifiers(staffList.headCoach));
    }

    return mods;
}

/**
 * Processes XP gain and leveling for a staff member.
 * @param {Object} staff - The staff member.
 * @param {Object} performance - { wins: number, playoffWins: number, isChampion: boolean }
 * @returns {boolean} True if leveled up.
 */
export function processStaffXp(staff, performance) {
    if (!staff) return false;

    // Initialize if missing
    if (!staff.xp) staff.xp = 0;
    if (!staff.level) staff.level = 1;
    if (staff.level >= 5) return false; // Max level

    const XP_PER_LEVEL = 1000;
    let gainedXp = 0;

    // Base XP for completing a season
    gainedXp += 100;

    // Performance XP
    if (performance) {
        gainedXp += (performance.wins || 0) * 20; // 10 wins = 200 XP
        gainedXp += (performance.playoffWins || 0) * 50;
        if (performance.isChampion) gainedXp += 200;
    }

    // Potential Development Bonus
    const devRating = staff.playerDevelopment || 50;
    gainedXp = Math.floor(gainedXp * (1 + (devRating - 50) / 100));

    staff.xp += gainedXp;

    let leveledUp = false;
    while (staff.xp >= XP_PER_LEVEL && staff.level < 5) {
        staff.xp -= XP_PER_LEVEL;
        staff.level++;
        leveledUp = true;
    }

    return leveledUp;
}

/**
 * Processes the "Coaching Carousel" - poaching successful coordinators to be Head Coaches.
 * @param {Object} league - The league object.
 */
export function processStaffPoaching(league) {
    if (!league || !league.teams) return;

    console.log("Processing Staff Poaching...");
    const vacancies = [];
    const candidates = [];

    // 1. Identify Vacancies (Teams without HC or random firings)
    league.teams.forEach(team => {
        // Chance to fire HC if performance was poor
        if (team.staff && team.staff.headCoach) {
            const wins = team.wins || (team.record ? team.record.w : 0);
            const tenure = team.staff.headCoach.tenure || 1;

            // Fire logic: < 4 wins?
            if (wins < 4 && Utils.random() < 0.3) {
                console.log(`🔥 ${team.name} has fired HC ${team.staff.headCoach.name} after a ${wins}-win season.`);
                if (league.news) league.news.push(`${team.name} has fired Head Coach ${team.staff.headCoach.name}.`);
                team.staff.headCoach = null; // Create vacancy
            }
        }

        if (!team.staff || !team.staff.headCoach) {
            vacancies.push(team);
        }
    });

    if (vacancies.length === 0) {
        console.log("No Head Coach vacancies.");
        return;
    }

    // 2. Identify Candidates (Coordinators from other teams)
    league.teams.forEach(team => {
        if (!team.staff) return;
        const wins = team.wins || (team.record ? team.record.w : 0);

        // Coordinators on winning teams are candidates
        if (wins >= 9) {
            if (team.staff.offCoordinator) candidates.push({ coach: team.staff.offCoordinator, team: team, role: 'OC', wins: wins });
            if (team.staff.defCoordinator) candidates.push({ coach: team.staff.defCoordinator, team: team, role: 'DC', wins: wins });
        }
    });

    // Sort candidates by Wins desc, then Level desc
    candidates.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.coach.level || 1) - (a.coach.level || 1);
    });

    // 3. Fill Vacancies
    vacancies.forEach(team => {
        if (candidates.length === 0) {
            // No candidates left? Hire random (handled by legacy logic usually, but we can generate one)
            const newHC = window.makeStaff ? window.makeStaff('HC') : null;
            if (newHC) {
                if (!team.staff) team.staff = {};
                team.staff.headCoach = newHC;
                console.log(`👔 ${team.name} hired ${newHC.name} (Unknown) as Head Coach.`);
                if (league.news) league.news.push(`${team.name} hires unknown candidate ${newHC.name} as Head Coach.`);
            }
            return;
        }

        // Poach the best available candidate
        const selection = candidates.shift(); // Remove from pool
        const coach = selection.coach;
        const oldTeam = selection.team;

        // Promote to HC
        const newHC = {
            ...coach,
            position: 'HC',
            perk: coach.archetype || 'Strategist', // Convert archetype to HC perk
            archetype: coach.archetype || 'Strategist',
            xp: 0, // Reset XP for new role? Or keep? Let's keep partial.
            level: 1, // Reset level for new role difficulty
            history: coach.history || []
        };

        // Remove from old team
        if (selection.role === 'OC') oldTeam.staff.offCoordinator = null;
        if (selection.role === 'DC') oldTeam.staff.defCoordinator = null;

        // Add to new team
        if (!team.staff) team.staff = {};
        team.staff.headCoach = newHC;

        console.log(`🚀 ${team.name} poaches ${selection.role} ${coach.name} from ${oldTeam.name} to be Head Coach!`);
        if (league.news) league.news.push(`${team.name} hires ${coach.name} (formerly ${oldTeam.abbr} ${selection.role}) as Head Coach!`);

        // Refill old team's coordinator spot immediately (or let next offseason step handle it)
        // For simplicity, generate a replacement for the old team now so they aren't empty
        const replacement = window.makeStaff ? window.makeStaff(selection.role) : null;
        if (replacement) {
             if (selection.role === 'OC') oldTeam.staff.offCoordinator = replacement;
             if (selection.role === 'DC') oldTeam.staff.defCoordinator = replacement;
             console.log(`  -> ${oldTeam.name} promotes internal candidate ${replacement.name} to ${selection.role}.`);
        }
    });
}

// --- LEGACY SUPPORT ---
// Keeping existing classes to prevent breakage if referenced elsewhere

function getSecureRandom() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] / (0xFFFFFFFF + 1);
  } else {
    return Utils.random();
  }
}

class Coach {
  constructor(data) {
    this.name = data.name;
    this.role = data.role;
    this.specialty = data.specialty;
    this.ratings = {
      development: data.devRating || 50,
      tactics: data.tacticsRating || 50,
      charisma: data.charismaRating || 50
    };
    this.salary = this.calculateSalary();
  }
  calculateSalary() {
    return (this.ratings.development + this.ratings.tactics) * 15000;
  }
}

class CoachMarket {
  constructor() {
    this.availableCoaches = [];
  }
  generateCandidates(num = 10) {
    const roles = ["OC", "DC", "HC"];
    const specialties = ["Quarterbacks", "Offensive Line", "Secondary", "Pass Rush"];
    for (let i = 0; i < num; i++) {
      this.availableCoaches.push(new Coach({
        name: `Coach ${Math.floor(getSecureRandom() * 1000)}`,
        role: roles[Math.floor(getSecureRandom() * roles.length)],
        specialty: specialties[Math.floor(getSecureRandom() * specialties.length)],
        devRating: Math.floor(getSecureRandom() * 60) + 30,
        tacticsRating: Math.floor(getSecureRandom() * 60) + 30
      }));
    }
  }
  checkForPoaching(teamStaff) {
    return teamStaff.filter(coach => {
      if (coach.role !== "HC" && coach.ratings.tactics > 85) {
        return getSecureRandom() > 0.85;
      }
      return false;
    });
  }
}

function calculateGamePerformance(player, teamTenure) {
    const baseRating = (player.ratings && player.ratings.overall) ? player.ratings.overall : (player.ovr || 50);
    const varianceReduction = Math.min(teamTenure * 0.05, 0.25);
    const randomFactor = (getSecureRandom() * 20) * (1 - varianceReduction);
    return baseRating + (randomFactor - 10);
}

export { Coach, CoachMarket, calculateGamePerformance };

/**
 * Initialize coaching stats for a coach
 * @param {Object} coach - Coach object
 * @returns {Object} Coach with initialized stats
 */
export function initializeCoachingStats(coach) {
  if (!coach) return null;

  if (!coach.stats) {
    coach.stats = {
      asHeadCoach: {
        seasons: 0,
        regularSeason: {
          wins: 0,
          losses: 0,
          ties: 0,
          winPercentage: 0.0
        },
        playoffs: {
          wins: 0,
          losses: 0,
          winPercentage: 0.0,
          appearances: 0
        },
        championships: {
          superBowls: 0,
          conferenceChampionships: 0
        },
        teamHistory: [],
        bestSeason: {
          year: 0,
          team: '',
          wins: 0,
          losses: 17,
          ties: 0,
          winPercentage: 0.0
        },
        awards: []
      },
      asCoordinator: {
        OC: {
          seasons: 0,
          teams: [],
          pointsPerGame: [],
          rankings: [], // Offensive rankings by season
          awards: []
        },
        DC: {
          seasons: 0,
          teams: [],
          pointsAllowedPerGame: [],
          rankings: [], // Defensive rankings by season
          awards: []
        }
      },
      careerStart: 0,
      totalSeasons: 0
    };
  }

  // Initialize career tracking
  if (!coach.careerHistory) {
    coach.careerHistory = [];
  }

  return coach;
}

/**
 * Generates a new coach.
 * @param {string} role - 'HC', 'OC', 'DC'
 * @returns {Object} Coach object
 */
export function makeCoach(role) {
    const roles = role ? [role] : ['HC', 'OC', 'DC'];
    const selectedRole = role || Utils.choice(roles);

    // Generate Name
    const name = Utils.choice(Constants.FIRST_NAMES) + ' ' + Utils.choice(Constants.LAST_NAMES);

    // Generate Rating (1-5, weighted towards average)
    // Utils.weightedChoice takes items and weights.
    // If Utils.weightedChoice isn't available, we use a simple fallback.
    // Assuming Utils.weightedChoice exists based on previous file usage, or we implement simple logic.
    let level = 3;
    if (Utils.weightedChoice) {
         level = Utils.weightedChoice([1, 2, 3, 4, 5], [10, 30, 40, 15, 5]);
    } else {
         level = Utils.rand(1, 5);
    }

    // Generate Schemes/Archetypes
    let archetype = null;
    let offScheme = null;
    let defScheme = null;

    if (selectedRole === 'HC') {
        // HCs have both schemes
        const offSchemes = Object.keys(Constants.OFFENSIVE_SCHEMES || {});
        const defSchemes = Object.keys(Constants.DEFENSIVE_SCHEMES || {});
        offScheme = Utils.choice(offSchemes) || 'Balanced';
        defScheme = Utils.choice(defSchemes) || '4-3';
        // Archetype for HC is usually a perk or focus
        archetype = Utils.choice(['Strategist', 'Motivator', 'Team Builder', 'Disciplinarian']);
    } else if (selectedRole === 'OC') {
        const schemes = Object.keys(Constants.OFFENSIVE_SCHEMES || {});
        offScheme = Utils.choice(schemes) || 'Balanced';
        archetype = offScheme; // For coordinators, scheme IS the archetype usually
    } else if (selectedRole === 'DC') {
        const schemes = Object.keys(Constants.DEFENSIVE_SCHEMES || {});
        defScheme = Utils.choice(schemes) || '4-3';
        archetype = defScheme;
    }

    // Age
    const age = Utils.rand(35, 65);

    const coach = {
        id: Utils.id(),
        name,
        position: selectedRole,
        age,
        level, // 1-5 star rating
        rating: Math.round(50 + (level * 10) + Utils.rand(-5, 5)), // 0-100 scale for UI
        archetype,
        offScheme,
        defScheme,
        years: Utils.rand(1, 5), // Contract years
        salary: Math.round((0.5 + (level * 0.5) + (selectedRole === 'HC' ? 2 : 0)) * 10) / 10, // $M
        xp: 0,
        history: []
    };

    return initializeCoachingStats(coach);
}

/**
 * Generates a full initial staff for a team.
 * @returns {Object} Staff object { headCoach, offCoordinator, defCoordinator }
 */
export function generateInitialStaff() {
    return {
        headCoach: makeCoach('HC'),
        offCoordinator: makeCoach('OC'),
        defCoordinator: makeCoach('DC')
    };
}

if (typeof window !== 'undefined') {
    window.Coach = Coach;
    window.CoachMarket = CoachMarket;
    window.calculateGamePerformance = calculateGamePerformance;
    // Expose new functions
    window.getCoachingMods = getCoachingMods;
    window.processStaffXp = processStaffXp;
    window.processStaffPoaching = processStaffPoaching;
    window.COACH_SKILL_TREES = COACH_SKILL_TREES;
    window.initializeCoachingStats = initializeCoachingStats;
    window.makeCoach = makeCoach;
    window.generateInitialStaff = generateInitialStaff;
}
