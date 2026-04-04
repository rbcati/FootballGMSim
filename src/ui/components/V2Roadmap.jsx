import React, { useMemo } from "react";

const ROADMAP_SECTIONS = [
  {
    title: "Roster & Depth Chart System",
    icon: "🏈",
    items: [
      "Practice/training module (weekly training points allocated by position)",
      "Automatic injury replacement + depth promotion logic",
    ],
  },
  {
    title: "Draft & Scouting Overhaul",
    icon: "🧠",
    items: [
      "Pre-draft scouting reports with combine results",
      "7-round mock draft + Big Board screen (sortable columns)",
      "Rookie potential tracking (hidden dev trait revealed over seasons)",
    ],
  },
  {
    title: "Free Agency & Contract System",
    icon: "💰",
    items: [
      "Realistic contract negotiation UI (years, salary, guarantees, incentives)",
      "Free agency bidding war simulation (CPU teams compete)",
    ],
  },
  {
    title: "Off-Season Calendar & Progression",
    icon: "📅",
    items: [
      "Owner goals + fan approval meter (0-100) with consequences",
      "Multi-year historical stats tracker + dynasty records",
    ],
  },
  {
    title: "AI Opponent & League Depth",
    icon: "🤖",
    items: [
      "GM AI that reacts to league trends (cap space, scheme meta)",
      "Scheme-specific CPU team building for every franchise",
      "Dynamic rivalry events + story-driven news items",
    ],
  },
  {
    title: "UI/UX & Visual Polish",
    icon: "🎨",
    items: [
      "Consistent dark theme across all screens",
      "Mobile-responsive navigation bar + bottom tab bar",
      "Team logos + player headshots (SVG placeholders)",
      "Quick-action modals (no full page reloads for common tasks)",
      "Animated SVG field improvements in LiveGame.jsx and GameSimulation.jsx",
    ],
  },
  {
    title: "Onboarding, Tutorial & Persistence",
    icon: "🧭",
    items: [
      "Multiple save slots with rename/delete + JSON export/import",
      "New-career checklist full integration",
    ],
  },
  {
    title: "Simulation & Performance",
    icon: "⚙️",
    items: [
      "Coaching staff hiring screen (scheme fit bonuses)",
      "Facility/stadium upgrades tied to fan approval",
      "Further batch-size tuning for older mobile devices",
    ],
  },
];

function CompletionBadge({ done, total }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const color = pct >= 70 ? "#34C759" : pct >= 40 ? "#FFD60A" : "#FF9F0A";

  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Version 2 progress</div>
      <div style={{
        height: 8,
        borderRadius: 999,
        background: "var(--surface-strong, #1A1A2E)",
        overflow: "hidden",
      }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width .25s ease" }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color }}>
        {done}/{total} complete ({pct}%)
      </div>
    </div>
  );
}

export default function V2Roadmap({ onNavigate }) {
  const total = useMemo(() => ROADMAP_SECTIONS.reduce((sum, s) => sum + s.items.length, 0), []);

  // Reflects the "Completed in Latest PR" list supplied in the v2 handoff.
  const completedCount = 6;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", paddingBottom: 80 }}>
      <div className="stat-box" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Version 2 Roadmap</h2>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
              Non-breaking rollout tracker for remaining V2 items. Existing save compatibility remains intact.
            </p>
          </div>
          <CompletionBadge done={completedCount} total={total} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        {ROADMAP_SECTIONS.map((section) => (
          <div key={section.title} className="stat-box" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{section.icon}</span>
              <h3 style={{ margin: 0, fontSize: 14 }}>{section.title}</h3>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
              {section.items.map((item) => (
                <li key={item} style={{ marginBottom: 4 }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="stat-box" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, letterSpacing: ".04em", textTransform: "uppercase" }}>
          Quick Actions
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="btn" onClick={() => onNavigate?.("Offseason")}>Open Offseason Hub</button>
          <button className="btn" onClick={() => onNavigate?.("Mock Draft")}>Open Mock Draft</button>
          <button className="btn" onClick={() => onNavigate?.("Training")}>Open Training</button>
          <button className="btn" onClick={() => onNavigate?.("Saves")}>Open Save Center</button>
        </div>
      </div>
    </div>
  );
}
