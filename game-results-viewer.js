// game-results-viewer.js - Game Results Viewer System
'use strict';

/**
 * Game results viewer system
 * Makes last week games clickable and shows detailed game statistics
 */

class GameResultsViewer {
    constructor() {
        this.currentGame = null;
        this.modal = null;
        this.init();
    }

    init() {
        this.createModal();
        this.setupEventListeners();
    }

    createModal() {
        // Create modal for game results
        this.modal = document.createElement('div');
        this.modal.id = 'gameResultsModal';
        this.modal.className = 'modal';
        this.modal.hidden = true; // Ensure it's hidden by default
        this.modal.innerHTML = `
            <div class="modal-content game-results-modal">
                <div class="modal-header">
                    <h2 id="gameModalTitle">Game Results</h2>
                    <button type="button" class="close" aria-label="Close modal">&times;</button>
                </div>
                <div class="modal-body" id="gameModalBody">
                    <div class="game-info">
                        <div class="game-header">
                            <div class="game-teams" id="gameTeams"></div>
                            <div class="game-score" id="gameScore"></div>
                            <div class="game-week" id="gameWeek"></div>
                        </div>
                        <div class="game-stats-grid" id="gameStatsGrid"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Set initial styles to ensure it's hidden
        this.modal.style.display = 'none';
        this.modal.style.visibility = 'hidden';
        this.modal.style.opacity = '0';
        
        document.body.appendChild(this.modal);
        
        // Close modal when clicking X (multiple event handlers for reliability)
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) {
            // Remove any existing handlers
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            
            // Add multiple event handlers for cross-platform compatibility
            newCloseBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                console.log('✅ Close button clicked');
                this.hideModal();
                return false;
            };
            
            newCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                console.log('✅ Close button clicked (addEventListener)');
                this.hideModal();
                return false;
            }, true);
            
            // Touch events for mobile
            newCloseBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('✅ Close button touched');
                this.hideModal();
                return false;
            }, { passive: false });
        }
        
        // Close modal when clicking outside (backdrop)
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                console.log('✅ Modal backdrop clicked');
                this.hideModal();
            }
        };
        
        // Close modal with Escape key
        this.escapeHandler = (e) => {
            if (e.key === 'Escape' && this.modal && !this.modal.hidden) {
                console.log('✅ Escape key pressed');
                this.hideModal();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);
    }

    setupEventListeners() {
        // Make all game result items clickable (only if game is ready)
        document.addEventListener('click', (e) => {
            // Don't process clicks if game isn't ready
            if (!window.state?.league || !window.state?.onboarded) {
                return;
            }
            
            if (e.target.closest('.result-item') || e.target.closest('.game-result')) {
                const gameItem = e.target.closest('.result-item') || e.target.closest('.game-result');
                // Don't open if clicking on buttons or inputs
                if (e.target.closest('button') || e.target.closest('input')) {
                    return;
                }
                const gameData = this.extractGameData(gameItem);
                if (gameData) {
                    this.showGameResults(gameData);
                }
            }
        });
    }

    extractGameData(gameItem) {
        // Try to extract game data from the DOM element
        const gameData = {
            homeTeam: null,
            awayTeam: null,
            homeScore: null,
            awayScore: null,
            week: null,
            date: null
        };

        // Look for team names and scores in the text content
        const text = gameItem.textContent;
        
        // Common patterns for game results
        const patterns = [
            // Pattern: "Team A 24 - Team B 17"
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d+)\s*-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d+)/,
            // Pattern: "Team A vs Team B: 24-17"
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+vs\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):\s*(\d+)-(\d+)/,
            // Pattern: "Team A defeats Team B 24-17"
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+defeats?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d+)-(\d+)/
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                gameData.homeTeam = match[1];
                gameData.awayTeam = match[2];
                gameData.homeScore = parseInt(match[3]);
                gameData.awayScore = parseInt(match[4]);
                break;
            }
        }

        // Try to get week from parent elements or data attributes
        const weekElement = gameItem.closest('[data-week]') || gameItem.querySelector('[data-week]');
        if (weekElement) {
            gameData.week = weekElement.dataset.week;
        }

        // If we found valid game data, return it
        if (gameData.homeTeam && gameData.awayTeam && 
            gameData.homeScore !== null && gameData.awayScore !== null) {
            return gameData;
        }

        return null;
    }

    showGameResults(gameData) {
        // Only show if we have valid game data and modal exists
        if (!gameData || !this.modal) {
            console.warn('Cannot show game results: missing data or modal');
            return;
        }
        
        // Don't show if game isn't ready
        if (!window.state?.league || !window.state?.onboarded) {
            console.warn('Cannot show game results: game not ready');
            return;
        }
        
        this.currentGame = gameData;
        this.displayGameResults(gameData);
        this.showModal();
    }

    displayGameResults(gameData) {
        // Update modal title and basic info
        document.getElementById('gameModalTitle').textContent = 'Game Results';
        
        const homeTeam = gameData.homeTeam;
        const awayTeam = gameData.awayTeam;
        const homeScore = gameData.homeScore;
        const awayScore = gameData.awayScore;
        
        // Determine winner
        const homeWin = homeScore > awayScore;
        const awayWin = awayScore > homeScore;
        const tie = homeScore === awayScore;
        
        // Update game header
        document.getElementById('gameTeams').innerHTML = `
            <div class="team ${homeWin ? 'winner' : ''}">${homeTeam}</div>
            <div class="vs">vs</div>
            <div class="team ${awayWin ? 'winner' : ''}">${awayTeam}</div>
        `;
        
        document.getElementById('gameScore').innerHTML = `
            <div class="score ${homeWin ? 'winner' : ''}">${homeScore}</div>
            <div class="score-separator">-</div>
            <div class="score ${awayWin ? 'winner' : ''}">${awayScore}</div>
        `;
        
        if (gameData.week) {
            document.getElementById('gameWeek').textContent = `Week ${gameData.week}`;
        }

        // Generate game stats
        const statsGrid = document.getElementById('gameStatsGrid');
        statsGrid.innerHTML = this.generateGameStatsHTML(gameData);
    }

    generateGameStatsHTML(gameData) {
        const homeTeam = gameData.homeTeam;
        const awayTeam = gameData.awayTeam;
        const homeScore = gameData.homeScore;
        const awayScore = gameData.awayScore;
        
        // Calculate some basic stats
        const totalPoints = homeScore + awayScore;
        const pointDifference = Math.abs(homeScore - awayScore);
        const isCloseGame = pointDifference <= 7;
        const isBlowout = pointDifference >= 21;
        
        let statsHTML = '';
        
        // Game summary
        statsHTML += `
            <div class="stats-section">
                <h3>Game Summary</h3>
                <div class="stats-row">
                    <span class="stat-label">Total Points:</span>
                    <span class="stat-value">${totalPoints}</span>
                </div>
                <div class="stats-row">
                    <span class="stat-label">Point Difference:</span>
                    <span class="stat-value">${pointDifference}</span>
                </div>
                <div class="stats-row">
                    <span class="stat-label">Game Type:</span>
                    <span class="stat-value">${isBlowout ? 'Blowout' : isCloseGame ? 'Close Game' : 'Competitive'}</span>
                </div>
            </div>
        `;

        // Team performance
        statsHTML += `
            <div class="stats-section">
                <h3>Team Performance</h3>
                <div class="team-performance">
                    <div class="team-stats">
                        <h4>${homeTeam}</h4>
                        <div class="stats-row">
                            <span class="stat-label">Score:</span>
                            <span class="stat-value">${homeScore}</span>
                        </div>
                        <div class="stats-row">
                            <span class="stat-label">Result:</span>
                            <span class="stat-value ${homeScore > awayScore ? 'winner' : ''}">${homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'T'}</span>
                        </div>
                    </div>
                    <div class="team-stats">
                        <h4>${awayTeam}</h4>
                        <div class="stats-row">
                            <span class="stat-label">Score:</span>
                            <span class="stat-value">${awayScore}</span>
                        </div>
                        <div class="stats-row">
                            <span class="stat-label">Result:</span>
                            <span class="stat-value ${awayScore > homeScore ? 'winner' : ''}">${awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'T'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Try to get detailed stats from league data
        const L = window.state?.league;
        if (L && L.resultsByWeek) {
            const detailedStats = this.getDetailedGameStats(L, homeTeam, awayTeam);
            if (detailedStats) {
                statsHTML += `
                    <div class="stats-section">
                        <h3>Detailed Statistics</h3>
                        <div class="detailed-stats">
                            ${this.renderDetailedStats(detailedStats)}
                        </div>
                    </div>
                `;
            }
        }

        return statsHTML;
    }

    getDetailedGameStats(league, homeTeam, awayTeam) {
        // Look through league results to find this specific game
        if (!league.resultsByWeek) return null;
        
        for (const weekResults of Object.values(league.resultsByWeek)) {
            if (Array.isArray(weekResults)) {
                for (const result of weekResults) {
                    if (result.home && result.away) {
                        const homeTeamName = this.getTeamNameById(league, result.home);
                        const awayTeamName = this.getTeamNameById(league, result.away);
                        
                        if ((homeTeamName === homeTeam && awayTeamName === awayTeam) ||
                            (homeTeamName === awayTeam && awayTeamName === homeTeam)) {
                            return result;
                        }
                    }
                }
            }
        }
        
        return null;
    }

    getTeamNameById(league, teamId) {
        if (league.teams && league.teams[teamId]) {
            return league.teams[teamId].name;
        }
        return null;
    }

    renderDetailedStats(gameResult) {
        if (!gameResult) return '';
        
        let statsHTML = '';
        
        // Offensive stats
        if (gameResult.homeStats || gameResult.awayStats) {
            statsHTML += '<h4>Offensive Statistics</h4>';
            
            if (gameResult.homeStats) {
                statsHTML += `
                    <div class="team-detailed-stats">
                        <h5>${this.getTeamNameById(window.state?.league, gameResult.home)}</h5>
                        <div class="stats-grid">
                            ${this.renderTeamStats(gameResult.homeStats)}
                        </div>
                    </div>
                `;
            }
            
            if (gameResult.awayStats) {
                statsHTML += `
                    <div class="team-detailed-stats">
                        <h5>${this.getTeamNameById(window.state?.league, gameResult.away)}</h5>
                        <div class="stats-grid">
                            ${this.renderTeamStats(gameResult.awayStats)}
                        </div>
                    </div>
                `;
            }
        }
        
        return statsHTML;
    }

    renderTeamStats(teamStats) {
        let statsHTML = '';
        
        const statCategories = {
            'Passing': ['passYards', 'passTDs', 'passInts', 'sacks'],
            'Rushing': ['rushYards', 'rushTDs', 'rushAttempts'],
            'Receiving': ['recYards', 'recTDs', 'receptions'],
            'Defense': ['tackles', 'sacks', 'interceptions', 'fumbles'],
            'Special Teams': ['fieldGoals', 'extraPoints', 'punts', 'kickoffYards']
        };
        
        Object.entries(statCategories).forEach(([category, stats]) => {
            const categoryStats = stats.filter(stat => teamStats[stat] !== undefined);
            if (categoryStats.length > 0) {
                statsHTML += `
                    <div class="stat-category">
                        <h6>${category}</h6>
                        ${categoryStats.map(stat => `
                            <div class="stat-item">
                                <span class="stat-name">${this.formatStatName(stat)}:</span>
                                <span class="stat-value">${teamStats[stat]}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        });
        
        return statsHTML;
    }

    formatStatName(stat) {
        const statNames = {
            'passYards': 'Pass Yards',
            'passTDs': 'Pass TDs',
            'passInts': 'Interceptions',
            'sacks': 'Sacks',
            'rushYards': 'Rush Yards',
            'rushTDs': 'Rush TDs',
            'rushAttempts': 'Rush Attempts',
            'recYards': 'Rec Yards',
            'recTDs': 'Rec TDs',
            'receptions': 'Receptions',
            'tackles': 'Tackles',
            'fumbles': 'Fumbles',
            'fieldGoals': 'Field Goals',
            'extraPoints': 'Extra Points',
            'punts': 'Punts',
            'kickoffYards': 'Kickoff Yards'
        };
        return statNames[stat] || stat.charAt(0).toUpperCase() + stat.slice(1);
    }

    showModal() {
        if (!this.modal) return;
        
        // Don't show if game isn't ready
        if (!window.state?.league || !window.state?.onboarded) {
            console.warn('Cannot show game results modal: game not ready');
            return;
        }
        
        console.log('📊 Showing game results modal');
        this.modal.hidden = false;
        this.modal.style.display = 'flex';
        this.modal.style.visibility = 'visible';
        this.modal.style.opacity = '1';
        this.modal.style.pointerEvents = 'auto';
        this.modal.style.zIndex = '10000';
        document.body.style.overflow = 'hidden';
        
        // Focus the close button for accessibility
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) {
            setTimeout(() => {
                try {
                    closeBtn.focus();
                } catch (e) {
                    // Focus might fail on some mobile browsers, that's okay
                }
            }, 100);
        }
    }

    hideModal() {
        if (!this.modal) return;
        console.log('🔒 Hiding game results modal');
        this.modal.hidden = true;
        this.modal.style.display = 'none';
        this.modal.style.visibility = 'hidden';
        this.modal.style.opacity = '0';
        this.modal.style.pointerEvents = 'none';
        document.body.style.overflow = 'auto';
        this.currentGame = null;
        
        // Remove focus from modal
        if (document.activeElement && this.modal.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        
        // Dispatch custom event for other systems
        window.dispatchEvent(new CustomEvent('gameResultsModalClosed'));
    }

    makeGameResultsClickable() {
        // Only make clickable if game is ready
        if (!window.state?.league || !window.state?.onboarded) {
            return;
        }
        
        // Add click handlers to all game result items
        const gameResults = document.querySelectorAll('.result-item, .game-result');
        gameResults.forEach(item => {
            if (!item.classList.contains('clickable')) {
                item.classList.add('clickable');
                item.style.cursor = 'pointer';
                item.addEventListener('click', (e) => {
                    // Don't process if clicking buttons or inputs
                    if (e.target.closest('button') || e.target.closest('input')) {
                        return;
                    }
                    // Only show if game is ready
                    if (!window.state?.league || !window.state?.onboarded) {
                        return;
                    }
                    const gameData = this.extractGameData(item);
                    if (gameData) {
                        this.showGameResults(gameData);
                    }
                });
            }
        });
    }
    
    // Cleanup method
    destroy() {
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
        }
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
    }
}

// Initialize the game results viewer
let gameResultsViewer;

// Only initialize if DOM is ready, and ensure modal is hidden
function initializeGameResultsViewer() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            gameResultsViewer = new GameResultsViewer();
            // Ensure modal is hidden on initialization
            if (gameResultsViewer && gameResultsViewer.modal) {
                gameResultsViewer.hideModal();
            }
        });
    } else {
        gameResultsViewer = new GameResultsViewer();
        // Ensure modal is hidden on initialization
        if (gameResultsViewer && gameResultsViewer.modal) {
            gameResultsViewer.hideModal();
        }
    }
}

// Initialize after a short delay to ensure everything is loaded
setTimeout(initializeGameResultsViewer, 100);

// Make function globally available
window.gameResultsViewer = gameResultsViewer;
window.makeGameResultsClickable = () => gameResultsViewer?.makeGameResultsClickable();

// Ensure modal is hidden on page load and stays hidden
window.addEventListener('load', () => {
    if (gameResultsViewer && gameResultsViewer.modal) {
        gameResultsViewer.hideModal();
    }
});

// Also ensure it's hidden after a delay (in case something tries to show it)
setTimeout(() => {
    if (gameResultsViewer && gameResultsViewer.modal && !gameResultsViewer.modal.hidden) {
        console.log('🔒 Forcing game results modal to close on startup');
        gameResultsViewer.hideModal();
    }
}, 1000);
