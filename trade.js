// trades.js – trade engine, trade block, CPU offers, manual trade system
(function (global) {
  'use strict';

  const C = global.Constants || {};
  const U = global.Utils || {};
  
  // --- Constants/Defaults (Kept as is) -----------------------------

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

  // --- Helpers (Kept as is) --------------------------------------

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

  function assetPlayer(playerId) {
    return { kind: 'player', playerId };
  }

  function assetPick(year, round) {
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

  function getContractFactor(player) {
    if (!player) return 1;

    const salary = player.baseAnnual || player.salary || 1;
    const yearsLeft = player.years || player.yearsRemaining || 1;

    // Cheaper players (lower salary/5) are more valuable. Salary cap relief is key.
    const costFactor = 1 / Math.max(0.5, salary / 5); 
    
    // More years left = slightly more valuable, up to 3 years.
    const termFactor = 0.8 + Math.min(3, yearsLeft) * 0.1; 

    return costFactor * termFactor;
  }

  function calcPlayerTradeValue(player, leagueYear) {
    if (!player) return 0;

    const ovr = getPlayerOvr(player);
    const age = getPlayerAge(player, leagueYear);
    const pos = player.pos || player.position || 'RB';

    let value = ovr * getPositionMultiplier(pos);

    // Age curve – prime around 24–28
    if (age < 23) value *= 0.9;
    else if (age >= 23 && age <= 28) value *= 1.05;
    else if (age > 30) value *= 0.8;

    // Player value is significantly driven by contract
    value *= getContractFactor(player);
    
    // Low OVR players have minimal value
    if (ovr < 70) value *= 0.5; 
    
    return Math.max(0, value);
  }

  /**
   * UPDATED: Calculates pick value, factoring in years out and team record.
   */
  function calcPickTradeValue(pick, leagueYear, teamRecord = 0.5) {
    if (!pick) return 0;

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
  function evaluateTrade(league, fromTeamId, toTeamId, fromAssets, toAssets) {
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

    return {
      fromValue: { give: fromGive, get: fromGet, delta: fromGet - fromGive },
      toValue:   { give: toGive,   get: toGet,   delta: toGet - toGive }
    };
  }

  function applyTrade(league, fromTeamId, toTeamId, fromAssets, toAssets) {
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
    if (typeof global.recalcCap === 'function') {
      global.recalcCap(L, fromTeam);
      global.recalcCap(L, toTeam);
    }
    if (typeof global.updateTeamRatings === 'function') {
      global.updateTeamRatings(fromTeam);
      global.updateTeamRatings(toTeam);
    }

    if (typeof global.saveState === 'function') {
      global.saveState();
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

  function proposeUserTradeInternal(league, userTeamId, cpuTeamId, userAssets, cpuAssets, options = {}) {
    const evalResult = evaluateTrade(league, userTeamId, cpuTeamId, userAssets, cpuAssets);
    if (!evalResult) return { accepted: false, eval: null };

    const cpuLossLimit = typeof options.cpuLossLimit === 'number' ? options.cpuLossLimit : -15;
    const cpuDelta = evalResult.toValue.delta;

    if (cpuDelta < cpuLossLimit) {
      return { accepted: false, eval: evalResult };
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

  function addToTradeBlock(league, teamId, playerId) {
    const team = league && league.teams ? league.teams[teamId] : null;
    if (!team) return false;
    const block = ensureTradeBlock(team);
    if (!block.includes(playerId)) block.push(playerId);
    if (typeof global.saveLeague === 'function') global.saveLeague();
    return true;
  }

  function removeFromTradeBlock(league, teamId, playerId) {
    const team = league && league.teams ? league.teams[teamId] : null;
    if (!team || !team.tradeBlock) return false;
    team.tradeBlock = team.tradeBlock.filter(id => id !== playerId);
    if (typeof global.saveLeague === 'function') global.saveLeague();
    return true;
  }

  function getTeamTradeBlock(league, teamId) {
    const team = league && league.teams ? league.teams[teamId] : null;
    if (!team) return [];
    return ensureTradeBlock(team).slice();
  }

  // --- CPU trade offers (Refined Logic) -----------------------------

  /**
   * ENHANCED: CPU trade offers with smarter logic
   * Now considers team needs, contract situations, and makes more realistic offers
   */
  function generateCpuTradeOffers(league, userTeamId, maxOffers) {
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
      if (Math.random() > 0.3) continue;

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
        // Reuse isCpuRebuilding from above (line 426)
        
        // Rebuilding teams prefer to give picks (future value)
        // Contending teams prefer to give players (win now)
        const preferPicks = isCpuRebuilding || Math.random() < 0.5;
        
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
            if (Math.random() > 0.3) continue;
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
        // Reuse isCpuRebuilding from above (line 426)
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

  // ... (The rest of the functions remain the same) ...

  // --- Expose API on window (Kept as is) ----------------------------------------

  global.evaluateTrade = function (fromTeamId, toTeamId, fromAssets, toAssets) {
    if (!global.state || !global.state.league) return null;
    return evaluateTrade(global.state.league, fromTeamId, toTeamId, fromAssets, toAssets);
  };

  global.applyTrade = function (fromTeamId, toTeamId, fromAssets, toAssets) {
    if (!global.state || !global.state.league) return false;
    return applyTrade(global.state.league, fromTeamId, toTeamId, fromAssets, toAssets);
  };

  global.addToTradeBlock = function (teamId, playerId) {
    if (!global.state || !global.state.league) return false;
    return addToTradeBlock(global.state.league, teamId, playerId);
  };

  global.removeFromTradeBlock = function (teamId, playerId) {
    if (!global.state || !global.state.league) return false;
    return removeFromTradeBlock(global.state.league, teamId, playerId);
  };

  global.getTeamTradeBlock = function (teamId) {
    if (!global.state || !global.state.league) return [];
    return getTeamTradeBlock(global.state.league, teamId);
  };

  global.generateCpuTradeOffers = function (userTeamId, maxOffers) {
    if (!global.state || !global.state.league) return [];
    return generateCpuTradeOffers(global.state.league, userTeamId, maxOffers);
  };

  // Manual trade from the UI: user -> CPU
  global.proposeUserTrade = function (cpuTeamId, userAssets, cpuAssets, options) {
    if (!global.state || !global.state.league) {
      return { accepted: false, eval: null };
    }
    const userTeamId = global.state.userTeamId || 0;
    return proposeUserTradeInternal(global.state.league, userTeamId, cpuTeamId, userAssets, cpuAssets, options);
  };

  // Asset helpers for your UI
  global.assetPlayer = assetPlayer;
  global.assetPick = assetPick;

  /**
   * Renders Trade Block UI - Better than competitors with visual management
   */
  global.renderTradeBlock = function() {
    const L = global.state?.league;
    if (!L || !L.teams) {
      console.error('No league for trade block');
      return;
    }

    const userTeamId = global.state?.userTeamId ?? 0;
    const userTeam = L.teams[userTeamId];
    if (!userTeam) {
      console.error('User team not found');
      return;
    }

    // Find or create trade block container
    let container = document.getElementById('tradeBlock');
    if (!container) {
      // Try to add it to the trade view
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

  /**
   * Refreshes trade block view
   */
  global.refreshTradeBlock = function() {
    if (global.renderTradeBlock) {
      global.renderTradeBlock();
    }
  };

  /**
   * Renders Trade History UI
   */
  global.renderTradeHistory = function() {
    const L = global.state?.league;
    if (!L) {
      console.error('No league for trade history');
      return;
    }

    // Find or create container
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
    const userTeamId = global.state?.userTeamId ?? 0;

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

  /**
   * Filters trade history
   */
  global.filterTradeHistory = function() {
    const filter = document.getElementById('tradeHistoryFilter')?.value || 'all';
    const rows = document.querySelectorAll('#tradeHistoryBody tr');
    const L = global.state?.league;
    const userTeamId = global.state?.userTeamId ?? 0;
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

})(window);
