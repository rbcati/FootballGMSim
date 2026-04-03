import re

with open('src/ui/App.jsx', 'r') as f:
    content = f.read()

# React hook dependency error: handleAdvanceWeek is used in the onKey useEffect, but handleAdvanceWeek is defined *after* it.
# We need to move handleAdvanceWeek above the onKey useEffect, or remove handleAdvanceWeek from the dependency array since it's just a ref in the broader scope.
# The proper fix is moving `handleAdvanceWeek` definition before `useEffect` keyboard hook.

# Find handleAdvanceWeek block
advance_match = re.search(r'(  const handleAdvanceWeek = useCallback\(\(\) => \{.*?\n  \}, \[busy, simulating, actions, league\]\);)\n', content, flags=re.DOTALL)
if advance_match:
    handle_code = advance_match.group(1)
    content = content.replace(handle_code + '\n', '')

    # insert it before the keyboard shortcut useEffect
    insert_pos = content.find('  // ── Keyboard shortcuts (desktop)')
    content = content[:insert_pos] + handle_code + '\n\n' + content[insert_pos:]

with open('src/ui/App.jsx', 'w') as f:
    f.write(content)
print("Fixed App.jsx hook ordering")
