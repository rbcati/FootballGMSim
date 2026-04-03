import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

print("handleAdvanceWeek index:", content.find('const handleAdvanceWeek = useCallback'))
print("Keyboard hook index:", content.find('// ── Keyboard shortcuts (desktop)'))

# Check if there are any syntax errors / undefined variable issues by building via vite
