const TEAM_INFOS = {
  0: [0, 0, 0], 1: [0, 0, 1], 2: [0, 0, 2], 3: [0, 0, 3],
  4: [0, 1, 0], 5: [0, 1, 1], 6: [0, 1, 2], 7: [0, 1, 3],
  8: [0, 2, 0], 9: [0, 2, 1], 10: [0, 2, 2], 11: [0, 2, 3],
  12: [0, 3, 0], 13: [0, 3, 1], 14: [0, 3, 2], 15: [0, 3, 3],
  16: [1, 0, 0], 17: [1, 0, 1], 18: [1, 0, 2], 19: [1, 0, 3],
  20: [1, 1, 0], 21: [1, 1, 1], 22: [1, 1, 2], 23: [1, 1, 3],
  24: [1, 2, 0], 25: [1, 2, 1], 26: [1, 2, 2], 27: [1, 2, 3],
  28: [1, 3, 0], 29: [1, 3, 1], 30: [1, 3, 2], 31: [1, 3, 3],
};

const TEMPLATE_TEAM_IDS = Array.from({ length: 32 }, (_, i) => i);
// Matchup tuple order is [homeTemplateTeamId, awayTemplateTeamId].
// If a caller needs [away, home], adapt in one place during materialization.

function rotateArray(values, offset) {
  const size = values.length;
  if (size === 0) return [];
  const normalized = ((offset % size) + size) % size;
  return [...values.slice(normalized), ...values.slice(0, normalized)];
}

function buildGeneratedTemplate(seed) {
  const weeks = [];

  for (let week = 1; week <= 18; week++) {
    const byeWeekIndex = week >= 5 && week <= 12 ? week - 5 : -1;
    const byeTeams = byeWeekIndex >= 0
      ? TEMPLATE_TEAM_IDS.filter(teamId => ((teamId + seed) % 8) === byeWeekIndex)
      : [];

    const activeTeams = TEMPLATE_TEAM_IDS.filter(teamId => !byeTeams.includes(teamId));
    const rotated = rotateArray(activeTeams, week * (seed + 1));
    const half = rotated.length / 2;
    const matchups = [];

    for (let i = 0; i < half; i++) {
      const teamA = rotated[i];
      const teamB = rotated[i + half];
      const shouldFlip = (week + i + seed) % 2 === 0;
      matchups.push(shouldFlip ? [teamB, teamA] : [teamA, teamB]);
    }

    weeks.push({ day: week, matchups });
  }

  return weeks;
}

export const NFL_32_TEMPLATE_PACK = {
  schedules: [0, 1, 2, 3].map(buildGeneratedTemplate),
  teamInfos: TEAM_INFOS,
};

function getTeamConferenceId(team) {
  return team.cid ?? team.conf ?? team.conferenceId ?? team.conference ?? null;
}

function getTeamDivisionId(team) {
  return team.did ?? team.div ?? team.divisionId ?? team.division ?? null;
}

export function getTemplateIndexForSeason(season) {
  const count = NFL_32_TEMPLATE_PACK.schedules.length;
  if (count === 0) {
    throw new Error('NFL_32_TEMPLATE_PACK.schedules is empty');
  }

  return Math.abs(Number(season) || 0) % count;
}

export function canUseNfl32Templates(teams) {
  if (!Array.isArray(teams) || teams.length !== 32) {
    return false;
  }

  const conferenceDivisionCounts = new Map();

  for (const team of teams) {
    const cid = getTeamConferenceId(team);
    const did = getTeamDivisionId(team);

    if (cid == null || did == null) {
      return false;
    }

    const key = `${cid}:${did}`;
    conferenceDivisionCounts.set(key, (conferenceDivisionCounts.get(key) ?? 0) + 1);
  }

  if (conferenceDivisionCounts.size !== 8) {
    return false;
  }

  const conferences = new Set();
  const divisionsByConference = new Map();

  for (const key of conferenceDivisionCounts.keys()) {
    const [cidRaw, didRaw] = key.split(':');
    const cid = Number(cidRaw);
    const did = Number(didRaw);
    conferences.add(cid);
    const divSet = divisionsByConference.get(cid) ?? new Set();
    divSet.add(did);
    divisionsByConference.set(cid, divSet);
  }

  if (conferences.size !== 2) {
    return false;
  }

  for (const count of conferenceDivisionCounts.values()) {
    if (count !== 4) {
      return false;
    }
  }

  for (const divSet of divisionsByConference.values()) {
    if (divSet.size !== 4) {
      return false;
    }
  }

  return true;
}

