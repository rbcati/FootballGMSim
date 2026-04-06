import { buildTeamIntelligence } from "./teamIntelligence.js";

const POSITION_ALIASES = {
  HB: "RB", FB: "RB", FL: "WR", SE: "WR",
  OT: "OL", LT: "OL", RT: "OL", OG: "OL", LG: "OL", RG: "OL", C: "OL",
  DE: "DL", DT: "DL", NT: "DL", IDL: "DL", EDGE: "DL",
  MLB: "LB", OLB: "LB", ILB: "LB",
  DB: "CB", NCB: "CB", FS: "S", SS: "S",
};

const POSITION_STARTERS = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2,
};

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function capHitFromPlayer(player) {
  if (!player) return 0;
  const base = safeNum(player?.contract?.baseAnnual ?? player?.baseAnnual, 0);
  const bonus = safeNum(player?.contract?.signingBonus ?? player?.signingBonus, 0);
  const years = Math.max(1, safeNum(player?.contract?.yearsTotal ?? player?.yearsTotal ?? player?.contract?.years, 1));
  return base + bonus / years;
}

function formatCapDelta(delta) {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "Cap flat";
  return rounded > 0 ? `Cap room +$${rounded.toFixed(1)}M` : `Cap room -$${Math.abs(rounded).toFixed(1)}M`;
}

function canonicalPos(player) {
  const raw = String(player?.pos ?? player?.position ?? "").toUpperCase();
  return POSITION_ALIASES[raw] ?? raw;
}

function teamMap(league) {
  return new Map((league?.teams ?? []).map((team) => [Number(team.id), team]));
}

function getTeamAbbrById(teamsById, teamId) {
  const team = teamsById.get(Number(teamId));
  return team?.abbr ?? null;
}

function pickFromLeague(league, pickId) {
  if (pickId == null) return null;
  for (const team of league?.teams ?? []) {
    const found = (team?.picks ?? []).find((pick) => String(pick?.id) === String(pickId));
    if (found) return found;
  }
  return null;
}

function roundSuffix(roundRaw) {
  const round = Number(roundRaw);
  if (!Number.isFinite(round)) return String(roundRaw ?? "?");
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `${roundRaw ?? "?"}th`;
}

export function formatPickLabel(pick, teamsById = new Map()) {
  if (!pick) return "Future pick";
  const year = pick?.season ?? pick?.year ?? "Future";
  const round = roundSuffix(pick?.round ?? "?");
  const sourceAbbr =
    pick?.originalOwnerAbbr
    ?? pick?.sourceTeamAbbr
    ?? getTeamAbbrById(teamsById, pick?.originalOwner)
    ?? getTeamAbbrById(teamsById, pick?.sourceTeamId)
    ?? null;
  if (!sourceAbbr) return `${year} ${round}`;
  if (pick?.currentOwner != null && pick?.originalOwner != null && Number(pick.currentOwner) !== Number(pick.originalOwner)) {
    return `${year} ${round} via ${sourceAbbr}`;
  }
  return `${year} ${round} (${sourceAbbr})`;
}

function formatPlayerLabel(player) {
  if (!player) return "Player";
  const pos = canonicalPos(player) || "?";
  const age = safeNum(player?.age, null);
  const ovr = player?.ovr ?? "?";
  return `${pos} ${player?.name ?? "Player"}, ${age ?? "?"}y, ${ovr} OVR`;
}

function getPlayerSnapshotById(team, playerId) {
  return (team?.roster ?? []).find((player) => String(player?.id) === String(playerId)) ?? null;
}

function resolveOfferPlayers(offer, side, league, userTeamId) {
  const teamsById = teamMap(league);
  const teamId = side === "receive" ? Number(offer?.offeringTeamId) : Number(userTeamId);
  const team = teamsById.get(teamId);
  const ids = side === "receive" ? (offer?.offering?.playerIds ?? []) : (offer?.receiving?.playerIds ?? []);
  const snapshotKey = side === "receive" ? "offeringPlayerSnapshots" : "receivingPlayerSnapshots";
  const snapshots = Array.isArray(offer?.[snapshotKey]) ? offer[snapshotKey] : [];
  if (snapshots.length) return snapshots;
  return ids.map((id) => getPlayerSnapshotById(team, id)).filter(Boolean);
}

function resolveOfferPicks(offer, side, league) {
  const ids = side === "receive" ? (offer?.offering?.pickIds ?? []) : (offer?.receiving?.pickIds ?? []);
  const snapshotKey = side === "receive" ? "offeringPickSnapshots" : "receivingPickSnapshots";
  const snapshots = Array.isArray(offer?.[snapshotKey]) ? offer[snapshotKey] : [];
  if (snapshots.length) return snapshots;
  return ids.map((id) => pickFromLeague(league, id)).filter(Boolean);
}

