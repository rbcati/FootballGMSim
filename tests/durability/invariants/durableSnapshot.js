import { createHash } from 'node:crypto';
import { canonicalIdKey, stableIdCompare } from '../../../src/core/referenceIntegrity.js';
import { activePlayersFromPool, draftPicks, freeAgentsFromPool, leagueHistory, playerPool, viewTeams } from './derive.js';

export const DURABLE_SNAPSHOT_VERSION = '2.0.0';
const money = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v ?? null);
const idKey = (v) => canonicalIdKey(v) ?? null;
const byId = (a, b) => stableIdCompare(a?.id ?? a?.playerId ?? a?.gameId, b?.id ?? b?.playerId ?? b?.gameId);

export function buildDurableSnapshot(state = {}) {
  const view = state.view ?? {};
  const ctx = { ...state, view };
  const teams = viewTeams(ctx);
  const { players } = playerPool(ctx);
  const retired = players.filter((p) => p?.status === 'retired' || p?.retired === true || p?.retirementYear != null);
  const active = players.filter((p) => p && p.status !== 'retired' && p.retired !== true);
  const picks = draftPicks(ctx).picks;
  const history = leagueHistory(ctx);
  return sortObject({
    version: DURABLE_SNAPSHOT_VERSION,
    league: {
      season: state.season ?? null,
      year: view.year ?? state.db?.meta?.year ?? null,
      week: view.week ?? null,
      phase: view.phase ?? null,
      seasonId: view.seasonId ?? state.db?.meta?.seasonId ?? null,
      userTeamId: idKey(view.userTeamId ?? state.db?.meta?.userTeamId),
      salaryCap: money(resolveLiveSalaryCap(state)),
    },
    teams: teams.map((t) => ({
      id: idKey(t.id), wins: t.wins ?? 0, losses: t.losses ?? 0, ties: t.ties ?? 0,
      roster: (Array.isArray(t.roster) ? t.roster.map((p) => idKey(p?.id)) : []).sort(stableIdCompare),
      deadCap: money(t.deadCap ?? t.deadMoney ?? t.currentDeadCap ?? 0), deferredDeadCap: money(t.deferredDeadCap ?? t.deferredDeadMoney ?? 0),
      capUsed: money(t.capUsed), capRoom: money(t.capRoom), capTotal: money(t.capTotal),
    })).sort(byId),
    players: active.map((p) => ({
      id: idKey(p.id), teamId: p.teamId == null ? null : idKey(p.teamId), age: p.age ?? null,
      ovr: p.ovr ?? p.overall ?? null, pot: p.pot ?? p.potential ?? null,
      injury: normalizeInjury(p), years: p.contract?.years ?? p.years ?? null,
      baseSalary: money(p.contract?.baseSalary ?? p.contract?.salary ?? p.salary),
      signingBonus: money(p.contract?.signingBonus ?? p.signingBonus), capHit: money(p.capHit ?? p.contract?.capHit),
    })).sort(byId),
    retiredPlayers: retired.map((p) => ({ id: idKey(p.id), retirementYear: p.retirementYear ?? p.retiredYear ?? null })).sort(byId),
    draftPicks: picks.map((pk) => ({ id: idKey(pk.id), season: pk.season ?? pk.year ?? null, round: pk.round ?? null, originalOwner: idKey(pk.originalOwner ?? pk.originalTeamId), currentOwner: idKey(pk.currentOwner ?? pk.teamId ?? pk.owner) })).sort(byId),
    schedule: normalizeSchedule(view.schedule ?? state.db?.schedule),
    history: history.map((h) => ({ season: h.season ?? h.year ?? null, year: h.year ?? null, champion: idKey(h.championTeamId ?? h.champion), runnerUp: idKey(h.runnerUpTeamId ?? h.runnerUp) })).sort((a,b) => (a.season ?? 0) - (b.season ?? 0)),
    pools: { active: active.length, rostered: activePlayersFromPool(players).length, freeAgent: freeAgentsFromPool(players).length, retired: retired.length },
  });
}

export function durableDigest(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export function compareDurableSnapshots(a, b, limit = 20) {
  const diffs = [];
  walk(a, b, '', diffs, limit);
  return { ok: diffs.length === 0, firstDivergence: diffs[0] ?? null, diffs };
}

function walk(a, b, path, out, limit) {
  if (out.length >= limit) return;
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') { out.push(toDiff(path, a, b)); return; }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) walk(a[k], b[k], path ? `${path}.${k}` : k, out, limit);
}
function toDiff(path, a, b) {
  const parts = path.split('.');
  return { domain: parts[0] ?? 'state', entityId: entityFromPath(parts), field: parts.at(-1) ?? path, path, runA: a, runB: b };
}
function entityFromPath(parts) { const m = String(parts[1] ?? '').match(/^(\d+)/); return m ? m[1] : null; }
function normalizeInjury(p) { const i = p.injury ?? {}; return { status: p.injuryStatus ?? i.status ?? null, weeks: i.weeks ?? p.injuryWeeks ?? null, available: p.available ?? p.isAvailable ?? null }; }
function normalizeSchedule(schedule) {
  const games = Array.isArray(schedule?.games) ? schedule.games : (Array.isArray(schedule?.weeks) ? schedule.weeks.flatMap((w) => (w.games || []).map((g) => ({ ...g, week: g.week ?? w.week }))) : []);
  return games.map((g) => ({ id: idKey(g.id ?? g.gameId), season: g.season ?? g.year ?? null, week: g.week ?? null, home: idKey(g.home ?? g.homeTeamId), away: idKey(g.away ?? g.awayTeamId), played: !!(g.played ?? g.final), final: !!(g.final ?? g.completed), homeScore: (g.played || g.final) ? (g.homeScore ?? null) : null, awayScore: (g.played || g.final) ? (g.awayScore ?? null) : null })).sort(byId);
}
export function resolveLiveSalaryCap(state = {}) { return state.view?.meta?.economy?.currentSalaryCap ?? state.db?.meta?.economy?.currentSalaryCap ?? state.view?.salaryCap ?? state.db?.meta?.salaryCap ?? state.view?.teams?.[0]?.capTotal ?? null; }
function sortObject(v) { if (Array.isArray(v)) return v.map(sortObject); if (!v || typeof v !== 'object') return v; return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortObject(v[k])])); }
