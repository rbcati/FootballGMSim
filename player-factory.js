// player-factory.js - Simple player generation fallback
'use strict';

(function (global) {
    if (global.makePlayer) return; // Preserve existing implementation if present

    const C = () => global.Constants;
    const U = () => global.Utils;

    function generatePlayerName(position) {
        const constants = C();
        const utils = U();
        const first = utils?.choice(constants?.FIRST_NAMES || ['James', 'Michael']);
        const last = utils?.choice(constants?.LAST_NAMES || ['Smith', 'Johnson']);
        return `${first} ${last}`;
    }

    function generatePlayerRatings(position, ovr) {
        const constants = C();
        const utils = U();
        const baseRatings = constants?.POS_RATING_RANGES?.[position] || {};
        const ratings = {};

        Object.keys(baseRatings).forEach(attr => {
            const [min, max] = baseRatings[attr];
            ratings[attr] = utils?.clamp ? utils.clamp(ovr + utils.rand(-5, 5), min, max) : ovr;
        });

        return ratings;
    }

    global.makePlayer = function makePlayer(position, age, ovr) {
        const constants = C();
        const utils = U();

        if (!constants || !utils) {
            console.error('makePlayer fallback missing dependencies');
            return null;
        }

        const playerOvr = typeof ovr === 'number' ? ovr : utils.rand(60, 85);
        const playerAge = typeof age === 'number' ? age : utils.rand(21, 35);

        const player = {
            id: utils.id(),
            name: generatePlayerName(position),
            pos: position,
            age: playerAge,
            ovr: playerOvr,
            years: utils.rand(1, 4),
            yearsTotal: undefined,
            baseAnnual: utils.rand(2, 15),
            ratings: generatePlayerRatings(position, playerOvr),
            abilities: constants?.ABILITIES_BY_POS?.[position]
                ? [utils.choice(constants.ABILITIES_BY_POS[position])]
                : [],
            college: utils.choice(constants?.COLLEGES || ['Alabama', 'Ohio State']),
            fatigue: 0,
            stats: {}
        };

        if (!player.yearsTotal) player.yearsTotal = player.years;
        return player;
    };
})(window);
