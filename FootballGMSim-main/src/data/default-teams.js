// Canonical 32-team set — conf: 0=AFC 1=NFC, div: 0=East 1=North 2=South 3=West.
// Mirrors legacy/teams.js (Constants.TEAMS_REAL) with explicit integer IDs so
// the worker cache Map keys are always Numbers, never strings.
export const DEFAULT_TEAMS = [
  // AFC East
  { id:  0, abbr: 'BUF', name: 'Buffalo Bills',           conf: 0, div: 0 },
  { id:  1, abbr: 'MIA', name: 'Miami Dolphins',           conf: 0, div: 0 },
  { id:  2, abbr: 'NE',  name: 'New England Patriots',     conf: 0, div: 0 },
  { id:  3, abbr: 'NYJ', name: 'New York Jets',            conf: 0, div: 0 },
  // AFC North
  { id:  4, abbr: 'BAL', name: 'Baltimore Ravens',         conf: 0, div: 1 },
  { id:  5, abbr: 'CIN', name: 'Cincinnati Bengals',       conf: 0, div: 1 },
  { id:  6, abbr: 'CLE', name: 'Cleveland Browns',         conf: 0, div: 1 },
  { id:  7, abbr: 'PIT', name: 'Pittsburgh Steelers',      conf: 0, div: 1 },
  // AFC South
  { id:  8, abbr: 'HOU', name: 'Houston Texans',           conf: 0, div: 2 },
  { id:  9, abbr: 'IND', name: 'Indianapolis Colts',       conf: 0, div: 2 },
  { id: 10, abbr: 'JAX', name: 'Jacksonville Jaguars',     conf: 0, div: 2 },
  { id: 11, abbr: 'TEN', name: 'Tennessee Titans',         conf: 0, div: 2 },
  // AFC West
  { id: 12, abbr: 'DEN', name: 'Denver Broncos',           conf: 0, div: 3 },
  { id: 13, abbr: 'KC',  name: 'Kansas City Chiefs',       conf: 0, div: 3 },
  { id: 14, abbr: 'LV',  name: 'Las Vegas Raiders',        conf: 0, div: 3 },
  { id: 15, abbr: 'LAC', name: 'Los Angeles Chargers',     conf: 0, div: 3 },
  // NFC East
  { id: 16, abbr: 'DAL', name: 'Dallas Cowboys',           conf: 1, div: 0 },
  { id: 17, abbr: 'NYG', name: 'New York Giants',          conf: 1, div: 0 },
  { id: 18, abbr: 'PHI', name: 'Philadelphia Eagles',      conf: 1, div: 0 },
  { id: 19, abbr: 'WAS', name: 'Washington Commanders',    conf: 1, div: 0 },
  // NFC North
  { id: 20, abbr: 'CHI', name: 'Chicago Bears',            conf: 1, div: 1 },
  { id: 21, abbr: 'DET', name: 'Detroit Lions',            conf: 1, div: 1 },
  { id: 22, abbr: 'GB',  name: 'Green Bay Packers',        conf: 1, div: 1 },
  { id: 23, abbr: 'MIN', name: 'Minnesota Vikings',        conf: 1, div: 1 },
  // NFC South
  { id: 24, abbr: 'ATL', name: 'Atlanta Falcons',          conf: 1, div: 2 },
  { id: 25, abbr: 'CAR', name: 'Carolina Panthers',        conf: 1, div: 2 },
  { id: 26, abbr: 'NO',  name: 'New Orleans Saints',       conf: 1, div: 2 },
  { id: 27, abbr: 'TB',  name: 'Tampa Bay Buccaneers',     conf: 1, div: 2 },
  // NFC West
  { id: 28, abbr: 'ARI', name: 'Arizona Cardinals',        conf: 1, div: 3 },
  { id: 29, abbr: 'LAR', name: 'Los Angeles Rams',         conf: 1, div: 3 },
  { id: 30, abbr: 'SF',  name: 'San Francisco 49ers',      conf: 1, div: 3 },
  { id: 31, abbr: 'SEA', name: 'Seattle Seahawks',         conf: 1, div: 3 },
];
