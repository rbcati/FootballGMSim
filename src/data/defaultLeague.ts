import { DEFAULT_TEAMS } from './default-teams.js';

const TEAM_COUNT = 32;
const START_YEAR = 2026;
const SEASON_ID = 's1';
const ROSTER_POSITIONS = [
  ['QB', 3],
  ['RB', 4],
  ['WR', 6],
  ['TE', 3],
  ['OL', 9],
  ['DL', 9],
  ['LB', 7],
  ['CB', 6],
  ['S', 4],
  ['K', 1],
  ['P', 1],
] as const;

const RATING_KEYS = [
  'throwPower',
  'throwAccuracy',
  'awareness',
  'catching',
  'catchInTraffic',
  'acceleration',
  'speed',
  'agility',
  'trucking',
  'juking',
  'passRushSpeed',
  'passRushPower',
  'runStop',
  'coverage',
  'runBlock',
  'passBlock',
  'intelligence',
  'kickPower',
  'kickAccuracy',
];

// Deterministic name generation — names are stable for a given (teamId, index) seed.
const FIRST_NAMES = [
  'Aaron','Andre','Austin','Blake','Brandon','Brett','Brian','Cameron','Carlos','Chase',
  'Christian','Colin','Curtis','Damon','Darren','Derek','Devon','Dillon','Dominic','Dylan',
  'Elijah','Ethan','Evan','Fabian','Felix','Finn','Frank','Grant','Greg','Hunter',
  'Isaiah','Ivan','Jared','Jason','Jordan','Justin','Kevin','Kyle','Landon','Liam',
  'Logan','Lucas','Malik','Marcus','Mason','Matt','Mike','Nathan','Nick','Noah',
  'Omar','Parker','Patrick','Quinn','Ramon','Ryan','Sam','Sean','Trey','Tyler',
  'Victor','Wesley','Xavier','Zach',
] as const;

const LAST_NAMES = [
  'Adams','Allen','Anderson','Baker','Barnes','Bell','Bennett','Black','Boyd','Brown',
  'Butler','Campbell','Carter','Clark','Cole','Collins','Cook','Cooper','Cox','Cruz',
  'Davis','Dixon','Edwards','Elliott','Ellis','Evans','Fisher','Fletcher','Ford','Foster',
  'Garcia','Gonzalez','Green','Griffin','Hall','Harris','Hayes','Hernandez','Hill','Howard',
  'Ingram','Jackson','James','Johnson','Jones','Jordan','Kelly','King','Knight','Lawrence',
  'Lee','Lewis','Long','Lopez','Lynch','Martin','Martinez','Miller','Mitchell','Moore',
  'Morgan','Morris','Murphy','Murray','Nelson','Ortiz','Parker','Perez','Perry','Phillips',
  'Price','Reid','Rivera','Roberts','Robinson','Rodriguez','Ross','Russell','Sanchez','Sanders',
  'Scott','Shaw','Smith','Taylor','Thomas','Thompson','Turner','Walker','Ward','Washington',
  'White','Williams','Wilson','Wood','Wright','Young',
] as const;

