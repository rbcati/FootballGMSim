import React, { useState, useEffect, useCallback } from "react";
import { useSettings } from "../context/SettingsContext.jsx";

/**
 * ThemeToggle — Dark/Light/System theme switcher
 *
 * Stores preference in localStorage as "theme" key.
 * Applies .force-dark or body.theme-light class to work
 * with the existing CSS custom properties system.
 */

const THEMES = {
  system: { label: "System", icon: SunMoonIcon },
  dark: { label: "Dark", icon: MoonIcon },
  light: { label: "Light", icon: SunIcon },
};

export default function ThemeToggle({ compact = false }) {
  const { settings, updateSetting } = useSettings();
  const savedTheme = settings?.theme ?? "system";
  const [theme, setTheme] = useState(() => {
    return savedTheme || "system";
  });

  useEffect(() => {
    setTheme(savedTheme || "system");
  }, [savedTheme]);

  const applyTheme = useCallback((t) => {
    const root = document.documentElement;
    const body = document.body;

    // Clear all theme classes
    root.classList.remove("force-dark");
    body.classList.remove("theme-light");

    if (t === "dark") {
      root.classList.add("force-dark");
    } else if (t === "light") {
      body.classList.add("theme-light");
    }
    // "system" — let @media (prefers-color-scheme) handle it
  }, []);

  useEffect(() => {
    applyTheme(theme);
    updateSetting?.("theme", theme);
  }, [theme, applyTheme, updateSetting]);

  const cycle = useCallback(() => {
    setTheme(prev => {
      if (prev === "system") return "dark";
      if (prev === "dark") return "light";
      return "system";
    });
  }, []);

  const IconComponent = THEMES[theme]?.icon || SunMoonIcon;

  if (compact) {
    return (
      <button
        className="theme-toggle"
        onClick={cycle}
        title={`Theme: ${THEMES[theme]?.label || "System"}`}
        aria-label={`Switch theme. Currently: ${THEMES[theme]?.label}`}
      >
        <IconComponent size={18} />
      </button>
    );
  }

  return (
    <div style={{
      display: "flex", gap: 2,
      background: "var(--surface)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--hairline)",
      padding: 2,
    }}>
      {Object.entries(THEMES).map(([key, { label, icon: Icon }]) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          title={label}
          aria-label={`${label} theme`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32,
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: theme === key ? "var(--accent)" : "transparent",
            color: theme === key ? "#fff" : "var(--text-muted)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}

function SunIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function SunMoonIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
