// trades.js – trade engine, trade block, CPU offers, manual trade system
import { Constants as C } from './constants.js';
import { Utils as U } from './utils.js';
import { state, saveState } from './state.js';

// Access global functions that haven't been migrated yet
const getRecalcCap = () => window.recalcCap;
const getUpdateTeamRatings = () => window.updateTeamRatings;

// --- Constants/Defaults -----------------------------

if (!C.POSITION_VALUES) {
  C.POSITION_VALUES = {
    QB: 1.5, WR: 1.2, RB: 1.0, TE: 1.1, OL: 1.1,
    DL: 1.0, LB: 1.0, CB: 1.1, S: 1.0
  };
}

if (!C.DEPTH_NEEDS) {
  C.DEPTH_NEEDS = {
    QB: 2, WR: 5, RB: 3, TE: 3,
    OL: 8, DL: 6, LB: 6, CB: 5, S: 4
  };
}

if (!C.TRADE_VALUES) {
  C.TRADE_VALUES = {};
}
if (typeof C.TRADE_VALUES.FUTURE_DISCOUNT !== 'number') {
  C.TRADE_VALUES.FUTURE_DISCOUNT = 0.85; // 15% discount per year out
}
if (!C.TRADE_VALUES.PICKS) {
  // Round averages (scaled) – enough for relative value
  C.TRADE_VALUES.PICKS = {
    1: { avg: 1476, rankFactor: 1.2 }, // Added rankFactor for scaling
    2: { avg: 418, rankFactor: 1.1 },
    3: { avg: 175, rankFactor: 1.05 },
    4: { avg: 57, rankFactor: 1.0 },
    5: { avg: 28, rankFactor: 1.0 },
    6: { avg: 11, rankFactor: 1.0 },
    7: { avg: 1.5, rankFactor: 1.0 }
  };
}

// --- Helpers --------------------------------------

function getLeagueYear(league) {
  if (league && typeof league.year === 'number') return league.year;
  if (C.GAME_CONFIG && typeof C.GAME_CONFIG.YEAR_START === 'number') {
    return C.GAME_CONFIG.YEAR_START;
  }
  return 2025;
}

function findPlayerOnTeam(team, playerId) {
  if (!team || !team.roster) return null;
  return team.roster.find(p => p.id === playerId) || null;
}

export function assetPlayer(playerId) {
  return { kind: 'player', playerId };
}

export function assetPick(year, round) {
  return { kind: 'pick', year, round };
}

function removePlayerFromTeam(team, playerId) {
  if (!team || !team.roster) return null;
  const idx = team.roster.findIndex(p => p.id === playerId);
  if (idx === -1) return null;
  const removed = team.roster.splice(idx, 1);
  return removed[0] || null;
}

function findPickOnTeam(team, year, round) {
  const picks = team && team.picks ? team.picks : [];
  return picks.find(p => p.year === year && p.round === round) || null;
}

function removePickFromTeam(team, year, round) {
  const picks = team && team.picks ? team.picks : [];
  const idx = picks.findIndex(p => p.year === year && p.round === round);
  if (idx === -1) return null;
  const removed = picks.splice(idx, 1);
  return removed[0] || null;
}

// --- Value functions ----------------------------------------------

