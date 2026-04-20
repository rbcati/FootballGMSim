'use strict';

// This file now correctly assumes that the Constants object is ALREADY on the window.
// It will add the team arrays TO that object.

if (!window.Constants) {
    window.Constants = {};
}

// AFC East
Constants.TEAMS_REAL = [
    { abbr: 'BUF', name: 'Buffalo Bills', conf: 0, div: 0 },
    { abbr: 'MIA', name: 'Miami Dolphins', conf: 0, div: 0 },
    { abbr: 'NE', name: 'New England Patriots', conf: 0, div: 0 },
    { abbr: 'NYJ', name: 'New York Jets', conf: 0, div: 0 },
    // AFC North
    { abbr: 'BAL', name: 'Baltimore Ravens', conf: 0, div: 1 },
    { abbr: 'CIN', name: 'Cincinnati Bengals', conf: 0, div: 1 },
    { abbr: 'CLE', name: 'Cleveland Browns', conf: 0, div: 1 },
    { abbr: 'PIT', name: 'Pittsburgh Steelers', conf: 0, div: 1 },
    // AFC South
    { abbr: 'HOU', name: 'Houston Texans', conf: 0, div: 2 },
    { abbr: 'IND', name: 'Indianapolis Colts', conf: 0, div: 2 },
    { abbr: 'JAX', name: 'Jacksonville Jaguars', conf: 0, div: 2 },
    { abbr: 'TEN', name: 'Tennessee Titans', conf: 0, div: 2 },
    // AFC West
    { abbr: 'DEN', name: 'Denver Broncos', conf: 0, div: 3 },
    { abbr: 'KC', name: 'Kansas City Chiefs', conf: 0, div: 3 },
    { abbr: 'LV', name: 'Las Vegas Raiders', conf: 0, div: 3 },
    { abbr: 'LAC', name: 'Los Angeles Chargers', conf: 0, div: 3 },
    // NFC East
    { abbr: 'DAL', name: 'Dallas Cowboys', conf: 1, div: 0 },
    { abbr: 'NYG', name: 'New York Giants', conf: 1, div: 0 },
    { abbr: 'PHI', name: 'Philadelphia Eagles', conf: 1, div: 0 },
    { abbr: 'WAS', name: 'Washington Commanders', conf: 1, div: 0 },
    // NFC North
    { abbr: 'CHI', name: 'Chicago Bears', conf: 1, div: 1 },
    { abbr: 'DET', name: 'Detroit Lions', conf: 1, div: 1 },
    { abbr: 'GB', name: 'Green Bay Packers', conf: 1, div: 1 },
    { abbr: 'MIN', name: 'Minnesota Vikings', conf: 1, div: 1 },
    // NFC South
    { abbr: 'ATL', name: 'Atlanta Falcons', conf: 1, div: 2 },
    { abbr: 'CAR', name: 'Carolina Panthers', conf: 1, div: 2 },
    { abbr: 'NO', name: 'New Orleans Saints', conf: 1, div: 2 },
    { abbr: 'TB', name: 'Tampa Bay Buccaneers', conf: 1, div: 2 },
    // NFC West
    { abbr: 'ARI', name: 'Arizona Cardinals', conf: 1, div: 3 },
    { abbr: 'LAR', name: 'Los Angeles Rams', conf: 1, div: 3 },
    { abbr: 'SF', name: 'San Francisco 49ers', conf: 1, div: 3 },
    { abbr: 'SEA', name: 'Seattle Seahawks', conf: 1, div: 3 }
];

