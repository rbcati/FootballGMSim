import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

# Add missing variables from state destructuring
content = re.sub(
    r"    batchSim\n  \} = state;",
    r"    batchSim,\n    promptUserGame,\n    userGameLogs\n  } = state;",
    content
)

with open('src/ui/App.jsx', 'w') as f:
    f.write(content)
