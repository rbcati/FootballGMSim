import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

content = content.replace("promptUserGame,\n    userGameLogs\n  } = state;", "  } = state;\n  const { promptUserGame, userGameLogs } = state;")

with open('src/ui/App.jsx', 'w') as f:
    f.write(content)