function seededPick<T extends readonly string[]>(arr: T, seed: number): T[number] {
  let t = ((seed * 2654435761) >>> 0);
  t = (t + 0x6D2B79F5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return arr[((r ^ (r >>> 14)) >>> 0) % arr.length];
}

function generatePlayerName(teamId: number, index: number): string {
  const seed = (teamId * 997 + index) * 1000003;
  return `${seededPick(FIRST_NAMES, seed)} ${seededPick(LAST_NAMES, seed + 499979)}`;
}

function buildRatings(pos: string, ovr: number) {
  const ratings = Object.fromEntries(RATING_KEYS.map((key) => [key, Math.max(45, Math.min(90, ovr - 2))]));
  const boost = (keys: string[], amount = 8) => {
    keys.forEach((key) => {
      ratings[key] = Math.max(45, Math.min(95, ovr + amount));
    });
  };

  if (pos === 'QB') boost(['throwPower', 'throwAccuracy', 'awareness', 'intelligence']);
  if (pos === 'RB') boost(['speed', 'acceleration', 'trucking', 'juking', 'awareness']);
  if (pos === 'WR') boost(['speed', 'acceleration', 'catching', 'catchInTraffic']);
  if (pos === 'TE') boost(['catching', 'catchInTraffic', 'runBlock', 'passBlock']);
  if (pos === 'OL') boost(['runBlock', 'passBlock', 'awareness']);
  if (pos === 'DL') boost(['passRushPower', 'passRushSpeed', 'runStop']);
  if (pos === 'LB') boost(['speed', 'runStop', 'coverage', 'awareness']);
  if (pos === 'CB') boost(['speed', 'acceleration', 'coverage', 'intelligence']);
  if (pos === 'S') boost(['speed', 'coverage', 'runStop', 'awareness']);
  if (pos === 'K' || pos === 'P') boost(['kickPower', 'kickAccuracy', 'awareness']);

  return ratings;
}

function makePlayer(teamId: number, index: number, pos: string, depthOrder: number) {
  const ovr = Math.max(58, Math.min(84, 74 - Math.floor(depthOrder / 2) + ((teamId + index) % 5)));
  const ratings = buildRatings(pos, ovr);
  const id = teamId * 1000 + index + 1;
  return {
    id,
    name: generatePlayerName(teamId, index),
    pos,
    age: 23 + ((teamId + index) % 10),
    ratings,
    trueRatings: { ...ratings },
    visibleRatings: { ...ratings },
    ovr,
    displayOvr: ovr,
    trueOvr: ovr,
    scoutedOvr: ovr,
    pot: Math.min(95, ovr + 6),
    potential: Math.min(95, ovr + 6),
    years: 2,
    yearsTotal: 2,
    baseAnnual: pos === 'QB' ? 8 : pos === 'K' || pos === 'P' ? 1.2 : 2.2,
    signingBonus: 0,
    guaranteedPct: 0.45,
    contract: { years: 2, yearsTotal: 2, salary: pos === 'QB' ? 8 : 2.2, amount: pos === 'QB' ? 8 : 2.2 },
    status: 'active',
    teamId,
    depthOrder,
    injuryWeeksRemaining: 0,
    injuryWeeks: 0,
    fatigue: 0,
    morale: 75,
    stats: {
      game: {},
      season: {},
      career: {},
    },
    awards: [],
    history: [],
    traits: [],
    abilities: [],
  };
}

function makeRoster(teamId: number) {
  const roster = [];
  let index = 0;
  for (const [pos, count] of ROSTER_POSITIONS) {
    for (let depth = 1; depth <= count; depth += 1) {
      roster.push(makePlayer(teamId, index, pos, depth));
      index += 1;
    }
  }
  return roster;
}

function makeDraftPicks(teamId: number) {
  const picks = [];
  for (let yearOffset = 0; yearOffset < 3; yearOffset += 1) {
    for (let round = 1; round <= 7; round += 1) {
      picks.push({
        id: `safe-pick-${teamId}-${START_YEAR + yearOffset}-${round}`,
        round,
        season: START_YEAR + yearOffset,
        originalOwner: teamId,
        currentOwner: teamId,
        isCompensatory: false,
      });
    }
  }
  return picks;
}

function makeSchedule(teams: Array<{ id: number }>) {
  const ids = teams.map((team) => team.id);
  const weeks = [];
  for (let week = 1; week <= 18; week += 1) {
    const offset = (week - 1) % ids.length;
    const rotated = ids.slice(offset).concat(ids.slice(0, offset));
    const games = [];
    for (let i = 0; i < rotated.length; i += 2) {
      const away = rotated[i];
      const home = rotated[i + 1];
      if (home == null || away == null) continue;
      const gameId = `${SEASON_ID}_w${week}_${home}_${away}`;
      games.push({
        id: gameId,
        gameId,
        seasonId: SEASON_ID,
        week,
        away,
        home,
        played: false,
      });
    }
    weeks.push({ week, games });
  }
  return { weeks };
}

export function buildDefaultLeague(options: { userTeamId?: number; name?: string; year?: number } = {}) {
  const userTeamId = Number.isFinite(Number(options.userTeamId)) ? Number(options.userTeamId) : 0;
  const year = Number.isFinite(Number(options.year)) ? Number(options.year) : START_YEAR;
  const teams = DEFAULT_TEAMS.slice(0, TEAM_COUNT).map((team, idx) => {
    const roster = makeRoster(idx);
    return {
      ...team,
      id: idx,
      wins: 0,
      losses: 0,
      ties: 0,
      ptsFor: 0,
      ptsAgainst: 0,
      roster,
      rosterIds: roster.map((player) => player.id),
      rosterCount: roster.length,
      picks: makeDraftPicks(idx),
      capTotal: 301.2,
      capUsed: 0,
      capRoom: 301.2,
      capSpace: 301.2,
      fanApproval: 50,
      history: [],
      stats: { season: {}, game: {} },
      strategies: { offPlanId: 'BALANCED', defPlanId: 'BALANCED', riskId: 'BALANCED', starTargetId: null },
      franchiseInvestments: {
        stadiumLevel: 1,
        concessionsStrategy: 'balanced',
        trainingLevel: 1,
        scoutingLevel: 1,
        scoutingRegion: 'national',
        ownerCapacity: 10,
        usedCapacity: 4,
        trainingFocus: 'balanced',
        history: [],
      },
    };
  });

  const schedule = makeSchedule(teams);

  return {
    id: 'fallback-league',
    name: options.name ?? 'Safe Starter League',
    phase: 'regular',
    week: 1,
    year,
    season: 1,
    seasonId: SEASON_ID,
    currentSeasonId: SEASON_ID,
    userTeamId,
    teams,
    schedule,
    resultsByWeek: [],
    transactions: [],
    newsItems: [],
    ownerGoals: [],
    retiredPlayers: [],
    records: {
      mostPassingYardsSeason: null,
      mostRushingYardsSeason: null,
      mostWinsSeason: null,
      mostChampionships: null,
      highestOvrPlayer: null,
    },
  };
}
