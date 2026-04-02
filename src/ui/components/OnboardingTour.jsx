/**
 * OnboardingTour.jsx — First-Season Guided Flow
 *
 * Shows 5 sequential tooltip-style tips on a new user's very first season.
 * Dismissed permanently after the user clicks through all steps, or after
 * Week 3 of their first season (whichever comes first).
 *
 * Storage key: gmsim_onboarding_done — set to "1" when complete.
 * No worker calls needed — purely cosmetic/educational.
 */

import React, { useState, useEffect } from "react";

// ── Tour steps ────────────────────────────────────────────────────────────────

const STEPS = [
  {
    emoji: "👋",
    title: "Welcome to Football GM!",
    body: "You're now the General Manager of an NFL franchise. Your job: build a championship roster, manage the salary cap, and out-smart 31 rival GMs.",
    cta: "Let's go →",
  },
  {
    emoji: "📅",
    title: "Advance Week to Simulate",
    body: 'Click the blue "▶ Sim Week" button at the top right to simulate each game week. You\'ll see live scores, injuries, and stat leaders update automatically.',
    cta: "Got it →",
  },
  {
    emoji: "🏋️",
    title: "Check Your Roster & Depth Chart",
    body: 'Visit the "Roster Hub" tab to see your players\' OVR ratings and scheme fit scores. Drag players in "Depth Chart" to set your starters before each game.',
    cta: "Nice →",
  },
  {
    emoji: "💰",
    title: "Manage the Salary Cap",
    body: 'Your hard cap is $301.2M. Watch for players nearing the end of their contracts — use "Re-Sign" in Free Agency before they hit the open market.',
    cta: "Understood →",
  },
  {
    emoji: "🏆",
    title: "Make the Playoffs!",
    body: 'The top 7 teams from each conference qualify. Win your division for a guaranteed bye. Use "Sim to Playoffs" when you want to fast-forward the season.',
    cta: "Let\'s win! 🏈",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingTour({ league }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show for brand-new careers (year 1 + first 2 weeks)
    try {
      const done = localStorage.getItem("gmsim_onboarding_done");
      if (done) return;
      if (!league) return;
      const isNewCareer = (league.year === 2025 || league.year === 1) && (league.week ?? 1) <= 2 && league.phase === "regular";
      if (isNewCareer) setVisible(true);
    } catch { /* non-fatal */ }
  }, [league?.seasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss after Week 3
  useEffect(() => {
    if (!league) return;
    if ((league.week ?? 0) >= 3) {
      dismiss();
    }
  }, [league?.week]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem("gmsim_onboarding_done", "1"); } catch { /* non-fatal */ }
  };

  const next = () => {
    if (step >= STEPS.length - 1) {
      dismiss();
    } else {
      setStep(s => s + 1);
    }
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: "fixed", inset: 0, zIndex: 4000,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(3px)",
        }}
      />

      {/* Tooltip card */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 4001,
          width: "min(400px, calc(100vw - 32px))",
          background: "var(--surface-strong, #1a1a2e)",
          border: "1.5px solid var(--accent)",
          borderRadius: "var(--radius-xl, 18px)",
          padding: "22px 20px 18px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(10,132,255,0.3)",
        }}
      >
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, marginBottom: 16, justifyContent: "center" }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step ? "var(--accent)" : i < step ? "rgba(10,132,255,0.4)" : "var(--hairline)",
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>{current.emoji}</div>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
            {current.title}
          </h3>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
            {current.body}
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={dismiss}
            style={{
              flex: 1,
              padding: "9px 0",
              background: "transparent",
              border: "1px solid var(--hairline)",
              borderRadius: 10,
              color: "var(--text-muted)",
              fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            Skip tour
          </button>
          <button
            onClick={next}
            style={{
              flex: 2,
              padding: "9px 0",
              background: "var(--accent)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontWeight: 800,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            {current.cta}
          </button>
        </div>

        {/* Step counter */}
        <div style={{ textAlign: "center", marginTop: 10, fontSize: "0.6rem", color: "var(--text-subtle)" }}>
          Tip {step + 1} of {STEPS.length}
        </div>
      </div>
    </>
  );
}
