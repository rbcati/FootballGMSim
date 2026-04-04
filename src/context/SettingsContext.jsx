import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "footballgm_settings";

const SettingsContext = createContext({
  soundEnabled: true,
  toggleSound: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ soundEnabled: true });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.soundEnabled === "boolean") {
        setSettings({ soundEnabled: parsed.soundEnabled });
      }
    } catch {
      setSettings({ soundEnabled: true });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo(() => ({
    soundEnabled: settings.soundEnabled,
    toggleSound: () => setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled })),
  }), [settings.soundEnabled]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
