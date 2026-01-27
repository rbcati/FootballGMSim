// relocation.js - Franchise Relocation Logic
'use strict';

/**
 * Franchise Relocation System
 * Defines available markets, costs, and logic for moving a team.
 */

const AVAILABLE_MARKETS = [
    { id: 'london', city: 'London', state: 'UK', population: 8900000, marketSize: 'Huge', interest: 'High', loyalty: 'Medium', cost: 550000000 },
    { id: 'mexico', city: 'Mexico City', state: 'MX', population: 9200000, marketSize: 'Huge', interest: 'High', loyalty: 'High', cost: 500000000 },
    { id: 'toronto', city: 'Toronto', state: 'ON', population: 2900000, marketSize: 'Large', interest: 'Medium', loyalty: 'Medium', cost: 450000000 },
    { id: 'san_antonio', city: 'San Antonio', state: 'TX', population: 1500000, marketSize: 'Medium', interest: 'High', loyalty: 'High', cost: 350000000 },
    { id: 'portland', city: 'Portland', state: 'OR', population: 650000, marketSize: 'Medium', interest: 'High', loyalty: 'High', cost: 325000000 },
    { id: 'st_louis', city: 'St. Louis', state: 'MO', population: 300000, marketSize: 'Medium', interest: 'High', loyalty: 'Very High', cost: 300000000 },
    { id: 'san_diego', city: 'San Diego', state: 'CA', population: 1400000, marketSize: 'Large', interest: 'Medium', loyalty: 'Medium', cost: 400000000 },
    { id: 'dublin', city: 'Dublin', state: 'IE', population: 544000, marketSize: 'Small', interest: 'Medium', loyalty: 'High', cost: 400000000 },
    { id: 'tokyo', city: 'Tokyo', state: 'JP', population: 13960000, marketSize: 'Huge', interest: 'Low', loyalty: 'Low', cost: 600000000 },
    { id: 'paris', city: 'Paris', state: 'FR', population: 2161000, marketSize: 'Large', interest: 'Low', loyalty: 'Medium', cost: 500000000 },
    { id: 'rio', city: 'Rio de Janeiro', state: 'BR', population: 6748000, marketSize: 'Large', interest: 'Medium', loyalty: 'High', cost: 450000000 },
    { id: 'sydney', city: 'Sydney', state: 'AU', population: 5312000, marketSize: 'Large', interest: 'Medium', loyalty: 'Medium', cost: 550000000 },
    { id: 'montreal', city: 'Montreal', state: 'QC', population: 1780000, marketSize: 'Medium', interest: 'Medium', loyalty: 'High', cost: 350000000 },
    { id: 'vancouver', city: 'Vancouver', state: 'BC', population: 675000, marketSize: 'Medium', interest: 'High', loyalty: 'High', cost: 375000000 },
    { id: 'orlando', city: 'Orlando', state: 'FL', population: 287000, marketSize: 'Medium', interest: 'Medium', loyalty: 'Medium', cost: 300000000 },
    { id: 'salt_lake', city: 'Salt Lake City', state: 'UT', population: 200000, marketSize: 'Small', interest: 'Medium', loyalty: 'High', cost: 250000000 },
    { id: 'columbus', city: 'Columbus', state: 'OH', population: 898000, marketSize: 'Medium', interest: 'High', loyalty: 'High', cost: 300000000 },
    { id: 'austin', city: 'Austin', state: 'TX', population: 961000, marketSize: 'Medium', interest: 'High', loyalty: 'Medium', cost: 350000000 },
    { id: 'oklahoma_city', city: 'Oklahoma City', state: 'OK', population: 655000, marketSize: 'Small', interest: 'High', loyalty: 'High', cost: 250000000 },
    { id: 'memphis', city: 'Memphis', state: 'TN', population: 651000, marketSize: 'Small', interest: 'Medium', loyalty: 'High', cost: 250000000 }
];

