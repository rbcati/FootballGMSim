'use strict';

import { SKILL_TREES } from './player.js';

/**
 * Player statistics viewer system
 * Now includes Progression (XP/Skill Tree), Legacy data, and Weekly Training Potential.
 */

class PlayerStatsViewer {
    constructor() {
        this.currentPlayer = null;
        this.modal = null;
        this.initialized = false;
        this.waitForLeague();
    }

    async waitForLeague() {
        // Wait for league to be ready before initializing
        let attempts = 0;
        const maxAttempts = 100; 
        
        while (attempts < maxAttempts) {
            if (window.state && window.state.league && window.state.league.teams) {
                this.init();
                this.initialized = true;
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        console.warn('PlayerStatsViewer: League not ready after timeout, initializing anyway');
        this.init();
    }

    init() {
        this.createModal();
        // this.setupEventListeners(); // Disabled in favor of routing
        
        // Auto-make players clickable after a short delay
        setTimeout(() => {
            this.makePlayersClickable();
        }, 500);
        
        // Set up observer to watch for new player rows
        this.setupDOMObserver();
    }

    createModal() {
        // Create modal for player stats
        this.modal = document.createElement('div');
        this.modal.id = 'playerStatsModal';
        this.modal.className = 'modal';
        this.modal.style.display = 'none'; // Hidden by default
        this.modal.hidden = true;
        this.modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="playerModalTitle">Player Statistics</h2>
                    <button type="button" class="close" aria-label="Close modal">&times;</button>
                </div>
                <div class="modal-body" id="playerModalBody">
                    <div class="player-info">
                        <div class="player-header">
                            <div class="player-name" id="playerName"></div>
                            <div class="player-position" id="playerPosition"></div>
                            <div class="player-team" id="playerTeam"></div>
                        </div>
                        <div class="player-stats-grid" id="playerStatsGrid"></div>
                    </div>
                </div>
                <div class="modal-progression-ui" id="playerProgressionUI"></div>
            </div>
        `;
        
        document.body.appendChild(this.modal);
        
        // Close modal when clicking X
        const closeBtn = this.modal.querySelector('.close');
        closeBtn.onclick = () => this.hideModal();
        
        // Close modal when clicking outside
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        };
    }

    setupEventListeners() {
        // Make all player rows clickable
        document.addEventListener('click', (e) => {
            if (e.target.closest('.player-row') || e.target.closest('tr[data-player-id]')) {
                const playerRow = e.target.closest('.player-row') || e.target.closest('tr[data-player-id]');
                const playerId = playerRow.dataset.playerId;
                if (playerId) {
                    this.showPlayerStats(playerId);
                }
            }
        });
    }

    cleanupStaleData() {
        // No-op for now
    }

    /**
     * Show stats for a player
     * @param {string} playerId - ID of the player
     */
    showPlayerStats(playerId) {
        if (!playerId) return;

        const L = window.state?.league;
        if (!L) return;

        let foundPlayer = null;
        let foundTeam = null;

        // Search in all teams
        if (L.teams) {
            for (const team of L.teams) {
                if (team.roster) {
                    const player = team.roster.find(p => p.id === playerId || String(p.id) === String(playerId));
                    if (player) {
                        foundPlayer = player;
                        foundTeam = team;
                        break;
                    }
                }
            }
        }

        // Search in free agents if not found
        if (!foundPlayer && L.freeAgents) {
            foundPlayer = L.freeAgents.find(p => p.id === playerId || String(p.id) === String(playerId));
            if (foundPlayer) {
                foundTeam = { name: 'Free Agent' };
            }
        }

        // Search in draft class
        if (!foundPlayer && window.state.draftClass) {
            foundPlayer = window.state.draftClass.find(p => p.id === playerId || String(p.id) === String(playerId));
            if (foundPlayer) {
                foundTeam = { name: 'Draft Prospect' };
            }
        }

        if (foundPlayer) {
            this.displayPlayerStats(foundPlayer, foundTeam);
            this.showModal();
        } else {
            console.warn('Player not found:', playerId);
        }
    }

    /**
     * Finds and displays player information and dynamically generated stats.
     */
    displayPlayerStats(player, team) {
        this.currentPlayer = player;
        
        // Update modal title and basic info
        document.getElementById('playerModalTitle').textContent = `${player.name} - Statistics`;
        document.getElementById('playerName').textContent = player.name;
        document.getElementById('playerPosition').textContent = player.pos || player.position || 'N/A';
        document.getElementById('playerTeam').textContent = team ? team.name : 'Unknown Team';

        // Generate stats grid based on position. PASSING TEAM HERE IS CRUCIAL FOR TRAINING POTENTIAL.
        const statsGrid = document.getElementById('playerStatsGrid');
        statsGrid.innerHTML = this.generateStatsHTML(player, team);

        // Generate and display the Skill Tree UI
        const progressionUI = document.getElementById('playerProgressionUI');
        progressionUI.innerHTML = this.generateProgressionUI(player);
    }

    /**
     * Renders player profile to a full-page view
     */
    renderToView(containerId, playerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const L = window.state?.league;
        if (!L) return;

        let foundPlayer = null;
        let foundTeam = null;

        // Search in all teams
        if (L.teams) {
            for (const team of L.teams) {
                if (team.roster) {
                    const player = team.roster.find(p => p.id === playerId || String(p.id) === String(playerId));
                    if (player) {
                        foundPlayer = player;
                        foundTeam = team;
                        break;
                    }
                }
            }
        }

        if (!foundPlayer && L.freeAgents) {
            foundPlayer = L.freeAgents.find(p => p.id === playerId || String(p.id) === String(playerId));
            if (foundPlayer) foundTeam = { name: 'Free Agent' };
        }

        if (!foundPlayer && window.state.draftClass) {
            foundPlayer = window.state.draftClass.find(p => p.id === playerId || String(p.id) === String(playerId));
            if (foundPlayer) foundTeam = { name: 'Draft Prospect' };
        }

        if (!foundPlayer) {
            container.innerHTML = '<div class="card"><h2>Player Not Found</h2><button class="btn" onclick="history.back()">Back</button></div>';
            return;
        }

        this.currentPlayer = foundPlayer;

        // Create full page layout
        let html = `
            <div class="card">
                <div class="row" style="align-items: center; margin-bottom: 1rem;">
                    <button class="btn" onclick="history.back()">← Back</button>
                    <div style="flex-grow: 1; text-align: center;">
                        <h2 style="margin: 0;">${foundPlayer.name}</h2>
                        <div class="text-muted">${foundPlayer.pos} • ${foundTeam ? foundTeam.name : 'N/A'}</div>
                    </div>
                    <div style="width: 60px;"></div> <!-- Spacer for balance -->
                </div>
            </div>
        `;

        // Stats Section
        html += `<div class="card mt">${this.generateStatsHTML(foundPlayer, foundTeam)}</div>`;

        // Progression Section
        html += `<div class="card mt">${this.generateProgressionUI(foundPlayer)}</div>`;

        container.innerHTML = html;

        // Bind progression buttons
        setTimeout(() => {
            container.querySelectorAll('.skill-buy-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const skillName = e.target.dataset.skill;
                    console.log(`Attempting to purchase: ${skillName}`);
                    if (window.setStatus) {
                        window.setStatus(`Placeholder: You bought ${skillName}!`);
                    }
                };
            });
        }, 100);
    }
    
    // ----------------------------------------------------
    // 🌳 NEW: Skill Tree UI Generation (For Display Only)
    // ----------------------------------------------------
    generateProgressionUI(player) {
        const prog = player.progression;
        // Check for SKILL_TREES global object
        const skillTree = SKILL_TREES?.[player.pos] || [];
        let html = '<div class="progression-panel">';

        html += `
            <h3 class="progression-header">🚀 Progression & Skill Tree</h3>
            <div class="xp-bar">
                <span class="xp-label">XP:</span> 
                <span class="xp-value">${prog?.xp || 0} / 1000</span>
                | 
                <span class="sp-label">Skill Points:</span>
                <span class="sp-value">${prog?.skillPoints || 0} SP</span>
            </div>
            <div class="progression-info">
                <div class="stats-row">
                    <span class="stat-label">Development Trait:</span>
                    <span class="stat-value">${player.devTrait || 'Normal'}</span>
                </div>
                <div class="stats-row">
                    <span class="stat-label">Potential (POT):</span>
                    <span class="stat-value">${player.potential || 'N/A'}</span>
                </div>
            </div>
            <hr>
            <h4>Available Upgrades (${player.pos} Tree)</h4>
        `;

        if (skillTree.length === 0) {
            html += '<p>No defined skill tree for this position. This player progresses passively.</p>';
        } else {
            html += '<ul class="skill-tree-list">';
            skillTree.forEach(skill => {
                const isPurchased = prog?.upgrades?.includes(skill.name);
                const statusClass = isPurchased ? 'skill-purchased' : 'skill-available';
                const buttonText = isPurchased ? 'Purchased' : `Buy (${skill.cost} SP)`;

                // Display Boosts nicely
                const boostString = Object.entries(skill.boosts).map(([stat, boost]) => 
                    `${this.formatRatingName(stat)} +${boost}`
                ).join(', ');

                html += `
                    <li class="${statusClass}">
                        <span class="skill-name">${skill.name}</span>
                        <span class="skill-boosts">(${boostString})</span>
                        <button class="skill-buy-btn" data-skill="${skill.name}" 
                                ${isPurchased || (prog?.skillPoints || 0) < skill.cost ? 'disabled' : ''}>
                            ${buttonText}
                        </button>
                    </li>
                `;
            });
            html += '</ul>';
            
            // Add handler for buying skills (example, requires back-end integration)
            setTimeout(() => {
                this.modal.querySelectorAll('.skill-buy-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        const skillName = e.target.dataset.skill;
                        console.log(`Attempting to purchase: ${skillName}`);
                        // Placeholder for game logic
                        if (window.setStatus) {
                            window.setStatus(`Placeholder: You bought ${skillName}!`);
                        } else {
                            // Use console.log as fallback if setStatus is unavailable
                            console.log(`Placeholder: You bought ${skillName}!`);
                        }
                        // Then reload player stats
                        // this.showPlayerStats(this.currentPlayer.id); 
                    };
                });
            }, 100);
        }
        
        html += '</div>';
        return html;
    }
    
    // ----------------------------------------------------
    // 🏆 Enhanced Stats Grid Generation
    // ----------------------------------------------------

    /**
     * Generates a positional stats table based on player position.
     * @param {Object} player - The player object.
     */
    generatePositionalStatsTable(player) {
        const pos = player.pos;
        const seasonStats = player.stats?.season || {};
        const careerStats = player.stats?.career || {};

        let columns = [];
        let seasonRow = [];
        let careerRow = [];

        // Helper to format values
        const fmt = (val) => (val !== undefined && val !== null) ? val.toLocaleString() : '0';
        const fmtPct = (val) => {
            if (val === undefined || val === null) return '0.0%';
            if (typeof val === 'string' && val.includes('%')) return val;
            if (val <= 1 && val > 0) return (val * 100).toFixed(1) + '%';
            return val.toFixed(1) + '%';
        };
        const fmtAvg = (val) => (val !== undefined && val !== null) ? val.toFixed(1) : '0.0';

        if (pos === 'QB') {
            columns = ['Pass Yds', 'TD', 'INT', 'Comp %', 'Rating', 'Rush Yds', 'Rush TD'];

            const getQBData = (s) => [
                fmt(s.passYd),
                fmt(s.passTD),
                fmt(s.interceptions || s.passInt),
                fmtPct(s.completionPct),
                fmtAvg(s.passerRating),
                fmt(s.rushYd),
                fmt(s.rushTD)
            ];

            seasonRow = getQBData(seasonStats);
            careerRow = getQBData(careerStats);

        } else if (['RB', 'WR', 'TE'].includes(pos)) {
            columns = ['Rush Yds', 'Rush TD', 'Avg/Carry', 'Rec Yds', 'Rec TD', 'Avg/Rec', 'Targets', 'Catch %', 'Drop %', 'Rating'];

            const getSkillData = (s) => [
                fmt(s.rushYd),
                fmt(s.rushTD),
                fmtAvg(s.yardsPerCarry),
                fmt(s.recYd),
                fmt(s.recTD),
                fmtAvg(s.yardsPerReception),
                fmt(s.targets),
                fmtPct(s.catchPct || (s.targets > 0 ? s.receptions / s.targets : 0)),
                fmtPct(s.dropRate),
                fmtAvg(s.ratingWhenTargeted)
            ];

            seasonRow = getSkillData(seasonStats);
            careerRow = getSkillData(careerStats);

        } else if (['DL', 'LB', 'CB', 'S', 'DE', 'DT', 'OLB', 'MLB'].includes(pos)) {
            columns = ['Tackles', 'Sacks', 'INT', 'FF', 'PD', 'TFL', 'Pres %', 'Cmp % All', 'Cov Rtg'];

            const getDefData = (s) => [
                fmt(s.tackles),
                fmt(s.sacks),
                fmt(s.interceptions),
                fmt(s.forcedFumbles),
                fmt(s.passesDefended),
                fmt(s.tacklesForLoss),
                fmtPct(s.pressureRate),
                s.targetsAllowed > 0 ? fmtPct(s.completionsAllowed / s.targetsAllowed) : '0.0%',
                fmtAvg(s.coverageRating)
            ];

            seasonRow = getDefData(seasonStats);
            careerRow = getDefData(careerStats);

        } else if (['K', 'P'].includes(pos)) {
            columns = ['FGM', 'FGA', 'FG%', 'XPM', 'XPA', 'Long'];
            if (pos === 'P') columns = ['Punts', 'Yards', 'Avg', 'Long', 'Inside 20'];

            if (pos === 'K') {
                const getKData = (s) => [
                    fmt(s.fgMade), fmt(s.fgAttempts), fmtPct(s.successPct),
                    fmt(s.xpMade), fmt(s.xpAttempts), fmt(s.longestFG)
                ];
                seasonRow = getKData(seasonStats);
                careerRow = getKData(careerStats);
            } else {
                const getPData = (s) => [
                    fmt(s.punts), fmt(s.puntYards), fmtAvg(s.avgPuntYards),
                    fmt(s.longestPunt), fmt(s.puntsInside20)
                ];
                seasonRow = getPData(seasonStats);
                careerRow = getPData(careerStats);
            }
        } else {
            // OL or Default
            columns = ['Games', 'Sacks All.', 'Pancakes'];
            const getOLData = (s) => [
                fmt(s.gamesPlayed), fmt(s.sacksAllowed), fmt(s.pancakes)
            ];
            seasonRow = getOLData(seasonStats);
            careerRow = getOLData(careerStats);
        }

        // Build Table HTML
        let html = `
            <div class="table-wrapper">
                <table class="table table-sm" style="width:100%; text-align: center;">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Period</th>
                            ${columns.map(c => `<th>${c}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="text-align: left; font-weight:bold;">Season</td>
                            ${seasonRow.map(v => `<td>${v}</td>`).join('')}
                        </tr>
                        <tr>
                            <td style="text-align: left; font-weight:bold;">Career</td>
                            ${careerRow.map(v => `<td>${v}</td>`).join('')}
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        return html;
    }

    /**
     * Generates Injury History & Assessment HTML
     */
    generateInjuryHTML(player) {
        if (!player) return '';
        // Ensure injuryHistory exists
        if (!player.injuryHistory) player.injuryHistory = [];

        const assessment = window.getInjuryPronenessAssessment ? window.getInjuryPronenessAssessment(player) : null;
        if (!assessment) return '';

        let html = `
            <div class="stats-section">
                <h3>🚑 Injury History & Assessment</h3>
                <div class="injury-assessment" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                    <div class="stats-row">
                        <span class="stat-label">Proneness:</span>
                        <span class="stat-value" style="font-weight: bold;">${assessment.level}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stat-label">Avg Weeks/Injury:</span>
                        <span class="stat-value">${assessment.averageWeeksPerInjury}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stat-label">Total Injuries:</span>
                        <span class="stat-value">${assessment.totalInjuries}</span>
                    </div>
                </div>
                <p class="text-muted small mt-2" style="margin-bottom: 10px; font-style: italic;">${assessment.recommendation}</p>
        `;

        if (player.injuryHistory.length > 0) {
            html += `
                <div class="table-wrapper">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Year</th>
                                <th>Type</th>
                                <th>Severity</th>
                                <th>Weeks</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${player.injuryHistory.slice().reverse().map(injury => `
                                <tr>
                                    <td>${injury.year || 'N/A'}</td>
                                    <td>${injury.type}</td>
                                    <td>${injury.severity}</td>
                                    <td>${injury.weeks}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            html += '<p class="muted small">No recorded injuries.</p>';
        }

        html += '</div>';
        return html;
    }

    /**
     * Generates the main stats grid content.
     * @param {Object} player - The player object.
     * @param {Object} team - The team object (needed for training calculation).
     */
    generateStatsHTML(player, team) {
        let statsHTML = '';
        
        // Basic player info and contract...
        const salary = player.contract?.salary || player.baseAnnual || player.salary || 0;
        const years = player.contract?.years || player.years || player.yearsTotal || 'N/A';
        
        // Section 1: Player Info & Contract 
        statsHTML += `
            <div class="stats-section">
                <h3>Player Information</h3>
                <div class="stats-row"><span class="stat-label">Age:</span><span class="stat-value">${player.age || 'N/A'}</span></div>
                <div class="stats-row"><span class="stat-label">College:</span><span class="stat-value">${player.college || 'N/A'}</span></div>
                <div class="stats-row"><span class="stat-label">Injury:</span><span class="stat-value">${player.injuryWeeks > 0 ? `${player.injuryWeeks} weeks` : 'Healthy'}</span></div>
                <div class="stats-row"><span class="stat-label">Morale:</span><span class="stat-value">${player.morale || 'N/A'}%</span></div>
            </div>
        `;
        
        if (salary > 0 || years !== 'N/A') {
             statsHTML += `
                <div class="stats-section">
                    <h3>Contract</h3>
                    <div class="stats-row"><span class="stat-label">Annual Salary:</span><span class="stat-value">$${salary.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M</span></div>
                    <div class="stats-row"><span class="stat-label">Years Remaining:</span><span class="stat-value">${years}</span></div>
                    <div class="stats-row"><span class="stat-label">Signing Bonus:</span><span class="stat-value">$${(player.signingBonus || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M</span></div>
                </div>
            `;
        }

        // Section 1.5: Injury History & Assessment
        statsHTML += this.generateInjuryHTML(player);

        // Section 2: Player Ratings/Attributes 
        if (player.ratings) {
            statsHTML += `
                <div class="stats-section">
                    <h3>Player Ratings (${player.ovr || '??'} OVR)</h3>
                    <div class="ratings-grid">
            `;
            
            Object.entries(player.ratings).forEach(([rating, value]) => {
                if (typeof value === 'number') {
                    const ratingClass = value >= 80 ? 'rating-high' : value >= 70 ? 'rating-medium' : 'rating-low';
                    statsHTML += `
                        <div class="rating-item">
                            <span class="rating-name">${this.formatRatingName(rating)}</span>
                            <span class="rating-value ${ratingClass}">${Math.round(value)}</span>
                        </div>
                    `;
                }
            });
            
            statsHTML += `
                    </div>
                </div>
            `;
        }
        
        // SECTION 2.5: NEW - Weekly Training Potential
        statsHTML += this.generateTrainingPotentialHTML(player, team);

        // Section 3: Legacy Metrics
        if (player.legacy?.metrics) {
            const m = player.legacy.metrics;
            statsHTML += `
                <div class="stats-section">
                    <h3>🏆 Legacy Metrics</h3>
                    <div class="legacy-metrics">
                        <div class="stats-row"><span class="stat-label">Legacy Score:</span><span class="stat-value">${m.legacyScore || 0}</span></div>
                        <div class="stats-row"><span class="stat-label">Impact Score:</span><span class="stat-value">${m.impactScore || 0}</span></div>
                        <div class="stats-row"><span class="stat-label">Peak Score:</span><span class="stat-value">${m.peakScore || 0}</span></div>
                        <div class="stats-row"><span class="stat-label">Clutch Score:</span><span class="stat-value">${m.clutchScore || 0}</span></div>
                        <div class="stats-row"><span class="stat-label">Durability:</span><span class="stat-value">${player.legacy.healthRecord?.durabilityRating || 100}%</span></div>
                    </div>
                </div>
            `;
        }

        // Section 4: Abilities & Awards
        statsHTML += `
            <div class="stats-section">
                <h3>Abilities & Awards</h3>
                <div class="abilities-list">
                    <p class="list-title">Abilities:</p>
                    ${(player.abilities && player.abilities.length > 0) ? 
                        player.abilities.map(a => `<span class="ability-tag">${a}</span>`).join('') : '<span class="ability-tag">None</span>'}
                    
                    <p class="list-title">Career Awards:</p>
                    ${(player.awards && player.awards.length > 0) ? 
                        player.awards.map(a => `<span class="award-tag">${a.year}: ${a.award}</span>`).join('') : '<span class="award-tag">None</span>'}
                </div>
            </div>
        `;

        // Section 5: Statistics (Season/Career) - Positional Table
        if (player.stats && (Object.keys(player.stats.season || {}).length > 0 || Object.keys(player.stats.career || {}).length > 0)) {
            statsHTML += `
                <div class="stats-section full-width">
                    <h3>Performance Stats (${player.pos})</h3>
                    ${this.generatePositionalStatsTable(player)}
                </div>
            `;
        }

        // Section 5.5: Weekly Stats Breakdown
        const weeklyStats = this.getWeeklyStats(player);
        if (weeklyStats.length > 0) {
            statsHTML += `
                <div class="stats-section full-width">
                    <h3>📊 Weekly Performance Breakdown</h3>
                    <div class="weekly-stats-container">
                        <div class="weekly-stats-table">
                            <div class="weekly-stats-header">
                                <span>Week</span>
                                <span>Opponent</span>
                                <span>Result</span>
                                <span>Stats Summary</span>
                            </div>
            `;
            
            weeklyStats.forEach(weekData => {
                statsHTML += `
                    <div class="weekly-stats-row">
                        <span class="week-number">${weekData.week}</span>
                        <span class="opponent">${weekData.opponent || 'N/A'}</span>
                        <span class="result ${weekData.result || ''}">${weekData.result || '—'}</span>
                        <span class="stats-summary">${weekData.summary}</span>
                    </div>
                `;
            });
            
            statsHTML += `
                        </div>
                    </div>
                </div>
            `;
        }


        // Section 6: Milestones (from Legacy)
        if (player.legacy?.milestones && player.legacy.milestones.length > 0) {
             statsHTML += `
                <div class="stats-section full-width">
                    <h3>✨ Milestones</h3>
                    <ul class="milestone-list">
                        ${player.legacy.milestones.map(m => 
                            `<li class="rarity-${m.rarity?.toLowerCase() || 'common'}">${m.description} (${m.year})</li>`
                        ).join('')}
                    </ul>
                </div>
            `;
        }

        return statsHTML;
    }

    /**
     * NEW: Generates the HTML for Weekly Training Potential using the global helper.
     * @param {Object} player - The player object.
     * @param {Object} team - The team object (required for coach skill).
     */
    generateTrainingPotentialHTML(player, team) {
        // Guard check: ensure the required function is loaded from training-fixed.js
        if (!window.getTrainingSuccessRate || !window.Constants) {
            return '';
        }

        // A curated list of common trainable stats to display
        const coreTrainableStats = [
            'speed', 'acceleration', 'agility', 'awareness', 'intelligence', 
            'strength', 'catching', 'throwPower', 'coverage'
        ];
        
        let trainingHTML = '';
        let statsFound = false;

        coreTrainableStats.forEach(stat => {
            // Only show the stat if the player actually has a rating for it
            const currentRating = player.ratings?.[stat] || player[stat];
            if (typeof currentRating !== 'number' || currentRating <= 0) {
                return;
            }

            const maxOVR = window.Constants.PLAYER_CONFIG.MAX_OVR;

            // Don't show training potential if already maxed out
            if (currentRating >= maxOVR) {
                trainingHTML += `
                    <div class="rating-item rating-maxed">
                        <span class="rating-name">${this.formatRatingName(stat)}</span>
                        <span class="rating-value">MAXED!</span>
                    </div>
                `;
                statsFound = true;
                return;
            }

            // Use the global function to get the success chance
            const successRate = window.getTrainingSuccessRate(player, stat, team);
            
            let colorClass;
            if (successRate >= 80) {
                colorClass = 'rating-high'; // Great chance
            } else if (successRate >= 60) {
                colorClass = 'rating-medium'; // Good chance
            } else {
                colorClass = 'rating-low'; // Challenging chance
            }

            trainingHTML += `
                <div class="rating-item">
                    <span class="rating-name">${this.formatRatingName(stat)}</span>
                    <span class="rating-value ${colorClass}">${successRate}%</span>
                </div>
            `;
            statsFound = true;
        });

        if (!statsFound) {
            return '';
        }
        
        // Wrap the results in the stats section structure
        return `
            <div class="stats-section">
                <h3>⚡ Weekly Training Potential</h3>
                <div class="ratings-grid">
                    ${trainingHTML}
                </div>
                <div class="muted small mt-2 p-1 bg-blue-50 border-l-4 border-blue-400">
                    * Percent chance this skill will improve if selected for this week's team training.
                </div>
            </div>
        `;
    }


    formatRatingName(rating) {
        const ratingNames = {
            'throwPower': 'Throw Power', 'throwAccuracy': 'Throw Acc',
            'speed': 'Speed', 'acceleration': 'Accel', 'agility': 'Agility',
            'awareness': 'Awareness', 'intelligence': 'IQ',
            'catching': 'Catching', 'catchInTraffic': 'Traffic Catch',
            'trucking': 'Trucking', 'juking': 'Juking',
            'passRushSpeed': 'PR Speed', 'passRushPower': 'PR Power',
            'runStop': 'Run Stop', 'coverage': 'Coverage',
            'runBlock': 'Run Block', 'passBlock': 'Pass Block',
            'kickPower': 'Kick Power', 'kickAccuracy': 'Kick Acc'
        };
        return ratingNames[rating] || rating.charAt(0).toUpperCase() + rating.slice(1);
    }

    formatStatName(stat) {
        // Simple capitalization/spacing for stats like 'yardsPassing', 'tacklesTotal'
        return stat.replace(/([A-Z])/g, ' $1').trim().replace(/\b(\w)/g, l => l.toUpperCase());
    }

    formatStatValue(stat, value) {
        // Format based on known types (e.g., decimal for percentages, rounds for others)
        if (stat.includes('Pct') || stat.includes('Percent')) {
            return `${(value * 100).toFixed(1)}%`;
        }
        if (Number.isInteger(value)) {
            return value.toLocaleString();
        }
        return value.toFixed(1);
    }

    /**
     * Get weekly stats breakdown from game results
     * @param {Object} player - Player object
     * @returns {Array} Array of weekly stat objects
     */
    getWeeklyStats(player) {
        const weeklyData = [];
        const L = window.state?.league;
        if (!L || !L.resultsByWeek || !player.id) return weeklyData;

        // Find player's team
        let playerTeam = null;
        let playerTeamId = null;
        for (const team of L.teams || []) {
            if (team.roster) {
                const foundPlayer = team.roster.find(p => p.id === player.id);
                if (foundPlayer) {
                    playerTeam = team;
                    playerTeamId = team.id;
                    break;
                }
            }
        }
        if (!playerTeam) return weeklyData;

        // Iterate through all weeks
        const maxWeek = Math.min(18, Object.keys(L.resultsByWeek).length);
        for (let week = 1; week <= maxWeek; week++) {
            const weekResults = L.resultsByWeek[week - 1];
            if (!weekResults || !Array.isArray(weekResults)) continue;

            // Find games this player's team played
            for (const gameResult of weekResults) {
                if (!gameResult || !gameResult.boxScore) continue;
                
                const isHome = gameResult.home === playerTeamId;
                const isAway = gameResult.away === playerTeamId;
                if (!isHome && !isAway) continue;

                const side = isHome ? 'home' : 'away';
                const opponentId = isHome ? gameResult.away : gameResult.home;
                const opponent = L.teams[opponentId];
                const opponentName = opponent ? opponent.abbr : 'N/A';

                // Find player in box score
                const playerStats = gameResult.boxScore[side];
                if (!playerStats) continue;

                let found = false;
                for (const playerId in playerStats) {
                    const pData = playerStats[playerId];
                    if (pData && (pData.id === player.id || pData.name === player.name)) {
                        found = true;
                        const stats = pData.stats || {};
                        const summary = this.formatPlayerGameSummary(player.pos, stats);
                        
                        // Determine result
                        let result = '';
                        if (gameResult.scoreHome !== undefined && gameResult.scoreAway !== undefined) {
                            const teamScore = isHome ? gameResult.scoreHome : gameResult.scoreAway;
                            const oppScore = isHome ? gameResult.scoreAway : gameResult.scoreHome;
                            result = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T';
                        }

                        weeklyData.push({
                            week: week,
                            opponent: opponentName,
                            result: result,
                            summary: summary,
                            stats: stats
                        });
                        break;
                    }
                }
                if (found) break; // Only count one game per week
            }
        }

        return weeklyData;
    }

    /**
     * Format a summary of player stats for a single game
     * @param {string} position - Player position
     * @param {Object} stats - Game stats object
     * @returns {string} Formatted summary
     */
    formatPlayerGameSummary(position, stats) {
        const summaries = [];

        if (position === 'QB') {
            if (stats.passYd !== undefined) summaries.push(`${stats.passYd} pass yds`);
            if (stats.passTD !== undefined && stats.passTD > 0) summaries.push(`${stats.passTD} TD`);
            if (stats.passInt !== undefined && stats.passInt > 0) summaries.push(`${stats.passInt} INT`);
            if (stats.rushYd !== undefined && stats.rushYd > 0) summaries.push(`${stats.rushYd} rush yds`);
        } else if (position === 'RB') {
            if (stats.rushYd !== undefined) summaries.push(`${stats.rushYd} rush yds`);
            if (stats.rushTD !== undefined && stats.rushTD > 0) summaries.push(`${stats.rushTD} TD`);
            if (stats.recYd !== undefined && stats.recYd > 0) summaries.push(`${stats.recYd} rec yds`);
        } else if (['WR', 'TE'].includes(position)) {
            if (stats.recYd !== undefined) summaries.push(`${stats.recYd} rec yds`);
            if (stats.recTD !== undefined && stats.recTD > 0) summaries.push(`${stats.recTD} TD`);
            if (stats.receptions !== undefined && stats.receptions > 0) summaries.push(`${stats.receptions} rec`);
        } else if (['DL', 'LB'].includes(position)) {
            if (stats.tackles !== undefined && stats.tackles > 0) summaries.push(`${stats.tackles} tkl`);
            if (stats.sacks !== undefined && stats.sacks > 0) summaries.push(`${stats.sacks} sack`);
        } else if (['CB', 'S'].includes(position)) {
            if (stats.tackles !== undefined && stats.tackles > 0) summaries.push(`${stats.tackles} tkl`);
            if (stats.interceptions !== undefined && stats.interceptions > 0) summaries.push(`${stats.interceptions} INT`);
        } else if (position === 'K') {
            if (stats.fieldGoals !== undefined && stats.fieldGoals > 0) summaries.push(`${stats.fieldGoals} FG`);
            if (stats.extraPoints !== undefined && stats.extraPoints > 0) summaries.push(`${stats.extraPoints} XP`);
        }

        return summaries.length > 0 ? summaries.join(', ') : 'DNP';
    }
    
    showModal() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            this.modal.hidden = false;
        }
    }

    hideModal() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.modal.hidden = true;
        }
    }

    makePlayersClickable() {
        // Add pointer cursor to all rows with player-id
        const rows = document.querySelectorAll('tr[data-player-id], .player-row');
        rows.forEach(row => {
            row.style.cursor = 'pointer';
            row.classList.add('clickable-player');
        });
    }

    refreshClickablePlayers() {
        this.makePlayersClickable();
    }

    setupDOMObserver() {
        if (this.observer) this.disconnect();

        this.observer = new MutationObserver((mutations) => {
            let shouldRefresh = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    shouldRefresh = true;
                }
            });

            if (shouldRefresh) {
                this.makePlayersClickable();
            }
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    disconnect() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

}

// Initialize the player stats viewer
let playerStatsViewer;

function initializePlayerStatsViewer() {
    if (!playerStatsViewer) {
        playerStatsViewer = new PlayerStatsViewer();
        
        // Make functions globally available
        window.playerStatsViewer = playerStatsViewer;
        window.makePlayersClickable = () => playerStatsViewer?.makePlayersClickable();
        window.cleanupStalePlayerData = () => playerStatsViewer?.cleanupStaleData();
        window.refreshClickablePlayers = () => playerStatsViewer?.refreshClickablePlayers();
        
        // Add debug function
        window.debugPlayerStats = (playerId) => {
             // ... (UNCHANGED DEBUG LOGIC) ...
        };
        
        console.log('✅ PlayerStatsViewer initialized and enhanced with Training Potential');
    }
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePlayerStatsViewer);
} else {
    initializePlayerStatsViewer();
}

