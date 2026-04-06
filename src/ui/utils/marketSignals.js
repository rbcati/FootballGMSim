import { buildTeamIntelligence } from "./teamIntelligence.js";

function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function computeTeamNeedsSummary(team) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  if (!roster.length) return { needs: [], surplus: [], counts: {} };
  const intelligence = buildTeamIntelligence(team);
  const counts = {};
  for (const player of roster) {
    const pos = player?.pos ?? player?.position;
    if (!pos) continue;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }

  return {
    needs: intelligence.needsNow.map((n) => n.pos),
    surplus: intelligence.surplus.map((s) => s.pos),
    counts,
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
  const decisionReason = market?.decisionReason ?? null;
  const decisionState = market?.timingState ?? "evaluating_market";
  const attention = market?.attention ?? null;
  const preference = player?.demandProfile?.headline ?? null;
  const priorities = Array.isArray(player?.demandProfile?.priorities) ? player.demandProfile.priorities : [];
  const urgencyTag = market?.urgencyLabel ?? null;
  const patienceLabel = market?.patienceLabel ?? null;
  const riskLabel = market?.riskLabel ?? null;
  const knownBidderLabel = bidderCount > 0 ? `${bidderCount} known bidder${bidderCount > 1 ? "s" : ""}` : "No known bidders";
  const hasVisibleSnapshot = hasTopOffer || bidderCount > 0 || userOffered || !!market?.timingState;
  const reSign = player?.reSign ?? null;
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
    knownBidderLabel,
    userOffered,
    userLeads,
    hasTopOffer,
    hasVisibleSnapshot,
    heatLabel,
    decision,
    decisionState,
    decisionReason,
    attention,
    preference,
    priorities,
    urgencyLabel,
    urgencyTag,
    patienceLabel,
    riskLabel,
    competitionLabel,
    leadLabel,
    topOfferLabel,
    topBidTeam: offers?.topBidTeam ?? null,
    reSign,
  };
}
