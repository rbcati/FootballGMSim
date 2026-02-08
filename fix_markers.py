import re

with open('live-game-viewer.js', 'r') as f:
    content = f.read()

# Pattern for SEARCH block
# <<<<<<< SEARCH
# ...
# =======
# ...
# >>>>>>> REPLACE

# We want to keep the REPLACE part.

# Regex explanation:
# <<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE
# Group 1 is SEARCH content
# Group 2 is REPLACE content
# We replace with Group 2

fixed_content = re.sub(
    r'<<<<<<< SEARCH\n.*?\n=======\n(.*?)\n>>>>>>> REPLACE',
    r'\1',
    content,
    flags=re.DOTALL
)

with open('live-game-viewer.js', 'w') as f:
    f.write(fixed_content)
