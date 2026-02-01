const DB_KEY_PREFIX = 'football_gm_league_';
const METADATA_KEY = 'football_gm_leagues_metadata';
const LAST_PLAYED_KEY = 'football_gm_last_played';

// Metadata helpers
function saveLeagueMetadata(meta) {
    try {
        localStorage.setItem(METADATA_KEY, JSON.stringify(meta));
    } catch (e) {
        console.error("Failed to save league metadata:", e);
    }
}

function rebuildMetadata() {
    console.log("Rebuilding league metadata...");
    const meta = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DB_KEY_PREFIX)) {
            try {
                const raw = localStorage.getItem(key);
                const league = JSON.parse(raw);
                if (league && league.name) {
                    meta[league.name] = {
                        name: league.name,
                        team: league.team || "Unknown",
                        year: league.year || 2025,
                        lastPlayed: league.lastPlayed || new Date().toLocaleString()
                    };
                }
            } catch (e) {
                console.error("Error parsing league for metadata:", key, e);
            }
        }
    }
    saveLeagueMetadata(meta);
    return meta;
}

function getLeagueMetadata() {
    const raw = localStorage.getItem(METADATA_KEY);
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.warn("Corrupt metadata, rebuilding...");
        }
    }
    return rebuildMetadata();
}

function updateLeagueMetadata(leagueData) {
    const meta = getLeagueMetadata();
    meta[leagueData.name] = {
        name: leagueData.name,
        team: leagueData.team,
        year: leagueData.year,
        lastPlayed: leagueData.lastPlayed
    };
    saveLeagueMetadata(meta);
}

function removeLeagueMetadata(leagueName) {
    const meta = getLeagueMetadata();
    if (meta[leagueName]) {
        delete meta[leagueName];
        saveLeagueMetadata(meta);
    }
}

// Helper to manage last played league
export function getLastPlayedLeague() {
    return localStorage.getItem(LAST_PLAYED_KEY);
}

export function setLastPlayedLeague(name) {
    if (name) {
        localStorage.setItem(LAST_PLAYED_KEY, name);
    }
}

export function hasSavedLeagues() {
    // Check metadata first
    const meta = getLeagueMetadata();
    if (Object.keys(meta).length > 0) return true;

    // Legacy check
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DB_KEY_PREFIX)) {
            return true;
        }
    }
    return false;
}

// Schema Migration Helper
export function migrateSchema(league) {
    if (!league || !league.teams) return;
    console.log("Running schema migration...");

    league.teams.forEach(team => {
        if (team.roster) {
            team.roster.forEach(p => {
                // Fix Fog of War / Scouted Attributes
                if (!p.scoutedAttributes) {
                    p.scoutedAttributes = { ...p.ratings }; // Default to visible
                    p.fogOfWar = false; // Default to fully revealed
                }

                // Fix Negotiation Status
                if (!p.negotiationStatus) {
                    p.negotiationStatus = 'OPEN'; // Default for Contract Heat feature
                }
            });
        }
    });
}

// 1. Function to Save Current Game
export async function saveGame(stateToSave) {
    const gameState = stateToSave || window.state;
    if (!gameState || !gameState.league) {
        console.warn("No league to save.");
        return;
    }

    // Update save status
    gameState.needsSave = false;
    gameState.lastSaved = new Date().toISOString();

    let leagueName = gameState.leagueName;
    if (!leagueName) {
         // Try to recover from session if we just created it
         leagueName = sessionStorage.getItem('temp_league_name');
         if (leagueName) {
             gameState.leagueName = leagueName;
         } else {
             // Generate a name if absolutely missing
             leagueName = "League " + new Date().getTime();
             gameState.leagueName = leagueName;
         }
    }

    const saveData = {
        name: leagueName,
        lastPlayed: new Date().toLocaleString(),
        year: gameState.league.year || 2025,
        team: gameState.league.teams[gameState.userTeamId]?.name || "Unknown",
        data: gameState // The actual game object
    };

    try {
        // Try IndexedDB first (Primary Storage)
        let savedToIDB = false;
        if (window.footballDB) {
            try {
                await window.footballDB.saveLeague(saveData);
                savedToIDB = true;
            } catch (idbErr) {
                console.error("IndexedDB save failed, attempting localStorage fallback...", idbErr);
            }
        }

        if (!savedToIDB) {
            // Fallback to localStorage
            localStorage.setItem(DB_KEY_PREFIX + leagueName, JSON.stringify(saveData));
        }

        setLastPlayedLeague(leagueName); // Update last played

        // Update metadata index for performance (kept in localStorage for sync access)
        updateLeagueMetadata(saveData);

        if (window.setStatus) window.setStatus("League saved: " + leagueName, "success");
        console.log("Game saved successfully to " + leagueName);
        renderDashboard();
    } catch (e) {
        console.error("Save error:", e);

        // iOS Safe Mode / Storage Quota Handling
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            alert("Storage Error: Private Browsing mode may block saving. Please disable Private Mode for this game.");
            if (window.setStatus) window.setStatus("Storage Error: Save failed (Private Mode?)", "error");
        } else {
            if (window.setStatus) window.setStatus("Save failed: " + e.message, "error");
        }
    }
}