const STADIUM_TIERS = [
    { id: 'basic', name: 'Basic Stadium', capacity: 60000, cost: 400000000, bonus: 0 },
    { id: 'standard', name: 'Modern Stadium', capacity: 70000, cost: 800000000, bonus: 5 },
    { id: 'luxury', name: 'Futuristic Dome', capacity: 85000, cost: 1500000000, bonus: 15 }
];

class RelocationManager {
    constructor() {
        this.markets = AVAILABLE_MARKETS;
    }

    getEligibleMarkets() {
        // Could filter based on logic (e.g. only unlock international if league is popular)
        return this.markets;
    }

    getMarketById(id) {
        return this.markets.find(m => m.id === id);
    }

    calculateTotalCost(marketId, stadiumTierId) {
        const market = this.getMarketById(marketId);
        const stadium = STADIUM_TIERS.find(s => s.id === stadiumTierId);
        if (!market || !stadium) return 0;
        return market.cost + stadium.cost;
    }

    canRelocate(teamId) {
        // Logic: Can only relocate if Owner Mode is active
        if (!window.state || !window.state.ownerMode || !window.state.ownerMode.enabled) {
            return { allowed: false, reason: "Owner Mode must be enabled." };
        }

        // Check if user is the owner of this team
        if (window.state.userTeamId !== teamId) {
             return { allowed: false, reason: "You can only relocate your own team." };
        }

        // Could check for minimum funds or approval rating
        return { allowed: true };
    }

    /**
     * Executes the relocation.
     * @param {number} teamId
     * @param {object} details { marketId, newName, newAbbr, primaryColor, secondaryColor, stadiumTierId }
     */
    relocateTeam(teamId, details) {
        const league = window.state.league;
        const team = league.teams.find(t => t.id === teamId);
        if (!team) return { success: false, message: "Team not found." };

        const market = this.getMarketById(details.marketId);
        const stadium = STADIUM_TIERS.find(s => s.id === details.stadiumTierId);
        const totalCost = this.calculateTotalCost(details.marketId, details.stadiumTierId);

        // Apply Changes
        const oldName = team.name;
        const oldCity = team.city || (team.name.split(' ').length > 1 ? team.name.split(' ').slice(0, -1).join(' ') : 'Unknown'); // rough guess if city not stored

        team.name = `${market.city} ${details.newName}`;
        team.abbr = details.newAbbr;
        team.colors = { primary: details.primaryColor, secondary: details.secondaryColor };
        team.city = market.city;
        team.marketSize = market.marketSize;
        team.loyalty = market.loyalty;
        team.stadium = {
            name: `New ${market.city} Stadium`,
            capacity: stadium.capacity,
            tier: stadium.name
        };

        // Financial Impact
        if (window.state.ownerMode) {
            // Expenses are annual, but this is a capital expenditure.
            // Let's add it to "Facilities" expenses for this year, effectively tanking profit.
            window.state.ownerMode.expenses.facilities += totalCost;
            window.state.ownerMode.expenses.total += totalCost;

            // Boost Fan Satisfaction (Honeymoon period)
            window.state.ownerMode.fanSatisfaction = 100;
        }

        // News Event
        if (league.news) {
            league.news.unshift({
                week: league.week,
                year: league.year,
                type: 'relocation',
                headline: `BREAKING: ${oldName} Relocating to ${market.city}!`,
                story: `In a historic move, the franchise formerly known as the ${oldName} has announced they are moving to ${market.city}. They will now be known as the ${team.name}. The ownership group has committed $${(totalCost/1000000).toFixed(1)}M to the move and a new ${stadium.name}.`
            });
        }

        return { success: true, message: `Successfully relocated to ${market.city}!` };
    }
}

// Export to global scope
window.RelocationManager = new RelocationManager();
window.AVAILABLE_MARKETS = AVAILABLE_MARKETS;
window.STADIUM_TIERS = STADIUM_TIERS;
