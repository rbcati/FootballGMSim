/**
 * GlossaryPopover.jsx — Rules & Terms Glossary
 *
 * A floating "?" button fixed to the bottom-left corner of the screen.
 * Clicking it opens a searchable glossary of football GM terms.
 * Persists open/close state in localStorage so power users can keep it closed.
 */

import React, { useState, useMemo, useRef, useEffect } from "react";

// ── Glossary data ─────────────────────────────────────────────────────────────

const TERMS = [
  // ── Player ratings ────────────────────────────────────────────────────────
  { term: "OVR", category: "Ratings", def: "Overall Rating (1–99). A weighted composite of a player's key attributes for their position. Higher is better." },
  { term: "POT", category: "Ratings", def: "Potential. The ceiling OVR a player may reach with development. Hidden dev-trait players reveal their true ceiling over time." },
  { term: "Scheme Fit %", category: "Ratings", def: "How well a player's attributes align with the team's current offensive/defensive scheme. Green ≥70%, yellow 50–69%, red <50%." },
  { term: "Avg Fit", category: "Ratings", def: "The average scheme fit % across all rostered players. A higher team average means your scheme complements your roster well." },
  { term: "Development Trait", category: "Ratings", def: "Hidden trait (Normal, Star, Superstar, X-Factor) that governs how fast a player progresses each offseason." },

  // ── Salary cap ────────────────────────────────────────────────────────────
  { term: "Salary Cap", category: "Cap", def: "The hard annual limit ($301.2M) on total player salaries. Exceeding it blocks week advances until you cut players or restructure contracts." },
  { term: "Cap Room", category: "Cap", def: "Salary Cap minus current Cap Hit. The money you have available to sign free agents or extend contracts." },
  { term: "Cap Hit", category: "Cap", def: "The amount a player's contract counts against the cap this season. Includes base salary plus prorated signing bonus." },
  { term: "Dead Cap", category: "Cap", def: "Accelerated cap charges owed to released players. When you cut someone with a signing bonus, the unamortised portion hits immediately." },
  { term: "Restructure", category: "Cap", def: "Converts up to 50% of base salary into a prorated signing bonus, reducing the current-year cap hit at the cost of dead cap in future years." },
  { term: "Franchise Tag", category: "Cap", def: "Keeps a pending free agent for one more year at the position's average top-5 salary. Non-exclusive — other teams can still offer a sheet." },
  { term: "Guaranteed Money", category: "Cap", def: "The portion of a contract that must be paid regardless of cuts or injury. Shown as a % of total value." },

  // ── Schemes ───────────────────────────────────────────────────────────────
  { term: "West Coast Offense", category: "Schemes", def: "Short-to-intermediate passing scheme. Rewards high ACC, ROU (route running), and CTCH. Accurate QBs and savvy receivers thrive." },
  { term: "Vertical / Air Raid", category: "Schemes", def: "Deep-ball-first passing system. Rewards ARM strength, SPD at WR, and athletic TEs. Big play ceiling, higher INT risk." },
  { term: "Smashmouth", category: "Schemes", def: "Run-first power offense. Rewards STR at RB/OL and OVR dominance up front. Grinding, clock-control style." },
  { term: "4-3 Cover 2", category: "Schemes", def: "Base 4-3 front with two deep safeties. Rewards SPD at DE/LB and zone awareness. Strong against the pass, can be run on." },
  { term: "3-4 Blitz", category: "Schemes", def: "3-down-lineman scheme that relies on unpredictable LB pressure. Rewards versatile LBs with high PASS RUSH and coverage ratings." },
  { term: "Man Coverage", category: "Schemes", def: "Press-man secondary focused on CBs winning 1-on-1. Rewards high MAN COV, SPD, and PRESS at corner. High risk / high reward." },

  // ── Draft ─────────────────────────────────────────────────────────────────
  { term: "Draft Value Chart", category: "Draft", def: "A point system (1st pick = 3,000 pts, 32nd = 590 pts, etc.) used to evaluate pick trades. Trade-up calculator uses these values." },
  { term: "Combine", category: "Draft", def: "Pre-draft workouts that reveal a prospect's athletic measurables. Scouting reports show combine results before the draft begins." },
  { term: "Big Board", category: "Draft", def: "Your ranked list of draft prospects sorted by projected value. Sortable by position, OVR, or fit with your scheme." },
  { term: "7-Round Draft", category: "Draft", def: "The full NFL-style 7-round draft. Each of the 32 teams picks once per round; compensatory picks can add extra selections." },
  { term: "Rookie Contract", category: "Draft", def: "All drafted players sign 4-year rookie deals at slot value — 10% cheaper than veteran equivalents." },

  // ── Free Agency ───────────────────────────────────────────────────────────
  { term: "Free Agency Window", category: "Free Agency", def: "The period after the draft when unsigned players negotiate with any team. CPU teams bid simultaneously — be decisive." },
  { term: "Bidding War", category: "Free Agency", def: "When multiple CPU teams want the same player, salaries are driven up automatically. You can outbid them or let the player walk." },
  { term: "Contract Incentives", category: "Free Agency", def: "Performance bonuses added to a contract. 'Likely to be earned' incentives count against the cap; 'unlikely' ones are offset." },
  { term: "Release / Cut", category: "Free Agency", def: "Releasing a player before their contract ends. Any remaining prorated signing bonus accelerates as dead cap immediately." },

  // ── Simulation ────────────────────────────────────────────────────────────
  { term: "Game Simulation", category: "Simulation", def: "Each week one game per team is simulated using player OVR, scheme fit, injury modifiers, and momentum. Results are deterministic from the save state." },
  { term: "Momentum", category: "Simulation", def: "An in-game swing meter (-100 to +100). A team riding momentum gets small temporary boosts to play success rates." },
  { term: "Sim to Playoffs", category: "Simulation", def: "Fast-forwards through all remaining regular-season weeks in one batch, then stops at the playoff bracket." },
  { term: "Sim to Offseason", category: "Simulation", def: "Simulates the full season including playoffs in a single batch operation. Your team will play (and lose) games automatically." },
  { term: "Watch Game", category: "Simulation", def: "Launches the premium live game viewer with animated plays, momentum meter, and play-call panel for your team's matchup." },

  // ── League operations ─────────────────────────────────────────────────────
  { term: "Depth Chart", category: "Roster", def: "The ordered lineup at every position. Drag-and-drop to set starters. Auto-sort orders by OVR + scheme bonus." },
  { term: "Preseason", category: "Phases", def: "Pre-season camp phase. Your roster can hold up to 90 players; you must cut to 53 before the regular season begins." },
  { term: "Offseason Re-Signing", category: "Phases", def: "The first offseason phase. Extend contracts with your own free agents before the open market begins." },
  { term: "Owner Approval", category: "Management", def: "A 0–100 score reflecting how satisfied the owner is. Driven by win %, cap health, and playoff success. Drops below 40 triggers a warning." },
  { term: "Fan Approval", category: "Management", def: "A 0–100 score reflecting fan engagement. Primarily driven by win percentage and recent momentum. Affects stadium upgrade costs." },
  { term: "Power Rankings", category: "Management", def: "League-wide team rankings by win % + OVR. Trend arrows (▲▼) show week-over-week movement." },

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  { term: "Space / Enter", category: "Shortcuts", def: "Advance the week (same as clicking the Advance button). Works when no input field is focused." },
  { term: "S", category: "Shortcuts", def: "Force an immediate manual save to IndexedDB." },
  { term: "?", category: "Shortcuts", def: "Toggle the changelog / update notes popup." },
];