function estimateOvrAfter(team, incomingPlayers, outgoingPlayers) {
  const before = safeNum(team?.ovr, 0);
  const rosterCount = Math.max(1, safeNum(team?.rosterCount, team?.roster?.length ?? 53));
  const swing = incomingPlayers.reduce((sum, player) => sum + safeNum(player?.ovr, 0), 0)
    - outgoingPlayers.reduce((sum, player) => sum + safeNum(player?.ovr, 0), 0);
  const after = Math.round((before + (swing / rosterCount)) * 10) / 10;
  return { before, after, estimated: true, model: "team OVR estimate from roster-average swing" };
}

function buildRankMap(roster = []) {
  const rankMap = new Map();
  const byPos = new Map();
  for (const player of roster) {
    const pos = canonicalPos(player);
    if (!pos) continue;
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push(player);
  }
  for (const [pos, group] of byPos) {
    group.sort((a, b) => safeNum(b?.ovr, 0) - safeNum(a?.ovr, 0));
    group.forEach((player, idx) => {
      rankMap.set(String(player?.id), { pos, rank: idx + 1, isStarter: idx < (POSITION_STARTERS[pos] ?? 1) });
    });
  }
  return rankMap;
}

function applyProjectedRoster(team, incomingPlayers = [], outgoingPlayers = []) {
  const outgoingIds = new Set(outgoingPlayers.map((p) => String(p?.id)));
  const base = (team?.roster ?? []).filter((p) => !outgoingIds.has(String(p?.id)));
  const existing = new Set(base.map((p) => String(p?.id)));
  const additions = incomingPlayers
    .filter((p) => p && !existing.has(String(p?.id)))
    .map((p) => ({ ...p, pos: canonicalPos(p) }));
  return [...base, ...additions];
}

function formatDepthRole(pos, rank) {
  if (!Number.isFinite(rank)) return `${pos} depth`;
  return `${pos}${rank}`;
}

function buildPositionRankImpact({ team, incomingPlayers, outgoingPlayers }) {
  const beforeRoster = Array.isArray(team?.roster) ? team.roster : [];
  const afterRoster = applyProjectedRoster(team, incomingPlayers, outgoingPlayers);
  const beforeRanks = buildRankMap(beforeRoster);
  const afterRanks = buildRankMap(afterRoster);
  const moved = [...incomingPlayers, ...outgoingPlayers];
  const lines = [];

  for (const player of moved) {
    if (!player) continue;
    const id = String(player?.id);
    const pos = canonicalPos(player);
    const before = beforeRanks.get(id);
    const after = afterRanks.get(id);
    if (before && !after) {
      lines.push(`Lose ${formatDepthRole(pos, before.rank)}`);
    } else if (!before && after) {
      lines.push(`Adds ${formatDepthRole(pos, after.rank)}`);
    } else if (before && after && before.rank !== after.rank) {
      lines.push(`${formatDepthRole(pos, before.rank)} → ${formatDepthRole(pos, after.rank)}`);
    }
  }

  const unique = [...new Set(lines)].slice(0, 4);
  return {
    lines: unique,
    estimated: true,
    model: "position depth rank estimate from current roster OVR ordering",
  };
}

function diffNeedSignals(intel, incomingPlayers, outgoingPlayers) {
  const incomingPos = [...new Set(incomingPlayers.map((player) => canonicalPos(player)).filter(Boolean))];
  const outgoingPos = [...new Set(outgoingPlayers.map((player) => canonicalPos(player)).filter(Boolean))];
  const needsNow = new Set((intel?.needsNow ?? []).map((need) => need.pos));
  const surplus = new Set((intel?.surplus ?? []).map((item) => item.pos));
  const helps = incomingPos.filter((pos) => needsNow.has(pos));
  const weakens = outgoingPos.filter((pos) => needsNow.has(pos));
  const surplusMoved = outgoingPos.filter((pos) => surplus.has(pos));
  return { helps, weakens, surplusMoved };
}

function buildOfferSignature(offer) {
  const givePlayers = [...(offer?.offering?.playerIds ?? [])].sort().join(",");
  const getPlayers = [...(offer?.receiving?.playerIds ?? [])].sort().join(",");
  const givePicks = [...(offer?.offering?.pickIds ?? [])].sort().join(",");
  const getPicks = [...(offer?.receiving?.pickIds ?? [])].sort().join(",");
  return `${offer?.offeringTeamId}|${offer?.offerType ?? "market"}|${givePlayers}|${getPlayers}|${givePicks}|${getPicks}`;
}

export function getOfferIdentity(offer) {
  const signature = offer?.signature ?? buildOfferSignature(offer);
  const id = String(offer?.id ?? `${signature}|w${offer?.week ?? "?"}`);
  return {
    id,
    signature,
    label: `W${offer?.week ?? "?"} · ${String(signature).slice(0, 8)}`,
  };
}

