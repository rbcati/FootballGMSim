'use strict';

import { saveState } from './state.js';
import { launchConfetti } from './confetti.js';
import { simGameStats, initializePlayerStats } from './game-simulator.js';

/**
 * Playoff Management System
 * Based on the user's original file, with a fix for the final round simulation.
 */

// --- PLAYOFF STRUCTURE & GENERATION ---
function generatePlayoffs(teams) {
    // Define playoff constants since window.Constants.PLAYOFFS doesn't exist
    const TEAMS_PER_CONF = 7; // 7 teams per conference make playoffs
    
    const bracket = {
        year: window.state?.league?.year || 2025,
        rounds: { afc: [[], [], []], nfc: [[], [], []], superbowl: [] },
        winner: null,
        currentRound: 0,
        results: []
    };

    const getConferenceTeams = (confId) => {
        return teams.filter(t => t.conf === confId)
            .sort((a, b) => {
                // Primary: Wins
                const winsA = a.wins ?? a.record?.w ?? 0;
                const winsB = b.wins ?? b.record?.w ?? 0;
                if (winsB !== winsA) return winsB - winsA;

                // Secondary: Point Diff
                const diffA = (a.ptsFor ?? a.record?.pf ?? 0) - (a.ptsAgainst ?? a.record?.pa ?? 0);
                const diffB = (b.ptsFor ?? b.record?.pf ?? 0) - (b.ptsAgainst ?? b.record?.pa ?? 0);
                return diffB - diffA;
            });
    };

    const afcTeams = getConferenceTeams(0);
    const nfcTeams = getConferenceTeams(1);

    const afcSeeds = afcTeams.slice(0, TEAMS_PER_CONF);
    const nfcSeeds = nfcTeams.slice(0, TEAMS_PER_CONF);

    // Add seed property to teams for easier sorting later
    afcSeeds.forEach((t, i) => t.seed = i + 1);
    nfcSeeds.forEach((t, i) => t.seed = i + 1);

    bracket.rounds.afc[0] = [{ home: afcSeeds[1], away: afcSeeds[6] }, { home: afcSeeds[2], away: afcSeeds[5] }, { home: afcSeeds[3], away: afcSeeds[4] }];
    bracket.rounds.nfc[0] = [{ home: nfcSeeds[1], away: nfcSeeds[6] }, { home: nfcSeeds[2], away: nfcSeeds[5] }, { home: nfcSeeds[3], away: nfcSeeds[4] }];

    bracket.rounds.afc[0].bye = afcSeeds[0];
    bracket.rounds.nfc[0].bye = nfcSeeds[0];
    
    console.log("Playoff bracket generated:", bracket);
    return bracket;
}

