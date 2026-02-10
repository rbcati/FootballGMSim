export class TradeLogicService {
  /**
   * Modified Jimmy Johnson Trade Value Chart
   * specific values for top picks, formula for others.
   */
  static DRAFT_PICK_VALUES = {
    1: 3000, 2: 2600, 3: 2200, 4: 1800, 5: 1700, 6: 1600, 7: 1500, 8: 1400,
    9: 1350, 10: 1300, 11: 1250, 12: 1200, 13: 1150, 14: 1100, 15: 1050,
    16: 1000, 17: 950, 18: 900, 19: 875, 20: 850, 21: 825, 22: 800,
    23: 760, 24: 740, 25: 720, 26: 700, 27: 680, 28: 660, 29: 640, 30: 620,
    31: 600, 32: 590
  };

  /**
   * Calculates the value of a draft pick.
   * @param {number} round - Draft round (1-7)
   * @param {number} pickInRound - Pick number within the round (1-32)
   * @param {number} yearOffset - Years into the future (0 = current year)
   * @returns {number} Asset value
   */
  static calculatePickValue(round, pickInRound, yearOffset = 0) {
    const globalPick = (round - 1) * 32 + pickInRound;
    let baseValue = 0;

    if (globalPick <= 32) {
      baseValue = this.DRAFT_PICK_VALUES[globalPick] || 590;
    } else {
      // Exponential decay for later rounds
      // Round 2 start (~33): 580 -> Round 3 start (~65): 265 -> Round 7 start (~193): ~2
      // Approximate formula: Value = 580 * 0.94^(pick - 33)
      // Or simply use a standard decay from the last known value (590)
      // Let's use a simplified decay model:
      // Round 2: ~580 - 270
      // Round 3: ~265 - 116
      // Round 4: ~112 - 44
      // Round 5: ~43 - 27
      // Round 6: ~26 - 16
      // Round 7: ~15 - 2

      if (round === 2) baseValue = 580 - (pickInRound - 1) * 10;
      else if (round === 3) baseValue = 265 - (pickInRound - 1) * 5;
      else if (round === 4) baseValue = 112 - (pickInRound - 1) * 2;
      else if (round === 5) baseValue = 43 - (pickInRound - 1) * 0.5;
      else if (round === 6) baseValue = 26 - (pickInRound - 1) * 0.3;
      else baseValue = 15 - (pickInRound - 1) * 0.4;
    }

    if (baseValue < 1) baseValue = 1;

    // Future discount: 0.75 per year
    const discount = Math.pow(0.75, yearOffset);
    return Math.round(baseValue * discount);
  }

  /**
   * Calculates the trade value of a player.
   * @param {Object} player - Player object
   * @returns {number} Asset value
   */
  static calculatePlayerValue(player) {
    if (!player) return 0;

    // 1. Base Performance Value (Non-linear curve)
    // 99 OVR = 4000 pts
    // 75 OVR = 800 pts
    // Curve: Value = A * (OVR - Threshold)^K
    // Let's use a simpler polynomial approximation satisfying the points.
    // V = 4000 * ((OVR - 55) / 44)^2.5 (approx)
    // If OVR < 55, Value = 0.

    let ovr = player.ovr;
    let baseValue = 0;

    if (ovr > 55) {
        // Solving for 75 -> 800:
        // 800 = C * (75-55)^k = C * 20^k
        // 4000 = C * (99-55)^k = C * 44^k
        // 5 = (44/20)^k = 2.2^k
        // log(5) / log(2.2) ~= 2.05
        // Let's use k=2.1
        // C = 800 / 20^2.1 ~= 1.48

        baseValue = 1.5 * Math.pow(ovr - 55, 2.1);
    }

    // 2. Age Decay
    // RB/WR: Steep decay at 28.
    // QB/OL: Gentle decay at 32.
    const age = player.age;
    const pos = player.pos;
    let ageMultiplier = 1.0;

    if (['RB', 'WR'].includes(pos)) {
        if (age >= 28) {
            // Steep decay: -15% per year over 28
            ageMultiplier = Math.pow(0.85, age - 27);
        }
    } else if (['QB', 'OL'].includes(pos)) {
        if (age >= 32) {
            // Gentle decay: -10% per year over 32
            ageMultiplier = Math.pow(0.90, age - 31);
        }
    } else {
        // Default: -10% per year over 29
        if (age >= 29) {
            ageMultiplier = Math.pow(0.90, age - 28);
        }
    }

    // Cap age multiplier
    if (ageMultiplier < 0.1) ageMultiplier = 0.1;

    let value = baseValue * ageMultiplier;

    // 3. Contract Surplus (The Cap Factor)
    // Calculate ExpectedSalary based on OVR
    // Compare Expected vs Actual
    const expectedSalary = this.getExpectedSalary(ovr, pos);
    const actualSalary = player.baseAnnual || player.salary || 1.0; // In Millions

    const surplus = expectedSalary - actualSalary;

    // Value adjustment:
    // Surplus adds value, Deficit subtracts value.
    // How much value is $1M cap space worth?
    // Let's say $1M surplus = 100 points (approx mid-late 3rd round pick)
    // $10M surplus = 1000 points (mid 1st round pick)
    // This seems reasonable.

    const capFactor = surplus * 100;

    value += capFactor;

    // Ensure value doesn't go below 0 (unless we want negative assets to require sweeteners)
    // Realistically, a bad contract is a negative asset.
    // However, to keep it simple for now, we'll floor at a small negative number or 0.
    // Let's allow negative values to represent "salary dumps".

    return Math.round(value);
  }

  /**
   * Estimates the fair market salary for a player based on OVR and position.
   * @param {number} ovr - Overall Rating
   * @param {string} pos - Position
   * @returns {number} Expected Salary in Millions
   */
  static getExpectedSalary(ovr, pos) {
    // Base salary curve
    let salary = 0;

    // Exponential salary curve
    // 99 OVR -> $25M
    // 70 OVR -> $2M
    if (ovr < 70) return 0.8; // Minimum

    // Simple quadratic curve
    // Salary = A * (OVR - 60)^2
    // 25 = A * (39)^2 => A = 25/1521 = 0.0164
    // Check 75: 0.0164 * 15^2 = 3.7M. Close to existing logic.

    salary = 0.017 * Math.pow(ovr - 60, 2);

    // Position Multipliers
    const posMultipliers = {
        QB: 1.4,
        DE: 1.1, EDGE: 1.1,
        LT: 1.1, OT: 1.0,
        WR: 1.1,
        CB: 1.0,
        DT: 0.9,
        LB: 0.8,
        S: 0.7,
        RB: 0.6, // RB devaluation
        TE: 0.6,
        K: 0.2, P: 0.2
    };

    const mult = posMultipliers[pos] || 1.0;
    return Math.max(0.8, salary * mult);
  }

  /**
   * Evaluates a trade proposal.
   * @param {Array} userOffer - List of assets offered by the user
   * @param {Array} aiAssets - List of assets requested from the AI
   * @param {Object} userTeam - The user's team object
   * @param {Object} aiTeam - The AI's team object
   * @returns {Object} Evaluation result
   */
  static evaluateTrade(userOffer, aiAssets, userTeam, aiTeam) {
    let userValue = 0;
    let aiValue = 0;

    // Helper to sum value
    const sumValue = (assets) => {
        let total = 0;
        for (const asset of assets) {
            if (asset.kind === 'player') {
                total += this.calculatePlayerValue(asset.player);
            } else if (asset.kind === 'pick') {
                const pick = asset.pickInRound || 16;
                const offset = asset.yearOffset || 0;
                total += this.calculatePickValue(asset.round, pick, offset);
            }
        }
        return total;
    };

    userValue = sumValue(userOffer);
    aiValue = sumValue(aiAssets);

    const requiredValue = aiValue * 1.05; // 5% Human Tax

    // 1. Value Check
    if (userValue < requiredValue) {
        // Allow tiny tolerance (within 1%)
        if (userValue < requiredValue * 0.99) {
            return {
                accepted: false,
                userValue: Math.round(userValue),
                aiValue: Math.round(aiValue),
                requiredValue: Math.round(requiredValue),
                message: 'Value Mismatch',
                rejectionReason: `Offer value (${Math.round(userValue)}) is below required value (${Math.round(requiredValue)}).`
            };
        }
    }

    // 2. Cap Space Check
    if (window.calculateCapImpact && userTeam && aiTeam) {
        // Check User Team Cap
        const userCapCheck = window.calculateCapImpact(userTeam, 'trade', aiAssets, userOffer);
        if (!userCapCheck.valid) {
            return {
                accepted: false,
                userValue: Math.round(userValue),
                aiValue: Math.round(aiValue),
                requiredValue: Math.round(requiredValue),
                message: 'Cap Space Exceeded',
                rejectionReason: `You cannot afford this trade. ${userCapCheck.message}`
            };
        }

        // Check AI Team Cap
        const aiCapCheck = window.calculateCapImpact(aiTeam, 'trade', userOffer, aiAssets);
        if (!aiCapCheck.valid) {
            return {
                accepted: false,
                userValue: Math.round(userValue),
                aiValue: Math.round(aiValue),
                requiredValue: Math.round(requiredValue),
                message: 'Cap Space Exceeded',
                rejectionReason: `Other team cannot afford this trade. ${aiCapCheck.message}`
            };
        }
    }

    // 3. Positional Surplus Check (AI Side)
    if (aiTeam && aiTeam.roster) {
        const surplusPositions = new Set();
        userOffer.forEach(asset => {
            if (asset.kind === 'player' || asset.player) {
                const p = asset.player || asset;
                const pos = p.pos;
                // Count quality players at this pos (>80 OVR)
                const existing = aiTeam.roster.filter(x => x.pos === pos && x.ovr > 80).length;
                if (existing >= 3) {
                    surplusPositions.add(pos);
                }
            }
        });

        if (surplusPositions.size > 0) {
            const positions = Array.from(surplusPositions).join(', ');
            return {
                accepted: false,
                userValue: Math.round(userValue),
                aiValue: Math.round(aiValue),
                requiredValue: Math.round(requiredValue),
                message: 'Positional Surplus',
                rejectionReason: `They don't need more players at: ${positions}.`
            };
        }
    }

    return {
        accepted: true,
        userValue: Math.round(userValue),
        aiValue: Math.round(aiValue),
        requiredValue: Math.round(requiredValue),
        ratio: aiValue > 0 ? userValue / aiValue : 1.0,
        message: 'Trade Accepted'
    };
  }
}
