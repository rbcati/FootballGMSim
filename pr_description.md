💡 **What:** Replaced usage of `.find()` and `.filter()` array methods in `buildSeasonArchiveSummary` with traditional `for` loops and cached the conversion of `userTeamId` to a number.

🎯 **Why:** To improve the performance of league memory summarization. Higher-order array methods in JS carry execution overhead, especially inside an O(N) loop when filtering `seasonStats` and `standings`. Pre-casting the ID prevents redundant string-to-number coercions during the lookups.

📊 **Measured Improvement:**
- **Baseline:** ~185ms to ~190ms (per 10,000 executions of a synthetic payload).
- **Improved:** ~115ms (per 10,000 executions).
- **Result:** ~38% faster execution time for the summarization block compared to baseline.
💡 **What:** Replaced the O(N) `league.teams.find(...)` lookup with an O(1) `league._teamsMap` hash map lookup inside `commitGameResult` and `updateTeamStandings`.

🎯 **Why:** `commitGameResult` executes frequently (for every game in a season, plus thousands during multi-season dynasty loops). Moving from `Array.prototype.find()` to a pre-computed map avoids repeatedly iterating over 32+ teams inside nested loops.

📊 **Measured Improvement:**
A focused benchmark was created simulating 27,200 games (100 full 17-game seasons):
- **Baseline (without optimization):** 894.14 ms
- **Optimized (with map):** 823.38 ms
- **Improvement:** 7.91% speedup

All unit tests and builds continue to pass.
