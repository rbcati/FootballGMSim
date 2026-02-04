# Feature Logic: Progression Tracking & "Improving Players" List

This document defines the data structures and algorithms required to track player progression within a season and generate "Top Movers" lists for the dashboard.

## 1. Data Structure Requirements

To track improvement without storing full history for every week, we implement a **Season Snapshot** strategy.

### Player Object Schema Update
We add a lightweight property to the player object initialized at the start of every season (Week 1).

**File:** `player.js` / `player-core.js`

```javascript
// Existing Player Object
{
  id: 101,
  name: "John Doe",
  ovr: 78,
  pot: 82,
  // ...

  // NEW FIELD: Snapshot taken at Week 1 (or upon signing)
  seasonStart: {
     ovr: 75,
     pot: 80,
     age: 23
  }
}
```

### Storage Efficiency Strategy
*   **When to Snapshot:**
    *   `startNewSeason()`: For all existing players.
    *   `generateDraftClass()`: Rookies get snapshot upon creation (or draft).
    *   `freeAgency`: Free agents keep their snapshot or reset if it's a new season context.
*   **What to Store:** minimal integers only (`ovr`, `pot`, `age`). Avoid storing full ratings objects unless detailed per-attribute progression view is required (which bloats save files significantly).

## 2. Logic Implementation

### Initialization (Pseudocode)

```javascript
function captureSeasonSnapshots(league) {
    league.teams.forEach(team => {
        team.roster.forEach(player => {
            // Only set if not already present for this year
            if (!player.seasonStart) {
                player.seasonStart = {
                    ovr: player.ovr,
                    pot: player.pot,
                    age: player.age
                };
            }
        });
    });
}
```

### Query: `getImprovingPlayers()` (Pseudocode)

This function returns players with the highest positive differential between current OVR and Season Start OVR.

```javascript
/**
 * Returns top N improving players in the league (or specific team)
 * @param {Object} league - League object
 * @param {number} teamId - Optional: Filter by team
 * @param {number} limit - Number of players to return
 */
function getImprovingPlayers(league, teamId = null, limit = 5) {
    let candidates = [];

    const processPlayer = (p, tid) => {
        if (p.seasonStart) {
            const diff = p.ovr - p.seasonStart.ovr;
            // Filter: Only show positive improvement
            if (diff > 0) {
                candidates.push({
                    id: p.id,
                    name: p.name,
                    pos: p.pos,
                    teamId: tid,
                    currentOvr: p.ovr,
                    startOvr: p.seasonStart.ovr,
                    diff: diff
                });
            }
        }
    };

    if (teamId !== null) {
        // Single Team
        const team = league.teams.find(t => t.id === teamId);
        if (team) team.roster.forEach(p => processPlayer(p, team.id));
    } else {
        // Entire League
        league.teams.forEach(team => {
            team.roster.forEach(p => processPlayer(p, team.id));
        });
    }

    // Sort by differential descending, then by current OVR
    candidates.sort((a, b) => {
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.currentOvr - a.currentOvr;
    });

    return candidates.slice(0, limit);
}
```

### Widget Integration

**Dashboard Widget ("Risers"):**
```javascript
const improvers = getImprovingPlayers(league, userTeamId, 5);
// Render list: "+3 (75 -> 78) QB J. Doe"
```

## 3. Best Free Agent Pickups (Logic)

To track "Best Free Agent Pickups", we need to know *when* a player was signed and their impact.

**Strategy:**
1.  When signing a Free Agent, tag them:
    ```javascript
    player.signedMidSeason = true;
    player.stats.season.gamesPlayedAtSign = 0; // or track week signed
    ```
2.  **Query:** Filter roster for `signedMidSeason === true`. Sort by `WAR` (Wins Above Replacement) or total stats accumulated since signing.

```javascript
function getBestFreeAgentPickups(league, teamId) {
    const team = league.teams.find(t => t.id === teamId);
    if (!team) return [];

    return team.roster
        .filter(p => p.signedMidSeason)
        .sort((a, b) => (b.stats.season.war || 0) - (a.stats.season.war || 0))
        .slice(0, 5);
}
```
