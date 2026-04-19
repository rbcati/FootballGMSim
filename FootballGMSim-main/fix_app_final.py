import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

# Fix the duplicate '  } = state;' from previous regex failure
content = re.sub(
    r"(\} = state;)(\s*\} = state;)",
    r"\1",
    content
)

with open('src/ui/App.jsx', 'w') as f:
    f.write(content)
