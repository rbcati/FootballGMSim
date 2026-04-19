import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

content = content.replace("    batchSim,\n      } = state;", "    batchSim\n  } = state;")

with open('src/ui/App.jsx', 'w') as f:
    f.write(content)
