import re

with open('tests/daily_regression.spec.js', 'r') as f:
    content = f.read()

# Fix syntax error in my previous patch
content = content.replace("'button.standings-tab:has-text(\"Strategy\"), { force: true }'", "'button.standings-tab:has-text(\"Strategy\")', { force: true }")
content = content.replace("'button.standings-tab:has-text(\"Standings\"), { force: true }'", "'button.standings-tab:has-text(\"Standings\")', { force: true }")
content = content.replace("'button.standings-tab:has-text(\"Roster\"), { force: true }'", "'button.standings-tab:has-text(\"Roster\")', { force: true }")

with open('tests/daily_regression.spec.js', 'w') as f:
    f.write(content)
