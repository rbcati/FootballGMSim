
class Coach {
  constructor(data) {
    this.name = data.name;
    this.role = data.role; // "HC", "OC", "DC"
    this.specialty = data.specialty; // e.g., "Quarterbacks", "Defense", "Development"

    // Ratings 0-100
    this.ratings = {
      development: data.devRating || 50, // Impact on XP gains
      tactics: data.tacticsRating || 50,     // Impact on game-day performance
      charisma: data.charismaRating || 50    // Impact on player happiness/chemistry
    };

    this.salary = this.calculateSalary();
  }

  calculateSalary() {
    // Top-tier coaches should be a significant cap hit
    return (this.ratings.development + this.ratings.tactics) * 15000;
  }
}

class CoachMarket {
  constructor() {
    this.availableCoaches = [];
  }

  // Generates a new pool of candidates each off-season
  generateCandidates(num = 10) {
    const roles = ["OC", "DC", "HC"];
    const specialties = ["Quarterbacks", "Offensive Line", "Secondary", "Pass Rush"];

    for (let i = 0; i < num; i++) {
      this.availableCoaches.push(new Coach({
        name: `Coach ${Math.floor(Math.random() * 1000)}`,
        role: roles[Math.floor(Math.random() * roles.length)],
        specialty: specialties[Math.floor(Math.random() * specialties.length)],
        devRating: Math.floor(Math.random() * 60) + 30, // 30-90 range
        tacticsRating: Math.floor(Math.random() * 60) + 30
      }));
    }
  }

  // Logic for other teams "stealing" your staff
  checkForPoaching(teamStaff) {
    return teamStaff.filter(coach => {
      // High-performing coordinators have a 15% chance to leave for an HC job
      if (coach.role !== "HC" && coach.ratings.tactics > 85) {
        return Math.random() > 0.85;
      }
      return false;
    });
  }
}

// Example modification for the in-game performance engine
function calculateGamePerformance(player, teamTenure) {
    // Handle cases where player.ratings.overall might not exist (e.g. factory objects vs class instances)
    const baseRating = (player.ratings && player.ratings.overall) ? player.ratings.overall : (player.ovr || 50);

    // Continuity reduces the "Randomness" of a bad game
    const varianceReduction = Math.min(teamTenure * 0.05, 0.25);
    const randomFactor = (Math.random() * 20) * (1 - varianceReduction);

    return baseRating + (randomFactor - 10); // Performance fluctuates less as tenure grows
}

export { Coach, CoachMarket, calculateGamePerformance };

// Attach to window for global access
if (typeof window !== 'undefined') {
    window.Coach = Coach;
    window.CoachMarket = CoachMarket;
    window.calculateGamePerformance = calculateGamePerformance;
}
