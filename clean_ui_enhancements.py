import re

with open('src/ui/styles/ui-enhancements.css', 'r') as f:
    content = f.read()

# Remove the old overlay declarations that I found
old_overlays = """
.game-event-overlay.touchdown .event-text { color: #FFD700; text-shadow: 0 0 20px rgba(255, 215, 0, 0.5); }
.game-event-overlay.field-goal .event-text { color: #34C759; text-shadow: 0 0 20px rgba(52, 199, 89, 0.5); }
.game-event-overlay.turnover .event-text { color: #FF453A; text-shadow: 0 0 20px rgba(255, 69, 58, 0.5); }
.game-event-overlay.safety .event-text { color: #FF9F0A; text-shadow: 0 0 20px rgba(255, 159, 10, 0.5); }
.game-event-overlay.sack .event-text { color: #FF9F0A; }
.game-event-overlay.big-play .event-text { color: #0A84FF; text-shadow: 0 0 20px rgba(10, 132, 255, 0.5); }
"""
content = content.replace(old_overlays, "")

# Remove specific event overlays
to_remove = [
    r'\.game-event-overlay\.field-goal-made \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.field-goal-made::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.defense-stop \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.defense-stop::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.punt \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.punt::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.goal \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.goal::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.kick \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.kick::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.save \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.save::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.two-point \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.two-point::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.two-point-miss \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.two-point-miss::before\s*\{[^}]*\}',
    r'\.game-event-overlay\.missed-xp \.event-text\s*\{[^}]*\}',
    r'\.game-event-overlay\.missed-xp::before\s*\{[^}]*\}',
]

for pattern in to_remove:
    content = re.sub(pattern, '', content)


with open('src/ui/styles/ui-enhancements.css', 'w') as f:
    f.write(content)
