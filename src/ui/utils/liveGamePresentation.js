function isPlaceholderName(name) {
  if (!name || typeof name !== 'string') return true;
  const t = name.trim();
  if (!t) return true;
  return /\bstarter\b/i.test(t)
    || /^[HA]\s+(QB|RB|WR|TE|OL|DL|LB|CB|S|K|P|EDGE|DE|DT|FS|SS|FB|OT|OG|C)\d+$/i.test(t)
    || /^player\s*#?\s*\d+$/i.test(t)
    || /^unknown(\s+player)?$/i.test(t);
}

function playerName(player) {
  const raw = player?.name;
  if (isPlaceholderName(raw)) {
    const pos = player?.pos || '';
    const id = player?.id;
    return id != null ? `${pos}${pos ? ' ' : ''}#${id}` : (pos || 'Player');
  }
  const name = String(raw).trim();
  const parts = name.split(/\s+/);
  return parts.length >= 2 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
}

export function getCurrentStandoutPlayers(events = [], visibleCount = events.length) {
  const totals = {
    qb: new Map(),
    rusher: new Map(),
    receiver: new Map(),
    sacks: new Map(),
    picks: new Map(),
  };

  for (let i = 0; i < visibleCount && i < events.length; i += 1) {
    const log = events[i]?.raw || {};
    const passer = log.passer;
    const runner = (log.type === 'run' ? log.player : null);
    const receiver = (log.type === 'pass' ? log.player : null);
    const defender = log.player;

    if (passer) {
      const key = playerName(passer);
      const prev = totals.qb.get(key) || { player: key, yds: 0, td: 0, att: 0, comp: 0 };
      prev.yds += Number(log.passYds || 0);
      prev.td += log.type === 'touchdown' && log.tdType === 'pass' ? 1 : 0;
      prev.att += Number(log.passAtt || 1);
      prev.comp += log.completed ? 1 : 0;
      totals.qb.set(key, prev);
    }
    if (runner) {
      const key = playerName(runner);
      const prev = totals.rusher.get(key) || { player: key, yds: 0, att: 0, td: 0 };
      prev.yds += Number(log.rushYds || 0);
      prev.att += 1;
      prev.td += log.type === 'touchdown' && log.tdType === 'rush' ? 1 : 0;
      totals.rusher.set(key, prev);
    }
    if (receiver) {
      const key = playerName(receiver);
      const prev = totals.receiver.get(key) || { player: key, yds: 0, rec: 0, td: 0 };
      prev.yds += Number(log.passYds || 0);
      prev.rec += log.completed ? 1 : 0;
      prev.td += log.type === 'touchdown' && log.tdType === 'pass' ? 1 : 0;
      totals.receiver.set(key, prev);
    }
    if (log.type === 'sack' && defender) {
      const key = playerName(defender);
      totals.sacks.set(key, (totals.sacks.get(key) || 0) + 1);
    }
    if (log.type === 'interception' && defender) {
      const key = playerName(defender);
      totals.picks.set(key, (totals.picks.get(key) || 0) + 1);
    }
  }

  const top = (map, valueKey) => {
    const entries = Array.from(map.values());
    if (!entries.length) return null;
    entries.sort((a, b) => ((b[valueKey] || b) - (a[valueKey] || a)));
    return entries[0];
  };

  return {
    qb: top(totals.qb, 'yds'),
    rusher: top(totals.rusher, 'yds'),
    receiver: top(totals.receiver, 'yds'),
    sacks: top(new Map(Array.from(totals.sacks.entries()).map(([player, sacks]) => [player, { player, sacks }])), 'sacks'),
    picks: top(new Map(Array.from(totals.picks.entries()).map(([player, picks]) => [player, { player, picks }])), 'picks'),
  };
}

export function summarizeGameSwing(events = [], visibleCount = events.length) {
  const recent = events.slice(Math.max(0, visibleCount - 6), visibleCount);
  const scores = recent.filter((event) => ['touchdown', 'field_goal'].includes(event.eventType)).length;
  const turnovers = recent.filter((event) => event.eventType === 'turnover').length;
  const explosive = recent.filter((event) => event.eventType === 'explosive_play').length;

  if (turnovers >= 2) return { label: 'Defense taking control', tone: 'defense' };
  if (scores >= 3) return { label: 'Offense in rhythm', tone: 'offense' };
  if (scores >= 2 && explosive >= 1) return { label: 'Momentum swing building', tone: 'swing' };
  if (explosive >= 2) return { label: 'Field position flipped', tone: 'swing' };
  return { label: 'Game still in balance', tone: 'neutral' };
}

export function getEventTags(event = {}) {
  const tags = [];
  if (event.eventType === 'touchdown') tags.push('TD');
  if (event.eventType === 'turnover') {
    const text = String(event.headline || '').toLowerCase();
    tags.push(text.includes('interception') ? 'INT' : 'FUM');
  }
  if (event.eventType === 'sack') tags.push('SACK');
  if (event.eventType === 'explosive_play') tags.push('BIG PLAY');
  if (event.eventType === 'red_zone_entry') tags.push('RED ZONE');
  if (event.impactTag === 'swing') tags.push('CLUTCH');
  return tags;
}