export function buildIncomingOfferPresentation({ offer, league, userTeamId }) {
  const teamsById = teamMap(league);
  const userTeam = teamsById.get(Number(userTeamId));
  const aiTeam = teamsById.get(Number(offer?.offeringTeamId));

  const receivePlayers = resolveOfferPlayers(offer, "receive", league, userTeamId);
  const givePlayers = resolveOfferPlayers(offer, "give", league, userTeamId);
  const receivePicks = resolveOfferPicks(offer, "receive", league);
  const givePicks = resolveOfferPicks(offer, "give", league);

  const userIntel = buildTeamIntelligence({ ...userTeam, roster: userTeam?.roster ?? [] }, { week: league?.week ?? 1 });
  const aiIntel = buildTeamIntelligence({ ...aiTeam, roster: aiTeam?.roster ?? [] }, { week: league?.week ?? 1 });

  const userCapDelta = receivePlayers.reduce((sum, player) => sum + capHitFromPlayer(player), 0)
    - givePlayers.reduce((sum, player) => sum + capHitFromPlayer(player), 0);
  const aiCapDelta = -userCapDelta;

  const userOvr = estimateOvrAfter(userTeam, receivePlayers, givePlayers);
  const aiOvr = estimateOvrAfter(aiTeam, givePlayers, receivePlayers);
  const userSignals = diffNeedSignals(userIntel, receivePlayers, givePlayers);
  const aiSignals = diffNeedSignals(aiIntel, givePlayers, receivePlayers);
  const userRankImpact = buildPositionRankImpact({ team: userTeam, incomingPlayers: receivePlayers, outgoingPlayers: givePlayers });
  const aiRankImpact = buildPositionRankImpact({ team: aiTeam, incomingPlayers: givePlayers, outgoingPlayers: receivePlayers });

  const tags = [];
  if (userSignals.helps.length) tags.push("Need fit");
  if (userSignals.surplusMoved.length) tags.push("Surplus moved");
  if ((receivePicks.length + givePicks.length) > 0) tags.push(receivePicks.length >= givePicks.length ? "Future pick value" : "Win-now move");
  if (userCapDelta >= 2) tags.push("Cap relief");
  if (userSignals.helps.length && userSignals.weakens.length) tags.push("Depth swap");
  if ((userIntel?.direction ?? "") === "rebuilding") tags.push("Rebuild move");
  if ((userIntel?.direction ?? "") === "contender") tags.push("Win-now move");
  if (!tags.length) tags.push("Depth swap");

  let recommendation = "Balanced swap; verify starter ripple effects.";
  if (userSignals.helps.length && userSignals.weakens.length) recommendation = `Upgrade at ${userSignals.helps[0]}, but lose ${userSignals.weakens[0]} starter depth.`;
  else if (userSignals.helps.length && userCapDelta >= 0) recommendation = `Adds ${userSignals.helps[0]} help without tightening your cap.`;
  else if (receivePicks.length > givePicks.length && !userSignals.weakens.length) recommendation = "Adds future value without hurting current starters.";
  else if (userCapDelta >= 2) recommendation = "Cap relief move with minor roster downgrade risk.";
  else if (userSignals.weakens.length) recommendation = `Risky downgrade at ${userSignals.weakens[0]} unless replacement is ready.`;

  const identity = getOfferIdentity(offer);

  return {
    identity,
    receive: {
      players: receivePlayers.map((player, idx) => ({ key: `r-p-${identity.id}-${player?.id ?? idx}`, label: formatPlayerLabel(player) })),
      picks: receivePicks.map((pick, idx) => ({ key: `r-k-${identity.id}-${pick?.id ?? idx}`, label: formatPickLabel(pick, teamsById) })),
    },
    give: {
      players: givePlayers.map((player, idx) => ({ key: `g-p-${identity.id}-${player?.id ?? idx}`, label: formatPlayerLabel(player) })),
      picks: givePicks.map((pick, idx) => ({ key: `g-k-${identity.id}-${pick?.id ?? idx}`, label: formatPickLabel(pick, teamsById) })),
    },
    userImpact: {
      abbr: userTeam?.abbr ?? "You",
      ovr: userOvr,
      capDelta: userCapDelta,
      capLine: formatCapDelta(userCapDelta),
      helps: userSignals.helps,
      weakens: userSignals.weakens,
      surplusMoved: userSignals.surplusMoved,
      rankImpact: userRankImpact,
    },
    offeringImpact: {
      abbr: aiTeam?.abbr ?? offer?.offeringTeamAbbr ?? "Them",
      ovr: aiOvr,
      capDelta: aiCapDelta,
      capLine: formatCapDelta(aiCapDelta),
      helps: aiSignals.helps,
      weakens: aiSignals.weakens,
      surplusMoved: aiSignals.surplusMoved,
      rankImpact: aiRankImpact,
    },
    recommendation,
    tags: [...new Set(tags)].slice(0, 5),
    estimateLabel: "OVR and depth-rank lines are estimates from current roster snapshots; final acceptance still uses AI trade logic.",
  };
}