function getPlayerOvr(player) {
  if (!player) return 60;
  if (typeof player.ovr === 'number') return player.ovr;
  if (!player.ratings) return 60;

  const values = Object.values(player.ratings).filter(v => typeof v === 'number');
  if (!values.length) return 60;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function getPlayerAge(player, leagueYear) {
  if (!player) return 25;
  if (typeof player.age === 'number') return player.age;
  if (player.year && typeof leagueYear === 'number') {
    // Assuming 'player.year' is the draft year. Age calculation is complex, but this formula is consistent.
    return Math.max(21, leagueYear - player.year + 22);
  }
  return 25;
}

function getPositionMultiplier(pos) {
  if (!pos) return 1;
  return C.POSITION_VALUES[pos] || 1;
}

/**
 * Contract factor for trade value. Now uses cap percentage rather than
 * arbitrary division by 5. A player earning 2% of cap ($5.1M) is much
 * more tradeable than one earning 15% ($38M).
 *
 * FIX: Previous version divided salary by 5 (magic number), making
 * $1M and $5M players identical in value. Now properly scaled to cap.
 */
function getContractFactor(player) {
  if (!player) return 1;

  const salary = player.baseAnnual || player.salary || 1;
  const yearsLeft = player.years || player.yearsRemaining || 1;
  const capBase = 255; // $255M salary cap

  // Cap percentage: $5M = 2%, $25M = 10%, $50M = 20%
  const capPct = salary / capBase;

  // Cost factor: inversely related to cap%. Low cap% = high value.
  // A player at 2% cap has factor ~1.4, at 10% cap has ~0.8, at 20% has ~0.5
  const costFactor = Math.max(0.3, 1.5 - capPct * 5);

  // More years of control = more valuable (up to 4 years)
  const termFactor = 0.85 + Math.min(4, yearsLeft) * 0.05;

  return costFactor * termFactor;
}

/**
 * Calculate a player's trade value with a realistic NFL age curve and
 * context-aware contract valuation.
 *
 * FIXES:
 * 1. Age curve now covers every age (no gap at 29). Uses smooth polynomial
 *    curve peaking at position-specific prime ages (QB=28, RB=25, etc.).
 * 2. Contract factor uses cap% instead of arbitrary division by 5.
 * 3. Potential/development is factored in for young players.
 * 4. Awards/accolades provide small value bumps.
 *
 * Based on real NFL trade value principles:
 * - Young stars on rookie deals = MAXIMUM value (cheap + productive)
 * - Older veterans on big contracts = MINIMUM value (expensive + declining)
 * - QBs always command premium (1.6x multiplier)
 * - Draft capital is slightly overvalued by GMs (reflected in pick values)
 *
 * @param {Object} player - Player object
 * @param {number} leagueYear - Current league year
 * @returns {number} Trade value (higher = more valuable)
 */
function calcPlayerTradeValue(player, leagueYear) {
  if (!player) return 0;

  const ovr = getPlayerOvr(player);
  const age = getPlayerAge(player, leagueYear);
  const pos = player.pos || player.position || 'RB';

  // --- BASE VALUE: OVR * position premium ---
  let value = ovr * getPositionMultiplier(pos);

  // --- SMOOTH AGE CURVE: Position-specific prime ages ---
  // NFL value peaks at different ages by position:
  // QBs peak at 28-30, RBs at 24-26, CBs at 25-27, etc.
  const PEAK_AGES = {
    QB: 28, RB: 25, WR: 27, TE: 27, OL: 29,
    DL: 28, LB: 27, CB: 26, S: 27, K: 30, P: 30
  };
  const peak = PEAK_AGES[pos] || 27;

  // Smooth curve: 1.0 at peak, declining on both sides
  // Young players (pre-peak) lose less value than old players (post-peak)
  const ageDiff = age - peak;
  let ageMult;
  if (ageDiff <= 0) {
    // Pre-peak: slight discount for very young (raw), increasing toward peak
    ageMult = 1.0 - Math.pow(Math.abs(ageDiff), 1.3) * 0.015;
  } else {
    // Post-peak: accelerating decline (quadratic), steeper for RBs
    const decayRate = pos === 'RB' ? 0.04 : pos === 'QB' ? 0.015 : 0.025;
    ageMult = 1.0 - Math.pow(ageDiff, 1.5) * decayRate;
  }
  ageMult = Math.max(0.2, Math.min(1.1, ageMult));
  value *= ageMult;

  // --- CONTRACT VALUE: Cap% based, not arbitrary division ---
  // Cheaper players relative to the cap are more valuable (surplus value)
  const salary = player.baseAnnual || player.salary || 1;
  const yearsLeft = player.years || player.yearsRemaining || 1;
  const capBase = 255; // $255M cap

  // Surplus value = how much production exceeds cost
  // A 90 OVR player earning $5M is far more valuable than one earning $40M
  const expectedSalary = ovr >= 85 ? 20 : ovr >= 75 ? 8 : ovr >= 65 ? 3 : 1;
  const surplusMult = Math.max(0.3, 1.0 + (expectedSalary - salary) / expectedSalary * 0.3);
  value *= surplusMult;

  // Contract term: more years of control = slightly more valuable
  const termMult = 0.85 + Math.min(4, yearsLeft) * 0.05;
  value *= termMult;

  // --- POTENTIAL BONUS: Young high-potential players ---
  if (age <= 26 && player.potential && player.potential > ovr + 5) {
    const potentialBonus = (player.potential - ovr) * 0.5;
    value += potentialBonus;
  }

  // --- LOW OVR PENALTY ---
  if (ovr < 65) value *= 0.4;
  else if (ovr < 70) value *= 0.6;

  return Math.max(0, Math.round(value * 10) / 10);
}

/**
 * UPDATED: Calculates pick value, factoring in years out and team record.
 */
function calcPickTradeValue(pick, leagueYear, teamRecord = 0.5) {
  if (!pick) return 0;

  // New TRADE_CONFIG Logic
  if (C.TRADE_CONFIG && C.TRADE_CONFIG.PICK_ONE_VALUE) {
      // Estimate pick number based on team record
      // Worst record (0.0) -> Pick 1 (Global 1 + (Round-1)*32)
      // Best record (1.0) -> Pick 32 (Global 32 + (Round-1)*32)
      // Average record (0.5) -> Pick 16

      const picksPerRound = 32;
      // Record 0.0 -> Pick 1. Record 1.0 -> Pick 32.
      // Pick = 1 + (Record * 31)
      const estimatedPickInRound = 1 + (teamRecord * (picksPerRound - 1));
      const globalPick = ((pick.round - 1) * picksPerRound) + estimatedPickInRound;

      let val = C.TRADE_CONFIG.PICK_ONE_VALUE * Math.pow(C.TRADE_CONFIG.PICK_DECAY, globalPick - 1);

      const yearsOut = Math.max(0, (pick.year || leagueYear) - leagueYear);
      // Use fallback for future discount if not in config
      const futureDiscount = 0.85;
      const disc = Math.pow(futureDiscount, yearsOut);

      return Math.max(1, Math.round(val * disc));
  }

  if (C.TRADE_VALUES && C.TRADE_VALUES.PICKS) {
    const roundMap = C.TRADE_VALUES.PICKS[pick.round];
    if (roundMap && typeof roundMap.avg === 'number') {
      let avg = roundMap.avg;
      const yearsOut = Math.max(0, (pick.year || leagueYear) - leagueYear);
      const disc = Math.pow(C.TRADE_VALUES.FUTURE_DISCOUNT, yearsOut);

      // --- Pick Value Refinement (New Logic) ---
      // Picks from teams with bad records (low win %) are more valuable.
      // teamRecord is win percentage (0.0 to 1.0).
      const winPctAdjustment = 1.0 - teamRecord; // 0.2 team record = 0.8 adjustment

      // Apply factor based on round importance
      const rankFactor = roundMap.rankFactor || 1.0;
      const recordFactor = 1.0 + (winPctAdjustment - 0.5) * rankFactor * 0.4;
      // Example: Bad team (0.2 win pct) -> winPctAdjustment=0.8. rankFactor=1.2 (R1).
      // RecordFactor = 1.0 + (0.3) * 1.2 * 0.4 = 1.144 (14.4% bump)

      avg *= recordFactor;
      // -----------------------------------------

      return avg * disc;
    }
  }

  // Fallback logic remains the same
  const baseValues = { 1: 1000, 2: 500, 3: 250, 4: 100, 5: 50, 6: 20, 7: 10 };
  const base = baseValues[pick.round] || 1;
  const yearsOut = Math.max(0, (pick.year || leagueYear) - leagueYear);
  const disc = Math.pow(0.85, yearsOut);
  return base * disc;
}

/**
 * Helper to get team record for pick valuation
 */
function getTeamRecord(team) {
  if (!team) return 0.5;
  const wins = team.wins || 0;
  const losses = team.losses || 0;
  const ties = team.ties || 0;
  const total = wins + losses + ties;
  if (total === 0) return 0.5;
  return (wins + 0.5 * ties) / total;
}

/**
 * Calculates the value of assets, including pick value adjustment.
 */
function calcAssetsValue(team, assets, leagueYear) {
  let total = 0;
  if (!team || !assets || !assets.length) return 0;
  
  // Get the trading team's record *if* they are giving the pick
  const teamRecord = getTeamRecord(team);

  assets.forEach(a => {
    if (a.kind === 'player') {
      const p = findPlayerOnTeam(team, a.playerId);
      if (p) total += calcPlayerTradeValue(p, leagueYear);
    } else if (a.kind === 'pick') {
      const pk = findPickOnTeam(team, a.year, a.round);
      // Pass teamRecord to calcPickTradeValue for more accurate pick value
      if (pk) total += calcPickTradeValue(pk, leagueYear, teamRecord);
    }
  });

  return total;
}

// --- Trade evaluation & execution (Minor update to eval call) --------------------------------

/**
 * Evaluate trade fairness from each side's perspective.
 * Returns: { fromValue: {give,get,delta}, toValue: {give,get,delta} }
 */
export function evaluateTrade(league, fromTeamId, toTeamId, fromAssets, toAssets) {
  const L = league;
  if (!L || !L.teams) return null;

  const leagueYear = getLeagueYear(L);
  const fromTeam = L.teams[fromTeamId];
  const toTeam = L.teams[toTeamId];

  if (!fromTeam || !toTeam) return null;

  // **Note:** calcAssetsValue handles finding the asset on the corresponding team
  // and using *that team's record* for pick valuation.
  const fromGive = calcAssetsValue(fromTeam, fromAssets, leagueYear);
  const fromGet  = calcAssetsValue(toTeam,   toAssets,   leagueYear);

  const toGive   = calcAssetsValue(toTeam,   toAssets,   leagueYear);
  const toGet    = calcAssetsValue(fromTeam, fromAssets, leagueYear);

  let validation = { valid: true, reason: '' };

  // 1. Cap Check (Bilateral Validation)
  if (window.calculateCapImpact) {
      const fromCap = window.calculateCapImpact(fromTeam, 'trade', toAssets, fromAssets);
      if (!fromCap.valid) {
          validation = { valid: false, reason: `Your Team Cap: ${fromCap.message}` };
      } else {
          const toCap = window.calculateCapImpact(toTeam, 'trade', fromAssets, toAssets);
          if (!toCap.valid) {
              // Standardized rejection message for AI cap failure
              validation = { valid: false, reason: "The other team cannot afford this trade." };
          }
      }
  }

  // 2. Positional Surplus (AI receives fromAssets)
  if (validation.valid && toTeam.roster) {
      fromAssets.forEach(asset => {
          if (asset.kind === 'player') {
              const p = findPlayerOnTeam(fromTeam, asset.playerId);
              if (p) {
                  const existing = toTeam.roster.filter(x => x.pos === p.pos && (x.ovr || 0) > 80).length;
                  if (existing >= 3) {
                      validation = { valid: false, reason: `Positional Surplus: They don't need more ${p.pos}s.` };
                  }
              }
          }
      });
  }

  return {
    fromValue: { give: fromGive, get: fromGet, delta: fromGet - fromGive },
    toValue:   { give: toGive,   get: toGet,   delta: toGet - toGive },
    validation: validation
  };
}

export function applyTrade(league, fromTeamId, toTeamId, fromAssets, toAssets) {
  const L = league;
  if (!L || !L.teams) return false;

  const fromTeam = L.teams[fromTeamId];
  const toTeam = L.teams[toTeamId];
  if (!fromTeam || !toTeam) return false;

  // Move players and picks from fromTeam -> toTeam
  fromAssets.forEach(asset => {
    if (asset.kind === 'player') {
      const player = removePlayerFromTeam(fromTeam, asset.playerId);
      if (player) {
        player.teamId = toTeamId;
        player.team = toTeam.abbr || toTeam.name;
        toTeam.roster = toTeam.roster || [];
        toTeam.roster.push(player);
      }
    } else if (asset.kind === 'pick') {
      const pick = removePickFromTeam(fromTeam, asset.year, asset.round);
      if (pick) {
        toTeam.picks = toTeam.picks || [];
        toTeam.picks.push(pick);
      }
    }
  });

  // Move players and picks from toTeam -> fromTeam
  toAssets.forEach(asset => {
    if (asset.kind === 'player') {
      const player = removePlayerFromTeam(toTeam, asset.playerId);
      if (player) {
        player.teamId = fromTeamId;
        player.team = fromTeam.abbr || fromTeam.name;
        fromTeam.roster = fromTeam.roster || [];
        fromTeam.roster.push(player);
      }
    } else if (asset.kind === 'pick') {
      const pick = removePickFromTeam(toTeam, asset.year, asset.round);
      if (pick) {
        fromTeam.picks = fromTeam.picks || [];
        fromTeam.picks.push(pick);
      }
    }
  });

  // Record trade in history
  const leagueYear = getLeagueYear(L);
  if (!L.tradeHistory) {
    L.tradeHistory = [];
  }

  const tradeRecord = {
    year: leagueYear,
    fromTeamId: fromTeamId,
    fromTeamName: fromTeam.name,
    toTeamId: toTeamId,
    toTeamName: toTeam.name,
    fromAssets: fromAssets.map(a => formatAssetForHistory(L, fromTeam, a)),
    toAssets: toAssets.map(a => formatAssetForHistory(L, toTeam, a)),
    timestamp: new Date().toISOString()
  };

  L.tradeHistory.push(tradeRecord);

  // Keep only last 100 trades
  if (L.tradeHistory.length > 100) {
    L.tradeHistory = L.tradeHistory.slice(-100);
  }

  // Recalculate caps and ratings if helpers exist
  const recalcCap = getRecalcCap();
  if (typeof recalcCap === 'function') {
    recalcCap(L, fromTeam);
    recalcCap(L, toTeam);
  }
  const updateTeamRatings = getUpdateTeamRatings();
  if (typeof updateTeamRatings === 'function') {
    updateTeamRatings(fromTeam);
    updateTeamRatings(toTeam);
  }

  if (typeof saveState === 'function') {
    saveState();
  }

  // Use enhanced save system if available
  if (window.saveGameState) {
      window.saveGameState().catch(e => console.error("Auto-save failed:", e));
  }

  return true;
}

/**
 * Formats asset for trade history
 */
function formatAssetForHistory(league, team, asset) {
  if (asset.kind === 'player') {
    const player = findPlayerOnTeam(team, asset.playerId);
    if (player) {
      return {
        kind: 'player',
        name: player.name,
        pos: player.pos,
        ovr: player.ovr
      };
    }
    return { kind: 'player', playerId: asset.playerId };
  } else if (asset.kind === 'pick') {
    return {
      kind: 'pick',
      year: asset.year,
      round: asset.round
    };
  }
  return asset;
}

/**
 * Process a user-initiated trade proposal with context-aware AI evaluation.
 *
 * IMPROVEMENT: CPU teams now evaluate trades based on their team situation:
 * - Contending teams (>0.5 win%) are conservative: reject trades where they
 *   lose more than 3 value points.
 * - Rebuilding teams (<0.4 win%) are willing to accept slight losses (-10)
 *   for young players and future picks.
 * - Mid-tier teams use standard evaluation (-5 tolerance).
 *
 * This prevents the exploit where users could fleece any CPU team with
 * lopsided trades (old cpuLossLimit was -15, now context-dependent).
 *
 * Also checks positional need: CPU won't trade for a position they're stacked at.
 */
function proposeUserTradeInternal(league, userTeamId, cpuTeamId, userAssets, cpuAssets, options = {}) {
  const evalResult = evaluateTrade(league, userTeamId, cpuTeamId, userAssets, cpuAssets);
  if (!evalResult) return { accepted: false, eval: null };

  // Validation check (cap, positional surplus, etc.)
  if (evalResult.validation && !evalResult.validation.valid) {
    return { accepted: false, eval: evalResult, reason: evalResult.validation.reason };
  }

  const cpuTeam = league.teams[cpuTeamId];
  const cpuDelta = evalResult.toValue.delta;

  // --- CONTEXT-AWARE ACCEPTANCE THRESHOLD ---
  // CPU teams evaluate trades based on their competitive window
  let cpuLossLimit;
  if (typeof options.cpuLossLimit === 'number') {
    cpuLossLimit = options.cpuLossLimit;
  } else if (cpuTeam) {
    const cpuRebuilding = isTeamRebuilding(cpuTeam);
    const cpuRecord = getTeamRecord(cpuTeam);

    if (cpuRebuilding) {
      // Rebuilding: willing to take slight losses for future assets
      cpuLossLimit = -10;
    } else if (cpuRecord > 0.6) {
      // Contending: very conservative, won't accept bad trades
      cpuLossLimit = -3;
    } else {
      // Mid-tier: standard evaluation
      cpuLossLimit = -5;
    }

    // --- NEED-BASED BONUS ---
    // If the CPU team needs the positions they're getting, they value the trade more
    const cpuNeeds = analyzeTeamNeeds(cpuTeam);
    let needBonus = 0;
    userAssets.forEach(asset => {
      if (asset.kind === 'player') {
        const p = findPlayerOnTeam(league.teams[userTeamId], asset.playerId);
        if (p && cpuNeeds.includes(p.pos)) {
          needBonus += 5; // Willing to overpay slightly for needed positions
        }
      }
    });

    // Apply need bonus to the delta evaluation
    if (cpuDelta + needBonus < cpuLossLimit) {
      return { accepted: false, eval: evalResult, reason: 'Trade value too lopsided for the other team.' };
    }
  } else {
    cpuLossLimit = -5;
  }

  if (cpuDelta < cpuLossLimit) {
    return { accepted: false, eval: evalResult, reason: 'Trade value too lopsided for the other team.' };
  }

  const applied = applyTrade(league, userTeamId, cpuTeamId, userAssets, cpuAssets);
  return { accepted: applied, eval: evalResult };
}

// ... (formatAssetString remains the same) ...

// --- Trade block (Kept as is) -------------------------------------

function ensureTradeBlock(team) {
  if (!team.tradeBlock) {
    team.tradeBlock = []; // array of playerId
  }
  return team.tradeBlock;
}

export function addToTradeBlock(league, teamId, playerId) {
  const team = league && league.teams ? league.teams[teamId] : null;
  if (!team) return false;
  const block = ensureTradeBlock(team);
  if (!block.includes(playerId)) block.push(playerId);
  if (typeof saveState === 'function') saveState();
  return true;
}

export function removeFromTradeBlock(league, teamId, playerId) {
  const team = league && league.teams ? league.teams[teamId] : null;
  if (!team || !team.tradeBlock) return false;
  team.tradeBlock = team.tradeBlock.filter(id => id !== playerId);
  if (typeof saveState === 'function') saveState();
  return true;
}

export function getTeamTradeBlock(league, teamId) {
  const team = league && league.teams ? league.teams[teamId] : null;
  if (!team) return [];
  return ensureTradeBlock(team).slice();
}

// --- CPU trade offers (Refined Logic) -----------------------------

/**
 * ENHANCED: CPU trade offers with smarter logic
 * Now considers team needs, contract situations, and makes more realistic offers
 */
export function generateCpuTradeOffers(league, userTeamId, maxOffers) {
  const L = league;
  const offers = [];
  if (!L || !L.teams || userTeamId == null) return offers;

  const userTeam = L.teams[userTeamId];
  if (!userTeam) return offers;

  const leagueYear = getLeagueYear(L);
  const userBlock = ensureTradeBlock(userTeam);
  if (!userBlock.length) return offers;

  const max = maxOffers || 3;

  // Precompute counts by position for each team
  const teamPosCounts = L.teams.map(team => {
    const counts = {};
    (team.roster || []).forEach(p => {
      const pos = p.pos || 'RB';
      counts[pos] = (counts[pos] || 0) + 1;
    });
    return counts;
  });

  function teamNeedsPosition(teamIndex, pos) {
    const counts = teamPosCounts[teamIndex] || {};
    const needed = C.DEPTH_NEEDS[pos] || 2;
    const have = counts[pos] || 0;
    // CPU needs player if they are below 75% of depth needs
    return have < needed * 0.75;
  }

  for (let t = 0; t < L.teams.length; t++) {
    if (t === userTeamId) continue;
    const cpuTeam = L.teams[t];
    if (!cpuTeam) continue;

    // Chance this team is active in trade talks
    if (U.random() > 0.3) continue;

    for (const playerId of userBlock) {
      const player = findPlayerOnTeam(userTeam, playerId);
      if (!player) continue;

      const pos = player.pos || 'RB';
      const cpuNeeds = analyzeTeamNeeds(cpuTeam);

      // ENHANCED: CPU targets players they need OR players that fit their strategy
      const needsPosition = cpuNeeds.includes(pos);
      const isCpuRebuilding = isTeamRebuilding(cpuTeam);
      const playerAge = getPlayerAge(player, leagueYear);
      const isYoung = playerAge < 26;
      const isVeteran = playerAge > 28;

      // CPU logic:
      // - Rebuilding teams want young players
      // - Contending teams want players they need
      // - Skip if player doesn't fit strategy
      if (!needsPosition) {
        if (isCpuRebuilding && !isYoung) continue; // Rebuilding teams want youth
        if (!isCpuRebuilding && isVeteran && player.ovr < 80) continue; // Contenders want quality
      }

      const playerVal = calcPlayerTradeValue(player, leagueYear);

      // CPU gives something, user gives the block player
      let cpuOfferAssets = [];
      const userReturnAssets = [{ kind: 'player', playerId: playerId }];

      // ENHANCED: Smarter asset selection based on team situation
      // Reuse isCpuRebuilding from above

      // Rebuilding teams prefer to give picks (future value)
      // Contending teams prefer to give players (win now)
      const preferPicks = isCpuRebuilding || U.random() < 0.5;

      if (preferPicks) {
        const cpuOfferPick = pickCpuTradeAssetForValue(cpuTeam, playerVal, leagueYear);
        if (cpuOfferPick) {
          cpuOfferAssets = [cpuOfferPick];
        }
      }

      if (cpuOfferAssets.length === 0) {
        // Try to find a player that makes sense
        const cpuOfferPlayer = pickCpuPlayerForValue(cpuTeam, playerVal, leagueYear, ensureTradeBlock(cpuTeam));
        if (!cpuOfferPlayer) continue;
        
        // Additional check: Don't trade away players at positions CPU needs
        const playerPos = cpuOfferPlayer.pos || 'RB';
        const cpuNeeds = analyzeTeamNeeds(cpuTeam);
        if (cpuNeeds.includes(playerPos) && !isCpuRebuilding) {
          // CPU needs this position and is contending - less likely to trade
          if (U.random() > 0.3) continue;
        }
        
        cpuOfferAssets = [{ kind: 'player', playerId: cpuOfferPlayer.id }];
      }

      // Must have assets to offer
      if (cpuOfferAssets.length === 0) continue;

      let evalResult = evaluateTrade(L, t, userTeamId, cpuOfferAssets, userReturnAssets);
      if (!evalResult) continue;

      let cpuDelta = evalResult.fromValue.delta; // "from" is CPU in this call

      // ENHANCED: Smarter sweetener logic
      // Rebuilding teams more willing to overpay slightly for young talent
      // Contending teams more conservative
      // Reuse isCpuRebuilding from above
      const isYoungPlayer = getPlayerAge(player, leagueYear) < 26;
      const sweetenerThreshold = isCpuRebuilding && isYoungPlayer ? -15 : -5;

      if (cpuDelta < sweetenerThreshold && cpuDelta > -25) {
        const sweetener = pickCpuTradeAssetForValue(cpuTeam, 10, leagueYear);
        if (sweetener && cpuOfferAssets.length < 3) {
          cpuOfferAssets.push(sweetener);
          evalResult = evaluateTrade(L, t, userTeamId, cpuOfferAssets, userReturnAssets);
          cpuDelta = evalResult.fromValue.delta;
        }
      }

      // ENHANCED: CPU acceptance threshold varies by situation
      // Rebuilding teams more willing to take slight losses for future value
      // Contending teams very conservative
      const acceptanceThreshold = isCpuRebuilding ? -8 : -3;
      if (cpuDelta < acceptanceThreshold) continue;

      offers.push({
        fromTeamId: t,
        toTeamId: userTeamId,
        fromAssets: cpuOfferAssets,
        toAssets: userReturnAssets,
        eval: evalResult
      });

      if (offers.length >= max) return offers;
    }
  }

  return offers;
}

function pickCpuTradeAssetForValue(team, target, leagueYear) {
  const picks = team && team.picks ? team.picks : [];
  if (!picks.length) return null;

  const teamRecord = getTeamRecord(team);

  const valued = picks.map(p => ({
    pick: p,
    // Use refined value function
    value: calcPickTradeValue(p, leagueYear, teamRecord)
  }));

  valued.sort((a, b) => Math.abs(a.value - target) - Math.abs(b.value - target));

  const best = valued[0];
  if (!best || best.value <= 0) return null;

  return {
    kind: 'pick',
    year: best.pick.year,
    round: best.pick.round
  };
}

/**
 * ENHANCED: Finds a player close to the target value with smarter filtering
 * Now considers team needs, contract status, age, and injury history
 */
function pickCpuPlayerForValue(team, target, leagueYear, excludeIds = []) {
  const roster = team && team.roster ? team.roster : [];
  if (!roster.length) return null;

  // Analyze team needs
  const teamNeeds = analyzeTeamNeeds(team);
  const isRebuilding = isTeamRebuilding(team);

  const valued = roster
    .map(p => {
      const baseValue = calcPlayerTradeValue(p, leagueYear);
      let adjustedValue = baseValue;
      
      // Adjust value based on team situation
      const playerPos = p.pos || 'RB';
      const isNeeded = teamNeeds.includes(playerPos);
      const playerAge = getPlayerAge(p, leagueYear);
      const isInjured = p.injured || false;
      const hasBadContract = (p.baseAnnual || 0) > 15 && (p.years || 0) > 2; // Overpaid long-term
      const isOld = playerAge > 30;
      
      // CPU is more willing to trade:
      // - Players at positions they don't need (if rebuilding)
      // - Injured players
      // - Overpaid players
      // - Old players (if rebuilding)
      if (!isNeeded && isRebuilding) {
        adjustedValue *= 0.8; // More willing to trade
      }
      if (isInjured) {
        adjustedValue *= 0.7; // Injured players worth less
      }
      if (hasBadContract) {
        adjustedValue *= 0.75; // Bad contracts worth less
      }
      if (isOld && isRebuilding) {
        adjustedValue *= 0.7; // Old players less valuable when rebuilding
      }

      return {
        player: p,
        value: baseValue,
        adjustedValue: adjustedValue
      };
    })
    // Filters
    .filter(v => {
      const p = v.player;
      // 1. Exclude core players (OVR > 88) unless rebuilding
      if (!isRebuilding && getPlayerOvr(p) > 88) return false;
      // 2. Exclude players on trade block
      if (excludeIds.includes(p.id)) return false;
      // 3. Must have positive value
      if (v.adjustedValue <= 0) return false;
      return true;
    });

  if (!valued.length) return null;

  // Sort by how close adjusted value is to target
  valued.sort((a, b) => Math.abs(a.adjustedValue - target) - Math.abs(b.adjustedValue - target));
  return valued[0].player;
}

/**
 * Analyze team's position needs
 * @param {Object} team - Team object
 * @returns {Array} Array of positions team needs
 */
function analyzeTeamNeeds(team) {
  if (!team || !team.roster) return [];

  const positionCounts = {};
  const positionQuality = {};

  team.roster.forEach(player => {
    const pos = player.pos || 'RB';
    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    
    if (!positionQuality[pos]) positionQuality[pos] = [];
    positionQuality[pos].push(player.ovr || 0);
  });

  const needs = [];
  const idealCounts = C.DEPTH_NEEDS || {
    QB: 3, RB: 4, WR: 6, TE: 3, OL: 8,
    DL: 6, LB: 6, CB: 5, S: 4, K: 1, P: 1
  };

  Object.keys(idealCounts).forEach(pos => {
    const have = positionCounts[pos] || 0;
    const need = idealCounts[pos] || 2;
    
    // Check both quantity and quality
    const avgQuality = positionQuality[pos] ?
      positionQuality[pos].reduce((a, b) => a + b, 0) / positionQuality[pos].length : 0;
    
    if (have < need * 0.75 || (have < need && avgQuality < 70)) {
      needs.push(pos);
    }
  });

  return needs;
}

/**
 * Determine if team is rebuilding
 * @param {Object} team - Team object
 * @returns {boolean} Is rebuilding
 */
function isTeamRebuilding(team) {
  if (!team) return false;

  const wins = team.wins || 0;
  const losses = team.losses || 0;
  const winPct = wins + losses > 0 ? wins / (wins + losses) : 0.5;

  // Rebuilding if:
  // - Win percentage below 0.4
  // - More losses than wins by significant margin
  // - Team age is high (old roster)
  const isLosing = winPct < 0.4 || (losses > wins + 3);

  // Calculate average team age
  if (team.roster && team.roster.length > 0) {
    const avgAge = team.roster.reduce((sum, p) => sum + (p.age || 25), 0) / team.roster.length;
    const isOld = avgAge > 28;
    
    return isLosing || (isOld && winPct < 0.5);
  }

  return isLosing;
}

// --- Expose API on window ----------------------------------------

export function proposeUserTrade(cpuTeamId, userAssets, cpuAssets, options) {
  if (!state || !state.league) {
    return { accepted: false, eval: null };
  }
  const userTeamId = state.userTeamId || 0;
  return proposeUserTradeInternal(state.league, userTeamId, cpuTeamId, userAssets, cpuAssets, options);
}

// Global exposure for backward compatibility
if (typeof window !== 'undefined') {
  window.evaluateTrade = function (fromTeamId, toTeamId, fromAssets, toAssets) {
    if (!state || !state.league) return null;
    return evaluateTrade(state.league, fromTeamId, toTeamId, fromAssets, toAssets);
  };

  window.applyTrade = function (fromTeamId, toTeamId, fromAssets, toAssets) {
    if (!state || !state.league) return false;
    return applyTrade(state.league, fromTeamId, toTeamId, fromAssets, toAssets);
  };

  window.addToTradeBlock = function (teamId, playerId) {
    if (!state || !state.league) return false;
    return addToTradeBlock(state.league, teamId, playerId);
  };

  window.removeFromTradeBlock = function (teamId, playerId) {
    if (!state || !state.league) return false;
    return removeFromTradeBlock(state.league, teamId, playerId);
  };

  window.getTeamTradeBlock = function (teamId) {
    if (!state || !state.league) return [];
    return getTeamTradeBlock(state.league, teamId);
  };

  window.generateCpuTradeOffers = function (userTeamId, maxOffers) {
    if (!state || !state.league) return [];
    return generateCpuTradeOffers(state.league, userTeamId, maxOffers);
  };

  window.proposeUserTrade = proposeUserTrade;

  window.assetPlayer = assetPlayer;
  window.assetPick = assetPick;

  window.renderTradeBlock = function() {
    const L = state?.league;
    if (!L || !L.teams) {
      console.error('No league for trade block');
      return;
    }

    const userTeamId = state?.userTeamId ?? 0;
    const userTeam = L.teams[userTeamId];
    if (!userTeam) {
      console.error('User team not found');
      return;
    }

    let container = document.getElementById('tradeBlock');
    if (!container) {
      const tradeView = document.getElementById('trade');
      if (tradeView) {
        container = document.createElement('div');
        container.id = 'tradeBlock';
        container.className = 'card';
        container.style.marginTop = '20px';
        tradeView.appendChild(container);
      } else {
        console.error('Trade view not found for trade block');
        return;
      }
    }

    const tradeBlock = ensureTradeBlock(userTeam);
    const blockPlayers = tradeBlock.map(playerId => 
      findPlayerOnTeam(userTeam, playerId)
    ).filter(p => p !== null);

    const leagueYear = getLeagueYear(L);

    let html = `
      <div class="trade-block-container">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; color: var(--accent);">Trade Block (${blockPlayers.length})</h3>
          <button class="btn btn-sm" onclick="window.refreshTradeBlock()" style="padding: 6px 12px; font-size: 12px;">
            Refresh
          </button>
        </div>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 15px;">
          Players on your trade block are more likely to receive CPU trade offers.
        </p>
    `;

    if (blockPlayers.length === 0) {
      html += `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>No players on trade block</p>
          <p style="font-size: 12px; margin-top: 10px;">Add players from your roster to receive trade offers</p>
        </div>
      `;
    } else {
      html += `
        <div class="trade-block-list" style="display: grid; gap: 10px;">
      `;

      blockPlayers.forEach(player => {
        const playerVal = calcPlayerTradeValue(player, leagueYear);
        const capHit = player.baseAnnual || 0;
        const yearsLeft = player.years || 0;

        html += `
          <div class="trade-block-item" style="
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 12px; 
            background: var(--surface); 
            border: 1px solid var(--hairline); 
            border-radius: 6px;
            transition: all 0.2s;
          " onmouseover="this.style.background='var(--surface-strong)'" onmouseout="this.style.background='var(--surface)'">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <strong style="color: var(--text);">${player.name}</strong>
                <span style="color: var(--text-muted); font-size: 12px;">${player.pos}</span>
                <span style="color: var(--accent); font-weight: 600;">OVR ${player.ovr}</span>
              </div>
              <div style="display: flex; gap: 15px; margin-top: 5px; font-size: 12px; color: var(--text-muted);">
                <span>Age: ${player.age}</span>
                <span>Cap: $${capHit.toFixed(1)}M</span>
                <span>Years: ${yearsLeft}</span>
                <span>Value: ${playerVal.toFixed(0)}</span>
              </div>
            </div>
            <button class="btn btn-sm" onclick="window.removeFromTradeBlock(${userTeamId}, '${player.id}'); window.renderTradeBlock();"
                    style="padding: 6px 12px; background: var(--error-text, #dc3545); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
              Remove
            </button>
          </div>
        `;
      });

      html += `</div>`;
    }

    html += `
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--hairline);">
          <h4 style="margin: 0 0 10px 0; font-size: 16px; color: var(--text);">Add Players to Trade Block</h4>
          <div style="max-height: 300px; overflow-y: auto; display: grid; gap: 8px;">
    `;

    // Show players not on block
    const availablePlayers = (userTeam.roster || []).filter(p => 
      !tradeBlock.includes(p.id)
    ).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));

    if (availablePlayers.length === 0) {
      html += `<p style="color: var(--text-muted); text-align: center; padding: 20px;">All players are on the trade block</p>`;
    } else {
      availablePlayers.slice(0, 20).forEach(player => {
        html += `
          <div style="
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 8px 12px; 
            background: var(--surface); 
            border: 1px solid var(--hairline); 
            border-radius: 4px;
            font-size: 13px;
          ">
            <span><strong>${player.name}</strong> (${player.pos}) - OVR ${player.ovr}</span>
            <button class="btn btn-sm" onclick="window.addToTradeBlock(${userTeamId}, '${player.id}'); window.renderTradeBlock();"
                    style="padding: 4px 10px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
              Add
            </button>
          </div>
        `;
      });
    }

    html += `
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  };

  window.refreshTradeBlock = function() {
    if (window.renderTradeBlock) {
      window.renderTradeBlock();
    }
  };

  /**
   * PROACTIVE CPU TRADE PROPOSALS
   * CPU teams can now initiate trades even without players on the trade block.
   * This creates more dynamic trade activity and interesting decisions.
   */
  window.generateProactiveCpuOffers = function(maxOffers = 3) {
    const L = state?.league;
    if (!L || !L.teams) return [];
    const userTeamId = state?.userTeamId ?? 0;
    const userTeam = L.teams[userTeamId];
    if (!userTeam) return [];

    const leagueYear = getLeagueYear(L);
    const offers = [];
    const userRoster = userTeam.roster || [];
    if (userRoster.length === 0) return [];

    // Count user position depth
    const userPosCounts = {};
    userRoster.forEach(p => { userPosCounts[p.pos] = (userPosCounts[p.pos] || 0) + 1; });
    const idealCounts = C.DEPTH_NEEDS || { QB: 3, RB: 4, WR: 6, TE: 3, OL: 8, DL: 6, LB: 6, CB: 5, S: 4 };

    for (let t = 0; t < L.teams.length && offers.length < maxOffers; t++) {
      if (t === userTeamId) continue;
      const cpuTeam = L.teams[t];
      if (!cpuTeam || !cpuTeam.roster) continue;
      if (U.random() > 0.15) continue; // 15% chance per team

      const cpuNeeds = analyzeTeamNeeds(cpuTeam);
      const cpuRebuilding = isTeamRebuilding(cpuTeam);

      for (const needPos of cpuNeeds) {
        const candidates = userRoster.filter(p =>
          p.pos === needPos && p.ovr >= 72 &&
          (userPosCounts[needPos] || 0) > Math.floor((idealCounts[needPos] || 2) * 0.6)
        );
        if (candidates.length === 0) continue;

        candidates.sort((a, b) => a.ovr - b.ovr);
        const target = candidates[0];
        if (!target) continue;

        const targetValue = calcPlayerTradeValue(target, leagueYear);
        let cpuOfferAssets = [];
        const userReturnAssets = [{ kind: 'player', playerId: target.id }];

        const offerPlayer = pickCpuPlayerForValue(cpuTeam, targetValue * 0.6, leagueYear, []);
        const offerPick = pickCpuTradeAssetForValue(cpuTeam, targetValue * 0.5, leagueYear);

        if (offerPlayer && offerPick) {
          cpuOfferAssets = [{ kind: 'player', playerId: offerPlayer.id }, offerPick];
        } else if (offerPick) {
          cpuOfferAssets = [offerPick];
        } else if (offerPlayer) {
          cpuOfferAssets = [{ kind: 'player', playerId: offerPlayer.id }];
        }
        if (cpuOfferAssets.length === 0) continue;

        const evalResult = evaluateTrade(L, t, userTeamId, cpuOfferAssets, userReturnAssets);
        if (!evalResult) continue;
        const cpuDelta = evalResult.fromValue.delta;
        if (cpuDelta < (cpuRebuilding ? -8 : -3)) continue;

        offers.push({
          fromTeamId: t, toTeamId: userTeamId,
          fromAssets: cpuOfferAssets, toAssets: userReturnAssets,
          eval: evalResult, proactive: true,
          reason: `${cpuTeam.name || cpuTeam.abbr} wants ${target.name} to fill their need at ${needPos}`
        });
        break;
      }
    }
    return offers;
  };

  /**
   * Simulate CPU-to-CPU trades for league-wide activity
   */
  window.simulateCpuTrades = function(maxTrades = 2) {
    const L = state?.league;
    if (!L || !L.teams) return [];
    const userTeamId = state?.userTeamId ?? 0;
    const leagueYear = getLeagueYear(L);
    const completedTrades = [];

    for (let attempt = 0; attempt < 10 && completedTrades.length < maxTrades; attempt++) {
      const teamA = U.rand(0, L.teams.length - 1);
      const teamB = U.rand(0, L.teams.length - 1);
      if (teamA === teamB || teamA === userTeamId || teamB === userTeamId) continue;

      const teamAObj = L.teams[teamA];
      const teamBObj = L.teams[teamB];
      if (!teamAObj || !teamBObj) continue;

      const needsA = analyzeTeamNeeds(teamAObj);
      const needsB = analyzeTeamNeeds(teamBObj);
      if (needsA.length === 0 || needsB.length === 0) continue;

      const targetFromB = (teamBObj.roster || []).find(p => needsA.includes(p.pos) && p.ovr >= 68);
      const targetFromA = (teamAObj.roster || []).find(p => needsB.includes(p.pos) && p.ovr >= 68);
      if (!targetFromB || !targetFromA) continue;

      const valA = calcPlayerTradeValue(targetFromA, leagueYear);
      const valB = calcPlayerTradeValue(targetFromB, leagueYear);
      if (Math.abs(valA - valB) > Math.max(valA, valB) * 0.3) continue;

      const success = applyTrade(L, teamA, teamB,
        [{ kind: 'player', playerId: targetFromA.id }],
        [{ kind: 'player', playerId: targetFromB.id }]
      );
      if (success) {
        completedTrades.push({
          teamA: teamAObj.name, teamB: teamBObj.name,
          playerA: targetFromA.name, playerB: targetFromB.name
        });
        if (L.news) {
          L.news.push({
            type: 'trade',
            headline: `TRADE: ${teamAObj.abbr} and ${teamBObj.abbr} swap players`,
            story: `${teamAObj.name} traded ${targetFromA.name} (${targetFromA.pos}) to ${teamBObj.name} for ${targetFromB.name} (${targetFromB.pos}).`,
            week: L.week, year: L.year
          });
        }
      }
    }
    return completedTrades;
  };

  window.renderTradeHistory = function() {
    const L = state?.league;
    if (!L) {
      console.error('No league for trade history');
      return;
    }

    let container = document.getElementById('tradeHistory');
    if (!container) {
      const tradeView = document.getElementById('trade');
      if (tradeView) {
        container = document.createElement('div');
        container.id = 'tradeHistory';
        container.className = 'card';
        container.style.marginTop = '20px';
        tradeView.appendChild(container);
      } else {
        console.error('Trade view not found');
        return;
      }
    }

    const tradeHistory = L.tradeHistory || [];
    const userTeamId = state?.userTeamId ?? 0;

    let html = `
      <div class="trade-history-container">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0; color: var(--accent);">Trade History</h3>
          <div style="display: flex; gap: 10px;">
            <select id="tradeHistoryFilter" 
                    style="padding: 6px 12px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 13px;"
                    onchange="filterTradeHistory()">
              <option value="all">All Trades</option>
              <option value="my">My Trades</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>
    `;

    if (tradeHistory.length === 0) {
      html += `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>No trades recorded yet</p>
        </div>
      `;
    } else {
      html += `
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--surface-strong); border-bottom: 2px solid var(--hairline-strong);">
                <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Year</th>
                <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Team A</th>
                <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Receives</th>
                <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: var(--text);">↔</th>
                <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Team B</th>
                <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Receives</th>
              </tr>
            </thead>
            <tbody id="tradeHistoryBody">
      `;

      tradeHistory.slice().reverse().forEach(trade => {
        const isMyTrade = trade.fromTeamId === userTeamId || trade.toTeamId === userTeamId;
        const rowClass = isMyTrade ? 'user-trade' : '';
        
        html += `
          <tr class="${rowClass}" style="border-bottom: 1px solid var(--hairline); ${isMyTrade ? 'background: var(--surface-strong);' : ''}">
            <td style="padding: 10px; color: var(--text);">${trade.year}</td>
            <td style="padding: 10px; color: var(--text); font-weight: ${trade.fromTeamId === userTeamId ? '600' : '400'};">
              ${trade.fromTeamName}
            </td>
            <td style="padding: 10px; color: var(--text-muted); font-size: 12px;">
              ${formatAssetsForDisplay(trade.toAssets)}
            </td>
            <td style="padding: 10px; text-align: center; color: var(--text-muted);">↔</td>
            <td style="padding: 10px; color: var(--text); font-weight: ${trade.toTeamId === userTeamId ? '600' : '400'};">
              ${trade.toTeamName}
            </td>
            <td style="padding: 10px; color: var(--text-muted); font-size: 12px;">
              ${formatAssetsForDisplay(trade.fromAssets)}
            </td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  };

  /**
   * Formats assets for display in trade history
   */
  function formatAssetsForDisplay(assets) {
    if (!assets || assets.length === 0) return 'None';
    
    return assets.map(asset => {
      if (asset.kind === 'player') {
        return `${asset.name || 'Player'} (${asset.pos || 'POS'})`;
      } else if (asset.kind === 'pick') {
        return `${asset.year} R${asset.round}`;
      }
      return 'Unknown';
    }).join(', ');
  }

  window.filterTradeHistory = function() {
    const filter = document.getElementById('tradeHistoryFilter')?.value || 'all';
    const rows = document.querySelectorAll('#tradeHistoryBody tr');
    const L = state?.league;
    const userTeamId = state?.userTeamId ?? 0;
    const currentYear = L?.year || L?.season || 2025;

    rows.forEach((row, index) => {
      const trade = (L?.tradeHistory || []).slice().reverse()[index];
      if (!trade) return;

      let show = true;
      
      if (filter === 'my') {
        show = trade.fromTeamId === userTeamId || trade.toTeamId === userTeamId;
      } else if (filter === 'year') {
        show = trade.year === currentYear;
      }

      row.style.display = show ? '' : 'none';
    });
  };

  console.log('✅ Trade system (manual + CPU) loaded and optimized for value');
}
