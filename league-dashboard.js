const DB_KEY_PREFIX = 'football_gm_league_';
const LAST_PLAYED_KEY = 'football_gm_last_played';

// Helper to manage last played league
export function getLastPlayedLeague() {
    return localStorage.getItem(LAST_PLAYED_KEY);
}

export function setLastPlayedLeague(name) {
    if (name) {
        localStorage.setItem(LAST_PLAYED_KEY, name);
    }
}

// 1. Function to Save Current Game
export function saveGame(stateToSave) {
    const gameState = stateToSave || window.state;
    if (!gameState || !gameState.league) {
        console.warn("No league to save.");
        return;
    }

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
        localStorage.setItem(DB_KEY_PREFIX + leagueName, JSON.stringify(saveData));
        setLastPlayedLeague(leagueName); // Update last played
        if (window.setStatus) window.setStatus("League saved: " + leagueName, "success");
        console.log("Game saved successfully to " + leagueName);
        renderDashboard();
    } catch (e) {
        if (window.setStatus) window.setStatus("Save failed: Storage full or error.", "error");
        console.error("Save error:", e);
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

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DB_KEY_PREFIX)) {
            hasLeagues = true;
            leagueCount++;
            try {
                const raw = localStorage.getItem(key);
                const league = JSON.parse(raw);

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
                console.error("Error parsing league", key, e);
            }
        }
    }

    const noLeaguesMsg = document.getElementById('no-leagues-msg');
    if (noLeaguesMsg) noLeaguesMsg.style.display = hasLeagues ? 'none' : 'block';
    console.log(`Dashboard rendered with ${leagueCount} leagues.`);
}

// 3. Load Specific League
export function loadLeague(leagueName) {
    const raw = localStorage.getItem(DB_KEY_PREFIX + leagueName);
    if (!raw) return null;

    try {
        const saveObj = JSON.parse(raw);
        window.state = saveObj.data;
        window.state.leagueName = leagueName; // Ensure name is preserved

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
export function deleteLeague(leagueName) {
    if (confirm(`Delete league "${leagueName}"? This cannot be undone.`)) {
        localStorage.removeItem(DB_KEY_PREFIX + leagueName);
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
    // Check if name exists
    if (localStorage.getItem(DB_KEY_PREFIX + name)) {
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
