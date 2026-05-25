function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function makeNote(id, text, score, category = 'game') {
  const clean = normalizeText(text);
  if (!clean) return null;
  return { id: String(id), text: clean, score: toNum(score), category };
}

export function buildAdvancedAttributionNotes(advancedAttribution, playerLookup = {}, context = {}) {
  if (!advancedAttribution || typeof advancedAttribution !== 'object') return [];
  const rows = Object.entries(advancedAttribution);
  if (!rows.length) return [];

  let dropsLeader = null;
  let sacksAllowedLeader = null;

  for (const [playerId, row] of rows) {
    const drops = toNum(row?.drops);
    const sacksAllowed = toNum(row?.sacksAllowed);
    if (!dropsLeader || drops > dropsLeader.value) dropsLeader = { playerId, value: drops };
    if (!sacksAllowedLeader || sacksAllowed > sacksAllowedLeader.value) sacksAllowedLeader = { playerId, value: sacksAllowed };
  }

  const notes = [];
  if (sacksAllowedLeader && sacksAllowedLeader.value >= 5) {
    const name = playerLookup?.[String(sacksAllowedLeader.playerId)]?.name ?? 'Protection unit';
    notes.push(makeNote('sacks-allowed', `Pressure told the story: ${name} allowed ${sacksAllowedLeader.value} sacks and never found rhythm.`, 90, 'attribution'));
  }
  if (dropsLeader && dropsLeader.value >= 3) {
    notes.push(makeNote('drops', `Drops stalled drives: ${dropsLeader.value} recorded drops kept the offense behind schedule.`, 80, 'attribution'));
  }
  return notes.filter(Boolean);
}

export function buildMomentumBroadcastNotes(gameFlowSummary, context = {}) {
  if (!gameFlowSummary || typeof gameFlowSummary !== 'object') return [];
  const turningPoints = Array.isArray(gameFlowSummary.turningPoints) ? gameFlowSummary.turningPoints : [];
  const leadChanges = turningPoints.filter((point) => point?.type === 'lead_change').length;
  if (leadChanges >= 2) {
    return [makeNote('lead-changes', `A fourth-quarter swing flipped momentum in a game with ${leadChanges} lead changes.`, 88, 'momentum')].filter(Boolean);
  }
  return [];
}

export function buildCultureBroadcastNotes(teamCultureChange, context = {}) {
  if (!teamCultureChange || typeof teamCultureChange !== 'object') return [];
  const before = toNum(teamCultureChange.previousScore, NaN);
  const after = toNum(teamCultureChange.newScore, NaN);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return [];
  if (before >= 55 && after < 55) {
    return [makeNote(`culture-down-${teamCultureChange.teamId ?? 'team'}`, `${teamCultureChange.teamName ?? 'Team'} dropped into an uneasy culture band after this week.`, 75, 'culture')].filter(Boolean);
  }
  if (before <= 85 && after > 85) {
    return [makeNote(`culture-up-${teamCultureChange.teamId ?? 'team'}`, `${teamCultureChange.teamName ?? 'Team'} climbed into a united culture band and carried real sideline energy.`, 75, 'culture')].filter(Boolean);
  }
  return [];
}

export function dedupeBroadcastNotes(notes = []) {
  const seen = new Set();
  const out = [];
  for (const note of notes) {
    if (!note || !note.text) continue;
    const key = normalizeText(note.text).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

export function rankBroadcastNotes(notes = [], options = {}) {
  const maxNotes = Math.max(0, toNum(options.maxNotes, 3));
  return [...notes]
    .sort((a, b) => (toNum(b?.score) - toNum(a?.score)) || String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
    .slice(0, maxNotes);
}

export function buildBroadcastGameNotes(gameSummary, context = {}) {
  if (!gameSummary || typeof gameSummary !== 'object') return [];
  const playerLookup = context.playerLookup ?? {};
  const attribution = buildAdvancedAttributionNotes(gameSummary.advancedAttribution, playerLookup, context);
  const momentum = buildMomentumBroadcastNotes(gameSummary.gameFlowSummary, context);
  return rankBroadcastNotes(dedupeBroadcastNotes([...attribution, ...momentum]), { maxNotes: context.maxNotes ?? 3 });
}
