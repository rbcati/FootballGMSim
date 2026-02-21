// schedule-factory.js - Simple schedule generation fallback
'use strict';

(function (global) {
    if (global.makeSchedule) return; // Use existing implementation if already loaded

    global.makeSchedule = function makeSchedule(teams) {
        const schedule = [];
        const teamList = Array.isArray(teams) ? teams : [];

        for (let week = 1; week <= 18; week++) {
            const weekGames = [];
            // Basic rotation: pair adjacent teams
            // A better rotation would shift teams, but this is a fallback.
            // To make it slightly better, we can rotate the array each week?
            // For now, keep it simple as the original code did, but ensure format is correct.

            // Note: The original fallback just paired 0-1, 2-3 every week.
            // Let's at least try to mix it up a tiny bit or just keep it simple.
            // User just wants it to WORK.

            for (let i = 0; i < teamList.length; i += 2) {
                if (teamList[i + 1]) {
                    // Alternate home/away based on week to add variety
                    const isHome = week % 2 !== 0;
                    weekGames.push({
                        home: isHome ? teamList[i + 1].id : teamList[i].id,
                        away: isHome ? teamList[i].id : teamList[i + 1].id,
                        finalized: false,
                        played: false
                    });
                }
            }

            schedule.push({
                weekNumber: week,
                games: weekGames
            });
        }
        return schedule;
    };
})(window);
