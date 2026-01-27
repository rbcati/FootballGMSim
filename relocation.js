// relocation.js - Franchise Relocation Logic
'use strict';

const AVAILABLE_MARKETS = [
    { id: 'london', city: 'London', name: 'Monarchs', marketSize: 'Huge', fanLoyalty: 6, region: 'International', abbr: 'LON' },
    { id: 'mexico', city: 'Mexico City', name: 'Diablos', marketSize: 'Huge', fanLoyalty: 8, region: 'International', abbr: 'MEX' },
    { id: 'toronto', city: 'Toronto', name: 'Huskies', marketSize: 'Large', fanLoyalty: 5, region: 'International', abbr: 'TOR' },
    { id: 'san_antonio', city: 'San Antonio', name: 'Marshals', marketSize: 'Medium', fanLoyalty: 9, region: 'South', abbr: 'SA' },
    { id: 'portland', city: 'Portland', name: 'Lumberjacks', marketSize: 'Medium', fanLoyalty: 9, region: 'West', abbr: 'POR' },
    { id: 'st_louis', city: 'St. Louis', name: 'Archers', marketSize: 'Medium', fanLoyalty: 7, region: 'Midwest', abbr: 'STL' },
    { id: 'salt_lake', city: 'Salt Lake City', name: 'Elks', marketSize: 'Small', fanLoyalty: 8, region: 'West', abbr: 'SLC' },
    { id: 'dublin', city: 'Dublin', name: 'Shamrocks', marketSize: 'Large', fanLoyalty: 7, region: 'International', abbr: 'DUB' },
    { id: 'tokyo', city: 'Tokyo', name: 'Samurai', marketSize: 'Huge', fanLoyalty: 5, region: 'International', abbr: 'TOK' },
    { id: 'paris', city: 'Paris', name: 'Musketeers', marketSize: 'Large', fanLoyalty: 4, region: 'International', abbr: 'PAR' }
];

class RelocationManager {
    constructor() {
        this.markets = AVAILABLE_MARKETS;
    }

    getAvailableMarkets() {
        return this.markets;
    }

    relocateTeam(teamId, marketId, newName, newAbbr, newColors) {
        if (!window.state || !window.state.league) return { success: false, message: "League not loaded" };

        const team = window.state.league.teams[teamId];
        if (!team) return { success: false, message: "Team not found" };

        const market = this.markets.find(m => m.id === marketId);
        if (!market) return { success: false, message: "Market not found" };

        // Save old name for news
        const oldName = team.name;

        // Update Team Data
        team.city = market.city;
        team.name = newName || `${market.city} ${market.name}`; // Fallback to default
        team.abbr = newAbbr ? newAbbr.toUpperCase() : (market.abbr || market.city.substring(0, 3).toUpperCase());
        team.marketSize = market.marketSize;

        // Update Colors
        if (newColors) {
            if (newColors.primary) team.color = newColors.primary;
            if (newColors.secondary) team.secondaryColor = newColors.secondary;
        }

        // Reset Fan Satisfaction (New City, Clean Slate)
        if (window.state.ownerMode) {
            window.state.ownerMode.fanSatisfaction = 50;
            window.state.ownerMode.marketSize = market.marketSize;
            // Maybe give a small "Honeymoon" boost
            window.state.ownerMode.fanSatisfaction += 10;
        }

        // Add News Item
        if (window.state.league.news) {
            window.state.league.news.unshift({
                id: Date.now(),
                week: window.state.league.week,
                year: window.state.league.year,
                type: 'relocation',
                headline: `BREAKING: ${oldName} Relocating to ${market.city}`,
                story: `It's official! The franchise formerly known as the ${oldName} is moving to ${market.city}. They will now be known as the ${team.name}. The ownership group promises a new era of success in their new home.`
            });
        }

        return { success: true, message: `Successfully relocated to ${market.city}!` };
    }
}

const relocationManager = new RelocationManager();

// Export globally
window.relocationManager = relocationManager;
window.AVAILABLE_MARKETS = AVAILABLE_MARKETS;
