// schedule-viewer.js - Schedule Viewer System
'use strict';

/**
 * Schedule viewer system
 * Shows full schedule and allows viewing previous game statistics
 */

class ScheduleViewer {
    constructor() {
        this.currentView = 'schedule';
        this.currentWeek = 1;
        this.init();
    }

    init() {
        this.createScheduleView();
        this.setupEventListeners();
    }

    createScheduleView() {
        // Add schedule view to the main content area
        const scheduleSection = document.querySelector('#standings');
        if (scheduleSection) {
            const scheduleView = document.createElement('div');
            scheduleView.id = 'scheduleView';
            scheduleView.className = 'schedule-view';
            scheduleView.innerHTML = `
                <div class="card">
                    <div class="schedule-header">
                        <h2>Season Schedule</h2>
                        <div class="schedule-controls">
                            <div class="view-toggle">
                                <button class="btn ${this.currentView === 'schedule' ? 'active' : ''}" data-view="schedule">Schedule</button>
                                <button class="btn ${this.currentView === 'results' ? 'active' : ''}" data-view="results">Results</button>
                            </div>
                            <div class="week-selector">
                                <label for="weekSelect">Week:</label>
                                <select id="weekSelect"></select>
                            </div>
                        </div>
                    </div>
                    <div class="schedule-content">
                        <div id="scheduleContent"></div>
                    </div>
                </div>
            `;
            
            scheduleSection.appendChild(scheduleView);
        }
    }

