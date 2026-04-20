import { normalizeLeagueSettings } from '../../core/leagueSettings.js';

export const MOD_SCHEMAS = Object.freeze({
  customRoster: {
    type: 'object',
    required: ['players'],
    properties: {
      players: { type: 'array', itemType: 'player' },
      teams: { type: 'array', itemType: 'team' },
    },
  },
  draftClass: {
    type: 'object',
    required: ['prospects'],
    properties: {
      prospects: { type: 'array', itemType: 'player' },
    },
  },
  leagueFile: {
    type: 'object',
    required: ['meta', 'snapshot'],
    properties: {
      meta: { type: 'object' },
      settings: { type: 'object' },
      snapshot: { type: 'object' },
      modData: { type: 'object' },
    },
  },
});

const POSITIONS = new Set(['QB','RB','WR','TE','OL','LT','LG','C','RG','RT','DL','DE','DT','LB','CB','S','K','P']);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function err(path, message) {
  return { path, message };
}

function validatePlayer(player, path = 'players[]') {
  const errors = [];
  if (!isObject(player)) return [err(path, 'Player must be an object.')];
  if (typeof player.name !== 'string' || !player.name.trim()) errors.push(err(`${path}.name`, 'name is required.'));
  if (!Number.isFinite(Number(player.age))) errors.push(err(`${path}.age`, 'age must be numeric.'));
  if (!Number.isFinite(Number(player.ovr))) errors.push(err(`${path}.ovr`, 'ovr must be numeric.'));
  if (!Number.isFinite(Number(player.potential ?? player.pot ?? player.ovr))) errors.push(err(`${path}.potential`, 'potential/pot must be numeric.'));
  if (!POSITIONS.has(String(player.pos ?? ''))) errors.push(err(`${path}.pos`, 'pos must be a valid football position code.'));
  return errors;
}

export function validateCustomRoster(payload) {
  const errors = [];
  if (!isObject(payload)) return { ok: false, errors: [err('root', 'Roster payload must be an object.')] };
  if (!Array.isArray(payload.players) || payload.players.length === 0) {
    errors.push(err('players', 'players array is required.'));
  } else {
    payload.players.forEach((p, idx) => errors.push(...validatePlayer(p, `players[${idx}]`)));
  }
  if (payload.teams != null && !Array.isArray(payload.teams)) {
    errors.push(err('teams', 'teams must be an array when provided.'));
  }
  return { ok: errors.length === 0, errors };
}

export function validateDraftClass(payload) {
  const errors = [];
  if (!isObject(payload)) return { ok: false, errors: [err('root', 'Draft class must be an object.')] };
  if (!Array.isArray(payload.prospects) || payload.prospects.length === 0) {
    errors.push(err('prospects', 'prospects array is required.'));
  } else {
    payload.prospects.forEach((p, idx) => errors.push(...validatePlayer(p, `prospects[${idx}]`)));
  }
  return { ok: errors.length === 0, errors };
}

export function validateLeagueSettingsPayload(payload) {
  if (!isObject(payload)) {
    return { ok: false, errors: [err('settings', 'settings must be an object.')], normalized: normalizeLeagueSettings({}) };
  }
  const normalized = normalizeLeagueSettings(payload);
  return { ok: true, errors: [], normalized };
}

export function validateLeagueFile(payload) {
  const errors = [];
  if (!isObject(payload)) return { ok: false, errors: [err('root', 'League file must be an object.')] };
  if (!payload.snapshot || !isObject(payload.snapshot)) errors.push(err('snapshot', 'snapshot object is required.'));
  if (!isObject(payload.meta)) errors.push(err('meta', 'meta object is required.'));
  if (payload.modData?.roster) {
    const roster = validateCustomRoster(payload.modData.roster);
    errors.push(...roster.errors.map((e) => ({ ...e, path: `modData.roster.${e.path}` })));
  }
  if (payload.modData?.draftClass) {
    const draft = validateDraftClass(payload.modData.draftClass);
    errors.push(...draft.errors.map((e) => ({ ...e, path: `modData.draftClass.${e.path}` })));
  }
  return { ok: errors.length === 0, errors };
}

export function summarizeValidationErrors(errors = [], limit = 6) {
  if (!errors.length) return 'Unknown validation error.';
  return errors.slice(0, limit).map((e) => `${e.path}: ${e.message}`).join(' | ');
}
