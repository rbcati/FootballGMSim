/**
 * SoundToggle.jsx — Placeholder sound toggle for future SFX support.
 * Stores preference in localStorage. Exposes window.__soundEnabled for
 * future integration with Web Audio API or Howler.js.
 */

import React, { useState, useEffect } from "react";

export default function SoundToggle({ compact = false }) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem("fgm_sound") !== "off"; }
    catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem("fgm_sound", enabled ? "on" : "off"); }
    catch { /* noop */ }
    window.__soundEnabled = enabled;
  }, [enabled]);

  return (
    <button
      onClick={() => setEnabled(e => !e)}
      title={enabled ? "Sound: ON (click to mute)" : "Sound: OFF (click to enable)"}
      aria-label={enabled ? "Mute sounds" : "Enable sounds"}
      style={{
        background: "none",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-md)",
        width: compact ? 32 : 40,
        height: compact ? 32 : 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: enabled ? "var(--text)" : "var(--text-muted)",
        fontSize: compact ? 14 : 16,
        transition: "all 0.15s ease",
        opacity: enabled ? 1 : 0.5,
      }}
    >
      {enabled ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
    </button>
  );
}

/**
 * Placeholder: play a sound effect.
 * Currently a no-op — wire to Web Audio API or Howler.js later.
 * Usage: playSound("draft_pick") or playSound("touchdown")
 */
export function playSound(soundId) {
  if (!window.__soundEnabled) return;
  // Future: load and play audio files
  // const sounds = { draft_pick: '/sfx/draft.mp3', touchdown: '/sfx/td.mp3', ... };
  // new Audio(sounds[soundId])?.play().catch(() => {});
}
