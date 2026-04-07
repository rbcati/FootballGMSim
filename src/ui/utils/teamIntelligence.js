import { classifyTeamDirection } from "./contractInsights.js";
import { buildTeamChemistrySummary } from "./teamChemistry.js";
import { franchiseInvestmentSummary, getProspectRegionTag } from "./franchiseInvestments.js";

const POSITION_TARGETS = {
  QB: { starters: 1, playableDepth: 2 },
  RB: { starters: 1, playableDepth: 3 },
  WR: { starters: 3, playableDepth: 5 },
  TE: { starters: 1, playableDepth: 2 },
  OL: { starters: 5, playableDepth: 7 },
  DL: { starters: 4, playableDepth: 6 },
  LB: { starters: 3, playableDepth: 5 },
  CB: { starters: 2, playableDepth: 4 },
  S: { starters: 2, playableDepth: 3 },
};

const POSITION_ALIAS = {
  HB: "RB", FB: "RB", FL: "WR", SE: "WR",
  OT: "OL", LT: "OL", RT: "OL", OG: "OL", LG: "OL", RG: "OL", C: "OL",
  DE: "DL", DT: "DL", NT: "DL", IDL: "DL", EDGE: "DL",
  MLB: "LB", OLB: "LB", ILB: "LB",
  DB: "CB", NCB: "CB", FS: "S", SS: "S",
};

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function canonicalPos(player) {
  const raw = String(player?.pos ?? player?.position ?? "").toUpperCase();
  return POSITION_ALIAS[raw] ?? raw;
}

function getYearsRemaining(player) {
  return safeNum(player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.years ?? 0);
}

function isExpiring(player) {
  return getYearsRemaining(player) <= 1;
}

function isStarterLevel(player) {
  return safeNum(player?.ovr, 0) >= 74;
}

function groupByCanonicalPos(roster = []) {
  const byPos = new Map();
  for (const player of roster) {
    const pos = canonicalPos(player);
    if (!POSITION_TARGETS[pos]) continue;
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push(player);
  }
  for (const [, list] of byPos) {
    list.sort((a, b) => safeNum(b?.ovr) - safeNum(a?.ovr));
  }
  return byPos;
}

function describeNeed(pos, starters, target, avgStarterOvr, depthCount) {
  if (pos === "QB" && starters >= 1 && depthCount <= 1) return "QB of the future";
  if (starters < target) return `${pos} starter short`;
  if (avgStarterOvr < 69) return `Thin at ${pos}`;
  return `${pos} depth`;
}