// --- PLAYOFF SIMULATION ---
function simPlayoffWeek() {
    const P = window.state?.playoffs;
    if (!P || P.winner) return;

    // Use imported simGameStats instead of global
    const simGame = simGameStats;
    if (!simGame) {
        console.error("simGameStats not available");
        return;
    }

    const roundResults = { round: P.currentRound, games: [] };

    const simRound = (games) => {
        const winners = [];
        games.forEach(game => {
            const result = simGame(game.home, game.away);
            if (result) {
                roundResults.games.push({ home: game.home, away: game.away, scoreHome: result.homeScore, scoreAway: result.awayScore });
                winners.push(result.homeScore > result.awayScore ? game.home : game.away);

                // Accumulate Playoff Stats
                const accumulatePlayoffStats = (team) => {
                    if (team && team.roster) {
                        team.roster.forEach(p => {
                             if (p && p.stats && p.stats.game) {
                                initializePlayerStats(p);
                                if (!p.stats.playoffs) p.stats.playoffs = {};

                                // Accumulate game stats into playoff stats
                                Object.keys(p.stats.game).forEach(key => {
                                    const value = p.stats.game[key];
                                    if (typeof value === 'number') {
                                        if (key.includes('Pct') || key.includes('Grade') || key.includes('Rating') ||
                                            key === 'yardsPerCarry' || key === 'yardsPerReception' || key === 'avgPuntYards' ||
                                            key === 'avgKickYards' || key === 'completionPct') {
                                            return;
                                        }
                                        p.stats.playoffs[key] = (p.stats.playoffs[key] || 0) + value;
                                    }
                                });

                                // Track games played
                                if (!p.stats.playoffs.gamesPlayed) p.stats.playoffs.gamesPlayed = 0;
                                p.stats.playoffs.gamesPlayed++;
                            }
                        });
                    }
                };

                accumulatePlayoffStats(game.home);
                accumulatePlayoffStats(game.away);

            } else {
                console.error("Simulation failed for game", game);
                // Fallback random winner to prevent crash
                winners.push(game.home);
            }
        });
        return winners;
    };

    if (P.currentRound === 0) { // Wildcard
        const afcWinners = simRound(P.rounds.afc[0]);
        const nfcWinners = simRound(P.rounds.nfc[0]);
        afcWinners.push(P.rounds.afc[0].bye);
        nfcWinners.push(P.rounds.nfc[0].bye);
        afcWinners.sort((a,b) => a.seed - b.seed);
        nfcWinners.sort((a,b) => a.seed - b.seed);
        P.rounds.afc[1] = [{home: afcWinners[0], away: afcWinners[3]}, {home: afcWinners[1], away: afcWinners[2]}];
        P.rounds.nfc[1] = [{home: nfcWinners[0], away: nfcWinners[3]}, {home: nfcWinners[1], away: nfcWinners[2]}];
    } else if (P.currentRound === 1) { // Divisional
        const afcWinners = simRound(P.rounds.afc[1]);
        const nfcWinners = simRound(P.rounds.nfc[1]);
        afcWinners.sort((a,b) => a.seed - b.seed);
        nfcWinners.sort((a,b) => a.seed - b.seed);
        P.rounds.afc[2] = [{home: afcWinners[0], away: afcWinners[1]}];
        P.rounds.nfc[2] = [{home: nfcWinners[0], away: nfcWinners[1]}];
    } else if (P.currentRound === 2) { // Conference
        const afcChamp = simRound(P.rounds.afc[2])[0];
        const nfcChamp = simRound(P.rounds.nfc[2])[0];
        P.rounds.superbowl = [{ home: afcChamp, away: nfcChamp }];
    } else if (P.currentRound === 3) { // Super Bowl
        const winner = simRound(P.rounds.superbowl)[0];
        P.winner = winner;
        
        // Record Super Bowl in history
        if (window.recordSuperBowl && window.state?.league) {
            const matchup = P.rounds.superbowl[0];
            const runnerUp = matchup.home.id === winner.id ? matchup.away : matchup.home;
            const year = P.year || window.state.league.year || 2025;
            window.recordSuperBowl(window.state.league, year, winner, runnerUp);
        }
        
        if (window.setStatus) window.setStatus(`🏆 ${P.winner.name} have won the Super Bowl!`);
        console.log("Super Bowl Winner:", P.winner);

        // Trigger confetti for the championship win
        if (launchConfetti) launchConfetti();
    }
    
    P.results.push(roundResults);

    if (!P.winner) {
        P.currentRound++;
    }

    // Use unified save
    if (window.saveGame) {
        window.saveGame();
    } else if (saveState) {
        saveState();
    }

    if (window.renderPlayoffs) renderPlayoffs();
}

// --- PLAYOFF INITIALIZATION ---
function startPlayoffs() {
    console.log('Starting playoffs...');
    
    try {
        // Check if playoffs already exist for this year to prevent overwrite
        if (window.state?.playoffs && window.state.playoffs.year === window.state.league?.year) {
            console.warn('Playoffs already active for this year. Redirecting...');
            if (window.location) {
                window.location.hash = '#/playoffs';
            }
            if (window.renderPlayoffs) {
                window.renderPlayoffs();
            }
            return;
        }

        if (!window.state?.league?.teams) {
            throw new Error('No teams available for playoffs');
        }

        // Generate playoff bracket
        const playoffBracket = generatePlayoffs(window.state.league.teams);

        // Store in state
        window.state.playoffs = playoffBracket;

        // Save state using robust method
        if (window.saveGame) {
            window.saveGame();
        } else if (saveState) {
            saveState();
        }

        // Navigate to playoffs view
        if (window.location) {
            window.location.hash = '#/playoffs';
        }

        // Render playoffs
        if (window.renderPlayoffs) {
            window.renderPlayoffs();
        }

        if (window.setStatus) window.setStatus('Playoffs have begun!', 'success');
        console.log('Playoffs started successfully');

    } catch (error) {
        console.error("Error starting playoffs:", error);
        if (window.setStatus) window.setStatus("Failed to start playoffs: " + error.message, 'error');
    }
}

