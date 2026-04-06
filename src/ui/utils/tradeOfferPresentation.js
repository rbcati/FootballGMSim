import { buildTeamIntelligence } from "./teamIntelligence.js";

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
  const pos = player?.pos ?? player?.position ?? "?";
  const ovr = player?.ovr ?? "?";
  const age = player?.age != null ? ` age ${player.age}` : null;
  return `${player?.name ?? "Player"} · ${pos} ${ovr}${age ? ` ·${age}` : ""}`;
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

function diffNeedSignals(intel, incomingPlayers, outgoingPlayers) {
  const incomingPos = [...new Set(incomingPlayers.map((player) => player?.pos).filter(Boolean))];
  const outgoingPos = [...new Set(outgoingPlayers.map((player) => player?.pos).filter(Boolean))];
  const needsNow = new Set((intel?.needsNow ?? []).map((need) => need.pos));
  const surplus = new Set((intel?.surplus ?? []).map((item) => item.pos));
  const helps = incomingPos.filter((pos) => needsNow.has(pos));
  const weakens = outgoingPos.filter((pos) => needsNow.has(pos));
  const surplusMoved = outgoingPos.filter((pos) => surplus.has(pos));
  return { helps, weakens, surplusMoved };
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

  const tags = [];
  if (userSignals.helps.length) tags.push("Need fit");
  if (userSignals.surplusMoved.length) tags.push("Surplus moved");
  if (userCapDelta >= 2) tags.push("Cap relief");
  if ((offer?.offeringPickSnapshots?.length ?? 0) + (offer?.receivingPickSnapshots?.length ?? 0) > 0) tags.push("Future value");
  if ((userTeam?.wins ?? 0) >= 8 && userSignals.weakens.length) tags.push("Risky for contender");
  if (!tags.length) tags.push("Depth swap");

  let recommendation = "Balanced swap; verify depth chart impact.";
  if (userSignals.helps.length && userCapDelta >= 0) recommendation = `Addresses ${userSignals.helps[0]} need and keeps cap flexible.`;
  else if (userSignals.helps.length && userSignals.weakens.length) recommendation = `Good value now, but weakens ${userSignals.weakens[0]}.`;
  else if (userCapDelta >= 2) recommendation = "Cap relief move with minor talent loss.";
  else if ((receivePicks.length > givePicks.length) && !userSignals.helps.length) recommendation = "Adds draft value, may hurt short-term push.";

  return {
    receive: {
      players: receivePlayers.map((player) => ({ key: `r-p-${player.id}`, label: formatPlayerLabel(player) })),
      picks: receivePicks.map((pick, idx) => ({ key: `r-k-${pick?.id ?? idx}`, label: formatPickLabel(pick, teamsById) })),
    },
    give: {
      players: givePlayers.map((player) => ({ key: `g-p-${player.id}`, label: formatPlayerLabel(player) })),
      picks: givePicks.map((pick, idx) => ({ key: `g-k-${pick?.id ?? idx}`, label: formatPickLabel(pick, teamsById) })),
    },
    userImpact: {
      abbr: userTeam?.abbr ?? "You",
      ovr: userOvr,
      capDelta: userCapDelta,
      capLine: formatCapDelta(userCapDelta),
      helps: userSignals.helps,
      weakens: userSignals.weakens,
      surplusMoved: userSignals.surplusMoved,
    },
    offeringImpact: {
      abbr: aiTeam?.abbr ?? offer?.offeringTeamAbbr ?? "Them",
      ovr: aiOvr,
      capDelta: aiCapDelta,
      capLine: formatCapDelta(aiCapDelta),
      helps: aiSignals.helps,
      weakens: aiSignals.weakens,
      surplusMoved: aiSignals.surplusMoved,
    },
    recommendation,
    tags,
    estimateLabel: "Estimates use current roster/cap snapshots. Final acceptance still uses AI trade logic.",
  };
}
