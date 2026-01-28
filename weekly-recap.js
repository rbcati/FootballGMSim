// weekly-recap.js
// Integrated with Core Loop
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
        const resultText = win ? `Victory vs ${opponent}` : (tie ? `Draw vs ${opponent}` : `Defeat vs ${opponent}`);
        const scoreText = `${userScore} - ${oppScore}`;

        outcomeHtml = `
            <div class="recap-outcome ${resultClass}">
                <div class="recap-result-label" style="font-size: 1.8rem;">${resultText}</div>
                <div class="recap-score">${scoreText}</div>
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

    const content = `
        <div class="weekly-recap-container">
            ${outcomeHtml}
            <div class="recap-grid">
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
