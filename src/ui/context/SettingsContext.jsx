import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

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

  // Stable identity + no-op bailout: consumers call updateSetting from mount
  // effects (e.g. ThemeToggle), so an unstable reference or an always-new
  // settings object re-triggers those effects forever ("Maximum update depth").
  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const value = useMemo(() => ({ settings, updateSetting }), [settings, updateSetting]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