export function buildTeamIntelligence(team, { week = 1 } = {}) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const direction = classifyTeamDirection(team, week);
  const investments = franchiseInvestmentSummary(team);
  if (!roster.length) {
    return {
      direction,
      investments,
      needsNow: [],
      needsLater: [],
      surplus: [],
      expiringStarters: 0,
      agingCoreWarnings: [],
      capStressContracts: [],
      upsideGroups: [],
      warnings: [],
      chemistry: buildTeamChemistrySummary(team, { week, direction }),
    };
  }

  const byPos = groupByCanonicalPos(roster);
  const needsNow = [];
  const needsLater = [];
  const surplus = [];

  for (const [pos, config] of Object.entries(POSITION_TARGETS)) {
    const group = byPos.get(pos) ?? [];
    const starters = group.slice(0, config.starters);
    const avgStarterOvr = starters.length
      ? starters.reduce((sum, p) => sum + safeNum(p?.ovr, 60), 0) / starters.length
      : 0;
    const depthCount = group.filter((p) => safeNum(p?.ovr, 0) >= 66).length;
    const shortStarters = starters.length < config.starters;
    const weakStarters = !shortStarters && avgStarterOvr < 70;
    const thinDepth = depthCount < config.playableDepth;

    if (shortStarters || weakStarters) {
      needsNow.push({
        pos,
        label: describeNeed(pos, starters.length, config.starters, avgStarterOvr, depthCount),
        severity: (shortStarters ? 3 : 0) + (weakStarters ? 2 : 0) + (thinDepth ? 1 : 0),
      });
    } else if (thinDepth || (pos === "QB" && group.length <= 1)) {
      needsLater.push({ pos, label: describeNeed(pos, starters.length, config.starters, avgStarterOvr, depthCount), severity: thinDepth ? 2 : 1 });
    }

    if (group.length >= config.playableDepth + 1 && avgStarterOvr >= 72) {
      surplus.push({ pos, label: `Surplus: ${pos}`, depth: group.length - config.playableDepth });
    }
  }

  const expiringStarters = roster.filter((p) => isExpiring(p) && isStarterLevel(p)).length;
  const agingCoreWarnings = Object.entries(POSITION_TARGETS)
    .map(([pos]) => {
      const group = (byPos.get(pos) ?? []).slice(0, Math.min(3, POSITION_TARGETS[pos].starters + 1));
      if (!group.length) return null;
      const aging = group.filter((p) => safeNum(p?.age, 0) >= 30).length;
      if (aging >= Math.ceil(group.length * 0.6)) return `Aging ${pos} group`;
      return null;
    })
    .filter(Boolean)
    .slice(0, 3);

  const capStressContracts = roster
    .filter((p) => safeNum(p?.contract?.baseAnnual, 0) >= 14 && safeNum(p?.age, 0) >= 30 && safeNum(p?.ovr, 0) <= 76)
    .sort((a, b) => safeNum(b?.contract?.baseAnnual, 0) - safeNum(a?.contract?.baseAnnual, 0))
    .slice(0, 3)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      pos: canonicalPos(p),
      annual: safeNum(p?.contract?.baseAnnual, 0),
      label: `${p.name} (${canonicalPos(p)}) $${safeNum(p?.contract?.baseAnnual, 0).toFixed(1)}M`,
    }));

  const upsideGroups = Object.entries(POSITION_TARGETS)
    .map(([pos]) => {
      const group = byPos.get(pos) ?? [];
      const upside = group.filter((p) => safeNum(p?.age, 99) <= 25 && (safeNum(p?.potential, 0) - safeNum(p?.ovr, 0)) >= 8).length;
      return upside >= 2 ? `${pos} young upside` : null;
    })
    .filter(Boolean)
    .slice(0, 3);

  needsNow.sort((a, b) => b.severity - a.severity);
  needsLater.sort((a, b) => b.severity - a.severity);
  surplus.sort((a, b) => b.depth - a.depth);

  const warnings = [];
  if (expiringStarters >= 3) warnings.push(`${expiringStarters} expiring starters`);
  if (!byPos.get("QB") || (byPos.get("QB") ?? []).filter((p) => safeNum(p?.age, 40) <= 28).length === 0) warnings.push("No long-term QB plan");
  if (agingCoreWarnings.length > 0) warnings.push(agingCoreWarnings[0]);
  if (capStressContracts.length >= 2) warnings.push("Cap tied in aging veterans");

  const chemistry = buildTeamChemistrySummary(team, { week, direction });

  return {
    direction,
    investments,
    needsNow: needsNow.slice(0, 4),
    needsLater: needsLater.slice(0, 3),
    surplus: surplus.slice(0, 3),
    expiringStarters,
    agingCoreWarnings,
    capStressContracts,
    upsideGroups,
    warnings: warnings.slice(0, 4),
    chemistry,
  };
}

export function buildDirectionGuidance(intel) {
  const direction = intel?.direction ?? "middling";
  if (direction === "contender") {
    return "Contender lane: prioritize reliable starters, trenches, and injury cover while protecting future cap flexibility.";
  }
  if (direction === "rebuilding") {
    return "Rebuild lane: prioritize age curve, upside, draft capital, and moving expensive veterans before value drops.";
  }
  return "Middling lane: decide your direction soon—either buy certainty at core weak spots or pivot to future assets.";
}

export function summarizeTradeImpact({ intel, incomingPositions = [], outgoingPositions = [], capBefore = 0, capAfter = 0 }) {
  const needHits = incomingPositions.filter((p) => (intel?.needsNow ?? []).some((n) => n.pos === p));
  const surplusMoved = outgoingPositions.filter((p) => (intel?.surplus ?? []).some((s) => s.pos === p));
  const capDelta = safeNum(capAfter) - safeNum(capBefore);
  return {
    needHits,
    surplusMoved,
    capDelta,
    timeline: intel?.direction === "contender"
      ? (capDelta < 0 ? "Win-now move with tighter cap." : "Win-now move that preserves flexibility.")
      : intel?.direction === "rebuilding"
        ? "Future-facing move; check age and pick return."
        : "Direction-setting move; ensure it clarifies your timeline.",
  };
}