// 2. Function to Load Dashboard
export function renderDashboard() {
    const list = document.getElementById('leagues-list');
    if (!list) return;

    // --- NEW: Add Resume Button for Last Played League ---
    const lastPlayed = getLastPlayedLeague();

    // Remove existing resume section if present (to avoid duplicates)
    const existingResume = document.getElementById('resume-league-section');
    if (existingResume) existingResume.remove();

    if (lastPlayed) {
        // Verify the league actually exists in storage
        if (localStorage.getItem(DB_KEY_PREFIX + lastPlayed)) {
            const resumeSection = document.createElement('div');
            resumeSection.id = 'resume-league-section';
            resumeSection.className = 'dashboard-section mb-4';

            const h3 = document.createElement('h3');
            h3.textContent = 'Resume Playing';
            resumeSection.appendChild(h3);

            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'background: linear-gradient(to right, #2d3748, #1a202c); border-left: 5px solid var(--accent); margin-bottom: 20px;';

            const flexDiv = document.createElement('div');
            flexDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px;';

            const infoDiv = document.createElement('div');
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 1.4rem; font-weight: bold; color: white;';
            nameDiv.textContent = lastPlayed;

            const labelDiv = document.createElement('div');
            labelDiv.style.cssText = 'font-size: 0.9rem; color: #cbd5e0;';
            labelDiv.textContent = 'Last Active League';

            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(labelDiv);

            const btn = document.createElement('button');
            btn.className = 'btn primary';
            btn.style.cssText = 'padding: 12px 24px; font-size: 1.1rem;';
            btn.textContent = 'Resume Game';
            btn.onclick = () => window.loadLeague(lastPlayed);

            flexDiv.appendChild(infoDiv);
            flexDiv.appendChild(btn);
            card.appendChild(flexDiv);
            resumeSection.appendChild(card);

            // Insert at the top of the dashboard content, after the title
            const container = document.querySelector('#leagueDashboard .card');
            if (container) {
                 const title = container.querySelector('h1');
                 if (title && title.nextSibling) {
                     container.insertBefore(resumeSection, title.nextSibling);
                 } else {
                     container.prepend(resumeSection);
                 }
            }
        }
    }

    list.innerHTML = '';
    let hasLeagues = false;
    let leagueCount = 0;

    // Use metadata index for performance instead of iterating all storage
    const metadata = getLeagueMetadata();
    const sortedLeagues = Object.values(metadata).sort((a, b) => {
        // Sort by last played descending (newest first)
        return new Date(b.lastPlayed) - new Date(a.lastPlayed);
    });

    let dirty = false;
    for (const league of sortedLeagues) {
        // We trust metadata now since IDB check is async.
        // If load fails later, we can handle it then.

        hasLeagues = true;
        leagueCount++;

        try {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            // Explicit onclick handler for robustness as requested
            row.setAttribute('onclick', `if(!event.target.closest('.btn')) window.loadLeague('${league.name.replace(/'/g, "\\'")}')`);
            row.innerHTML = `
                <td><strong>${league.name}</strong></td>
                <td>${league.team}</td>
                <td>${league.year}</td>
                <td>${league.lastPlayed}</td>
                <td>
                    <div class="row">
                        <button class="btn-load btn primary btn-sm" style="margin-right:5px">Play</button>
                        <button class="btn-danger btn danger btn-sm">Delete</button>
                    </div>
                </td>
            `;
            list.appendChild(row);

            // Add event listeners safely
            const loadBtn = row.querySelector('.btn-load');
            const delBtn = row.querySelector('.btn-danger');

            // Make entire row clickable for loading (Listener + Attribute for safety)
            row.addEventListener('click', (e) => {
                // Prevent firing if clicking buttons specifically
                if (e.target.closest('.btn')) return;
                loadLeague(league.name);
            });

            if (loadBtn) loadBtn.onclick = (e) => {
                e.stopPropagation();
                loadLeague(league.name);
            };
            if (delBtn) delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteLeague(league.name);
            };

        } catch (e) {
            console.error("Error rendering league row", league.name, e);
        }
    }

    if (dirty) {
        saveLeagueMetadata(metadata);
    }

    const noLeaguesMsg = document.getElementById('no-leagues-msg');
    if (noLeaguesMsg) noLeaguesMsg.style.display = hasLeagues ? 'none' : 'block';
    console.log(`Dashboard rendered with ${leagueCount} leagues.`);
}