export function buildTemplateSlotToTidMap(teams) {
  const grouped = new Map();

  for (const team of teams) {
    const cid = getTeamConferenceId(team);
    const did = getTeamDivisionId(team);
    const tid = team.tid ?? team.id;

    if (cid == null || did == null || tid == null) {
      throw new Error('Cannot map teams without conference, division, and team id values');
    }

    const key = `${cid}:${did}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push({ tid, cid, did });
    grouped.set(key, bucket);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.tid - b.tid);
  }

  const slotToTid = new Map();

  for (const [templateTidRaw, info] of Object.entries(NFL_32_TEMPLATE_PACK.teamInfos)) {
    const templateTid = Number(templateTidRaw);
    const [cid, did, slot] = info;
    const bucketKey = `${cid}:${did}`;
    const realTeam = grouped.get(bucketKey)?.[slot];

    if (!realTeam) {
      throw new Error(
        `Missing real team for template slot ${templateTid} (cid=${cid}, did=${did}, slot=${slot})`,
      );
    }

    slotToTid.set(templateTid, realTeam.tid);
  }

  return slotToTid;
}

export function materializeTemplateSchedule(teams, season) {
  if (!canUseNfl32Templates(teams)) {
    throw new Error('League does not match the 32-team NFL template structure');
  }

  const templateIndex = getTemplateIndexForSeason(season);
  const template = NFL_32_TEMPLATE_PACK.schedules[templateIndex];
  const slotToTid = buildTemplateSlotToTidMap(teams);

  return template.map((week) => ({
    week: week.day,
    games: week.matchups.map(([homeTemplateTid, awayTemplateTid]) => {
      const homeTid = slotToTid.get(homeTemplateTid);
      const awayTid = slotToTid.get(awayTemplateTid);

      if (homeTid == null || awayTid == null) {
        throw new Error(
          `Failed to materialize matchup [${homeTemplateTid}, ${awayTemplateTid}] for week ${week.day}`,
        );
      }

      return {
        week: week.day,
        homeTid,
        awayTid,
      };
    }),
  }));
}

export function validateMaterializedTemplateSchedule(weeks, expectedTeamCount = 32) {
  if (weeks.length !== 18) {
    throw new Error(`Expected 18 weeks, got ${weeks.length}`);
  }

  const gamesPlayed = new Map();

  for (const week of weeks) {
    const seen = new Set();

    for (const game of week.games) {
      if (game.homeTid === game.awayTid) {
        throw new Error(`Week ${week.week} has self-matchup for team ${game.homeTid}`);
      }

      if (seen.has(game.homeTid) || seen.has(game.awayTid)) {
        throw new Error(`Week ${week.week} has a duplicate team assignment`);
      }

      seen.add(game.homeTid);
      seen.add(game.awayTid);

      gamesPlayed.set(game.homeTid, (gamesPlayed.get(game.homeTid) ?? 0) + 1);
      gamesPlayed.set(game.awayTid, (gamesPlayed.get(game.awayTid) ?? 0) + 1);
    }
  }

  if (gamesPlayed.size !== expectedTeamCount) {
    throw new Error(
      `Expected ${expectedTeamCount} teams in schedule, got ${gamesPlayed.size}`,
    );
  }

  for (const [tid, count] of gamesPlayed.entries()) {
    if (count !== 17) {
      throw new Error(`Expected team ${tid} to have 17 games, got ${count}`);
    }
  }
}