export function scoreFreeAgentForTeam(player, intel, capRoom = 0) {
  const pos = canonicalPos(player);
  const ask = safeNum(player?._ask ?? player?.demandProfile?.askAnnual ?? player?.contractDemand?.baseAnnual, 0);
  const needNow = (intel?.needsNow ?? []).find((n) => n.pos === pos);
  const needLater = (intel?.needsLater ?? []).find((n) => n.pos === pos);
  const affordability = capRoom <= 0 ? 0 : Math.max(0, 1 - ask / Math.max(1, capRoom));
  const age = safeNum(player?.age, 28);
  const direction = intel?.direction ?? "middling";
  const directionFit = direction === "contender" ? (age <= 30 ? 1 : 0.75) : direction === "rebuilding" ? (age <= 27 ? 1 : 0.55) : (age <= 29 ? 1 : 0.8);
  const chemistryAppeal = safeNum(intel?.chemistry?.freeAgencyAppeal, 0);
  const investmentAppeal = safeNum(intel?.investments?.freeAgentAppealDelta, 0);
  const score = (needNow ? 60 : needLater ? 35 : 10) + affordability * 20 + directionFit * 20 + chemistryAppeal * 2 + investmentAppeal;
  let reason = "Depth option";
  if (needNow) reason = `Immediate starter/depth at ${pos}`;
  else if (needLater) reason = `Future need coverage at ${pos}`;
  if (direction === "rebuilding" && age <= 26) reason = `${reason} with rebuild age profile`;
  if (ask > Math.max(capRoom, 1) * 0.75) reason = `Likely expensive for current cap flexibility`;
  else if (chemistryAppeal >= 3) reason = `${reason} in a stable locker room`;
  else if (chemistryAppeal <= -2) reason = `${reason}, but locker-room stability is a concern`;
  if (investmentAppeal >= 6) reason = `${reason}; facilities and franchise environment are a selling point`;
  return { score, reason, pos, ask };
}

export function classifyNeedFitForProspect(pos, intel) {
  if (!pos) return { bucket: "Luxury pick", tone: "neutral", short: "No clear need match" };
  const now = (intel?.needsNow ?? []).find((n) => n.pos === pos);
  if (now) {
    if ((now.severity ?? 0) >= 5) return { bucket: "Immediate need", tone: "urgent", short: now.label ?? `${pos} need now` };
    return { bucket: "Future starter", tone: "strong", short: now.label ?? `${pos} starter path` };
  }
  const later = (intel?.needsLater ?? []).find((n) => n.pos === pos);
  if (later) return { bucket: "Developmental need", tone: "medium", short: later.label ?? `${pos} depth path` };
  const surplus = (intel?.surplus ?? []).find((s) => s.pos === pos);
  if (surplus) return { bucket: "Luxury pick", tone: "light", short: `Already deep at ${pos}` };
  return { bucket: "Depth upgrade", tone: "neutral", short: `Adds competition at ${pos}` };
}

export function describeProspectProfile(player) {
  const age = safeNum(player?.age, 23);
  const ovr = safeNum(player?.ovr, 60);
  const pot = safeNum(player?.potential ?? player?.pot ?? player?.ovr, ovr);
  const gap = pot - ovr;
  const readiness = ovr >= 76 ? "Ready to contribute early" : ovr >= 69 ? "Rotational ready" : "Developmental timeline";
  const upside = gap >= 12 || age <= 21 ? "High upside swing" : gap >= 7 ? "Balanced upside" : "Lower-ceiling profile";
  const ageProfile = age <= 21 ? "Young-for-class profile" : age >= 24 ? "Older prospect profile" : "Typical draft age";
  return { readiness, upside, ageProfile, gap };
}

export function scoreProspectForTeam(player, intel) {
  const ovr = safeNum(player?.ovr, 60);
  const pot = safeNum(player?.potential ?? player?.pot ?? player?.ovr, ovr);
  const age = safeNum(player?.age, 23);
  const pos = canonicalPos(player);
  const profile = describeProspectProfile(player);
  const fit = classifyNeedFitForProspect(pos, intel);

  const needBoost =
    fit.bucket === "Immediate need" ? 20 :
    fit.bucket === "Future starter" ? 14 :
    fit.bucket === "Developmental need" ? 9 :
    fit.bucket === "Depth upgrade" ? 5 : 0;
  const direction = intel?.direction ?? "middling";
  const directionAdj =
    direction === "contender"
      ? (profile.readiness.includes("Ready") ? 8 : -3)
      : direction === "rebuilding"
        ? (profile.upside.includes("High") || age <= 21 ? 8 : -2)
        : 0;
  const regionFocus = intel?.investments?.profile?.scoutingRegion ?? 'national';
  const playerRegion = getProspectRegionTag(player);
  const regionAdj = regionFocus !== 'national' && regionFocus === playerRegion ? 4 : 0;

  const score = ovr + gap * 1.2 + needBoost + directionAdj + regionAdj;
  return {
    pos,
    score,
    fit,
    profile,
    archetypeHint: `${profile.readiness} · ${profile.upside}${regionAdj > 0 ? ' · Regional visibility boost' : ''}`,
  };
}
