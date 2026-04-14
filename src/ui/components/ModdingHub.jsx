import React, { useMemo, useRef, useState } from 'react';
import { DEFAULT_LEAGUE_SETTINGS } from '../../core/leagueSettings.js';

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DRAFT_ORDER_OPTIONS = [
  { value: 'reverse_standings', label: 'Reverse standings' },
  { value: 'lottery', label: 'Lottery' },
  { value: 'random', label: 'Random' },
];

export default function ModdingHub({ league, actions }) {
  const fileRef = useRef(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const settings = useMemo(() => ({ ...DEFAULT_LEAGUE_SETTINGS, ...(league?.settings ?? {}) }), [league?.settings]);

  const clear = () => { setMessage(''); setError(''); };

  const onExportLeagueFile = async () => {
    clear();
    try {
      const resp = await actions?.exportLeagueFile?.();
      const data = resp?.payload?.data;
      if (!data) throw new Error('No data returned from worker');
      downloadJson(data, `footballgm_league_${league?.year ?? 'season'}.json`);
      setMessage('League file exported.');
    } catch (e) {
      setError(`Export failed: ${e.message}`);
    }
  };

  const onImportFile = async (file) => {
    clear();
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data?.players)) {
        await actions?.importCustomRoster?.(data);
        setMessage('Roster imported successfully.');
      } else if (Array.isArray(data?.prospects)) {
        await actions?.importDraftClass?.(data);
        setMessage('Draft class imported successfully.');
      } else if (data?.snapshot) {
        await actions?.importLeagueFile?.(data, `Imported ${new Date().toLocaleDateString()}`);
        setMessage('League file imported. Reloading...');
        setTimeout(() => window.location.reload(), 700);
      } else {
        throw new Error('Unsupported JSON. Use league file, roster, or draft class schema.');
      }
    } catch (e) {
      setError(`Import failed: ${e.message}`);
    }
  };

  const updateRule = (key, value) => {
    clear();
    actions?.updateSettings?.({ [key]: value });
    setMessage('Rule update sent to worker.');
  };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
      <h2>Modding & Customisation Hub</h2>
      {message ? <div className="card" style={{ color: 'var(--success)' }}>{message}</div> : null}
      {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}

      <div className="card" style={{ padding: 12 }}>
        <h3>Import / Export</h3>
        <p style={{ fontSize: 12 }}>Supports full league files, custom rosters, and draft classes. Validation runs in the worker.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onExportLeagueFile} title="Download full league JSON package">Export League File</button>
          <button className="btn" onClick={() => fileRef.current?.click()} title="Import validated community JSON">Import JSON</button>
          <a className="btn" href="/docs/modding.md" target="_blank" rel="noreferrer" title="Open schema docs">Schema Docs</a>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onImportFile(e.target.files[0])} />
      </div>

      <div className="card" style={{ padding: 12 }}>
        <h3>League Rule Tweaks</h3>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <label>Overtime format
            <select value={settings.overtimeFormat} onChange={(e) => updateRule('overtimeFormat', e.target.value)}>
              <option value="nfl">NFL</option>
              <option value="college">College</option>
            </select>
          </label>
          <label>Playoff teams
            <input type="number" min={2} max={32} value={settings.playoffTeams} onChange={(e) => updateRule('playoffTeams', Number(e.target.value))} />
          </label>
          <label>Draft order
            <select value={settings.draftOrderLogic} onChange={(e) => updateRule('draftOrderLogic', e.target.value)}>
              {DRAFT_ORDER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          <label>Injury frequency
            <input type="range" min={0} max={100} value={settings.injuryFrequency} onChange={(e) => updateRule('injuryFrequency', Number(e.target.value))} />
          </label>
          <label>Suspension frequency
            <input type="range" min={0} max={100} value={settings.suspensionFrequency ?? 50} onChange={(e) => updateRule('suspensionFrequency', Number(e.target.value))} />
          </label>
          <label>Universe
            <select value={settings.leagueUniverse ?? 'fictional'} onChange={(e) => updateRule('leagueUniverse', e.target.value)}>
              <option value="fictional">Fictional</option>
              <option value="historical">Historical</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