// --- PLAYOFF UI RENDERING ---
function renderPlayoffs() {
    let container = document.getElementById('playoffs') || document.getElementById('playoff-bracket');
    if (!container) {
        // Create the view if it doesn't exist
        const content = document.querySelector('.content');
        if (content) {
            const playoffSection = document.createElement('section');
            playoffSection.id = 'playoffs';
            playoffSection.className = 'view';
            playoffSection.hidden = false; // Show it
            content.appendChild(playoffSection);
            container = playoffSection;
        } else {
            console.warn('Playoff container not found and could not be created');
            return;
        }
    }

    const P = window.state?.playoffs;
    if (!P) {
        container.innerHTML = '<div class="card"><p>No playoff data available.</p></div>';
        return;
    }

    const userTeamId = window.state?.userTeamId || 0;

    let html = `
        <div class="card">
            <div class="row">
                <h2>${P.year} NFL Playoffs</h2>
                <div class="spacer"></div>
                ${!P.winner ? `<button id="btnSimPlayoff" class="btn primary">Simulate ${getRoundName(P.currentRound)}</button>` : `<h3 class="champion-title">🏆 ${P.winner.name}</h3>`}
            </div>
            <div class="playoff-bracket-container">
                <div class="playoff-bracket-grid">
                    ${renderConference('AFC', P.rounds.afc, userTeamId)}
                    ${renderConference('NFC', P.rounds.nfc, userTeamId)}
                </div>
                ${P.rounds.superbowl.length > 0 ? renderSuperBowl(P.rounds.superbowl, userTeamId) : ''}
            </div>
        </div>
    `;
    container.innerHTML = html;

    const simButton = document.getElementById('btnSimPlayoff');
    if (simButton) {
        simButton.addEventListener('click', simPlayoffWeek);
    }
}

function renderConference(name, confRounds, userTeamId = 0) {
    if (!confRounds) return '';
    return `
        <div class="conference-bracket ${name.toLowerCase()}">
            <h3 class="conference-title">${name} Conference</h3>
            <div class="bracket-rounds">
                <div class="bracket-round round-wildcard">
                    <div class="round-header">Wild Card</div>
                    ${renderRound(confRounds[0], 0, userTeamId)}
                </div>
                <div class="bracket-round round-divisional">
                    <div class="round-header">Divisional</div>
                    ${renderRound(confRounds[1], 1, userTeamId)}
                </div>
                <div class="bracket-round round-conference">
                    <div class="round-header">Conference Championship</div>
                    ${renderRound(confRounds[2], 2, userTeamId)}
                </div>
            </div>
        </div>
    `;
}