Constants.TEAMS_FICTIONAL = [
    // Conference 1, Division 1
    { abbr: 'BOS', name: 'Boston Minutemen', conf: 0, div: 0 },
    { abbr: 'TOR', name: 'Toronto Huskies', conf: 0, div: 0 },
    { abbr: 'MIA', name: 'Miami Sharks', conf: 0, div: 0 },
    { abbr: 'NJ', name: 'New Jersey Generals', conf: 0, div: 0 },
    // Conference 1, Division 2
    { abbr: 'PIT', name: 'Pittsburgh Ironmen', conf: 0, div: 1 },
    { abbr: 'CLE', name: 'Cleveland Steamers', conf: 0, div: 1 },
    { abbr: 'CHI', name: 'Chicago Tigers', conf: 0, div: 1 },
    { abbr: 'DET', name: 'Detroit Gears', conf: 0, div: 1 },
    // Conference 1, Division 3
    { abbr: 'HOU', name: 'Houston Oilers', conf: 0, div: 2 },
    { abbr: 'MEM', name: 'Memphis Blues', conf: 0, div: 2 },
    { abbr: 'IND', name: 'Indiana Racers', conf: 0, div: 2 },
    { abbr: 'ORL', name: 'Orlando Wizards', conf: 0, div: 2 },
    // Conference 1, Division 4
    { abbr: 'DEN', name: 'Denver Gold', conf: 0, div: 3 },
    { abbr: 'SD', name: 'San Diego Chargers', conf: 0, div: 3 },
    { abbr: 'OAK', name: 'Oakland Invaders', conf: 0, div: 3 },
    { abbr: 'POR', name: 'Portland Beavers', conf: 0, div: 3 },
    // Conference 2, Division 1
    { abbr: 'NY', name: 'New York Knights', conf: 1, div: 0 },
    { abbr: 'PHI', name: 'Philadelphia Quakers', conf: 1, div: 0 },
    { abbr: 'WAS', name: 'Washington Federals', conf: 1, div: 0 },
    { abbr: 'BAL', name: 'Baltimore Stars', conf: 1, div: 0 },
    // Conference 2, Division 2
    { abbr: 'MIN', name: 'Minnesota Lumberjacks', conf: 1, div: 1 },
    { abbr: 'GB', name: 'Green Bay Pioneers', conf: 1, div: 1 },
    { abbr: 'STL', name: 'St. Louis Stallions', conf: 1, div: 1 },
    { abbr: 'MIL', name: 'Milwaukee Brewers', conf: 1, div: 1 },
    // Conference 2, Division 3
    { abbr: 'ATL', name: 'Atlanta Firebirds', conf: 1, div: 2 },
    { abbr: 'NO', name: 'New Orleans Jazz', conf: 1, div: 2 },
    { abbr: 'CAR', name: 'Carolina Cougars', conf: 1, div: 2 },
    { abbr: 'BHM', name: 'Birmingham Vulcans', conf: 1, div: 2 },
    // Conference 2, Division 4
    { abbr: 'LA', name: 'Los Angeles Express', conf: 1, div: 3 },
    { abbr: 'SF', name: 'San Francisco Demons', conf: 1, div: 3 },
    { abbr: 'SEA', name: 'Seattle Kings', conf: 1, div: 3 },
    { abbr: 'ARI', name: 'Arizona Scorpions', conf: 1, div: 3 }
];

// Create Teams object with both naming conventions to ensure compatibility
const Teams = {
    fictional: Constants.TEAMS_FICTIONAL,
    real: Constants.TEAMS_REAL,
    
    // Add the expected property names for compatibility with onboard-fix.js
    TEAM_META_REAL: Constants.TEAMS_REAL,
    TEAM_META_FICTIONAL: Constants.TEAMS_FICTIONAL,

    getByAbbr: function(abbr, mode = 'fictional') {
        const teamList = (mode === 'real') ? this.real : this.fictional;
        return teamList.find(t => t.abbr === abbr);
    },

    getById: function(id, mode = 'fictional') {
        const teamList = (mode === 'real') ? this.real : this.fictional;
        return teamList[id];
    }
};

function listByMode(mode) {
    console.log('listByMode called with mode:', mode);
    
    if (!window.Teams) {
        console.error("Teams data has not loaded yet!");
        return [];
    }
    
    if (mode === 'real') {
        const teams = Teams.real || Teams.TEAM_META_REAL || Constants.TEAMS_REAL || [];
        console.log(`Returning ${teams.length} real teams`);
        return teams;
    } else {
        const teams = Teams.fictional || Teams.TEAM_META_FICTIONAL || Constants.TEAMS_FICTIONAL || [];
        console.log(`Returning ${teams.length} fictional teams`);
        return teams;
    }
}

// --- CRITICAL ---
// Make the Teams object and the listByMode function globally available
window.Teams = Teams;
window.listByMode = listByMode;

// Also add to Constants for additional compatibility
Constants.TEAM_META_REAL = Constants.TEAMS_REAL;
Constants.TEAM_META_FICTIONAL = Constants.TEAMS_FICTIONAL;

console.log('Teams.js loaded - Real teams:', Teams.TEAM_META_REAL?.length, 'Fictional teams:', Teams.TEAM_META_FICTIONAL?.length);
