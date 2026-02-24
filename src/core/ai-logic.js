export const TeamState = {
  CONTENDING: 'Contending',
  REBUILDING: 'Rebuilding',
  MIDDLE: 'Middle',
};

// Base pick values by round
const PICK_VALUES = [0, 1000, 450, 200, 90, 40, 15, 5];

/**
 * Determine a team's current state (Contending, Rebuilding, or Middle).
 * @param {Object} team - The team object (must have wins, losses).
 * @param {Array} roster - The team's roster (array of player objects).
 * @returns {string} One of TeamState values.
 */
export function determineTeamState(team, roster) {
  if (!team || !roster || roster.length === 0) return TeamState.MIDDLE;

  // Calculate Average OVR of top 25 players (starters + key depth)
  const sortedRoster = [...roster].sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  const top25 = sortedRoster.slice(0, 25);
  const avgOvr = top25.reduce((sum, p) => sum + (p.ovr || 0), 0) / (top25.length || 1);

  // Win % check (only meaningful if games played > 4)
  const games = (team.wins || 0) + (team.losses || 0);
  const winPct = games > 4 ? (team.wins || 0) / games : null;

  // Logic
  if (winPct !== null) {
      // Mid-season logic
      if (winPct >= 0.60 || avgOvr >= 82) return TeamState.CONTENDING;
      if (winPct <= 0.35 || avgOvr <= 74) return TeamState.REBUILDING;
  } else {
      // Offseason / Preseason logic based purely on OVR
      if (avgOvr >= 80) return TeamState.CONTENDING;
      if (avgOvr <= 74) return TeamState.REBUILDING;
  }

  return TeamState.MIDDLE;
}

/**
 * Calculate the trade value of a single asset.
 * @param {Object} asset - The player object or draft pick object.
 * @param {string} teamState - The evaluating team's state (Contending/Rebuilding/Middle).
 * @param {boolean} isDraftPick - Whether the asset is a draft pick.
 * @returns {number} The calculated value.
 */
export function calculateAssetValue(asset, teamState, isDraftPick = false) {
    if (!asset) return 0;

    if (isDraftPick) {
        // asset is { round, year, originalOwner... }
        let val = PICK_VALUES[asset.round] || 5;

        // Context: Rebuilding teams value picks HIGHER
        if (teamState === TeamState.REBUILDING) val *= 1.5;
        // Contending teams value picks LOWER (prefer win-now assets)
        if (teamState === TeamState.CONTENDING) val *= 0.8;

        return Math.round(val);
    }

    // Player Valuation
    const player = asset;
    const ovr = player.ovr || 70;
    const age = player.age || 27;
    const pos = player.pos || 'OL';

    // Position Multipliers
    const POS_MULT = {
        QB: 2.2, WR: 1.3, RB: 0.8, TE: 1.1, OL: 1.0,
        EDGE: 1.4, DL: 1.1, LB: 1.0, CB: 1.2, S: 0.9,
        K: 0.1, P: 0.1
    };
    const pMult = POS_MULT[pos] || 1.0;

    // Age Factor
    let ageFactor = 1.0;
    if (age <= 24) ageFactor = 1.2;       // Young upside premium
    else if (age <= 28) ageFactor = 1.0;  // Prime
    else if (age <= 31) ageFactor = 0.8;  // Decline
    else ageFactor = 0.5;                 // Old

    // Base Value Calculation (Power Curve)
    // ovr^2.2 gives steep value increase for elites
    let value = Math.pow(ovr, 2.2) * 0.05 * pMult * ageFactor;

    // Contextual Adjustments based on Team State
    if (teamState === TeamState.CONTENDING) {
        // Contenders pay premium for veterans who can help win now (80+ OVR)
        if (age >= 28 && ovr >= 80) value *= 1.3;
    } else if (teamState === TeamState.REBUILDING) {
        // Rebuilders discount old players heavily
        if (age > 27) value *= 0.6;
        // Rebuilders pay premium for young talent
        if (age < 25) value *= 1.3;
    }

    // Salary Cap Penalty (Simplified)
    // If salary is huge (>20M) and player is not elite (<85 OVR), value drops
    const salary = player.contract?.baseAnnual || 0;
    if (salary > 20 && ovr < 85) value *= 0.7;

    return Math.max(0, Math.round(value));
}

/**
 * Evaluate a trade proposal from the perspective of the 'receiving' team (the AI).
 * @param {Object} offer - Assets offered by the other team { players: [], picks: [] }
 * @param {Object} receive - Assets requested from the AI team { players: [], picks: [] }
 * @param {string} aiTeamState - The AI team's state.
 * @returns {Object} { accepted: boolean, reason: string, diff: number, receiveValue: number, giveValue: number }
 */
export function evaluateTradeProposal(offer, receive, aiTeamState) {
    let receiveValue = 0;
    let giveValue = 0;

    // Calculate value of what AI receives (from Offer)
    if (offer.players) {
        for (const p of offer.players) {
            receiveValue += calculateAssetValue(p, aiTeamState, false);
        }
    }
    if (offer.picks) {
        for (const pk of offer.picks) {
            receiveValue += calculateAssetValue(pk, aiTeamState, true);
        }
    }

    // Calculate value of what AI gives (from Receive)
    if (receive.players) {
        for (const p of receive.players) {
            giveValue += calculateAssetValue(p, aiTeamState, false);
        }
    }
    if (receive.picks) {
        for (const pk of receive.picks) {
            giveValue += calculateAssetValue(pk, aiTeamState, true);
        }
    }

    // Decision Logic
    // AI needs to win the trade slightly (receive >= 85% of give is old logic, let's keep it similar but stricter maybe?)
    // Prompt says: "reject any trade where the sum of received trade value is less than the sum of given trade value"
    // Okay, prompt is strict: received >= given.
    // However, usually there's a small margin for "fairness" or "homer bias".
    // Let's stick to the prompt: received < given => REJECT.
    // Actually, "reject any trade where sum of received... is less than sum of given". So strictly >=.

    const diff = receiveValue - giveValue;
    const accepted = diff >= 0;

    let reason = '';
    if (accepted) {
        reason = 'This deal makes sense for us.';
        if (aiTeamState === TeamState.REBUILDING && receiveValue > 0) {
             reason += ' As a rebuilding team, we value these assets.';
        } else if (aiTeamState === TeamState.CONTENDING) {
             reason += ' As a contender, this helps our push.';
        }
    } else {
        reason = 'The value is not enough.';
        if (aiTeamState === TeamState.REBUILDING) {
            // Check if they offered veterans
            const hasVeterans = offer.players && offer.players.some(p => p.age > 28);
            if (hasVeterans) reason += ' We are rebuilding and prefer draft picks or young players over veterans.';
            else reason += ' We need more value (picks/prospects) to move these assets.';
        } else if (aiTeamState === TeamState.CONTENDING) {
            // Check if they offered picks
            const hasPicks = offer.picks && offer.picks.length > 0;
            if (hasPicks && !offer.players?.length) reason += ' We are contending and need players who can help us win now, not just picks.';
            else reason += ' We cannot afford to lose this much talent right now.';
        }
    }

    return {
        accepted,
        reason,
        diff,
        receiveValue,
        giveValue
    };
}
