import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "footballgm_settings";

const SettingsContext = createContext({
  soundEnabled: true,
  theme: "system",
  toggleSound: () => {},
  setTheme: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ soundEnabled: true, theme: "system" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSettings((prev) => ({
        ...prev,
        soundEnabled: typeof parsed?.soundEnabled === "boolean" ? parsed.soundEnabled : prev.soundEnabled,
        theme: typeof parsed?.theme === "string" ? parsed.theme : prev.theme,
      }));
    } catch {
      setSettings({ soundEnabled: true, theme: "system" });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo(() => ({
    soundEnabled: settings.soundEnabled,
    theme: settings.theme,
    toggleSound: () => setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled })),
    setTheme: (theme) => setSettings((prev) => ({ ...prev, theme })),
  }), [settings.soundEnabled, settings.theme]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
