import re

with open('src/worker/protocol.js', 'r') as f:
    content = f.read()

# Add toWorker
content = re.sub(
    r"(\s*SIM_TO_PLAYOFFS:\s*'SIM_TO_PLAYOFFS',)",
    r"\1\n  WATCH_GAME:         'WATCH_GAME',\n  SIMULATE_USER_GAME: 'SIMULATE_USER_GAME',",
    content
)

# Add toUI
content = re.sub(
    r"(\s*WEEK_COMPLETE:\s*'WEEK_COMPLETE',)",
    r"\1\n  PROMPT_USER_GAME:   'PROMPT_USER_GAME',\n  PLAY_LOGS:          'PLAY_LOGS',",
    content
)

with open('src/worker/protocol.js', 'w') as f:
    f.write(content)
