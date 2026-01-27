// tradeProposals.js – AI trade proposal system
'use strict';
// CONFIG
const MAX_TRADE_PROPOSALS = 5;
const CPU_LOSS_LIMIT = -12;        // how much value CPU is willing to lose
const MIN_USER_VALUE_GAIN = 1.0;   // user should gain at least this much value
const MAX_PLAYERS_PER_SIDE = 2;
const MAX_PICKS_PER_SIDE = 1;
// --- Helpers -------------------------------------------------------------
function tp_getLeague() {
  const L = window.state?.league;
  if (!L || !Array.isArray(L.teams)) {
    console.error('TradeProposals: league/teams missing');
    return null;
  }
  return L;
}
function tp_computeTeamOvr(team) {
  if (!team) return 0;
  // Prefer precomputed overall
  if (typeof team.overallRating === 'number') return team.overallRating;
  if (typeof team.ovr === 'number') return team.ovr;
  // Use calculateTeamRating if provided
  if (typeof window.calculateTeamRating === 'function') {
    try {
      const r = window.calculateTeamRating(team);
      if (r && typeof r.overall === 'number') return r.overall;
    } catch (e) {
      console.warn('TradeProposals: calculateTeamRating failed', e);
    }
  }
  // Fallback: average roster OVR
  if (Array.isArray(team.roster) && team.roster.length > 0) {
    const sum = team.roster.reduce((acc, p) => acc + (p.ovr || 0), 0);
    return Math.round(sum / team.roster.length);
  }
  return 50;
}
function tp_getCapSpace(team) {
  const total = team.capTotal ?? 0;
  const used  = team.capUsed  ?? 0;
  return +(total - used).toFixed(2);
}
function tp_teamLabel(team, L) {
  const ovr = tp_computeTeamOvr(team);
  const avgOvr = L.teams.reduce((s, t) => s + tp_computeTeamOvr(t), 0) / L.teams.length;
  let tag = 'retooling';
  if (ovr > avgOvr + 5) tag = 'contending';
  else if (ovr < avgOvr - 5) tag = 'rebuilding';
  const rec = team.record || {};
  const wins = rec.w ?? team.wins ?? 0;
  const losses = rec.l ?? team.losses ?? 0;
  const capSpace = tp_getCapSpace(team);
  return {
    status: tag,
    recordStr: `${wins}-${losses}`,
    capStr: `$${capSpace.toFixed(2)}M cap space`
  };
}
function tp_randomChoice(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
function tp_buildPlayerAsset(player) {
  return { kind: 'player', playerId: player.id };
}
function tp_buildPickAsset(pick) {
  return { kind: 'pick', year: pick.year, round: pick.round };
}
/**
 * Make a shallow copy of a team and apply a trade to compute new OVR.
 * This avoids mutating the real league while we preview.
 */
function tp_previewTeamAfterTrade(team, incoming, outgoing, L) {
  const clone = {
    ...team,
    roster: Array.isArray(team.roster) ? team.roster.slice() : [],
    picks: Array.isArray(team.picks) ? team.picks.slice() : []
  };
  // remove outgoing players
  outgoing
    .filter(a => a.kind === 'player')
    .forEach(a => {
      const idx = clone.roster.findIndex(p => p.id === a.playerId);
      if (idx >= 0) clone.roster.splice(idx, 1);
    });
  // add incoming players
  incoming
    .filter(a => a.kind === 'player')
    .forEach(a => {
      // find real player object in league
      for (const t of L.teams) {
        const p = (t.roster || []).find(pl => pl.id === a.playerId);
        if (p) {
          clone.roster.push(p);
          break;
        }
      }
    });
  // simple pick handling (optional – only affects cosmetic OVR minimally)
  return tp_computeTeamOvr(clone);
}
// --- Proposal generation -------------------------------------------------
/**
 * Generate a single CPU→user trade idea between cpuTeam and userTeam.
 * Returns a proposal object or null if no fair trade found.
 */
function tp_generateProposalForPair(L, cpuId, userId) {
  const cpuTeam = L.teams[cpuId];
  const userTeam = L.teams[userId];
  if (!cpuTeam || !userTeam) return null;
  const cpuRoster = (cpuTeam.roster || []).filter(p => p.ovr >= 65);
  const userRoster = (userTeam.roster || []).filter(p => p.ovr >= 60);
  if (cpuRoster.length === 0 || userRoster.length === 0) return null;
  // CPU offers 1–2 players
  const cpuOfferCount = Math.min(
    MAX_PLAYERS_PER_SIDE,
    1 + Math.floor(Math.random() * 2),
    cpuRoster.length
  );
  const cpuPlayers = [...cpuRoster].sort(() => Math.random() - 0.5).slice(0, cpuOfferCount);
  // User sends back 1–2 players
  const userOfferCount = Math.min(
    MAX_PLAYERS_PER_SIDE,
    1 + Math.floor(Math.random() * 2),
    userRoster.length
  );
  const userPlayers = [...userRoster].sort(() => Math.random() - 0.5).slice(0, userOfferCount);
  const cpuAssets = cpuPlayers.map(tp_buildPlayerAsset);
  const userAssets = userPlayers.map(tp_buildPlayerAsset);
  if (typeof window.evaluateTrade !== 'function') {
    console.warn('TradeProposals: evaluateTrade not available');
    return null;
  }
  // Note: orientation: fromTeamId = CPU, toTeamId = user
  const evalResult = window.evaluateTrade(cpuId, userId, cpuAssets, userAssets);
  if (!evalResult || !evalResult.fromValue || !evalResult.toValue) return null;
  const cpuDelta  = evalResult.fromValue.delta;  // CPU side
  const userDelta = evalResult.toValue.delta;    // user side
  // CPU won't get fleeced too badly, and user should gain something
  if (cpuDelta < CPU_LOSS_LIMIT) return null;
  if (userDelta < MIN_USER_VALUE_GAIN) return null;
  // Compute OVR before/after
  const cpuOvrBefore  = tp_computeTeamOvr(cpuTeam);
  const userOvrBefore = tp_computeTeamOvr(userTeam);
  const cpuOvrAfter  = tp_previewTeamAfterTrade(cpuTeam, userAssets, cpuAssets, L);
  const userOvrAfter = tp_previewTeamAfterTrade(userTeam, cpuAssets, userAssets, L);
  return {
    id: `cpu-${cpuId}-to-${userId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    fromTeamId: cpuId,
    toTeamId: userId,
    fromAssets: cpuAssets,
    toAssets: userAssets,
    eval: {
      cpuDelta,
      userDelta
    },
    ovr: {
      cpuBefore: cpuOvrBefore,
      cpuAfter: cpuOvrAfter,
      userBefore: userOvrBefore,
      userAfter: userOvrAfter
    },
    // Store raw players for easier UI
    cpuPlayers,
    userPlayers
  };
}
/**
 * Generate up to MAX_TRADE_PROPOSALS trade proposals from AI teams
 * targeting the user team.
 */
export function generateAITradeProposals() {
  const L = tp_getLeague();
  if (!L) return;
  const userId = window.state?.userTeamId ?? 0;
  const proposals = [];
  const candidates = L.teams
    .map((t, idx) => ({ team: t, idx }))
    .filter(t => t.team && t.idx !== userId);
  // shuffle CPU teams
  candidates.sort(() => Math.random() - 0.5);
  for (const { idx: cpuId } of candidates) {
    if (proposals.length >= MAX_TRADE_PROPOSALS) break;
    const proposal = tp_generateProposalForPair(L, cpuId, userId);
    if (proposal) {
      proposals.push(proposal);
    }
  }
  window.state.tradeProposals = proposals;
  console.log(`TradeProposals: generated ${proposals.length} proposals`);
}
// --- UI rendering --------------------------------------------------------
export function renderTradeProposals() {
  const L = tp_getLeague();
  if (!L) {
    console.warn('TradeProposals: No league available');
    return;
  }
  const userId = window.state?.userTeamId ?? 0;
  const userTeam = L.teams[userId];
  
  if (!userTeam) {
    console.warn('TradeProposals: User team not found');
    return;
  }
  // Try multiple possible container locations
  let container = document.getElementById('tradeProposals');
  let listEl = document.getElementById('tradeProposalsList');
  let refreshBtn = document.getElementById('btnRefreshProposals');
  
  // If not found in nav, try creating in trade view
  if (!container || !listEl) {
    const tradeView = document.getElementById('trade');
    if (tradeView) {
      // Create container in trade view
      let existingContainer = tradeView.querySelector('#tradeProposalsContainer');
      if (!existingContainer) {
        existingContainer = document.createElement('div');
        existingContainer.id = 'tradeProposalsContainer';
        existingContainer.className = 'card mt';
        tradeView.appendChild(existingContainer);
      }
      existingContainer.innerHTML = `
        <div class="row">
          <h3>Trade Finder</h3>
          <div class="spacer"></div>
          <button id="btnRefreshProposals" class="btn btn-sm">Refresh</button>
        </div>
        <div id="tradeProposalsList"></div>
      `;
      listEl = document.getElementById('tradeProposalsList');
      refreshBtn = document.getElementById('btnRefreshProposals');
    }
  }
  // If container not found, try to create it in trade view
  if (!listEl) {
    const tradeView = document.getElementById('trade');
    if (tradeView) {
      let existingContainer = tradeView.querySelector('#tradeProposalsContainer');
      if (!existingContainer) {
        existingContainer = document.createElement('div');
        existingContainer.id = 'tradeProposalsContainer';
        existingContainer.className = 'card mt';
        existingContainer.innerHTML = `
          <div class="row">
            <h3>AI Trade Proposals</h3>
            <div class="spacer"></div>
            <button id="btnRefreshProposals" class="btn btn-sm">Refresh</button>
          </div>
          <div id="tradeProposalsList"></div>
        `;
        tradeView.appendChild(existingContainer);
      }
      listEl = document.getElementById('tradeProposalsList');
      refreshBtn = document.getElementById('btnRefreshProposals');
    }
  }
  
  if (!listEl) {
    console.warn('TradeProposals: Could not find or create container');
    return;
  }
  if (!window.state.tradeProposals) {
    generateAITradeProposals();
  }
  const proposals = window.state.tradeProposals || [];
  if (refreshBtn && !refreshBtn._tpBound) {
    refreshBtn.addEventListener('click', () => {
      generateAITradeProposals();
      renderTradeProposals();
    });
    refreshBtn._tpBound = true;
  }
  if (proposals.length === 0) {
    listEl.innerHTML = `
      <div class="card">
        <h3>Trade Proposals</h3>
        <p class="muted">No AI trade proposals right now. Try refreshing after a few games.</p>
      </div>
    `;
    return;
  }
  listEl.innerHTML = proposals.map((p, idx) => {
    const cpuTeam = L.teams[p.fromTeamId];
    const cpuMeta = tp_teamLabel(cpuTeam, L);
    const cpuPlayersHtml = p.cpuPlayers.map(pl => `
      <div class="trade-player">
        <span class="pos">${pl.pos}</span>
        <span class="name">${pl.name}</span>
        <span class="meta">${pl.age} yo, OVR ${pl.ovr}</span>
        <span class="salary">$${(pl.baseAnnual || 0).toFixed(1)}M / yr</span>
      </div>
    `).join('');
    const userPlayersHtml = p.userPlayers.map(pl => `
      <div class="trade-player">
        <span class="pos">${pl.pos}</span>
        <span class="name">${pl.name}</span>
        <span class="meta">${pl.age} yo, OVR ${pl.ovr}</span>
        <span class="salary">$${(pl.baseAnnual || 0).toFixed(1)}M / yr</span>
      </div>
    `).join('');
    const cpuOvrLine = `${p.ovr.cpuBefore} → ${p.ovr.cpuAfter}`;
    const userOvrLine = `${p.ovr.userBefore} → ${p.ovr.userAfter}`;
    return `
      <div class="card trade-proposal" data-proposal-index="${idx}">
        <div class="trade-header">
          <div class="team-line">
            <span class="team-name">${cpuTeam.name}</span>
            <span class="team-meta">${cpuMeta.recordStr}, ${cpuMeta.status}, ${cpuMeta.capStr}</span>
          </div>
          <button class="icon-btn tp-dismiss" title="Dismiss">✕</button>
        </div>
        <div class="trade-body two-col">
          <div class="side user-side">
            <h4>${userTeam.name} receive:</h4>
            ${cpuPlayersHtml || '<div class="muted">No players</div>'}
            <div class="ovr-line">Team ovr: ${userOvrLine}</div>
            <div class="delta-line">Value Δ: ${p.eval.userDelta.toFixed(1)}</div>
          </div>
          <div class="side cpu-side">
            <h4>${cpuTeam.name} receive:</h4>
            ${userPlayersHtml || '<div class="muted">No players</div>'}
            <div class="ovr-line">Team ovr: ${cpuOvrLine}</div>
            <div class="delta-line">Value Δ: ${p.eval.cpuDelta.toFixed(1)}</div>
          </div>
        </div>
        <div class="trade-footer">
          <button class="btn" data-role="negotiate">Negotiate</button>
        </div>
      </div>
    `;
  }).join('');
  // Wire dismiss + negotiate buttons
  listEl.querySelectorAll('.trade-proposal').forEach(card => {
    const index = parseInt(card.dataset.proposalIndex, 10);
    const proposal = proposals[index];
    const dismissBtn = card.querySelector('.tp-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        window.state.tradeProposals.splice(index, 1);
        renderTradeProposals();
      });
    }
    const negBtn = card.querySelector('[data-role="negotiate"]');
    if (negBtn) {
      negBtn.addEventListener('click', () => {
        // Hand this proposal off to the main Trade Center as a preloaded trade
        window.pendingTradeProposal = proposal;
        if (typeof window.show === 'function') {
          window.show('trade');
        }
        if (typeof window.renderTradeCenter === 'function') {
          window.renderTradeCenter();
        }
      });
    }
  });
}

// Expose helpers for inline handlers or non-module callers.
window.generateAITradeProposals = generateAITradeProposals;
window.renderTradeProposals = renderTradeProposals;
