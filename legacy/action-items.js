/**
 * action-items.js
 * Engine for generating blockers and warnings for the Week HQ
 */

export function getActionItems(league, team) {
    const blockers = [];
    const warnings = [];
    const info = [];

    if (!team) return { blockers, warnings, info };

    // --- BLOCKERS ---

    // 0. Save Game (Priority)
    if (window.state && window.state.needsSave) {
        // We push this as a WARNING so it doesn't block simulation, but it's high priority
        warnings.push({
            id: 'unsaved_progress',
            title: 'Unsaved Progress',
            description: 'You have unsaved changes. Save your game to avoid losing progress.',
            action: 'if(window.saveGame) window.saveGame()',
            actionLabel: 'Save Game'
        });
    }

    // 1. Roster Limits
    // NFL limit is 53. We enforce strict 53 max during season.
    const rosterSize = team.roster.length;
    if (rosterSize > 53) {
        blockers.push({
            id: 'roster_max',
            title: 'Roster Limit Exceeded',
            description: `You have ${rosterSize} players. The maximum is 53. Cut ${rosterSize - 53} players to advance.`,
            route: '#/roster',
            actionLabel: 'Manage Roster'
        });
    }

    // 2. Salary Cap
    // Check if cap is enabled in settings
    const capEnabled = window.state?.settings?.salaryCapEnabled !== false;
    if (capEnabled) {
        // Ensure cap numbers are fresh
        if (typeof window.recalcCap === 'function') {
             window.recalcCap(league, team);
        }

        if (team.capUsed > team.capTotal) {
            const overage = (team.capUsed - team.capTotal).toFixed(2);
            blockers.push({
                id: 'salary_cap',
                title: 'Salary Cap Exceeded',
                description: `You are $${overage}M over the salary cap. Clear space to advance.`,
                route: '#/contracts', // Or roster
                actionLabel: 'Manage Cap'
            });
        }
    }

    // --- WARNINGS ---

    // 1. Roster Minimums
    if (rosterSize < 40) {
        warnings.push({
            id: 'roster_min',
            title: 'Low Roster Count',
            description: `You only have ${rosterSize} players. We recommend at least 45.`,
            route: '#/freeagency',
            actionLabel: 'Sign Players'
        });
    }

    // 2. Injured Starters
    // Check for injured players who are effectively starters (depth 1 or high OVR)
    // We assume depth chart is maintained, but if not, use OVR
    const injuredStarters = team.roster.filter(p => p.injuryWeeks > 0 && p.depthChart?.depthPosition === 1);
    if (injuredStarters.length > 0) {
        const names = injuredStarters.map(p => p.name).join(', ');
        warnings.push({
            id: 'injured_starters',
            title: 'Injured Starters',
            description: `${injuredStarters.length} starter(s) injured: ${names}. Check depth chart.`,
            route: '#/roster',
            actionLabel: 'View Roster'
        });
    }

    // 3. Trade Proposals
    if (window.state.tradeProposals && window.state.tradeProposals.length > 0) {
        warnings.push({
            id: 'trade_offers',
            title: 'Trade Proposals',
            description: `You have ${window.state.tradeProposals.length} pending trade offers.`,
            route: '#/trade', // or trade proposals view
            actionLabel: 'View Offers'
        });
    }

    // --- INFO / GOALS ---

    // Owner Satisfaction Warning
    if (window.state.ownerMode && window.state.ownerMode.enabled) {
        const sat = window.state.ownerMode.fanSatisfaction;
        if (sat < 30) {
             warnings.push({
                id: 'low_approval',
                title: 'Owner Approval Low',
                description: `Approval is at ${sat}%. You are at risk of being fired.`,
                route: '#/hub', // Hub shows owner mode
                actionLabel: 'View Owner Goals'
            });
        }
    }

    return { blockers, warnings, info };
}
