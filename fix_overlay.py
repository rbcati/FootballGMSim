import re

with open('src/ui/styles/ui-enhancements.css', 'r') as f:
    content = f.read()

# Fix punt overlay not showing up in grep
overlay_css = """
.game-event-overlay.punt .event-text { color: #0A84FF; text-shadow: 0 0 15px #0056b3; font-weight: 900; letter-spacing: 1px; }
.game-event-overlay.punt::before { content: '🦶'; display: block; font-size: 4rem; margin-bottom: 10px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
"""

# Check if punt exists, if not, append to touchdown block
if ".game-event-overlay.punt" not in content:
    content = content.replace(".game-event-overlay.field-goal::before { content: '👟'; display: block; font-size: 4rem; margin-bottom: 10px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }", ".game-event-overlay.field-goal::before { content: '👟'; display: block; font-size: 4rem; margin-bottom: 10px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }\n" + overlay_css)


with open('src/ui/styles/ui-enhancements.css', 'w') as f:
    f.write(content)
