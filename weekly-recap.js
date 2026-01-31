// weekly-recap.js
// Integrated with Core Loop
import { OFFENSIVE_PLANS, DEFENSIVE_PLANS, RISK_PROFILES } from './strategy.js';
import { getTrackedPlayerUpdates } from './player-tracking.js';
import soundManager from './sound-manager.js';

'use strict';

/**
 * Displays a weekly recap modal with game results, injuries, and news.
 * @param {number} week - The week number that just finished.
 * @param {Array} results - Array of game result objects for the week.
 * @param {Array} news - Array of news objects (optional).
 */
export function showWeeklyRecap(week, results, news) {
    if (!window.Modal) {
        console.warn('Modal component not found, skipping recap.');
        return;
    }

    const state = window.state;
    const userTeamId = state.userTeamId;
    const userTeam = state.league.teams[userTeamId];

    // Find User's Game in Results
    let userGame = null;
    if (results) {
        userGame = results.find(r => {
            const homeId = typeof r.home === 'object' ? r.home.id : r.home;
            const awayId = typeof r.away === 'object' ? r.away.id : r.away;
            return homeId === userTeamId || awayId === userTeamId;
        });
    }

    // Check if user had a scheduled game (to distinguish BYE from Error)
    let scheduledGame = null;
    if (window.Scheduler && window.Scheduler.getWeekGames) {
        const weekData = window.Scheduler.getWeekGames(state.league.schedule, week);
        if (weekData && weekData.games) {
            scheduledGame = weekData.games.find(g =>
                !g.bye &&
                ((typeof g.home === 'object' ? g.home.id : g.home) === userTeamId ||
                 (typeof g.away === 'object' ? g.away.id : g.away) === userTeamId)
            );
        }
    }

    // Determine outcome
    let outcomeHtml = '';
    let resultClass = '';
    let heroHtml = '';
    let schemeHtml = '';
    let rivalryHtml = '';

    if (userGame) {
        const isHome = (typeof userGame.home === 'object' ? userGame.home.id : userGame.home) === userTeamId;
        const userScore = isHome ? userGame.scoreHome : userGame.scoreAway;
        const oppScore = isHome ? userGame.scoreAway : userGame.scoreHome;
        const opponent = isHome ? (userGame.away.name || 'Opponent') : (userGame.home.name || 'Opponent');
        const win = userScore > oppScore;
        const tie = userScore === oppScore;

        resultClass = win ? 'win' : (tie ? 'tie' : 'loss');
        let resultText = win ? `Victory vs ${opponent}` : (tie ? `Draw vs ${opponent}` : `Defeat vs ${opponent}`);
        const scoreText = `${userScore} - ${oppScore}`;

        // ENHANCED TENSION: High Stakes Logic
        let highStakesClass = '';
        const oppId = isHome ? (typeof userGame.away === 'object' ? userGame.away.id : userGame.away) : (typeof userGame.home === 'object' ? userGame.home.id : userGame.home);

        // Rivalry Check
        const rivalry = userTeam.rivalries ? userTeam.rivalries[oppId] : null;
        if (rivalry && rivalry.score > 50) {
            resultText = win ? `RIVALRY VICTORY` : `BITTER DEFEAT`;
            highStakesClass = 'high-stakes';
        }

        // Playoff Implications (Late Season)
        if (week > 14 && !state.offseason) {
            // Simplified check: if margin was close (< 4 points)
            const margin = Math.abs(userScore - oppScore);
            if (margin <= 3 && !tie) {
                 resultText = win ? `CLUTCH WIN` : `HEARTBREAKER`;
                 highStakesClass = 'high-stakes';
            }
        }

        // Playoff Game
        if (week > 18) { // Assuming 18 week season
             resultText = win ? `PLAYOFF ADVANCE` : `SEASON OVER`;
             highStakesClass = 'playoff';
        }

        // Post-Game Callbacks (New)
        let callbacksHtml = '';
        if (userGame.callbacks && userGame.callbacks.length > 0) {
            callbacksHtml = `
                <div class="recap-callbacks" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
                    ${userGame.callbacks.map(cb => `<div style="font-size: 1.05rem; font-style: italic; margin-bottom: 4px;">"${cb}"</div>`).join('')}
                </div>
            `;
        }

        outcomeHtml = `
            <div class="recap-outcome ${resultClass} ${highStakesClass}">
                <div class="recap-result-label" style="font-size: ${highStakesClass ? '2.2rem' : '1.8rem'};">${resultText}</div>
                ${highStakesClass ? `<div style="font-size: 1rem; opacity: 0.9; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px;">vs ${opponent}</div>` : ''}
                <div class="recap-score">${scoreText}</div>
                ${callbacksHtml}
            </div>
        `;

        // Scheme Impact
        if (userGame.schemeNote) {
            const isGood = userGame.schemeNote.includes('Advantage');
            const schemeColor = isGood ? '#4ade80' : '#f87171'; // Green or Red
            schemeHtml = `
                <div class="recap-section" style="border-left: 4px solid ${schemeColor};">
                    <h4 style="color: ${schemeColor};">📋 Scheme Analysis</h4>
                    <p style="margin: 0; font-size: 0.95rem;">${userGame.schemeNote}</p>
                </div>
            `;
        }

        // Rivalry Impact
        if (userTeam.rivalries) {
            const oppId = isHome ? (typeof userGame.away === 'object' ? userGame.away.id : userGame.away) : (typeof userGame.home === 'object' ? userGame.home.id : userGame.home);
            const riv = userTeam.rivalries[oppId];

            if (riv && riv.score > 20) {
                // Determine narrative
                let narrative = "";
                if (win) {
                    narrative = riv.score > 50 ? "A massive win against a bitter rival!" : "Beating a rival always feels good.";
                    if (riv.events && riv.events[0] && riv.events[0].includes("Eliminated")) {
                        narrative = "Revenge exacted for past heartbreak!";
                    }
                } else {
                    narrative = "Losing to them hurts more than usual.";
                }

                rivalryHtml = `
                    <div class="recap-section" style="border-left: 4px solid #f59e0b;">
                        <h4 style="color: #f59e0b;">⚔️ Rivalry Report</h4>
                        <p style="margin: 0; font-size: 0.95rem;">${narrative}</p>
                        <div style="font-size: 0.8rem; margin-top: 4px; opacity: 0.8;">Rivalry Intensity: ${riv.score}/100</div>
                    </div>
                `;
            }
        }

        // Hero of the Week (Best Rating)
        if (userGame.boxScore) {
            const userSide = (typeof userGame.home === 'object' ? userGame.home.id : userGame.home) === userTeamId ? 'home' : 'away';
            const box = userGame.boxScore[userSide];
            if (box) {
                const players = Object.values(box);
                // Calculate a simple game score
                players.forEach(p => {
                    p.gameScore = (p.stats.passTD || 0)*4 + (p.stats.rushTD || 0)*6 + (p.stats.recTD || 0)*6 + (p.stats.sacks || 0)*4 + (p.stats.interceptions || 0)*4 + (p.stats.passYd || 0)*0.04 + (p.stats.rushYd || 0)*0.1 + (p.stats.recYd || 0)*0.1 + (p.stats.tackles || 0)*1;
                });
                players.sort((a,b) => b.gameScore - a.gameScore);
                const hero = players[0];

                if (hero && hero.gameScore > 10) {
                     heroHtml = `
                        <div class="recap-section">
                            <h4>⭐ Player of the Week</h4>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="font-weight: bold; font-size: 1.1rem;">${hero.name}</div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">${hero.pos}</div>
                            </div>
                            <div style="font-size: 0.9rem; margin-top: 5px;">
                                ${hero.stats.passYd ? `${hero.stats.passYd} Yds, ${hero.stats.passTD} TD` : ''}
                                ${hero.stats.rushYd ? `${hero.stats.rushYd} Rush Yds, ${hero.stats.rushTD} TD` : ''}
                                ${hero.stats.recYd ? `${hero.stats.recYd} Rec Yds, ${hero.stats.recTD} TD` : ''}
                                ${hero.stats.tackles ? `${hero.stats.tackles} Tkl, ${hero.stats.sacks || 0} Sacks` : ''}
                            </div>
                        </div>
                    `;
                }
            }
        }

    } else if (scheduledGame) {
        outcomeHtml = `
            <div class="recap-outcome loss" style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);">
                <div class="recap-result-label">SIMULATION ISSUE</div>
                <div class="recap-score">Result Pending</div>
                <div style="font-size: 1rem; margin-top: 5px;">Game was scheduled but results are missing.</div>
            </div>
        `;
    } else {
        outcomeHtml = `
            <div class="recap-outcome bye">
                <div class="recap-result-label">BYE WEEK</div>
                <div class="recap-score">Rest & Recovery</div>
            </div>
        `;
    }

    // Development Watch
    let devHtml = '';
    const activeDev = userTeam.roster.filter(p => p.seasonNews && p.seasonNews.some(n => n.week === week && (n.headline.includes('Breakout') || n.headline.includes('Stalled') || n.headline.includes('Decline'))));

    if (activeDev.length > 0) {
        devHtml = `
            <div class="recap-section">
                <h4>🚀 Development Watch</h4>
                <ul class="recap-list">
                    ${activeDev.map(p => {
                        const newsItem = p.seasonNews.find(n => n.week === week);
                        const isGood = newsItem.headline.includes('Breakout');
                        const tagClass = isGood ? 'good-tag' : 'bad-tag'; // Defined in CSS or style below
                        return `
                            <li>
                                <strong style="color: ${isGood ? '#4ade80' : '#f87171'}">${newsItem.headline}</strong>
                                <div><strong>${p.name}</strong> (${p.pos})</div>
                                <div style="font-size: 0.85rem; color: #ccc;">${newsItem.story}</div>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `;
    }

    // Milestones
    let milestonesHtml = '';
    const milestonePlayers = userTeam.roster.filter(p => p.legacy && p.legacy.milestones && p.legacy.milestones.some(m => m.week === week && m.year === state.league.year));

    if (milestonePlayers.length > 0) {
        milestonesHtml = `
            <div class="recap-section" style="border-left: 4px solid #fbbf24;">
                <h4 style="color: #fbbf24;">🏅 Milestone Achievements</h4>
                <ul class="recap-list">
                    ${milestonePlayers.map(p => {
                        const milestones = p.legacy.milestones.filter(m => m.week === week && m.year === state.league.year);
                        return milestones.map(m => `
                            <li>
                                <strong style="color: #fbbf24;">${m.description}</strong>
                                <div><strong>${p.name}</strong> (${p.pos})</div>
                                <div style="font-size: 0.85rem; color: #ccc;">${m.rarity} Milestone Reached</div>
                            </li>
                        `).join('');
                    }).join('')}
                </ul>
            </div>
        `;
    }

    // Injuries (User Team)
    let injuriesHtml = '';
    const newInjuries = userTeam.roster.filter(p => p.injuryWeeks > 0 && p.injuries && p.injuries[0] && p.injuries[0].week === week);

    if (newInjuries.length > 0) {
        injuriesHtml = `
            <div class="recap-section">
                <h4>🏥 Injury Report</h4>
                <ul class="recap-list">
                    ${newInjuries.map(p => `
                        <li>
                            <strong>${p.name} (${p.pos})</strong>: ${p.injuries[0].type}
                            <span class="bad-tag">Out ${p.injuryWeeks} weeks</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    // Top News
    let newsHtml = '';
    const recentNews = (news || state.league.news || []).slice(-3).reverse();
    if (recentNews.length > 0) {
        newsHtml = `
            <div class="recap-section">
                <h4>📰 Around the League</h4>
                <ul class="recap-list">
                    ${recentNews.map(n => `
                        <li class="news-item-small">
                            ${typeof n === 'string' ? n : `<strong>${n.headline}</strong>: ${n.story}`}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    // Tracked Player Updates
    let trackedUpdatesHtml = '';
    if (getTrackedPlayerUpdates) {
        const trackedUpdates = getTrackedPlayerUpdates(state.league, week, results);
        if (trackedUpdates && trackedUpdates.length > 0) {
            trackedUpdatesHtml = `
                <div class="recap-section">
                    <h4>📌 Tracked Player Updates</h4>
                    <ul class="recap-list">
                        ${trackedUpdates.map(u => `
                            <li>
                                <strong>${u.player.name}</strong>: ${u.message}
                                <span class="tag ${u.type === 'good' ? 'is-success' : u.type === 'bad' || u.type === 'injury' ? 'is-danger' : 'is-info'}">${u.type.toUpperCase()}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }
    }

    // Strategy Report (New)
    let strategyHtml = '';
    const strategy = state.league.weeklyGamePlan;
    if (strategy && userGame && !userGame.bye) {
        const offPlan = OFFENSIVE_PLANS[strategy.offPlanId] || OFFENSIVE_PLANS.BALANCED;
        const defPlan = DEFENSIVE_PLANS[strategy.defPlanId] || DEFENSIVE_PLANS.BALANCED;
        const risk = RISK_PROFILES[strategy.riskId] || RISK_PROFILES.BALANCED;

        // Simple narrative logic based on outcome
        const isWin = resultClass === 'win';
        let narrative = '';

        if (isWin) {
             narrative = `Your decision to use <strong>${offPlan.name}</strong> and <strong>${defPlan.name}</strong> paid off.`;
             if (strategy.riskId === 'AGGRESSIVE') narrative += ` The aggressive approach overwhelmed them.`;
             else if (strategy.riskId === 'CONSERVATIVE') narrative += ` Playing it safe secured the victory.`;
        } else {
             narrative = `The combination of <strong>${offPlan.name}</strong> and <strong>${defPlan.name}</strong> struggled.`;
             if (strategy.riskId === 'AGGRESSIVE') narrative += ` High risk led to costly mistakes.`;
             else if (strategy.riskId === 'CONSERVATIVE') narrative += ` Too conservative to keep up.`;
        }

        strategyHtml = `
            <div class="recap-section">
                <h4>📋 Strategy Report</h4>
                <div style="font-size: 0.95rem; margin-bottom: 5px; display: flex; flex-wrap: wrap; gap: 4px;">
                    <span class="tag" style="background: #4a5568; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${offPlan.name}</span>
                    <span class="tag" style="background: #4a5568; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${defPlan.name}</span>
                    <span class="tag" style="background: #4a5568; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${risk.name}</span>
                </div>
                <div style="font-size: 0.9rem; opacity: 0.9; line-height: 1.4;">${narrative}</div>
            </div>
        `;
    }

    const content = `
        <div class="weekly-recap-container">
            ${outcomeHtml}
            <div class="recap-grid">
                ${strategyHtml}
                ${trackedUpdatesHtml}
                ${heroHtml}
                ${schemeHtml}
                ${rivalryHtml}
                ${devHtml}
                ${injuriesHtml}
                ${newsHtml}
            </div>

            <div class="recap-actions">
                <button class="btn primary large" onclick="this.closest('.modal').remove(); if(window.renderHub) window.renderHub();">Continue to Week ${week + 1}</button>
            </div>
        </div>

        <style>
            .weekly-recap-container { text-align: center; }
            .recap-outcome { padding: 20px; border-radius: 8px; margin-bottom: 20px; color: white; }
            .recap-outcome.win { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
            .recap-outcome.loss { background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); }
            .recap-outcome.tie { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
            .recap-outcome.bye { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }

            /* High Stakes Variations */
            .recap-outcome.win.high-stakes { background: linear-gradient(135deg, #059669 0%, #047857 50%, #10b981 100%); border: 2px solid #fbbf24; box-shadow: 0 0 15px rgba(251, 191, 36, 0.4); }
            .recap-outcome.loss.high-stakes { background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 50%, #ef4444 100%); border: 2px solid #1f2937; }
            .recap-outcome.playoff { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); border: 2px solid white; }

            .recap-result-label { font-size: 2rem; font-weight: 900; letter-spacing: 2px; margin-bottom: 5px; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
            .recap-score { font-size: 3rem; font-weight: 700; line-height: 1; }
            .recap-opponent { font-size: 1.2rem; opacity: 0.9; margin-top: 5px; }

            .recap-grid { display: grid; gap: 15px; text-align: left; }
            .recap-section { background: var(--surface); padding: 15px; border-radius: 8px; border: 1px solid var(--hairline); }
            .recap-section h4 { margin-top: 0; border-bottom: 1px solid var(--hairline); padding-bottom: 8px; margin-bottom: 10px; color: var(--text-muted); text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px; }

            .recap-list { list-style: none; padding: 0; margin: 0; }
            .recap-list li { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.95rem; }
            .recap-list li:last-child { border-bottom: none; }

            .bad-tag { color: #ef4444; font-weight: bold; margin-left: 5px; }

            .recap-actions { margin-top: 25px; }
            .btn.large { padding: 15px 30px; font-size: 1.2rem; width: 100%; }
        </style>
    `;

    // Play Sound
    if (resultClass === 'win') {
        soundManager.playCheer();
    } else if (resultClass === 'loss') {
        soundManager.playFailure();
    } else if (resultClass === 'tie') {
        soundManager.playWhistle();
    }

    const modal = new window.Modal({
        title: `Week ${week} Recap`,
        content: content,
        size: 'normal' // or large if needed
    });

    const modalEl = modal.render(document.body);
    modalEl.style.display = 'flex';
}

// Expose globally
if (typeof window !== 'undefined') {
    window.showWeeklyRecap = showWeeklyRecap;
}
