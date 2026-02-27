import re

with open('src/worker/protocol.js', 'r') as f:
    content = f.read()

# Add GET_DASHBOARD_LEADERS to toWorker
content = re.sub(
    r"(GET_LEAGUE_LEADERS:\s*'GET_LEAGUE_LEADERS',.*?\n)",
    r"\1  GET_DASHBOARD_LEADERS: 'GET_DASHBOARD_LEADERS', // { }\n",
    content,
    flags=re.MULTILINE
)

# Add DASHBOARD_LEADERS to toUI
content = re.sub(
    r"(LEAGUE_LEADERS:\s*'LEAGUE_LEADERS',.*?\n)",
    r"\1  DASHBOARD_LEADERS:  'DASHBOARD_LEADERS',    // { league, team }\n",
    content,
    flags=re.MULTILINE
)

with open('src/worker/protocol.js', 'w') as f:
    f.write(content)
