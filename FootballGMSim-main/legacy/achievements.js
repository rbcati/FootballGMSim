// achievements.js
'use strict';

export const ACHIEVEMENTS = [
    { id: 'first_win', name: 'First Win', description: 'Win your first game.', xp: 100, icon: '🎉' },
    { id: 'winning_record', name: 'Winning Culture', description: 'Finish a season with a winning record.', xp: 300, icon: '📈' },
    { id: 'playoff_berth', name: 'Playoff Bound', description: 'Make the playoffs.', xp: 500, icon: '🎟️' },
    { id: 'division_champ', name: 'King of the Hill', description: 'Win a division title.', xp: 1000, icon: '👑' },
    { id: 'conf_champ', name: 'Conference Champion', description: 'Win the Conference Championship.', xp: 2500, icon: '🏆' },
    { id: 'super_bowl', name: 'World Champion', description: 'Win the Super Bowl.', xp: 5000, icon: '💍' },
    { id: 'perfect_season', name: 'Perfection', description: 'Complete a perfect regular season.', xp: 10000, icon: '🌟' },
    { id: 'dynasty', name: 'Dynasty', description: 'Win 3 Super Bowls in 5 years.', xp: 15000, icon: '🏰' },
    { id: 'mvp', name: 'MVP', description: 'Have a player win MVP.', xp: 2000, icon: '🏅' },
    { id: 'roty', name: 'The Future', description: 'Have a player win Rookie of the Year.', xp: 1000, icon: '👶' },
    { id: 'coty', name: 'Mastermind', description: 'Win Coach of the Year.', xp: 2000, icon: '🧠' }
];

export function checkAchievements(state) {
    if (!state || !state.league) return;
    if (!state.achievements) state.achievements = []; // Store IDs of unlocked achievements

    const team = state.league.teams[state.userTeamId];
    if (!team) return;

    // 1. First Win
    if (!hasAchievement(state, 'first_win') && team.record.w > 0) {
        unlockAchievement(state, 'first_win');
    }

    // 2. Season End Checks
    // We check these if the season is over (e.g., during offseason or after playoffs)
    // For simplicity, we check some based on current state which might be mid-season, but "finish" implies end.
    // Let's check "Playoff Bound" if playoffs exist and user is in them
    if (!hasAchievement(state, 'playoff_berth') && state.playoffs) {
        // Check if user is in playoffs
        const userInPlayoffs = state.playoffs.teams && state.playoffs.teams.some(t => t.id === team.id);
        if (userInPlayoffs) {
            unlockAchievement(state, 'playoff_berth');
        }
    }

    // 3. Super Bowl
    if (!hasAchievement(state, 'super_bowl') && state.playoffs && state.playoffs.winner && state.playoffs.winner.id === team.id) {
        unlockAchievement(state, 'super_bowl');
    }

    // 4. Perfect Season (Regular Season)
    if (!hasAchievement(state, 'perfect_season')) {
        const gamesPlayed = team.record.w + team.record.l + team.record.t;
        if (gamesPlayed >= 17 && team.record.l === 0 && team.record.t === 0) {
            unlockAchievement(state, 'perfect_season');
        }
    }
}

function hasAchievement(state, id) {
    return state.achievements.some(a => a.id === id || a === id);
}

function unlockAchievement(state, id) {
    // Check again to be safe
    if (hasAchievement(state, id)) return;

    state.achievements.push({ id: id, date: new Date().toISOString(), year: state.league.year });
    const achievement = ACHIEVEMENTS.find(a => a.id === id);

    if (achievement) {
        if (window.setStatus) window.setStatus(`🏆 Achievement Unlocked: ${achievement.name}`, 'success', 5000);
        console.log(`Achievement Unlocked: ${achievement.name}`);

        // Add XP to user coach if available
        // Assuming user coach is identifiable or we add to all user staff
        // For now, just log it.
    }
}

export function renderAchievements() {
    const state = window.state;
    if (!state) return '<p>No game state loaded.</p>';
    if (!state.achievements) state.achievements = [];

    let html = `
        <div class="achievements-container">
            <div class="achievements-header">
                <h3>Career Achievements</h3>
                <div class="achievement-progress">
                    ${state.achievements.length} / ${ACHIEVEMENTS.length} Unlocked
                </div>
            </div>
            <div class="achievements-grid">
    `;

    ACHIEVEMENTS.forEach(achievement => {
        const unlocked = state.achievements.find(a => (a.id || a) === achievement.id);
        const isUnlocked = !!unlocked;
        const dateStr = unlocked && unlocked.date ? new Date(unlocked.date).toLocaleDateString() : '';
        const yearStr = unlocked && unlocked.year ? `(Year ${unlocked.year})` : '';

        html += `
            <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-info">
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-desc">${achievement.description}</div>
                    ${isUnlocked ? `<div class="achievement-date">Unlocked ${dateStr} ${yearStr}</div>` : ''}
                </div>
                <div class="achievement-xp">+${achievement.xp} XP</div>
            </div>
        `;
    });

    html += `</div></div>`;

    // Add CSS dynamically
    const css = `
        <style>
            .achievements-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 15px; }
            .achievement-card {
                background: var(--surface); border: 1px solid var(--hairline); border-radius: 8px; padding: 15px;
                display: flex; align-items: center; gap: 15px; transition: transform 0.2s;
            }
            .achievement-card.locked { opacity: 0.6; filter: grayscale(1); }
            .achievement-card.unlocked { border-left: 4px solid var(--accent); background: linear-gradient(to right, var(--surface), rgba(255,255,255,0.05)); }
            .achievement-icon { font-size: 2rem; }
            .achievement-info { flex: 1; }
            .achievement-name { font-weight: bold; font-size: 1.1rem; }
            .achievement-desc { font-size: 0.9rem; color: var(--text-muted); }
            .achievement-date { font-size: 0.8rem; color: var(--accent); margin-top: 4px; }
            .achievement-xp { font-weight: bold; color: var(--text-muted); font-size: 0.9rem; }
        </style>
    `;

    return css + html;
}

if (typeof window !== 'undefined') {
    window.checkAchievements = checkAchievements;
    window.renderAchievements = renderAchievements;
}
