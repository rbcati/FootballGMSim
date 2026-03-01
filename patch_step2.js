import fs from 'fs';

let content = fs.readFileSync('src/core/game-simulator.js', 'utf8');

// Replace team lookup in commitGameResult
content = content.replace(
`    const home = league.teams.find(t => t && t.id === homeTeamId);
    const away = league.teams.find(t => t && t.id === awayTeamId);`,
`    let home, away;
    if (league._teamsMap) {
        home = league._teamsMap[homeTeamId];
        away = league._teamsMap[awayTeamId];
    } else {
        home = league.teams.find(t => t && t.id === homeTeamId);
        away = league.teams.find(t => t && t.id === awayTeamId);
    }`);

// Replace schedule lookup in commitGameResult
content = content.replace(
`    // 1. Update Schedule (Find the game)
    const weekIndex = (league.week || 1) - 1;
    const scheduleWeeks = league.schedule?.weeks || league.schedule || [];
    let scheduledGame = null;

    // Strategy 1: Look in current week (if structured with weeks)
    const weekSchedule = scheduleWeeks[weekIndex];
    if (weekSchedule && weekSchedule.games) {
        scheduledGame = weekSchedule.games.find(g =>
            g && g.home !== undefined && g.away !== undefined &&
            (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
            (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
        );
    }

    // Strategy 2: Look in flat array (if schedule is flat array of games)
    if (!scheduledGame && Array.isArray(scheduleWeeks)) {
        scheduledGame = scheduleWeeks.find(g =>
            g && g.home !== undefined && g.away !== undefined &&
            (g.week === league.week) &&
            (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
            (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
        );
    }

    // Strategy 3: Global search (fallback)
    if (!scheduledGame && league.schedule) {
        // Iterate all weeks if structure is nested
        if (league.schedule.weeks) {
            for (const w of league.schedule.weeks) {
                if (w.games) {
                    const g = w.games.find(g =>
                        g && g.home !== undefined && g.away !== undefined &&
                        (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
                        (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
                    );
                    if (g) {
                        scheduledGame = g;
                        break;
                    }
                }
            }
        } else if (Array.isArray(league.schedule)) {
             scheduledGame = league.schedule.find(g =>
                g && g.home !== undefined && g.away !== undefined &&
                (g.home === homeTeamId || (g.home && g.home.id === homeTeamId)) &&
                (g.away === awayTeamId || (g.away && g.away.id === awayTeamId))
            );
        }
    }`,
`    // 1. Update Schedule (Find the game)
    const weekIndex = (league.week || 1) - 1;
    let scheduledGame = null;

    if (league._scheduleMap) {
        scheduledGame = league._scheduleMap[\`\${homeTeamId}-\${awayTeamId}\`];
    } else {
        const scheduleWeeks = league.schedule?.weeks || league.schedule || [];

        // Strategy 1: Look in current week (if structured with weeks)
        const weekSchedule = scheduleWeeks[weekIndex];
        if (weekSchedule && weekSchedule.games) {
            scheduledGame = weekSchedule.games.find(g =>
                g && g.home !== undefined && g.away !== undefined &&
                (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
                (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
            );
        }

        // Strategy 2: Look in flat array (if schedule is flat array of games)
        if (!scheduledGame && Array.isArray(scheduleWeeks)) {
            scheduledGame = scheduleWeeks.find(g =>
                g && g.home !== undefined && g.away !== undefined &&
                (g.week === league.week) &&
                (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
                (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
            );
        }

        // Strategy 3: Global search (fallback)
        if (!scheduledGame && league.schedule) {
            // Iterate all weeks if structure is nested
            if (league.schedule.weeks) {
                for (const w of league.schedule.weeks) {
                    if (w.games) {
                        const g = w.games.find(g =>
                            g && g.home !== undefined && g.away !== undefined &&
                            (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
                            (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
                        );
                        if (g) {
                            scheduledGame = g;
                            break;
                        }
                    }
                }
            } else if (Array.isArray(league.schedule)) {
                 scheduledGame = league.schedule.find(g =>
                    g && g.home !== undefined && g.away !== undefined &&
                    (g.home === homeTeamId || (g.home && g.home.id === homeTeamId)) &&
                    (g.away === awayTeamId || (g.away && g.away.id === awayTeamId))
                );
            }
        }
    }`);


// Add caching to simulateBatch
content = content.replace(
`    // Use passed league object or fail
    const league = options.league;
    if (!league) {
        console.error('No league provided to simulateBatch');
        return [];
    }`,
`    // Use passed league object or fail
    const league = options.league;
    if (!league) {
        console.error('No league provided to simulateBatch');
        return [];
    }

    // OPTIMIZATION: create maps for fast lookups during commit
    if (league.teams && !league._teamsMap) {
        league._teamsMap = {};
        for (let i = 0; i < league.teams.length; i++) {
            const t = league.teams[i];
            if (t && t.id !== undefined) league._teamsMap[t.id] = t;
        }
    }

    if (league.schedule && !league._scheduleMap) {
        league._scheduleMap = {};
        const weekIndex = (league.week || 1) - 1;
        const scheduleWeeks = league.schedule?.weeks || league.schedule || [];
        const weekSchedule = scheduleWeeks[weekIndex];
        if (weekSchedule && weekSchedule.games) {
            for (let i = 0; i < weekSchedule.games.length; i++) {
                const g = weekSchedule.games[i];
                if (g && g.home !== undefined && g.away !== undefined) {
                    const hId = typeof g.home === 'object' ? g.home.id : g.home;
                    const aId = typeof g.away === 'object' ? g.away.id : g.away;
                    league._scheduleMap[\`\${hId}-\${aId}\`] = g;
                }
            }
        }
    }`);

// Clean up maps at end of simulateBatch
content = content.replace(
`    });

    return results;
}

/**
 * Validates the league state after simulation.`,
`    });

    if (league._teamsMap) {
        delete league._teamsMap;
    }
    if (league._scheduleMap) {
        delete league._scheduleMap;
    }

    return results;
}

/**
 * Validates the league state after simulation.`);

fs.writeFileSync('src/core/game-simulator.js', content, 'utf8');
