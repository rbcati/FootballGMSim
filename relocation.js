// relocation.js - Relocation Logic
'use strict';

export const AVAILABLE_MARKETS = [
    { city: 'London', name: 'Monarchs', abbr: 'LON', size: 'Huge', cost: 500, region: 'International' },
    { city: 'Mexico City', name: 'Diablos', abbr: 'MEX', size: 'Huge', cost: 450, region: 'International' },
    { city: 'San Antonio', name: 'Marshals', abbr: 'SA', size: 'Medium', cost: 200, region: 'South' },
    { city: 'Portland', name: 'Lumberjacks', abbr: 'POR', size: 'Medium', cost: 250, region: 'West' },
    { city: 'Salt Lake City', name: 'Elks', abbr: 'SLC', size: 'Small', cost: 150, region: 'West' },
    { city: 'Oklahoma City', name: 'Bison', abbr: 'OKC', size: 'Small', cost: 150, region: 'South' },
    { city: 'Toronto', name: 'Huskies', abbr: 'TOR', size: 'Large', cost: 350, region: 'International' },
    { city: 'St. Louis', name: 'Archers', abbr: 'STL', size: 'Medium', cost: 200, region: 'Midwest' },
    { city: 'Austin', name: 'Bats', abbr: 'AUS', size: 'Medium', cost: 250, region: 'South' },
    { city: 'Dublin', name: 'Shamrocks', abbr: 'DUB', size: 'Large', cost: 400, region: 'International' }
];

export class RelocationManager {
    constructor() {
        this.markets = AVAILABLE_MARKETS;
    }

    getAvailableMarkets(league) {
        // Filter out markets that already have a team (based on city name)
        const occupiedCities = league.teams.map(t => t.city || t.name.split(' ')[0]); // Heuristic: City is usually first word
        return this.markets.filter(m => !occupiedCities.includes(m.city));
    }

    getRelocationCost(market) {
        // Base cost is in millions
        return market.cost;
    }

    canAffordRelocation(team, market) {
        // Check if team/owner has funds.
        // Currently owner mode tracks revenue/profit but not a "bank balance".
        // We'll use a hypothetical budget or check against annual profit as a proxy for creditworthiness.
        // For now, let's assume if they have positive profit, they can finance it.
        const ownerMode = window.state?.ownerMode;
        if (!ownerMode || !ownerMode.enabled) return true; // GM mode ignores cost

        return ownerMode.profit > 0;
    }

    relocateTeam(league, teamId, marketIndex, newName, newAbbr, newColors) {
        const team = league.teams[teamId];
        const market = this.markets[marketIndex];

        if (!team || !market) return { success: false, message: 'Invalid team or market.' };

        // Apply changes
        team.name = `${market.city} ${newName || market.name}`;
        team.abbr = newAbbr || market.abbr;
        team.city = market.city; // Store city explicitly now

        // Update branding if colors provided
        if (newColors) {
            team.colors = newColors;
        }

        // Apply cost (if owner mode)
        if (window.state?.ownerMode?.enabled) {
            window.state.ownerMode.expenses.facilities += this.getRelocationCost(market) * 1000000;
        }

        // Add news item
        if (league.news) {
            league.news.unshift({
                week: league.week,
                year: league.year,
                type: 'relocation',
                headline: `Franchise on the Move: ${team.name}`,
                story: `The franchise has officially relocated to ${market.city}. They will now be known as the ${team.name}.`
            });
        }

        return { success: true, message: `Successfully relocated to ${market.city}!` };
    }
}

const relocationManager = new RelocationManager();
export default relocationManager;

// Expose globally for UI
if (typeof window !== 'undefined') {
    window.relocationManager = relocationManager;
    window.AVAILABLE_MARKETS = AVAILABLE_MARKETS;
}
