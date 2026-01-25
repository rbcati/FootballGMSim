// coach-system.js
import { Utils } from './utils.js';

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

// --- LEGACY SUPPORT ---
// Keeping existing classes to prevent breakage if referenced elsewhere

function getSecureRandom() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] / (0xFFFFFFFF + 1);
  } else {
    return Math.random();
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

if (typeof window !== 'undefined') {
    window.Coach = Coach;
    window.CoachMarket = CoachMarket;
    window.calculateGamePerformance = calculateGamePerformance;
    // Expose new functions
    window.getCoachingMods = getCoachingMods;
    window.processStaffXp = processStaffXp;
    window.COACH_SKILL_TREES = COACH_SKILL_TREES;
}
