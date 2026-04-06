const STARTER_TARGETS = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 1,
  OL: 5,
  DL: 4,
  LB: 3,
  CB: 2,
  S: 2,
};

function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function computeTeamNeedsSummary(team) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  if (!roster.length) return { needs: [], surplus: [], counts: {} };

  const byPos = {};
  for (const player of roster) {
    const pos = player?.pos ?? player?.position;
    if (!pos) continue;
    byPos[pos] = byPos[pos] ?? [];
    byPos[pos].push(player);
  }

  const needs = [];
  const surplus = [];
  for (const [pos, target] of Object.entries(STARTER_TARGETS)) {
    const group = (byPos[pos] ?? []).slice().sort((a, b) => safeNum(b?.ovr) - safeNum(a?.ovr));
    const starterSlice = group.slice(0, target);
    const startersPresent = starterSlice.length;
    const avgStarterOvr = startersPresent > 0
      ? starterSlice.reduce((sum, p) => sum + safeNum(p?.ovr, 60), 0) / startersPresent
      : 0;

    if (startersPresent < target || avgStarterOvr < 70) {
      needs.push({ pos, severity: (target - startersPresent) + Math.max(0, Math.round((70 - avgStarterOvr) / 5)) });
    }
    if (group.length >= target + 2 && avgStarterOvr >= 72) {
      surplus.push({ pos, depth: group.length - target });
    }
  }

  needs.sort((a, b) => b.severity - a.severity);
  surplus.sort((a, b) => b.depth - a.depth);

  return {
    needs: needs.map((n) => n.pos),
    surplus: surplus.map((s) => s.pos),
    counts: Object.fromEntries(Object.entries(byPos).map(([pos, players]) => [pos, players.length])),
  };
}

export function formatNeedsLine(summary, { maxNeeds = 3, maxSurplus = 2 } = {}) {
  if (!summary) return "Need data unavailable";
  const needs = summary.needs.slice(0, maxNeeds);
  const surplus = summary.surplus.slice(0, maxSurplus);
  if (!needs.length && !surplus.length) return "Roster balance: no clear need/surplus signal";
  const needText = needs.length ? `Need: ${needs.join(", ")}` : "Need: none flagged";
  const surplusText = surplus.length ? `Surplus: ${surplus.join(", ")}` : null;
  return surplusText ? `${needText} · ${surplusText}` : needText;
}

export function summarizeFreeAgentMarket(player) {
  const market = player?.market ?? {};
  const offers = player?.offers ?? {};
  const bidderCount = safeNum(offers?.count ?? market?.bidderCount, 0);
  const userOffered = !!offers?.userOffered;
  const userLeads = !!offers?.userIsTopBidder;
  const hasTopOffer = safeNum(offers?.topBidAnnual, 0) > 0 && safeNum(offers?.topBidYears, 0) > 0;

  const heatLabel = market?.heatLabel ?? null;
  const decision = market?.decision ?? "Evaluating offers";
  const attention = market?.attention ?? null;
  const preference = player?.demandProfile?.headline ?? null;
  const urgency = market?.urgency ?? "low";
  const urgencyLabel = urgency === "high" ? "Decision expected soon" : urgency === "medium" ? "Decision window open" : "No immediate deadline signal";
  let competitionLabel = "No visible competing offer yet";
  if (bidderCount > 1) competitionLabel = `${bidderCount} teams involved`;
  else if (bidderCount === 1) competitionLabel = "1 known bidder";

  let leadLabel = "You have not submitted an offer";
  if (userOffered) leadLabel = userLeads ? "You currently lead" : (offers?.userTrailReason ?? "You are currently trailing");

  let topOfferLabel = "No current market snapshot";
  if (hasTopOffer) {
    topOfferLabel = `$${safeNum(offers.topBidAnnual).toFixed(1)}M / ${safeNum(offers.topBidYears, 1)}y`;
  }

  return {
    bidderCount,
    userOffered,
    userLeads,
    hasTopOffer,
    heatLabel,
    decision,
    attention,
    preference,
    urgencyLabel,
    competitionLabel,
    leadLabel,
    topOfferLabel,
    topBidTeam: offers?.topBidTeam ?? null,
  };
}
