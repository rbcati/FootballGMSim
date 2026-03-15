import re

with open('src/worker/worker.js', 'r') as f:
    content = f.read()

# Modify handleAdvanceWeek to check for user game
advance_week_code = """
  // ── 0. Check for User Game to Prompt ────────────────────────────────────
  const userTeamId = meta.userTeamId;
  if (userTeamId != null && !payload.skipUserGame && ['regular', 'playoffs'].includes(meta.phase)) {
      const scheduleWeeks = meta.schedule?.weeks || [];
      const currentWeekData = scheduleWeeks.find(w => w.week === meta.currentWeek);
      if (currentWeekData) {
          const userGame = currentWeekData.games.find(g => (Number(g.home) === userTeamId || Number(g.away) === userTeamId) && !g.played);
          if (userGame) {
              // Pause simulation and prompt the UI
              post(toUI.PROMPT_USER_GAME, {}, id);
              return;
          }
      }
  }

  // ── 0. Update Injuries (Recovery) ─────────────────────────────────────────"""

content = re.sub(
    r"(\s*\/\/\s*──\s*0\.\s*Update Injuries \(Recovery\)\s*─────────────────────────────────────────)",
    advance_week_code,
    content
)

# Add handleWatchGame and handleSimulateUserGame
new_handlers = """
// ── Handler: WATCH_GAME ──────────────────────────────────────────────────────

async function handleWatchGame(payload, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  const week = meta.currentWeek;
  const seasonId = meta.currentSeasonId;
  const schedule = expandSchedule(meta.schedule);
  const userTeamId = meta.userTeamId;

  const league = buildLeagueForSim(schedule, week, seasonId);
  const userGameIndex = league._weekGames.findIndex(g => g.home.id === userTeamId || g.away.id === userTeamId);

  if (userGameIndex === -1) {
      post(toUI.ERROR, { message: 'No user game found this week' }, id);
      return;
  }

  const userGame = league._weekGames[userGameIndex];

  // Simulate JUST the user game, passing options to generate logs
  const batchResults = simulateBatch([userGame], {
    league,
    isPlayoff: meta.phase === 'playoffs',
    generateLogs: true
  });

  const res = batchResults[0];
  if (res) {
    applyGameResultToCache(res, week, seasonId);

    // Make sure we emit the GAME_EVENT so it shows in the UI later
    const homeId = Number(typeof res.home === 'object' ? res.home.id : (res.home ?? res.homeTeamId));
    const awayId = Number(typeof res.away === 'object' ? res.away.id : (res.away ?? res.awayTeamId));
    post(toUI.GAME_EVENT, {
        gameId:    `${seasonId}_w${week}_${homeId}_${awayId}`,
        week,
        homeId,
        awayId,
        homeName:  res.homeTeamName ?? cache.getTeam(homeId)?.name ?? '?',
        awayName:  res.awayTeamName ?? cache.getTeam(awayId)?.name ?? '?',
        homeAbbr:  res.homeTeamAbbr ?? cache.getTeam(homeId)?.abbr ?? '???',
        awayAbbr:  res.awayTeamAbbr ?? cache.getTeam(awayId)?.abbr ?? '???',
        homeScore: res.scoreHome ?? res.homeScore ?? 0,
        awayScore: res.scoreAway ?? res.awayScore ?? 0,
    });

    // Remove the user game from the week's schedule so when ADVANCE_WEEK is called, it doesn't re-simulate it
    // Wait, applyGameResultToCache already marks it as `played = true` in the meta schedule,
    // so buildLeagueForSim in ADVANCE_WEEK will filter it out automatically!

    await flushDirty();

    post(toUI.PLAY_LOGS, { logs: res.playLogs || [] }, id);
  } else {
    post(toUI.ERROR, { message: 'Simulation failed' }, id);
  }
}

// ── Handler: SIMULATE_USER_GAME ──────────────────────────────────────────────
async function handleSimulateUserGame(payload, id) {
  // Essentially the same as WATCH_GAME but we don't need to return logs
  // Since the user chose to just sim it, we can just call handleAdvanceWeek
  // But wait, the UI handles "Simulate" by just calling advanceWeek({ skipUserGame: true }).
  // Actually, if they click Simulate, they want the game to happen.
  // The ADVANCE_WEEK with skipUserGame=true means it skips the *prompt*, not the game itself.
  // So ADVANCE_WEEK({skipUserGame: true}) will just simulate the whole week, including the user's game.
  // I will just use that logic in the UI and remove SIMULATE_USER_GAME.
}
"""

content += new_handlers

content = re.sub(
    r"(case toWorker\.SIM_TO_PLAYOFFS:\s*return await handleSimToWeek\(\{ targetWeek: 18 \}, id\);)",
    r"\1\n      case toWorker.WATCH_GAME:         return await handleWatchGame(payload, id);",
    content
)

with open('src/worker/worker.js', 'w') as f:
    f.write(content)
