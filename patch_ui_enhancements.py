import re
import os

# 1. Clean up ui-enhancements.css
file_path = "src/ui/styles/ui-enhancements.css"
with open(file_path, "r") as f:
    content = f.read()

# Replace fonts
content = content.replace("font-family: 'Arial Black', sans-serif;", "font-weight: 900;")
content = content.replace("font-family: 'Courier New', monospace;", "font-weight: 900; font-variant-numeric: tabular-nums;")
content = content.replace("font-family: 'Courier New', Courier, monospace;", "font-weight: 900; font-variant-numeric: tabular-nums;")

# Remove existing .fade-in, .fade-out, @keyframes fadeOut, @keyframes fadeIn
content = re.sub(r'\.fade-in\s*\{[^}]*\}', '', content)
content = re.sub(r'\.fade-out\s*\{[^}]*\}', '', content)
content = re.sub(r'@keyframes fadeIn\s*\{[^}]*\}', '', content)
content = re.sub(r'@keyframes fadeOut\s*\{[^}]*\}', '', content)

# Define new fade-in / fade-out
fade_css = """
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

.fade-in {
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.fade-out {
  animation: fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none;
}
"""
content += "\n" + fade_css

# Ensure .game-event-overlay.touchdown etc are defined with distinct overlays
overlay_css = """
.game-event-overlay.touchdown .event-text { color: #FFD700; text-shadow: 0 0 20px #FFA500, 0 0 40px #FF4500; font-weight: 900; letter-spacing: 2px; }
.game-event-overlay.touchdown::before { content: '🙌'; display: block; font-size: 5rem; margin-bottom: 10px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

.game-event-overlay.field-goal .event-text { color: #0A84FF; text-shadow: 0 0 15px #0056b3; font-weight: 900; letter-spacing: 1px; }
.game-event-overlay.field-goal::before { content: '👟'; display: block; font-size: 4rem; margin-bottom: 10px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

.game-event-overlay.punt .event-text { color: #0A84FF; text-shadow: 0 0 15px #0056b3; font-weight: 900; letter-spacing: 1px; }
.game-event-overlay.punt::before { content: '🦶'; display: block; font-size: 4rem; margin-bottom: 10px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

.game-event-overlay.turnover .event-text { color: #FF453A; border: 4px solid #FF453A; background: rgba(0, 0, 0, 0.85); padding: 15px 30px; transform: rotate(-5deg); border-radius: 12px; box-shadow: 0 0 20px rgba(255, 69, 58, 0.6); font-weight: 900; font-variant-numeric: tabular-nums; }
.game-event-overlay.turnover::before { content: '🔄'; display: block; font-size: 5rem; margin-bottom: 10px; filter: drop-shadow(0 0 10px rgba(255, 69, 58, 0.5)); animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

.game-event-overlay.sack .event-text { color: #FF453A; border: 4px solid #FF453A; background: rgba(0, 0, 0, 0.85); padding: 15px 30px; transform: rotate(-5deg); border-radius: 12px; box-shadow: 0 0 20px rgba(255, 69, 58, 0.6); font-weight: 900; }
.game-event-overlay.sack::before { content: '💥'; display: block; font-size: 5rem; margin-bottom: 10px; filter: drop-shadow(0 0 10px rgba(255, 69, 58, 0.5)); animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

.game-event-overlay.safety .event-text { color: #FF453A; border: 4px solid #FF453A; background: rgba(0, 0, 0, 0.85); padding: 15px 30px; transform: rotate(-5deg); border-radius: 12px; box-shadow: 0 0 20px rgba(255, 69, 58, 0.6); font-weight: 900; }
.game-event-overlay.safety::before { content: '🛡️'; display: block; font-size: 5rem; margin-bottom: 10px; filter: drop-shadow(0 0 10px rgba(255, 69, 58, 0.5)); animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
"""
content += "\n" + overlay_css

with open(file_path, "w") as f:
    f.write(content)

# 2. Clean up components.css button styles
file_path = "src/ui/styles/components.css"
with open(file_path, "r") as f:
    content = f.read()

# Make sure .btn transition is using the springy bezier
content = re.sub(r'(\.btn\s*\{[^}]*)transition:[^;]+;', r'\1transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);', content)
content = re.sub(r'\.btn:hover\s*\{[^}]*\}', '.btn:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-md);\n  border-color: var(--hairline-strong);\n  filter: brightness(1.05);\n}', content)
content = re.sub(r'\.btn:active\s*\{[^}]*\}', '.btn:active {\n  transform: scale(0.96) translateY(1px);\n  filter: brightness(0.95);\n}', content)

with open(file_path, "w") as f:
    f.write(content)

# 3. Update AnimatedField.jsx
file_path = "src/ui/components/AnimatedField.jsx"
with open(file_path, "r") as f:
    content = f.read()

