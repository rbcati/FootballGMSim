import { estimateHoldoutRisk } from '../contracts/realisticContracts.js';

const EVENT_TYPES = Object.freeze({
  HOLDOUT: 'holdout',
  TRADE_DEMAND: 'trade_demand',
  SUSPENSION: 'suspension',
  RETIREMENT: 'retirement',
  INJURY: 'injury',
  MILESTONE: 'milestone',
  AWARD: 'award',
  DRAFT_RUMOR: 'draft_rumor',
  OFF_FIELD: 'off_field_storyline',
});

export const EVENT_TOOLTIPS = Object.freeze({
  [EVENT_TYPES.HOLDOUT]: 'Contract leverage standoff. High diva/holdout-risk players push for better terms.',
  [EVENT_TYPES.TRADE_DEMAND]: 'A player is requesting a move due to fit, morale, or team direction.',
  [EVENT_TYPES.SUSPENSION]: 'Discipline issue that temporarily removes the player from active games.',
  [EVENT_TYPES.RETIREMENT]: 'Career decision triggered by age, injuries, or personal motivation.',
  [EVENT_TYPES.INJURY]: 'Medical event affecting availability and short-term team planning.',
  [EVENT_TYPES.MILESTONE]: 'Notable statistical achievement that boosts profile and morale.',
  [EVENT_TYPES.AWARD]: 'End-of-season recognition for individual or coaching excellence.',
  [EVENT_TYPES.DRAFT_RUMOR]: 'Pre-draft buzz that changes expectations and fan sentiment.',
  [EVENT_TYPES.OFF_FIELD]: 'Narrative event (charity, controversy, mentoring) that impacts morale/popularity.',
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomOf(rng, list = []) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)] ?? null;
}

function scorePlayer(player, team, context = {}) {
  const wins = Number(team?.wins ?? 0);
  const losses = Number(team?.losses ?? 0);
  const poorRecord = losses > wins ? 1 : 0;
  const profile = player?.personalityProfile ?? {};
  const holdoutRisk = estimateHoldoutRisk(player, { wins });
  return {
    player,
    team,
    holdoutRisk,
    volatility: Number(profile?.diva ?? 35) + Number(profile?.offFieldRisk ?? 25) + poorRecord * 12,
    motivation: Number(player?.motivation ?? team?.staff?.headCoach?.motivation ?? 60),
    discipline: Number(profile?.discipline ?? 50),
    week: Number(context?.week ?? 1),
    phase: String(context?.phase ?? 'regular'),
  };
}

export function createEventEntry(type, payload, context = {}) {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    category: type,
    headline: payload.headline,
    body: payload.body,
    description: payload.description ?? payload.body,
    playerId: payload.playerId ?? null,
    teamId: payload.teamId ?? null,
    staffId: payload.staffId ?? null,
    actionLabel: payload.actionLabel ?? null,
    actionTarget: payload.actionTarget ?? null,
    effects: payload.effects ?? null,
    priority: payload.priority ?? 'medium',
    scope: payload.scope ?? (payload.teamId != null ? 'team' : 'league'),
    phase: context.phase ?? 'regular',
    week: context.week ?? 1,
    year: context.year ?? null,
    timestamp: Date.now(),
    tooltip: EVENT_TOOLTIPS[type] ?? '',
  };
}

