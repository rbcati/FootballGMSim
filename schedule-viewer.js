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
        this.filterMyTeam = false;
        this.init();
    }

    init() {
        if (window.state?.league?.week) {
            this.currentWeek = Math.min(window.state.league.week, 18);
        }
        this.createScheduleView();
        this.setupEventListeners();
    }

    createScheduleView() {
        // Add schedule view to the main content area
        const scheduleSection = document.querySelector('#scheduleWrap');
        if (scheduleSection) {
            scheduleSection.innerHTML = `
                <div class="schedule-controls-card">
                    <div class="schedule-header">
                        <div class="schedule-controls">
                            <div class="view-toggle">
                                <button class="btn ${this.currentView === 'schedule' ? 'active' : ''}" data-view="schedule">Schedule</button>
                                <button class="btn ${this.currentView === 'results' ? 'active' : ''}" data-view="results">Results</button>
                            </div>
                            <div class="week-selector">
                                <label for="weekSelect">Week:</label>
                                <select id="weekSelect"></select>
                            </div>
                            <div class="filter-toggle">
                                <label>
                                    <input type="checkbox" id="scheduleFilterMyTeam" ${this.filterMyTeam ? 'checked' : ''}> My Team Only
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="schedule-content">
                    <div id="scheduleContent"></div>
                </div>
            `;
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
            if (e.target.id === 'scheduleFilterMyTeam') {
                this.filterMyTeam = e.target.checked;
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

        // Populate week selector if empty
        const weekSelect = document.getElementById('weekSelect');
        if (weekSelect && weekSelect.options.length === 0) {
            this.populateWeekSelector();
        }

        if (this.currentView === 'schedule') {
            contentDiv.innerHTML = this.renderSchedule();
        } else {
            contentDiv.innerHTML = this.renderResults();
        }
    }

    renderSchedule() {
        const L = window.state?.league;
        if (!L || !L.schedule) {
            return '<p>No schedule data available.</p>';
        }

        let html = '<div class="schedule-grid">';
        
        // Render current week (or filtered weeks)
        // If "My Team" is checked, we could show all weeks, but let's stick to week selector for now
        // actually user requested "start at team schedule and have a selectable option to see league schedule"
        // But the week selector design is better for performance.

        const weekData = L.schedule.weeks ? L.schedule.weeks.find(w => w.weekNumber === this.currentWeek) : null;

        if (weekData) {
            html += this.renderWeekSchedule(weekData, this.currentWeek);
        } else {
            // Legacy schedule format support
             if (L.schedule[this.currentWeek]) {
                 html += this.renderWeekSchedule({ games: L.schedule[this.currentWeek] }, this.currentWeek);
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
            const L = window.state.league;
            const userTeamId = window.state.userTeamId;
            const weekResults = L.resultsByWeek ? L.resultsByWeek[weekNumber - 1] : []; // Results are 0-indexed

            weekData.games.forEach((game, gameIndex) => {
                if (game.bye) {
                    // Bye week
                    if (this.filterMyTeam && !game.bye.includes(userTeamId)) return;

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
                    if (this.filterMyTeam && game.home !== userTeamId && game.away !== userTeamId) return;

                    const homeTeam = this.getTeamById(game.home);
                    const awayTeam = this.getTeamById(game.away);
                    
                    if (homeTeam && awayTeam) {
                        // Check for result
                        const result = weekResults ? weekResults.find(r => r.home === game.home && r.away === game.away) : null;
                        const isPlayed = !!result;
                        const homeScore = isPlayed ? result.scoreHome : (game.homeScore !== undefined ? game.homeScore : '');
                        const awayScore = isPlayed ? result.scoreAway : (game.awayScore !== undefined ? game.awayScore : '');

                        const homeWin = isPlayed && homeScore > awayScore;
                        const awayWin = isPlayed && awayScore > homeScore;
                        const isTie = isPlayed && homeScore === awayScore;

                        html += `
                            <div class="game-item ${game.home === userTeamId || game.away === userTeamId ? 'user-game' : ''}">
                                <div class="game-teams">
                                    <span class="away-team ${awayWin ? 'winner' : ''}">${awayTeam.name}</span>
                                    <span class="at">@</span>
                                    <span class="home-team ${homeWin ? 'winner' : ''}">${homeTeam.name}</span>
                                </div>
                                <div class="game-score">
                                    ${isPlayed ?
                                        `<span class="score ${awayWin ? 'winner' : ''}">${awayScore}</span> - <span class="score ${homeWin ? 'winner' : ''}">${homeScore}</span>` :
                                        '<span class="time">TBD</span>'
                                    }
                                </div>
                                ${isPlayed ? `<button class="btn btn-sm" onclick="window.showBoxScore(${weekNumber}, ${gameIndex})">Box Score</button>` : ''}
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
        // Alias for schedule view but maybe strictly results?
        // With the new combined view, 'Results' tab might just default to previous weeks or filter for completed games.
        // For now, reuse renderSchedule as it handles scores.
        return this.renderSchedule();
    }

    getTeamById(teamId) {
        const L = window.state?.league;
        if (L && L.teams && L.teams[teamId]) {
            return L.teams[teamId];
        }
        return null;
    }

    populateWeekSelector() {
        const weekSelect = document.getElementById('weekSelect');
        if (!weekSelect) return;

        weekSelect.innerHTML = '';
        
        // Detect max weeks
        const L = window.state?.league;
        const maxWeeks = L?.schedule?.weeks?.length || 18;

        for (let week = 1; week <= maxWeeks; week++) {
            const option = document.createElement('option');
            option.value = week;
            option.textContent = `Week ${week}`;
            if (week === this.currentWeek) {
                option.selected = true;
            }
            weekSelect.appendChild(option);
        }
    }

    refresh() {
        if (!document.getElementById('scheduleView')) {
             this.createScheduleView();
        }
        // Update week if season changed
        if (window.state?.league?.week && this.currentWeek < window.state.league.week && this.currentWeek < 18) {
             this.currentWeek = window.state.league.week;
        }
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
window.renderSchedule = () => scheduleViewer?.refresh(); // Override global renderSchedule
