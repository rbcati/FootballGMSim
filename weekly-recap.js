// weekly-recap.js
// Integrated with Core Loop
import { GAME_PLANS, RISK_PROFILES } from './strategy.js';

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

    // Find User's Game
    let userGame = null;
    if (results) {
        userGame = results.find(r => {
            const homeId = typeof r.home === 'object' ? r.home.id : r.home;
            const awayId = typeof r.away === 'object' ? r.away.id : r.away;
            return homeId === userTeamId || awayId === userTeamId;
        });
    }

    // Determine outcome
    let outcomeHtml = '';
    let resultClass = '';
    if (userGame) {
        const isHome = (typeof userGame.home === 'object' ? userGame.home.id : userGame.home) === userTeamId;
        const userScore = isHome ? userGame.scoreHome : userGame.scoreAway;
        const oppScore = isHome ? userGame.scoreAway : userGame.scoreHome;
        const opponent = isHome ? (userGame.away.name || 'Opponent') : (userGame.home.name || 'Opponent');
        const win = userScore > oppScore;
        const tie = userScore === oppScore;

        resultClass = win ? 'win' : (tie ? 'tie' : 'loss');
        const resultText = win ? 'VICTORY' : (tie ? 'DRAW' : 'DEFEAT');
        const scoreText = `${userScore} - ${oppScore}`;

        outcomeHtml = `
            <div class="recap-outcome ${resultClass}">
                <div class="recap-result-label">${resultText}</div>
                <div class="recap-score">${scoreText}</div>
                <div class="recap-opponent">vs ${opponent}</div>
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

    // Strategy Report (New)
    let strategyHtml = '';
    const strategy = state.league.weeklyGamePlan;
    if (strategy && userGame && !userGame.bye) {
        const plan = GAME_PLANS[strategy.planId] || GAME_PLANS.BALANCED;
        const risk = RISK_PROFILES[strategy.riskId] || RISK_PROFILES.BALANCED;

        // Simple narrative logic based on outcome
        const isWin = resultClass === 'win';
        let narrative = '';

        if (isWin) {
             narrative = `Your decision to use <strong>${plan.name}</strong> paid off.`;
             if (strategy.riskId === 'AGGRESSIVE') narrative += ` The aggressive approach overwhelmed them.`;
             else if (strategy.riskId === 'CONSERVATIVE') narrative += ` Playing it safe secured the victory.`;
        } else {
             const oppName = (typeof userGame.home === 'object' ? userGame.home.abbr : (userGame.home === userTeamId ? 'OPP' : 'OPP'));
             narrative = `The <strong>${plan.name}</strong> strategy struggled.`;
             if (strategy.riskId === 'AGGRESSIVE') narrative += ` High risk led to costly mistakes.`;
             else if (strategy.riskId === 'CONSERVATIVE') narrative += ` Too conservative to keep up.`;
        }

        strategyHtml = `
            <div class="recap-section">
                <h4>📋 Strategy Report</h4>
                <div style="font-size: 0.95rem; margin-bottom: 5px;">
                    <span class="tag" style="background: #4a5568; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${plan.name}</span>
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

            .recap-result-label { font-size: 2rem; font-weight: 900; letter-spacing: 2px; margin-bottom: 5px; }
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
