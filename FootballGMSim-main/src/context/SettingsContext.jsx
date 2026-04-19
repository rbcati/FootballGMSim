import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "footballgm_settings";

const SettingsContext = createContext({
  settings: { soundEnabled: true, theme: "system", contrastMode: "standard" },
  soundEnabled: true,
  theme: "system",
  contrastMode: "standard",
  toggleSound: () => {},
  setTheme: () => {},
  updateSetting: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ soundEnabled: true, theme: "system", contrastMode: "standard" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSettings((prev) => ({
        ...prev,
        soundEnabled: typeof parsed?.soundEnabled === "boolean" ? parsed.soundEnabled : prev.soundEnabled,
        theme: typeof parsed?.theme === "string" ? parsed.theme : prev.theme,
        contrastMode: parsed?.contrastMode === "high" ? "high" : "standard",
      }));
    } catch {
      setSettings({ soundEnabled: true, theme: "system", contrastMode: "standard" });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo(() => ({
    settings,
    soundEnabled: settings.soundEnabled,
    theme: settings.theme,
    contrastMode: settings.contrastMode,
    toggleSound: () => setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled })),
    setTheme: (theme) => setSettings((prev) => ({ ...prev, theme })),
    updateSetting: (key, val) => setSettings((prev) => ({ ...prev, [key]: val })),
  }), [settings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