const CATEGORIES = [...new Set(TERMS.map(t => t.category))];

const categoryColor = (cat) => {
  const map = {
    Ratings: "#0A84FF", Cap: "#FF9F0A", Schemes: "#34C759",
    Draft: "#BF5AF2", "Free Agency": "#FF453A", Simulation: "#5E5CE6",
    Roster: "#64D2FF", Phases: "#FFD60A", Management: "#30D158",
    Shortcuts: "#AEC6CF",
  };
  return map[cat] ?? "var(--text-muted)";
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function GlossaryPopover() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TERMS.filter(t => {
      if (activeCat !== "All" && t.category !== activeCat) return false;
      if (!q) return true;
      return t.term.toLowerCase().includes(q) || t.def.toLowerCase().includes(q);
    });
  }, [query, activeCat]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Rules & Glossary (? key)"
        aria-label="Open rules glossary"
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
          right: 12,
          zIndex: 3000,
          width: 34, height: 34,
          borderRadius: "50%",
          background: open ? "var(--accent)" : "color-mix(in srgb, var(--surface-strong) 88%, transparent)",
          border: "1.5px solid var(--hairline)",
          color: open ? "#fff" : "var(--text-muted)",
          fontSize: "0.82rem",
          fontWeight: 900,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0,0,0,0.32)",
          transition: "background 0.15s, color 0.15s, transform 0.15s",
          opacity: open ? 1 : 0.92,
        }}
      >
        ?
      </button>

      {/* Popover panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 130px)",
            right: 12,
            zIndex: 3001,
            width: "min(360px, calc(100vw - 24px))",
            maxHeight: "60vh",
            background: "var(--surface-strong, #1a1a2e)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-xl, 16px)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "12px 14px 8px",
            borderBottom: "1px solid var(--hairline)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: "1rem" }}>📖</span>
            <span style={{ fontWeight: 900, fontSize: "0.9rem", flex: 1 }}>Rules Glossary</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
              aria-label="Close glossary"
            >
              ×
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--hairline)" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search terms…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "var(--bg)", border: "1px solid var(--hairline)",
                borderRadius: 8, padding: "6px 10px",
                color: "var(--text)", fontSize: "0.8rem",
                outline: "none",
              }}
            />
          </div>

          {/* Category filter pills */}
          <div style={{
            display: "flex", gap: 6, padding: "6px 14px",
            overflowX: "auto", flexShrink: 0,
            scrollbarWidth: "none",
            borderBottom: "1px solid var(--hairline)",
          }}>
            {["All", ...CATEGORIES].map(cat => {
              const active = activeCat === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCat(cat)}
                  style={{
                    padding: "3px 10px", borderRadius: 12, border: "none",
                    background: active ? categoryColor(cat) : "var(--surface)",
                    color: active ? "#fff" : "var(--text-muted)",
                    fontWeight: active ? 700 : 500, fontSize: "0.65rem",
                    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    opacity: active ? 1 : 0.8,
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Terms list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "20px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                No terms match "{query}"
              </div>
            ) : filtered.map(t => (
              <div key={t.term} style={{
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--text)" }}>{t.term}</span>
                  <span style={{
                    fontSize: "0.6rem", fontWeight: 700,
                    background: `${categoryColor(t.category)}22`,
                    color: categoryColor(t.category),
                    padding: "1px 6px", borderRadius: 8,
                  }}>{t.category}</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.73rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {t.def}
                </p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px",
            borderTop: "1px solid var(--hairline)",
            fontSize: "0.62rem", color: "var(--text-subtle)", textAlign: "center",
          }}>
            {filtered.length} term{filtered.length !== 1 ? "s" : ""} · Press <kbd style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 3, padding: "0 4px" }}>Esc</kbd> to close
          </div>
        </div>
      )}
    </>
  );
}
