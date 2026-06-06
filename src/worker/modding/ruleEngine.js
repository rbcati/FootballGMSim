// Win% helper (ties count as half a win).
function teamWinPct(team) {
  const w = Number(team?.wins ?? 0);
  const l = Number(team?.losses ?? 0);
  const t = Number(team?.ties ?? 0);
  const g = w + l + t;
  return g > 0 ? (w + t * 0.5) / g : 0.5;
}

/**
 * Strength of Schedule: each team's average opponent win%, derived from the
 * regular-season schedule. Opponents are read from schedule.weeks[].games[]
 * (home/away may be ids or {id} objects). Teams with no resolved opponents
 * default to 0.5 (neutral).
 * @returns {Map<number, number>} teamId → average opponent win%
 */
export function computeStrengthOfSchedule(teams = [], schedule = null) {
  const winPctById = new Map();
  for (const t of teams) winPctById.set(Number(t?.id), teamWinPct(t));

  const opponents = new Map();
  for (const t of teams) opponents.set(Number(t?.id), []);

  const readId = (side) => Number(side?.id ?? side);
  for (const week of (schedule?.weeks ?? [])) {
    for (const game of (week?.games ?? [])) {
      const homeId = readId(game?.home ?? game?.homeId);
      const awayId = readId(game?.away ?? game?.awayId);
      if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) continue;
      if (opponents.has(homeId)) opponents.get(homeId).push(awayId);
      if (opponents.has(awayId)) opponents.get(awayId).push(homeId);
    }
  }

  const sos = new Map();
  for (const [id, opps] of opponents) {
    if (!opps.length) { sos.set(id, 0.5); continue; }
    const avg = opps.reduce((acc, oppId) => acc + (winPctById.get(oppId) ?? 0.5), 0) / opps.length;
    sos.set(id, avg);
  }
  return sos;
}

export function buildDraftOrder(teams = [], settings = {}, championTeamId = null, rng = Math.random, opts = {}) {
  const method = String(settings?.draftOrderLogic ?? 'reverse_standings');

  // Strength of Schedule replaces point differential as the tiebreaker so that
  // tanking (losing by 1 vs 30) no longer manipulates draft position. SoS is
  // computed from the schedule when supplied (or passed in precomputed).
  const sos = opts?.sosByTeamId instanceof Map
    ? opts.sosByTeamId
    : (opts?.schedule ? computeStrengthOfSchedule(teams, opts.schedule) : null);
  const sosFor = (team) => (sos ? (sos.get(Number(team?.id)) ?? 0.5) : 0);

  // Seeded, deterministic coin-flip key per team (assigned in id order so the
  // sequence is independent of input ordering). Used only when wins AND SoS tie.
  const coinFlip = new Map();
  for (const t of [...teams].sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0))) {
    coinFlip.set(Number(t?.id), rng());
  }

  const sorted = [...teams].sort((a, b) => {
    const wDiff = Number(a?.wins ?? 0) - Number(b?.wins ?? 0);
    if (wDiff !== 0) return wDiff;
    // Weaker schedule (lower SoS) drafts earlier.
    const sosDiff = sosFor(a) - sosFor(b);
    if (Math.abs(sosDiff) > 1e-9) return sosDiff;
    return (coinFlip.get(Number(a?.id)) ?? 0) - (coinFlip.get(Number(b?.id)) ?? 0);
  });

  if (method === 'random') {
    const ids = sorted.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  if (method === 'lottery') {
    const bottom = sorted.slice(0, Math.min(14, sorted.length));
    const rest = sorted.slice(bottom.length);
    const tickets = bottom.flatMap((team, idx) => {
      const count = Math.max(1, 14 - idx);
      return Array.from({ length: count }, () => team.id);
    });
    const picked = [];
    const used = new Set();
    while (picked.length < bottom.length) {
      const id = tickets[Math.floor(rng() * tickets.length)];
      if (used.has(id)) continue;
      used.add(id);
      picked.push(id);
    }
    return [...picked, ...rest.map((t) => t.id)];
  }

  let draftOrder = sorted.map((t) => t.id);
  if (championTeamId != null) {
    draftOrder = draftOrder.filter((id) => Number(id) !== Number(championTeamId));
    draftOrder.push(championTeamId);
  }
  return draftOrder;
}

export function getSuspensionProbabilityMultiplier(settings = {}) {
  const freq = Number(settings?.suspensionFrequency ?? 50);
  return Math.max(0, Math.min(2, freq / 50));
}
