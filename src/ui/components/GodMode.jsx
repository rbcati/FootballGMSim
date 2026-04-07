/**
 * GodMode.jsx — In-game God Mode editor for league rules and settings.
 *
 * Provides collapsible sections for editing league rules, players, teams,
 * draft settings, simulation tuning, and financials. Only accessible when
 * league.godMode === true; otherwise shows a locked gate screen.
 *
 * Props:
 *  - league: league view-model
 *  - actions: worker action dispatchers (applyGodMode, toggleGodMode, etc.)
 */

import React, { useState, useMemo, useCallback } from "react";
import { DEFAULT_LEAGUE_SETTINGS, normalizeLeagueSettings } from "../../core/leagueSettings.js";

// ── Constants ────────────────────────────────────────────────────────────────

const SECTION_ICONS = {
  leagueRules: "📜",
  playerEditor: "🏃",
  teamEditor: "🏟️",
  draftSettings: "🎯",
  simSettings: "⚙️",
  financialSettings: "💰",
};

const DEFAULT_SETTINGS = DEFAULT_LEAGUE_SETTINGS;

// ── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline)",
      borderRadius: 10, marginBottom: 12, overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "14px 16px", border: "none", background: "none",
          cursor: "pointer", color: "var(--text)", fontSize: 15, fontWeight: 700,
          borderBottom: open ? "1px solid var(--hairline)" : "none",
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1, textAlign: "left" }}>{title}</span>
        <span style={{
          fontSize: 12, transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          color: "var(--text-muted)",
        }}>▼</span>
      </button>
      {open && (
        <div className="fade-in" style={{ padding: 16 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Setting Controls ─────────────────────────────────────────────────────────

function SettingRow({ label, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, padding: "8px 0",
      borderBottom: "1px solid var(--hairline)",
      flexWrap: "wrap",
    }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", minWidth: 140 }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function SliderInput({ value, onChange, min = 0, max = 100, step = 1, suffix = "" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 120, accentColor: "var(--accent)" }}
      />
      <span style={{
        fontSize: 13, fontWeight: 700, color: "var(--accent)",
        minWidth: 40, textAlign: "right",
      }}>
        {value}{suffix}
      </span>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, prefix = "", suffix = "" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {prefix && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{prefix}</span>}
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: 80, padding: "4px 8px", borderRadius: 6, fontSize: 13,
          border: "1px solid var(--hairline)", background: "var(--bg)",
          color: "var(--text)", fontWeight: 600, textAlign: "right",
        }}
      />
      {suffix && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{suffix}</span>}
    </div>
  );
}

function ToggleSwitch({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none",
        background: value ? "var(--success)" : "var(--hairline)",
        cursor: "pointer", position: "relative", transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 3,
        left: value ? 23 : 3,
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

// ── Player Search & Editor ───────────────────────────────────────────────────

function PlayerEditor({ league, changes, setChanges }) {
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const allPlayers = useMemo(() => {
    const players = [];
    for (const team of (league.teams || [])) {
      for (const p of (team.roster || team.players || [])) {
        players.push({ ...p, teamAbbr: team.abbr || team.name?.slice(0, 3) || "???" });
      }
    }
    if (league.roster) {
      const ids = new Set(players.map(p => p.id ?? p.pid));
      for (const p of league.roster) {
        if (!ids.has(p.id ?? p.pid)) players.push(p);
      }
    }
    return players;
  }, [league]);

  const filtered = useMemo(() => {
    if (!search || search.length < 2) return [];
    const q = search.toLowerCase();
    return allPlayers.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 12);
  }, [search, allPlayers]);

  const updatePlayer = (key, val) => {
    if (!selectedPlayer) return;
    const pid = selectedPlayer.id ?? selectedPlayer.pid;
    const updated = { ...selectedPlayer, [key]: val };
    setSelectedPlayer(updated);
    setChanges(prev => ({
      ...prev,
      [`player.${pid}.${key}`]: { playerId: pid, field: key, value: val, playerName: selectedPlayer.name },
    }));
  };

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text" placeholder="Search players by name..."
          value={search} onChange={e => { setSearch(e.target.value); setSelectedPlayer(null); }}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
            border: "1px solid var(--hairline)", background: "var(--bg)",
            color: "var(--text)",
          }}
        />
      </div>

      {/* Search results */}
      {filtered.length > 0 && !selectedPlayer && (
        <div style={{
          border: "1px solid var(--hairline)", borderRadius: 8,
          maxHeight: 200, overflowY: "auto", marginBottom: 12,
        }}>
          {filtered.map(p => (
            <div
              key={p.id ?? p.pid ?? p.name}
              onClick={() => { setSelectedPlayer(p); setSearch(p.name || ""); }}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 13,
                borderBottom: "1px solid var(--hairline)",
                display: "flex", alignItems: "center", gap: 8,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {p.pos || p.position} · OVR {p.ovr ?? "?"} · {p.teamAbbr || "FA"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Player edit form */}
      {selectedPlayer && (
        <div className="fade-in" style={{
          background: "var(--bg)", border: "1px solid var(--hairline)",
          borderRadius: 8, padding: 14,
        }}>
          <div style={{
            fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 12,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            Editing: {selectedPlayer.name}
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              ({selectedPlayer.pos || selectedPlayer.position})
            </span>
          </div>

          <SettingRow label="Overall (OVR)">
            <SliderInput value={selectedPlayer.ovr ?? 50} onChange={v => updatePlayer("ovr", v)}
              min={30} max={99} />
          </SettingRow>
          <SettingRow label="Potential">
            <SliderInput value={selectedPlayer.potential ?? selectedPlayer.pot ?? 50}
              onChange={v => updatePlayer("potential", v)} min={30} max={99} />
          </SettingRow>
          <SettingRow label="Age">
            <NumberInput value={selectedPlayer.age ?? 25} onChange={v => updatePlayer("age", v)}
              min={18} max={45} />
          </SettingRow>
          <SettingRow label="Contract ($/yr)">
            <NumberInput value={selectedPlayer.salary ?? selectedPlayer.contract?.amount ?? 1}
              onChange={v => updatePlayer("salary", v)} prefix="$" suffix="M" min={0.5} max={60} step={0.5} />
          </SettingRow>
          <SettingRow label="Speed">
            <SliderInput value={selectedPlayer.ratings?.speed ?? selectedPlayer.speed ?? 50}
              onChange={v => updatePlayer("speed", v)} min={20} max={99} />
          </SettingRow>
          <SettingRow label="Strength">
            <SliderInput value={selectedPlayer.ratings?.strength ?? selectedPlayer.strength ?? 50}
              onChange={v => updatePlayer("strength", v)} min={20} max={99} />
          </SettingRow>
        </div>
      )}
    </div>
  );
}

// ── Team Editor ──────────────────────────────────────────────────────────────

function TeamEditor({ league, changes, setChanges }) {
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const teams = league.teams || [];

  const team = useMemo(
    () => teams.find(t => String(t.id ?? t.tid) === String(selectedTeamId)),
    [teams, selectedTeamId],
  );

  const updateTeam = (key, val) => {
    if (!team) return;
    const tid = team.id ?? team.tid;
    setChanges(prev => ({
      ...prev,
      [`team.${tid}.${key}`]: { teamId: tid, field: key, value: val, teamName: team.name || team.abbr },
    }));
  };

  return (
    <div>
      <select
        value={selectedTeamId}
        onChange={e => setSelectedTeamId(e.target.value)}
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--hairline)", background: "var(--bg)",
          color: "var(--text)", marginBottom: 12,
        }}
      >
        <option value="">Select a team...</option>
        {teams.map(t => (
          <option key={t.id ?? t.tid} value={t.id ?? t.tid}>
            {t.name || t.abbr} ({t.wins ?? 0}-{t.losses ?? 0})
          </option>
        ))}
      </select>

      {team && (
        <div className="fade-in" style={{
          background: "var(--bg)", border: "1px solid var(--hairline)",
          borderRadius: 8, padding: 14,
        }}>
          <SettingRow label="Wins">
            <NumberInput value={team.wins ?? 0} onChange={v => updateTeam("wins", v)}
              min={0} max={20} />
          </SettingRow>
          <SettingRow label="Losses">
            <NumberInput value={team.losses ?? 0} onChange={v => updateTeam("losses", v)}
              min={0} max={20} />
          </SettingRow>
          <SettingRow label="Cap Space">
            <NumberInput value={team.capSpace ?? team.cap ?? 50}
              onChange={v => updateTeam("capSpace", v)}
              prefix="$" suffix="M" min={-50} max={300} step={0.5} />
          </SettingRow>
          <SettingRow label="Draft Picks">
            <NumberInput value={team.draftPicks?.length ?? team.numDraftPicks ?? 7}
              onChange={v => updateTeam("numDraftPicks", v)} min={0} max={20} />
          </SettingRow>
        </div>
      )}
    </div>
  );
}

// ── Changes Log ──────────────────────────────────────────────────────────────

function ChangesLog({ changes }) {
  const entries = Object.values(changes);
  if (entries.length === 0) return null;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline)",
      borderRadius: 10, padding: 14, marginBottom: 12,
    }}>
      <h3 style={{
        fontSize: 13, fontWeight: 700, color: "var(--text)",
        marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
      }}>
        📝 Pending Changes
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8,
          background: "rgba(234,179,8,0.12)", color: "#eab308",
        }}>
          {entries.length}
        </span>
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
        {entries.map((e, i) => (
          <div key={i} style={{
            fontSize: 12, color: "var(--text-muted)", padding: "4px 0",
            borderBottom: i < entries.length - 1 ? "1px solid var(--hairline)" : "none",
            display: "flex", gap: 6,
          }}>
            <span style={{ color: "var(--warning)" }}>•</span>
            <span>
              {e.playerName && <><strong>{e.playerName}</strong> — </>}
              {e.teamName && <><strong>{e.teamName}</strong> — </>}
              {e.field}: <strong style={{ color: "var(--accent)" }}>{e.value}</strong>
              {e.label && <> ({e.label})</>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Locked Screen ────────────────────────────────────────────────────────────

function LockedScreen({ onEnable }) {
  return (
    <div className="fade-in" style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "60px 24px",
      textAlign: "center", maxWidth: 480, margin: "0 auto",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%", marginBottom: 20,
        background: "var(--surface)", border: "2px solid var(--hairline)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36,
      }}>
        🔒
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
        God Mode Disabled
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 24 }}>
        God Mode allows you to edit league rules, player ratings, team records, and simulation
        settings. Enabling it will mark your save as modified and achievements may be disabled.
      </p>
      <button
        className="btn"
        onClick={onEnable}
        style={{
          padding: "10px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700,
          background: "var(--accent)", color: "#fff", border: "none",
          cursor: "pointer", transition: "opacity 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}
      >
        Enable God Mode
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function GodMode({ league, actions }) {
  const [changes, setChanges] = useState({});

  // ── Local settings state (initialized from league or defaults) ──────────
  const [settings, setSettings] = useState(() => normalizeLeagueSettings(league?.settings ?? {}));

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setChanges(prev => ({ ...prev, [`setting.${key}`]: { field: key, value, label: "league setting" } }));
  }, []);

  const handleApply = useCallback(() => {
    if (actions?.updateSettings) {
      actions.updateSettings(settings);
    }
    const commissionerActions = Object.values(changes)
      .filter(c => c.playerId != null || c.teamId != null)
      .map(c => c.playerId != null
        ? ({ entityType: "player", entityId: c.playerId, field: c.field, value: c.value })
        : ({ entityType: "team", entityId: c.teamId, field: c.field, value: c.value }));
    if (commissionerActions.length > 0 && actions?.applyCommissionerActions) {
      actions.applyCommissionerActions(commissionerActions);
    }
    setChanges({});
  }, [actions, settings, changes]);

  const handleReset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    const resetChanges = {};
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      resetChanges[`setting.${key}`] = { field: key, value: val, label: "reset to default" };
    }
    setChanges(resetChanges);
  }, []);

  const handleEnableGodMode = useCallback(() => {
    if (actions?.toggleCommissionerMode) actions.toggleCommissionerMode(true);
  }, [actions]);

  // ── Locked gate ────────────────────────────────────────────────────────
  if (!league.commissionerMode && !league.godMode) {
    return <LockedScreen onEnable={handleEnableGodMode} />;
  }

  // ── Main editor ────────────────────────────────────────────────────────
  const changeCount = Object.keys(changes).length;

  return (
    <div className="fade-in" style={{ padding: "var(--space-4)", maxWidth: 720, margin: "0 auto" }}>
      {/* Warning Banner */}
      <div style={{
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 10, padding: "12px 16px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--danger)" }}>
            Commissioner Mode Active
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Changes cannot be undone. Achievements may be disabled.
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20, flexWrap: "wrap", gap: 10,
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
          Commissioner Mode
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleReset} style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: "1px solid var(--hairline)", background: "var(--surface)",
            color: "var(--text-muted)", cursor: "pointer",
          }}>
            Reset Defaults
          </button>
          <button className="btn" onClick={handleApply} style={{
            padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 700,
            border: "none", background: changeCount > 0 ? "var(--accent)" : "var(--hairline)",
            color: changeCount > 0 ? "#fff" : "var(--text-muted)",
            cursor: changeCount > 0 ? "pointer" : "default",
            transition: "all 0.15s",
          }}>
            Apply Changes {changeCount > 0 && `(${changeCount})`}
          </button>
        </div>
      </div>

      {/* Changes log */}
      <ChangesLog changes={changes} />

      {/* ── League Rules ──────────────────────────────────────────────── */}
      <Section title="League Rules" icon={SECTION_ICONS.leagueRules} defaultOpen>
        <SettingRow label="Salary Cap">
          <NumberInput value={settings.salaryCap} onChange={v => updateSetting("salaryCap", v)}
            prefix="$" suffix="M" min={50} max={500} step={5} />
        </SettingRow>
        <SettingRow label="Roster Size">
          <NumberInput value={settings.rosterSize} onChange={v => updateSetting("rosterSize", v)}
            min={30} max={75} />
        </SettingRow>
        <SettingRow label="Playoff Teams">
          <NumberInput value={settings.playoffTeams} onChange={v => updateSetting("playoffTeams", v)}
            min={4} max={32} />
        </SettingRow>
        <SettingRow label="Schedule Length">
          <NumberInput value={settings.seasonLength} onChange={v => updateSetting("seasonLength", v)}
            suffix=" games" min={10} max={24} />
        </SettingRow>
      </Section>

      {/* ── Player Editor ─────────────────────────────────────────────── */}
      <Section title="Player Editor" icon={SECTION_ICONS.playerEditor}>
        <PlayerEditor league={league} changes={changes} setChanges={setChanges} />
      </Section>

      {/* ── Team Editor ───────────────────────────────────────────────── */}
      <Section title="Team Editor" icon={SECTION_ICONS.teamEditor}>
        <TeamEditor league={league} changes={changes} setChanges={setChanges} />
      </Section>

      {/* ── Draft Settings ────────────────────────────────────────────── */}
      <Section title="Draft Settings" icon={SECTION_ICONS.draftSettings}>
        <SettingRow label="Draft Rounds">
          <NumberInput value={settings.draftRounds} onChange={v => updateSetting("draftRounds", v)}
            min={1} max={12} />
        </SettingRow>
        <SettingRow label="Prospect Pool Size">
          <NumberInput value={settings.prospectPoolSize}
            onChange={v => updateSetting("prospectPoolSize", v)} min={100} max={1000} step={10} />
        </SettingRow>
        <SettingRow label="Draft Lottery">
          <ToggleSwitch value={settings.lotteryEnabled}
            onChange={v => updateSetting("lotteryEnabled", v)} />
        </SettingRow>
      </Section>

      {/* ── Simulation Settings ───────────────────────────────────────── */}
      <Section title="Simulation Settings" icon={SECTION_ICONS.simSettings}>
        <SettingRow label="Injury Frequency">
          <SliderInput value={settings.injuryFrequency}
            onChange={v => updateSetting("injuryFrequency", v)} suffix="%" />
        </SettingRow>
        <SettingRow label="Trade Realism">
          <SliderInput value={settings.tradeDifficulty}
            onChange={v => updateSetting("tradeDifficulty", v)} suffix="%" />
        </SettingRow>
        <SettingRow label="AI Aggressiveness">
          <SliderInput value={settings.freeAgencyAggressiveness}
            onChange={v => updateSetting("freeAgencyAggressiveness", v)} suffix="%" />
        </SettingRow>
      </Section>

      {/* ── Financial Settings ────────────────────────────────────────── */}
      <Section title="Financial Settings" icon={SECTION_ICONS.financialSettings}>
        <SettingRow label="Revenue Sharing">
          <ToggleSwitch value={settings.revenueSharing}
            onChange={v => updateSetting("revenueSharing", v)} />
        </SettingRow>
        <SettingRow label="Luxury Tax Rate">
          <SliderInput value={settings.luxuryTaxRate}
            onChange={v => updateSetting("luxuryTaxRate", v)}
            min={0} max={100} suffix="%" />
        </SettingRow>
        <SettingRow label="Cap Floor">
          <NumberInput value={settings.capFloor} onChange={v => updateSetting("capFloor", v)}
            prefix="$" suffix="M" min={0} max={300} step={5} />
        </SettingRow>
      </Section>

      {/* Bottom apply button (for mobile convenience) */}
      {changeCount > 0 && (
        <div style={{
          position: "sticky", bottom: 16, zIndex: 100,
          display: "flex", justifyContent: "center", marginTop: 8,
        }}>
          <button className="btn" onClick={handleApply} style={{
            padding: "12px 32px", borderRadius: 10, fontSize: 14, fontWeight: 700,
            border: "none", background: "var(--accent)", color: "#fff",
            cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            transition: "transform 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
            onMouseLeave={e => e.currentTarget.style.transform = ""}
          >
            Apply {changeCount} Change{changeCount !== 1 ? "s" : ""}
          </button>
        </div>
      )}
    </div>
  );
}
