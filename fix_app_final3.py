import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

# I see it now.
content = content.replace("    userGameLogs\n\n\n  const [activeView, setActiveView] = useState('saves');", "    userGameLogs\n  } = state;\n\n  const [activeView, setActiveView] = useState('saves');")

with open('src/ui/App.jsx', 'w') as f:
    f.write(content)
