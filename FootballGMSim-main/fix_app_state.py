import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

# I see what happened. `const { state, actions } = useWorker();`
# `const { busy, ... } = state;` and then I had `  } = state; const { promptUserGame, userGameLogs } = state;` and now it's `  const { promptUserGame, userGameLogs } = state;` without `}`? Let's check exactly what the head of the file looks like to replace cleanly.