function renderRound(games, roundNum, userTeamId = 0) {
    if (!games || games.length === 0) {
        return '<div class="matchup-empty">TBD</div>';
    }
    
    let html = '';
    games.forEach(game => {
        if (!game) return;

        // Handle bye week logic stored in array
        if (game.bye) {
             const isUserTeam = game.bye.id === userTeamId;
             html += `
                <div class="matchup bye ${isUserTeam ? 'user-team-matchup' : ''}">
                    <div class="team winner ${isUserTeam ? 'user-team' : ''}">
                        <span class="seed">${game.bye.seed || 1}</span>
                        <span class="team-name">${game.bye.name || 'TBD'}</span>
                        <span class="bye-label">BYE</span>
                    </div>
                </div>
            `;
            return;
        }

        if (!game.home || !game.away) return;
        
        const result = findResult(game.home, game.away, roundNum);
        const homeWinner = result && result.scoreHome > result.scoreAway;
        const awayWinner = result && result.scoreAway > result.scoreHome;
        const isUserTeam = (game.home.id === userTeamId || game.away.id === userTeamId);
        
        html += `
            <div class="matchup ${isUserTeam ? 'user-team-matchup' : ''}">
                <div class="team ${homeWinner ? 'winner' : ''} ${game.home.id === userTeamId ? 'user-team' : ''}">
                    <span class="seed">${game.home.seed || ''}</span>
                    <span class="team-name">${game.home.name || 'TBD'}</span>
                    ${result ? `<span class="score">${result.scoreHome}</span>` : ''}
                </div>
                <div class="team ${awayWinner ? 'winner' : ''} ${game.away.id === userTeamId ? 'user-team' : ''}">
                    <span class="seed">${game.away.seed || ''}</span>
                    <span class="team-name">${game.away.name || 'TBD'}</span>
                    ${result ? `<span class="score">${result.scoreAway}</span>` : ''}
                </div>
            </div>
        `;
    });
    
    // Handle bye week stored as property on array (legacy check)
    if (games.bye && !Array.isArray(games)) {
        const isUserTeam = games.bye.id === userTeamId;
        html += `
            <div class="matchup bye ${isUserTeam ? 'user-team-matchup' : ''}">
                <div class="team winner ${isUserTeam ? 'user-team' : ''}">
                    <span class="seed">${games.bye.seed || 1}</span>
                    <span class="team-name">${games.bye.name || 'TBD'}</span>
                    <span class="bye-label">BYE</span>
                </div>
            </div>
        `;
    }
    
    return html || '<div class="matchup-empty">TBD</div>';
}

function renderSuperBowl(game, userTeamId = 0) {
    if (!game || game.length === 0) return '';
    const matchup = game[0];
    if (!matchup.home || !matchup.away) return '';
    
    const result = findResult(matchup.home, matchup.away, 3);
    const homeWinner = result && result.scoreHome > result.scoreAway;
    const awayWinner = result && result.scoreAway > result.scoreHome;
    const isUserTeam = (matchup.home.id === userTeamId || matchup.away.id === userTeamId);
    
    return `
        <div class="superbowl-bracket">
            <h3 class="superbowl-title">🏆 Super Bowl</h3>
            <div class="matchup superbowl-matchup ${isUserTeam ? 'user-team-matchup' : ''}">
                <div class="team ${homeWinner ? 'winner' : ''} ${matchup.home.id === userTeamId ? 'user-team' : ''}">
                    <span class="conference-badge afc-badge">AFC</span>
                    <span class="team-name">${matchup.home.name || 'TBD'}</span>
                    ${result ? `<span class="score">${result.scoreHome}</span>` : ''}
                </div>
                <div class="vs-divider">VS</div>
                <div class="team ${awayWinner ? 'winner' : ''} ${matchup.away.id === userTeamId ? 'user-team' : ''}">
                    <span class="conference-badge nfc-badge">NFC</span>
                    <span class="team-name">${matchup.away.name || 'TBD'}</span>
                    ${result ? `<span class="score">${result.scoreAway}</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

function findResult(homeTeam, awayTeam, roundNum) {
    const P = window.state?.playoffs;
    if (!P || !P.results || !P.results[roundNum]) return null;
    return P.results[roundNum].games.find(g => 
        g.home && g.away && homeTeam && awayTeam &&
        g.home.id === homeTeam.id && g.away.id === awayTeam.id
    );
}

function getRoundName(roundNum) {
    const names = ['Wildcard', 'Divisional', 'Conference', 'Super Bowl'];
    return names[roundNum] || '';
}

// Make functions globally available
window.generatePlayoffs = generatePlayoffs;
window.simPlayoffWeek = simPlayoffWeek;
window.renderPlayoffs = renderPlayoffs;
window.startPlayoffs = startPlayoffs;
