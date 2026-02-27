import re

with open('src/ui/hooks/useWorker.js', 'r') as f:
    content = f.read()

# Add getDashboardLeaders
content = re.sub(
    r"(getLeagueLeaders:\s*\(mode\s*=\s*'season'\)\s*=>\s*\n\s*request\(toWorker\.GET_LEAGUE_LEADERS,\s*\{ mode \},\s*\{ silent: true \}\),)",
    r"\1\n\n    /** Fetch dashboard leaders (returns a Promise). */\n    getDashboardLeaders: () =>\n      request(toWorker.GET_DASHBOARD_LEADERS, {}, { silent: true }),",
    content
)

with open('src/ui/hooks/useWorker.js', 'w') as f:
    f.write(content)