    setupEventListeners() {
        // View toggle buttons
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-view]')) {
                const view = e.target.dataset.view;
                this.switchView(view);
            }
        });

        // Week selector
        document.addEventListener('change', (e) => {
            if (e.target.id === 'weekSelect') {
                this.currentWeek = parseInt(e.target.value);
                this.renderContent();
            }
        });
    }

    switchView(view) {
        this.currentView = view;
        
        // Update button states
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        this.renderContent();
    }

    renderContent() {
        const contentDiv = document.getElementById('scheduleContent');
        if (!contentDiv) return;

        if (this.currentView === 'schedule') {
            contentDiv.innerHTML = this.renderSchedule();
        } else {
            contentDiv.innerHTML = this.renderResults();
        }
    }

    renderSchedule() {
        const L = state.league;
        if (!L || !L.schedule) {
            return '<p>No schedule data available.</p>';
        }

        let html = '<div class="schedule-grid">';
        
        // Render all weeks
        for (let week = 1; week <= 18; week++) {
            const weekData = L.schedule.weeks.find(w => w.weekNumber === week);
            if (weekData) {
                html += this.renderWeekSchedule(weekData, week);
            }
        }
        
        html += '</div>';
        return html;
    }

    renderWeekSchedule(weekData, weekNumber) {
        let html = `
            <div class="week-schedule ${weekNumber === this.currentWeek ? 'current-week' : ''}">
                <h3>Week ${weekNumber}</h3>
                <div class="games-list">
        `;

        if (weekData.games) {
            weekData.games.forEach(game => {
                if (game.bye) {
                    // Bye week
                    html += `
                        <div class="game-item bye-week">
                            <div class="bye-teams">
                                ${game.bye.map(teamId => {
                                    const team = this.getTeamById(teamId);
                                    return team ? team.name : 'Unknown Team';
                                }).join(', ')} - BYE
                            </div>
                        </div>
                    `;
                } else {
                    // Regular game
                    const homeTeam = this.getTeamById(game.home);
                    const awayTeam = this.getTeamById(game.away);
                    
                    if (homeTeam && awayTeam) {
                        html += `
                            <div class="game-item">
                                <div class="game-teams">
                                    <span class="away-team">${awayTeam.name}</span>
                                    <span class="at">@</span>
                                    <span class="home-team">${homeTeam.name}</span>
                                </div>
                                <div class="game-time">TBD</div>
                            </div>
                        `;
                    }
                }
            });
        }

        html += `
                </div>
            </div>
        `;
        
        return html;
    }

    renderResults() {
        const L = state.league;
        if (!L || !L.resultsByWeek) {
            return '<p>No game results available.</p>';
        }

        let html = '<div class="results-grid">';
        
        // Render all weeks with results
        for (let week = 1; week <= 18; week++) {
            const weekResults = L.resultsByWeek[week];
            if (weekResults && Array.isArray(weekResults)) {
                html += this.renderWeekResults(weekResults, week);
            }
        }
        
        html += '</div>';
        return html;
    }

    renderWeekResults(weekResults, weekNumber) {
        let html = `
            <div class="week-results ${weekNumber === this.currentWeek ? 'current-week' : ''}">
                <h3>Week ${weekNumber} Results</h3>
                <div class="results-list">
        `;

        weekResults.forEach(result => {
            if (result.bye) {
                // Bye week
                html += `
                    <div class="result-item bye-week">
                        <div class="bye-teams">
                            ${result.bye.map(teamId => {
                                const team = this.getTeamById(teamId);
                                return team ? team.name : 'Unknown Team';
                            }).join(', ')} - BYE
                        </div>
                    </div>
                `;
            } else {
                // Game result
                const homeTeam = this.getTeamById(result.home);
                const awayTeam = this.getTeamById(result.away);
                
                if (homeTeam && awayTeam) {
                    const homeWin = result.homeWin;
                    const homeScore = result.scoreHome || 0;
                    const awayScore = result.scoreAway || 0;
                    
                    // Find game index for box score
                    const weekResults = state.league?.resultsByWeek?.[weekNumber - 1] || [];
                    const gameIndex = weekResults.findIndex(r => 
                        r && r.home === result.home && r.away === result.away
                    );
                    
                    html += `
                        <div class="result-item game-result clickable-game" 
                             data-week="${weekNumber}" 
                             data-home="${result.home}" 
                             data-away="${result.away}"
                             ${gameIndex >= 0 ? `onclick="window.showBoxScore(${weekNumber}, ${gameIndex})" style="cursor: pointer;" title="Click to view box score"` : ''}>
                            <div class="game-teams">
                                <span class="away-team ${!homeWin ? 'winner' : ''}">${awayTeam.name}</span>
                                <span class="at">@</span>
                                <span class="home-team ${homeWin ? 'winner' : ''}">${homeTeam.name}</span>
                            </div>
                            <div class="game-score">
                                <span class="away-score ${!homeWin ? 'winner' : ''}">${awayScore}</span>
                                <span class="score-separator">-</span>
                                <span class="home-score ${homeWin ? 'winner' : ''}">${homeScore}</span>
                            </div>
                            <div class="game-result-indicator">
                                ${homeWin ? 'Home Win' : 'Away Win'}
                                ${gameIndex >= 0 ? '<span class="box-score-link">📊 Box Score</span>' : ''}
                            </div>
                        </div>
                    `;
                }
            }
        });

        html += `
                </div>
            </div>
        `;
        
        return html;
    }

    getTeamById(teamId) {
        const L = state.league;
        if (L && L.teams && L.teams[teamId]) {
            return L.teams[teamId];
        }
        return null;
    }

    populateWeekSelector() {
        const weekSelect = document.getElementById('weekSelect');
        if (!weekSelect) return;

        weekSelect.innerHTML = '';
        
        for (let week = 1; week <= 18; week++) {
            const option = document.createElement('option');
            option.value = week;
            option.textContent = `Week ${week}`;
            if (week === this.currentWeek) {
                option.selected = true;
            }
            weekSelect.appendChild(option);
        }
    }

    showDetailedGameStats(week, homeTeamId, awayTeamId) {
        const L = state.league;
        if (!L || !L.resultsByWeek || !L.resultsByWeek[week]) {
            return;
        }

        const weekResults = L.resultsByWeek[week];
        const gameResult = weekResults.find(result => 
            result.home === homeTeamId && result.away === awayTeamId
        );

        if (!gameResult) return;

        // Show detailed stats in a modal
        this.showGameStatsModal(gameResult, week);
    }

    showGameStatsModal(gameResult, week) {
        // Create modal for detailed game stats
        const modal = document.createElement('div');
        modal.className = 'modal game-stats-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Week ${week} - Game Statistics</h2>
                    <button type="button" class="close" aria-label="Close modal">&times;</button>
                </div>
                <div class="modal-body">
                    ${this.generateDetailedGameStatsHTML(gameResult, week)}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal when clicking X
        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => {
            document.body.removeChild(modal);
        };

        // Close modal when clicking outside
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };

        // Show modal
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    generateDetailedGameStatsHTML(gameResult, week) {
        const homeTeam = this.getTeamById(gameResult.home);
        const awayTeam = this.getTeamById(gameResult.away);
        
        if (!homeTeam || !awayTeam) {
            return '<p>Team information not available.</p>';
        }

        const homeScore = gameResult.scoreHome || 0;
        const awayScore = gameResult.scoreAway || 0;
        const homeWin = gameResult.homeWin;

        let html = `
            <div class="game-summary">
                <div class="game-header">
                    <div class="team ${homeWin ? 'winner' : ''}">${homeTeam.name}</div>
                    <div class="score">${homeScore}</div>
                    <div class="vs">vs</div>
                    <div class="score">${awayScore}</div>
                    <div class="team ${!homeWin ? 'winner' : ''}">${awayTeam.name}</div>
                </div>
                <div class="game-details">
                    <div class="week">Week ${week}</div>
                    <div class="result">${homeWin ? homeTeam.name + ' wins' : awayTeam.name + ' wins'}</div>
                </div>
            </div>
        `;

        // Add detailed statistics if available
        if (gameResult.homeStats || gameResult.awayStats) {
            html += '<div class="detailed-stats">';
            
            if (gameResult.homeStats) {
                html += `
                    <div class="team-stats">
                        <h3>${homeTeam.name} Statistics</h3>
                        ${this.renderTeamGameStats(gameResult.homeStats)}
                    </div>
                `;
            }
            
            if (gameResult.awayStats) {
                html += `
                    <div class="team-stats">
                        <h3>${awayTeam.name} Statistics</h3>
                        ${this.renderTeamGameStats(gameResult.awayStats)}
                    </div>
                `;
            }
            
            html += '</div>';
        }

        return html;
    }

    renderTeamGameStats(teamStats) {
        let html = '<div class="stats-categories">';
        
        const categories = {
            'Passing': ['passYards', 'passTDs', 'passInts', 'sacks'],
            'Rushing': ['rushYards', 'rushTDs', 'rushAttempts'],
            'Receiving': ['recYards', 'recTDs', 'receptions'],
            'Defense': ['tackles', 'sacks', 'interceptions', 'fumbles'],
            'Special Teams': ['fieldGoals', 'extraPoints', 'punts', 'kickoffYards']
        };

        Object.entries(categories).forEach(([category, stats]) => {
            const availableStats = stats.filter(stat => teamStats[stat] !== undefined);
            if (availableStats.length > 0) {
                html += `
                    <div class="stat-category">
                        <h4>${category}</h4>
                        ${availableStats.map(stat => `
                            <div class="stat-item">
                                <span class="stat-name">${this.formatStatName(stat)}:</span>
                                <span class="stat-value">${teamStats[stat]}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        });

        html += '</div>';
        return html;
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

    refresh() {
        this.populateWeekSelector();
        this.renderContent();
    }
}

// Initialize the schedule viewer
let scheduleViewer;
document.addEventListener('DOMContentLoaded', () => {
    scheduleViewer = new ScheduleViewer();
    
    // Refresh when league data changes
    if (window.state && window.state.league) {
        scheduleViewer.refresh();
    }
});

// Make function globally available
window.scheduleViewer = scheduleViewer;
window.refreshScheduleViewer = () => scheduleViewer?.refresh();
