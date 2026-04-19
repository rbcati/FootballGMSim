import re

with open('src/ui/hooks/useWorker.js', 'r') as f:
    content = f.read()

# Add initial state
content = re.sub(
    r"(notifications:\[\],)",
    r"\1\n  promptUserGame: false,\n  userGameLogs: null,",
    content
)

# Add reducer cases
content = re.sub(
    r"(case 'SIM_START':)",
    r"case 'PROMPT_USER_GAME':\n      return { ...state, busy: false, simulating: false, promptUserGame: true };\n    case 'PLAY_LOGS':\n      return { ...state, busy: false, promptUserGame: false, userGameLogs: action.logs };\n    case 'CLEAR_USER_GAME':\n      return { ...state, promptUserGame: false, userGameLogs: null };\n    \1",
    content
)

# Add protocol handling
content = re.sub(
    r"(case toUI\.SIM_PROGRESS:)",
    r"case toUI.PROMPT_USER_GAME:\n          dispatch({ type: 'PROMPT_USER_GAME' });\n          break;\n        case toUI.PLAY_LOGS:\n          dispatch({ type: 'PLAY_LOGS', logs: payload.logs });\n          break;\n        \1",
    content
)

# Add actions
content = re.sub(
    r"(\/\*\* Simulate the current week\. \*\/)",
    r"/** Watch the user game (returns a Promise resolving to logs). */\n    watchGame: () => request(toWorker.WATCH_GAME, {}, { silent: false }),\n\n    /** Simulate user game directly */\n    simulateUserGame: () => {\n      dispatch({ type: 'SIM_START' });\n      send(toWorker.SIMULATE_USER_GAME);\n    },\n\n    clearUserGame: () => dispatch({ type: 'CLEAR_USER_GAME' }),\n\n    \1",
    content
)

# Update advanceWeek
content = re.sub(
    r"(advanceWeek:\s*\(\)\s*=>\s*\{[\s\S]*?send\(toWorker\.ADVANCE_WEEK\);\n\s*\},)",
    r"advanceWeek: (options = {}) => {\n      dispatch({ type: 'SIM_START' });\n      send(toWorker.ADVANCE_WEEK, options);\n    },",
    content
)

with open('src/ui/hooks/useWorker.js', 'w') as f:
    f.write(content)