export function generateDynamicEvents({ players = [], teams = [], userTeamId = null, week = 1, year = null, phase = 'regular', rng = Math.random } = {}) {
  const teamById = Object.fromEntries((teams || []).map((t) => [Number(t.id), t]));
  const candidates = players
    .filter((p) => Number(p?.teamId) >= 0 && p?.status !== 'retired' && p?.status !== 'draft_eligible')
    .map((p) => scorePlayer(p, teamById[Number(p.teamId)], { week, phase }))
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 80);

  const events = [];
  for (const row of candidates) {
    const { player, team, volatility, holdoutRisk, discipline, motivation } = row;
    const profile = player?.personalityProfile ?? {};

    if (phase === 'regular' && holdoutRisk?.shouldHoldout && rng() < clamp((holdoutRisk.score ?? 0) / 1300, 0.01, 0.22)) {
      events.push(createEventEntry(EVENT_TYPES.HOLDOUT, {
        headline: `${player.name} skips workouts over contract dispute`,
        body: `${player.pos} ${player.name} is holding out while talks with ${team?.abbr ?? 'the team'} stall.`,
        playerId: player.id,
        teamId: player.teamId,
        actionLabel: 'Negotiate',
        actionTarget: 'Contract Center',
        effects: { morale: -5, negotiationLeverage: 6 },
        priority: 'high',
      }, { week, year, phase }));
    }

    if (phase === 'regular' && rng() < clamp((volatility - discipline) / 5000, 0, 0.08)) {
      events.push(createEventEntry(EVENT_TYPES.TRADE_DEMAND, {
        headline: `${player.name} requests a trade`,
        body: `${player.name} wants a fresh start after mounting frustration with role and results.`,
        playerId: player.id,
        teamId: player.teamId,
        actionLabel: 'View Profile',
        actionTarget: 'Player',
        effects: { morale: -4, popularity: -2 },
      }, { week, year, phase }));
    }

    if (rng() < clamp((Number(profile?.offFieldRisk ?? 20) - discipline) / 4000, 0, 0.04)) {
      events.push(createEventEntry(EVENT_TYPES.SUSPENSION, {
        headline: `${player.name} suspended by league office`,
        body: `League discipline will sideline ${player.name} for conduct policy violations.`,
        playerId: player.id,
        teamId: player.teamId,
        effects: { morale: -8, popularity: -6 },
        priority: 'high',
      }, { week, year, phase }));
    }

    if (phase === 'regular' && rng() < 0.025) {
      const storyline = randomOf(rng, ['charity', 'controversy', 'mentoring']);
      const body = storyline === 'charity'
        ? `${player.name} funded a local youth football initiative, boosting community support.`
        : storyline === 'mentoring'
          ? `${player.name} has become a key mentor in the locker room for younger teammates.`
          : `${player.name} drew headlines after a controversial media appearance.`;
      const effects = storyline === 'charity'
        ? { morale: 2, popularity: 6, negotiationLeverage: -2 }
        : storyline === 'mentoring'
          ? { morale: 3, popularity: 2, negotiationLeverage: -1 }
          : { morale: -3, popularity: -5, negotiationLeverage: 3 };
      events.push(createEventEntry(EVENT_TYPES.OFF_FIELD, {
        headline: `${player.name} off-field update`,
        body,
        playerId: player.id,
        teamId: player.teamId,
        effects,
        priority: storyline === 'controversy' ? 'medium' : 'low',
      }, { week, year, phase }));
    }

    if (events.length >= 10) break;
  }

  if (phase === 'draft' && rng() < 0.8) {
    const rumorTeam = randomOf(rng, teams);
    if (rumorTeam) {
      events.push(createEventEntry(EVENT_TYPES.DRAFT_RUMOR, {
        headline: `Draft rumor: ${rumorTeam.abbr} considering aggressive move up`,
        body: `${rumorTeam.name} is reportedly exploring a trade-up package for a premium prospect.`,
        teamId: rumorTeam.id,
        scope: Number(rumorTeam.id) === Number(userTeamId) ? 'team' : 'league',
      }, { week, year, phase }));
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function sum(totals = {}, keys = []) {
  return keys.reduce((acc, key) => acc + Number(totals?.[key] ?? 0), 0);
}

export function calculateSeasonAwards({ stats = [], teams = [], year = null, coaches = [] } = {}) {
  const teamById = Object.fromEntries(teams.map((t) => [Number(t.id), t]));
  const score = (s) => {
    const wins = Number(teamById[Number(s.teamId)]?.wins ?? 0);
    return sum(s.totals, ['passYd', 'rushYd', 'recYd']) / 45
      + sum(s.totals, ['passTD', 'rushTD', 'recTD']) * 7
      + Number(s.totals?.sacks ?? 0) * 5
      + Number(s.totals?.interceptions ?? 0) * 6
      + wins * 2.2;
  };
  const sorted = [...stats].sort((a, b) => score(b) - score(a));
  const best = (arr) => (arr.length ? arr[0] : null);

  const mvp = best(sorted);
  const roty = best(sorted.filter((row) => Number(row?.age ?? 99) <= 23));
  const coy = [...teams].sort((a, b) => Number(b.wins ?? 0) - Number(a.wins ?? 0))[0] ?? null;

  const allProOffense = sorted
    .filter((s) => ['QB', 'RB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'].includes(String(s.pos)))
    .slice(0, 11)
    .map((s) => ({ playerId: s.playerId, name: s.name, pos: s.pos, teamId: s.teamId }));
  const allProDefense = sorted
    .filter((s) => ['DL', 'DE', 'DT', 'LB', 'CB', 'S'].includes(String(s.pos)))
    .slice(0, 11)
    .map((s) => ({ playerId: s.playerId, name: s.name, pos: s.pos, teamId: s.teamId }));

  return {
    mvp: mvp ? { playerId: mvp.playerId, name: mvp.name, pos: mvp.pos, teamId: mvp.teamId, year } : null,
    roty: roty ? { playerId: roty.playerId, name: roty.name, pos: roty.pos, teamId: roty.teamId, year } : null,
    coachOfTheYear: coy ? { coachName: coaches.find((c) => Number(c?.teamId) === Number(coy.id))?.name ?? `${coy.abbr} Staff`, teamId: coy.id, year } : null,
    allPro: {
      firstTeamOffense: allProOffense,
      firstTeamDefense: allProDefense,
    },
  };
}