// 3. Load Specific League
export async function loadLeague(leagueName) {
    try {
        let saveObj = null;

        // Try IndexedDB first
        if (window.footballDB) {
            try {
                saveObj = await window.footballDB.loadLeague(leagueName);
            } catch (idbErr) {
                console.warn("IDB load failed, checking localStorage backup...", idbErr);
            }
        }

        // Fallback to localStorage (Migration / Backup)
        if (!saveObj) {
            const raw = localStorage.getItem(DB_KEY_PREFIX + leagueName);
            if (raw) {
                saveObj = JSON.parse(raw);
                console.log("Loaded from localStorage (Legacy)");

                // Optional: Migrate to IDB automatically?
                if (window.footballDB && saveObj) {
                    window.footballDB.saveLeague(saveObj).then(() => console.log("Migrated to IDB"));
                }
            }
        }

        if (!saveObj) {
            console.error("League not found in any storage:", leagueName);
            if (window.setStatus) window.setStatus("Failed to load league: Not Found", "error");
            return null;
        }

        window.state = saveObj.data;
        window.state.leagueName = leagueName; // Ensure name is preserved

        // Fix 1: Schema Migration
        if (window.state.league) {
            migrateSchema(window.state.league);
        }

        // Update last played on load
        setLastPlayedLeague(leagueName);

        // Hide dashboard, show game
        const dashboard = document.getElementById('leagueDashboard');
        if (dashboard) {
            dashboard.hidden = true;
            dashboard.style.display = 'none';
        }

        // Force UI updates
        if (window.updateHeader) window.updateHeader();
        if (window.renderHub) window.renderHub();

        // Ensure data consistency (fix 0-0-0 record issue)
        if (window.state.league && window.state.league.teams) {
            window.state.league.teams.forEach(team => {
                if (!team.record) {
                    team.record = {
                        w: team.wins || 0,
                        l: team.losses || 0,
                        t: team.ties || 0,
                        pf: team.ptsFor || 0,
                        pa: team.ptsAgainst || 0
                    };
                } else {
                    // Sync if record exists but might be stale
                    if (team.wins !== undefined) team.record.w = team.wins;
                    if (team.losses !== undefined) team.record.l = team.losses;
                    if (team.ties !== undefined) team.record.t = team.ties;
                    if (team.ptsFor !== undefined) team.record.pf = team.ptsFor;
                    if (team.ptsAgainst !== undefined) team.record.pa = team.ptsAgainst;
                }
            });
        }

        // Use game controller to navigate and refresh
        if (window.gameController) {
            window.gameController.router('hub');
            if (typeof window.gameController.renderHub === 'function') {
                window.gameController.renderHub();
            }
        } else {
            location.hash = '#/hub';
            if (typeof window.renderHub === 'function') {
                window.renderHub();
            }
        }

        if (window.setStatus) window.setStatus("Loaded " + leagueName, "success");
        return window.state;
    } catch (e) {
        console.error("Error loading league:", e);
        if (window.setStatus) window.setStatus("Failed to load league.", "error");
        return null;
    }
}

// 4. Delete League
export async function deleteLeague(leagueName) {
    if (confirm(`Delete league "${leagueName}"? This cannot be undone.`)) {
        // Delete from IDB
        if (window.footballDB) {
            await window.footballDB.deleteLeague(leagueName);
        }
        // Delete from LocalStorage (Legacy cleanup)
        localStorage.removeItem(DB_KEY_PREFIX + leagueName);

        removeLeagueMetadata(leagueName);

        if (getLastPlayedLeague() === leagueName) {
            localStorage.removeItem(LAST_PLAYED_KEY);
        }
        renderDashboard();
    }
}

// 5. Create New League Wrapper
export function createNewLeague(name) {
    if (!name) {
        alert("Please enter a league name.");
        return;
    }
    // Check if name exists (check metadata)
    const meta = getLeagueMetadata();
    if (meta[name]) {
        alert("League name already exists. Please choose another.");
        return;
    }

    // Store name temporarily
    sessionStorage.setItem('temp_league_name', name);

    // Set as last played immediately
    setLastPlayedLeague(name);

    // Hide dashboard
    const dashboard = document.getElementById('leagueDashboard');
    if (dashboard) {
        dashboard.hidden = true;
        dashboard.style.display = 'none';
    }

    // Start new game flow
    if (window.gameController) {
        window.gameController.startNewLeague();
    } else {
        console.error("GameController not ready");
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.saveGame = saveGame;
    window.renderDashboard = renderDashboard;
    window.loadLeague = loadLeague;
    window.deleteLeague = deleteLeague;
    window.createNewLeague = createNewLeague;
    window.getLastPlayedLeague = getLastPlayedLeague;
    window.hasSavedLeagues = hasSavedLeagues;
}

// Bind UI events when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.renderDashboard) window.renderDashboard();

    const createBtn = document.getElementById('create-league-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('new-league-name');
            if (nameInput) createNewLeague(nameInput.value);
        });
    }
});