# Replace ParticleBurst
old_burst = """function ParticleBurst({ x, y, color, count = 12, active }) {
  if (!active) return null;
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 2 * Math.PI;
      const dist = 20 + Math.random() * 30;
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
    }), [count] // eslint-disable-line
  );
  return (
    <g>
      {particles.map((p, i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={color} opacity="0.9">
          <animateTransform
            attributeName="transform" type="translate"
            from="0 0" to={`${p.dx} ${p.dy}`}
            dur="0.6s" fill="freeze"
          />
          <animate attributeName="opacity" from="0.9" to="0" dur="0.6s" fill="freeze" />
          <animate attributeName="r" from="3" to="1" dur="0.6s" fill="freeze" />
        </circle>
      ))}
    </g>
  );
}"""

new_burst = """function ParticleBurst({ x, y, color, count = 14, active }) {
  if (!active) return null;
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 2 * Math.PI;
      const dist = 20 + Math.random() * 40;
      const size = 2 + Math.random() * 4;
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, size };
    }), [count] // eslint-disable-line
  );
  return (
    <g>
      {particles.map((p, i) => (
        <circle key={i} cx={x} cy={y} r={p.size} fill={color} opacity="0.9">
          <animate
            attributeName="cx"
            from={x} to={x + p.dx}
            dur="0.8s" fill="freeze"
          />
          <animate
            attributeName="cy"
            values={`${y}; ${y + p.dy * 0.5 - 15}; ${y + p.dy + 30}`}
            keyTimes="0; 0.4; 1"
            dur="0.8s" fill="freeze"
          />
          <animate attributeName="opacity" from="0.9" to="0" dur="0.8s" fill="freeze" />
          <animate attributeName="r" from={p.size} to="0" dur="0.8s" fill="freeze" />
        </circle>
      ))}
    </g>
  );
}"""
content = content.replace(old_burst, new_burst)

# Update trajectory logic to include kick/punt
trajectory_regex = r'\{\/\*\s*Pass trajectory\s*\*\/\}.*?(<line[^>]+/>\s*\)\})'
new_trajectory = """{/* Pass/Kick trajectory */}
        {(play?.type === "pass" || play?.type === "kick" || (play?.description || "").toLowerCase().includes("punt") || (play?.description || "").toLowerCase().includes("field goal")) && animPhase >= 1 && (
          <line
            x1={losX} y1={FIELD_H / 2}
            x2={ballPos.x} y2={ballPos.y}
            stroke="white" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5"
            style={{ transition: `x2 ${0.6 / speed}s ease, y2 ${0.6 / speed}s ease` }}
          />
        )}"""
content = re.sub(trajectory_regex, new_trajectory, content, flags=re.DOTALL)

# Update burst color logic
burst_color_regex = r'const burstColor = isBigPlay.*?:\s*"#34C759";'
new_burst_color = """const burstColor = isBigPlay
    ? (play?.isTouchdown || (play?.description || "").toLowerCase().includes("touchdown")) ? "#FFD700"
      : (play?.type === "kick" || (play?.description || "").toLowerCase().includes("field goal") || (play?.description || "").toLowerCase().includes("punt")) ? "#0A84FF"
      : (play?.isTurnover || (play?.description || "").toLowerCase().includes("interception") || (play?.description || "").toLowerCase().includes("sack") || (play?.description || "").toLowerCase().includes("safety") || (play?.description || "").toLowerCase().includes("fumble")) ? "#FF453A"
      : "#FF9F0A"
    : "#34C759";"""
content = re.sub(burst_color_regex, new_burst_color, content, flags=re.DOTALL)

with open(file_path, "w") as f:
    f.write(content)

# 4. Update LiveGame.jsx overlay dispatch
file_path = "src/ui/components/LiveGame.jsx"
with open(file_path, "r") as f:
    content = f.read()

overlay_regex = r'if \(lowerText\.includes\("touchdown"\)\) \{.*?setOverlayEvent\(null\);\s*\}'
new_overlay = """if (lowerText.includes("touchdown")) {
      setOverlayEvent({ type: "touchdown", text: "TOUCHDOWN" });
    } else if (lowerText.includes("field goal attempt... good") || lowerText.includes("field goal")) {
      setOverlayEvent({ type: "field-goal", text: "FIELD GOAL" });
    } else if (lowerText.includes("interception") || lowerText.includes("fumble")) {
      setOverlayEvent({ type: "turnover", text: "TURNOVER" });
    } else if (lowerText.includes("sack")) {
      setOverlayEvent({ type: "sack", text: "SACK" });
    } else if (lowerText.includes("safety")) {
      setOverlayEvent({ type: "safety", text: "SAFETY" });
    } else if (lowerText.includes("punt")) {
      setOverlayEvent({ type: "punt", text: "PUNT" });
    } else if (lowerText.includes("deep pass complete")) {
      setOverlayEvent({ type: "big-play", text: "BIG PLAY" });
    } else {
      setOverlayEvent(null);
    }"""
content = re.sub(overlay_regex, new_overlay, content, flags=re.DOTALL)

with open(file_path, "w") as f:
    f.write(content)

print("Patch applied.")
