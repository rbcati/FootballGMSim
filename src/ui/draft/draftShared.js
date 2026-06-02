/**
 * draftShared.js — shared constants and pure helpers for the Draft module.
 * Extracted from the former monolithic Draft.jsx (behavior unchanged).
 */
import { applyAdvancedPlayerFilters } from "../../core/footballAdvancedFilters";

export const POSITIONS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "LB",
  "CB",
  "S",
  "K",
  "P",
];

export const DRAFT_ROOM_PHASES = Object.freeze({
  PRE_DRAFT: "PRE_DRAFT",
  ON_THE_CLOCK: "ON_THE_CLOCK",
  CPU_PICKING: "CPU_PICKING",
  PICK_MADE: "PICK_MADE",
  DRAFT_COMPLETE: "DRAFT_COMPLETE",
});

export function formatClock(seconds = 0) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function buildPickOrder(teams, rounds = 7, userTeamId = null) {
  if (!Array.isArray(teams) || teams.length === 0) return [];
  const sorted = [...teams].sort((a, b) => (a?.wins ?? 0) - (b?.wins ?? 0));
  const order = [];
  for (let round = 1; round <= rounds; round++) {
    sorted.forEach((team, idx) => {
      const overall = (round - 1) * sorted.length + idx + 1;
      order.push({
        round,
        pick: overall,
        overallPick: overall,
        teamId: team.id,
        teamName: team.name,
        teamAbbr: team.abbr ?? "TEAM",
        isUserTeam: Number(team.id) === Number(userTeamId),
      });
    });
  }
  return order;
}

export function ovrColor(ovr) {
  if (ovr >= 85) return "var(--success)";
  if (ovr >= 75) return "var(--accent)";
  if (ovr >= 65) return "var(--warning)";
  return "var(--danger)";
}

export function _seededRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Returns a stable { grade, gradeColor, range } object for a prospect.
 * scoutAccuracy: 0–1 (1 = perfect info, 0 = pure guesswork).
 */
export function getScoutReport(trueOvr, playerId, scoutAccuracy = 0.65) {
  const noise = Math.round((_seededRand(playerId) - 0.5) * 2 * (1 - scoutAccuracy) * 18);
  const scoutedOvr = Math.min(99, Math.max(50, trueOvr + noise));
  const spread = Math.round((1 - scoutAccuracy) * 10);
  const low  = Math.max(50, scoutedOvr - spread);
  const high = Math.min(99, scoutedOvr + spread);

  let grade, gradeColor;
  if (scoutedOvr >= 88)      { grade = "A+"; gradeColor = "#34C759"; }
  else if (scoutedOvr >= 83) { grade = "A";  gradeColor = "#34C759"; }
  else if (scoutedOvr >= 78) { grade = "B+"; gradeColor = "#30D158"; }
  else if (scoutedOvr >= 73) { grade = "B";  gradeColor = "#0A84FF"; }
  else if (scoutedOvr >= 68) { grade = "C+"; gradeColor = "#FF9F0A"; }
  else if (scoutedOvr >= 63) { grade = "C";  gradeColor = "#FF9F0A"; }
  else if (scoutedOvr >= 58) { grade = "D";  gradeColor = "#FF453A"; }
  else                        { grade = "F";  gradeColor = "#FF453A"; }

  return { grade, gradeColor, range: `${low}–${high}` };
}

export function calculatePickGrade(playerOvr, overallPick, totalPicks) {
  // Expected OVR curve: early picks ~80, late picks ~60
  const positionPct = overallPick / totalPicks;
  const expectedOvr = 82 - positionPct * 25; // 82 for #1, ~57 for last pick
  const diff = playerOvr - expectedOvr;

  if (diff >= 15) return { grade: "A+", color: "#34C759", emoji: "" };
  if (diff >= 10) return { grade: "A", color: "#34C759", emoji: "" };
  if (diff >= 5) return { grade: "B+", color: "#30D158", emoji: "" };
  if (diff >= 0) return { grade: "B", color: "#0A84FF", emoji: "" };
  if (diff >= -5) return { grade: "C+", color: "#FF9F0A", emoji: "" };
  if (diff >= -10) return { grade: "C", color: "#FF9F0A", emoji: "" };
  if (diff >= -15) return { grade: "D", color: "#FF453A", emoji: "" };
  return { grade: "F", color: "#FF453A", emoji: "" };
}

export function filterDraftProspectsForView(prospects, { filterPos, nameFilter, advancedFilters }) {
  let list = [...(prospects ?? [])];
  if (filterPos) list = list.filter((p) => p.pos === filterPos);
  if (nameFilter) list = list.filter((p) => String(p?.name ?? "").toLowerCase().includes(nameFilter.toLowerCase()));
  return applyAdvancedPlayerFilters(list, advancedFilters);
}

export function normalizeIncomingDraftState(incoming) {
  if (!incoming || typeof incoming !== "object" || incoming.notStarted) return null;
  return {
    ...incoming,
    prospects: Array.isArray(incoming.prospects) ? incoming.prospects : [],
    completedPicks: Array.isArray(incoming.completedPicks) ? incoming.completedPicks : [],
    upcomingPicks: Array.isArray(incoming.upcomingPicks) ? incoming.upcomingPicks : [],
    totalPicks: Number(incoming.totalPicks ?? 0),
  };
}

