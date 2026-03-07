with open('src/worker/worker.js', 'r') as f:
    content = f.read()

search = """  const winners = results.map(r => getWinner(r));
  // Unique conference ids from the seeds object (as numbers)
  const confs = [...new Set(Object.keys(seeds).map(Number))].sort();

  if (currentWeek === 19) {
    // Wildcard → Divisional (Week 20)
    // Per conf: add the #1-seed bye + 3 WC survivors, sort by seed, then
    // lowest-seed (1) hosts vs highest-surviving-seed (slot 3) and so on.
    const allGames = [];
    for (const confId of confs) {
      const confSeeds = seeds[confId] ?? [];
      if (confSeeds.length === 0) continue;

      const byeEntry = { teamId: confSeeds[0].teamId, seed: 1, conf: confId };
      const wcSurvivors = winners
        .filter(tid => getConf(tid) === confId)
        .map(tid => ({ teamId: tid, seed: getSeed(tid), conf: confId }));

      const divTeams = [byeEntry, ...wcSurvivors].sort((a, b) => a.seed - b.seed);

      if (divTeams.length >= 4) {
        allGames.push({ home: divTeams[0].teamId, away: divTeams[3].teamId, played: false, round: 'divisional', conf: confId });
        allGames.push({ home: divTeams[1].teamId, away: divTeams[2].teamId, played: false, round: 'divisional', conf: confId });
      }
    }
    return { week: 20, playoffRound: 'divisional', games: allGames };

  } else if (currentWeek === 20) {
    // Divisional → Conference (Week 21)
    const allGames = [];
    for (const confId of confs) {
      const confWinners = winners
        .filter(tid => getConf(tid) === confId)
        .map(tid => ({ teamId: tid, seed: getSeed(tid) }))
        .sort((a, b) => a.seed - b.seed);

      if (confWinners.length >= 2) {
        allGames.push({ home: confWinners[0].teamId, away: confWinners[1].teamId, played: false, round: 'conference', conf: confId });
      }
    }
    return { week: 21, playoffRound: 'conference', games: allGames };

  } else if (currentWeek === 21) {"""

replace = """  const winners = results.map(r => getWinner(r));
  // Unique conference ids from the seeds object (as numbers)
  const confs = [...new Set(Object.keys(seeds).map(Number))].sort();

  const mappedWinners = winners.map(tid => ({ teamId: tid, seed: getSeed(tid), conf: getConf(tid) }));

  if (currentWeek === 19) {
    // Wildcard → Divisional (Week 20)
    // Per conf: add the #1-seed bye + 3 WC survivors, sort by seed, then
    // lowest-seed (1) hosts vs highest-surviving-seed (slot 3) and so on.
    const allGames = [];
    for (const confId of confs) {
      const confSeeds = seeds[confId] ?? [];
      if (confSeeds.length === 0) continue;

      const byeEntry = { teamId: confSeeds[0].teamId, seed: 1, conf: confId };
      const wcSurvivors = mappedWinners.filter(w => w.conf === confId);

      const divTeams = [byeEntry, ...wcSurvivors].sort((a, b) => a.seed - b.seed);

      if (divTeams.length >= 4) {
        allGames.push({ home: divTeams[0].teamId, away: divTeams[3].teamId, played: false, round: 'divisional', conf: confId });
        allGames.push({ home: divTeams[1].teamId, away: divTeams[2].teamId, played: false, round: 'divisional', conf: confId });
      }
    }
    return { week: 20, playoffRound: 'divisional', games: allGames };

  } else if (currentWeek === 20) {
    // Divisional → Conference (Week 21)
    const allGames = [];
    for (const confId of confs) {
      const confWinners = mappedWinners
        .filter(w => w.conf === confId)
        .sort((a, b) => a.seed - b.seed);

      if (confWinners.length >= 2) {
        allGames.push({ home: confWinners[0].teamId, away: confWinners[1].teamId, played: false, round: 'conference', conf: confId });
      }
    }
    return { week: 21, playoffRound: 'conference', games: allGames };

  } else if (currentWeek === 21) {"""

if search in content:
    content = content.replace(search, replace)
    with open('src/worker/worker.js', 'w') as f:
        f.write(content)
    print("Updated src/worker/worker.js successfully")
else:
    print("Could not find the search string in src/worker/worker.js")
