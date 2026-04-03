import re

with open('tests/daily_regression.spec.js', 'r') as f:
    content = f.read()

# .hub-header is probably changed or gone in recent commits. The new header appears to be .app-header in App.jsx.
# Let's replace instances of `.hub-header` in the tests with `.app-header`.

content = content.replace('.hub-header', '.app-header')

with open('tests/daily_regression.spec.js', 'w') as f:
    f.write(content)
print("Replaced .hub-header with .app-header")
