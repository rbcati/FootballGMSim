import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'fgmsim_settings_v1';

const defaultSettings = {
  soundEnabled: true,
  theme: 'system',
  // future: animationsEnabled, etc.
};

const SettingsContext = createContext({
  settings: defaultSettings,
  updateSetting: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // best-effort persistence
    }
  }, [settings]);

  const updateSetting = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  const value = useMemo(() => ({ settings, updateSetting }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
