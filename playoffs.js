'use strict';

import { saveState } from './state.js';

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
            .sort((a, b) => (b.record.w - a.record.w) || ((b.record.pf - b.record.pa) - (a.record.pf - a.record.pa)));
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

    const simGame = window.simGameStats;
    const roundResults = { round: P.currentRound, games: [] };

    const simRound = (games) => {
        const winners = [];
        games.forEach(game => {
            const result = simGame(game.home, game.away);
            roundResults.games.push({ home: game.home, away: game.away, scoreHome: result.homeScore, scoreAway: result.awayScore });
            winners.push(result.homeScore > result.awayScore ? game.home : game.away);
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
        
        setStatus(`🏆 ${P.winner.name} have won the Super Bowl!`);
        console.log("Super Bowl Winner:", P.winner);
    }
    
    P.results.push(roundResults);
    // ** THE FIX IS HERE **
    // The original code was likely incrementing the round before the Super Bowl check,
    // causing it to skip the final round. This structure ensures all rounds are played.
    if (!P.winner) {
        P.currentRound++;
    }

    if (saveState) saveState();
    if (window.renderPlayoffs) renderPlayoffs();
}

// --- PLAYOFF INITIALIZATION ---
function startPlayoffs() {
    console.log('Starting playoffs...');
    
    if (!window.state?.league?.teams) {
        console.error('No teams available for playoffs');
        window.setStatus('Error: No teams available for playoffs');
        return;
    }
    
    // Generate playoff bracket
    const playoffBracket = generatePlayoffs(window.state.league.teams);
    
    // Store in state
    window.state.playoffs = playoffBracket;
    
    // Save state
    if (saveState) {
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
    
    window.setStatus('Playoffs have begun!');
    console.log('Playoffs started successfully');
}

// --- PLAYOFF UI RENDERING ---
function renderPlayoffs() {
    const container = document.getElementById('playoffs') || document.getElementById('playoff-bracket');
    if (!container) {
        console.warn('Playoff container not found, creating one.');
        const content = document.querySelector('.content');
        if (!content) return;
        // Create a new section if it doesn't exist.
        let playoffSection = document.getElementById('playoffs');
        if (!playoffSection) {
            playoffSection = document.createElement('section');
            playoffSection.id = 'playoffs';
            playoffSection.className = 'view';
            content.appendChild(playoffSection);
        }
        container = playoffSection;
    }

    const P = window.state?.playoffs || window.state?.playoffs;
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
    
    // Handle bye week for #1 seed
    if (games.bye) {
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
    const P = window.state?.playoffs || window.state?.playoffs;
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
