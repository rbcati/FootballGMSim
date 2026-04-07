import React, { useState, useMemo, useCallback } from "react";
import { DEFAULT_TEAMS } from "../../data/default-teams.js";
import { teamColor } from "../../data/team-utils.js";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_LEAGUE_SETTINGS } from "../../core/leagueSettings.js";

const CONF_NAMES = ["AFC", "NFC"];
const DIV_NAMES = ["East", "North", "South", "West"];
const FILTERS = [
  { label: "All Teams", conf: null, div: null },
  { label: "AFC", conf: 0, div: null },
  { label: "NFC", conf: 1, div: null },
  { label: "AFC East", conf: 0, div: 0 },
  { label: "AFC North", conf: 0, div: 1 },
  { label: "AFC South", conf: 0, div: 2 },
  { label: "AFC West", conf: 0, div: 3 },
  { label: "NFC East", conf: 1, div: 0 },
  { label: "NFC North", conf: 1, div: 1 },
  { label: "NFC South", conf: 1, div: 2 },
  { label: "NFC West", conf: 1, div: 3 },
];

const DIFFICULTY_OPTIONS = [
  { value: "Easy", label: "Easy", desc: "Boosted draft luck, cheaper free agents, AI trades favor you", icon: "🟢" },
  { value: "Normal", label: "Normal", desc: "Balanced gameplay — the standard experience", icon: "🟡" },
  { value: "Hard", label: "Hard", desc: "Tougher AI, stricter cap, less draft luck", icon: "🟠" },
  { value: "Legendary", label: "Legendary", desc: "Brutally realistic — every decision matters", icon: "🔴" },
];

const PLAYOFF_FORMATS = [
  { value: "standard", label: "Standard (14 teams)", desc: "7 per conference, 1 bye each" },
  { value: "expanded", label: "Expanded (16 teams)", desc: "8 per conference, no byes" },
  { value: "classic", label: "Classic (12 teams)", desc: "6 per conference, 2 byes each" },
];

const DRAFT_ORDER_TYPES = [
  { value: "reverse_standings", label: "Reverse Standings", desc: "Worst record picks first" },
  { value: "lottery", label: "Draft Lottery", desc: "Bottom 14 teams enter lottery" },
  { value: "random", label: "Random", desc: "Fully randomized draft order" },
];

const SCHEDULE_BALANCE_OPTIONS = [
  { value: "balanced", label: "Balanced" },
  { value: "division-heavy", label: "Division Heavy" },
  { value: "conference-heavy", label: "Conference Heavy" },
];

export default function NewLeagueSetup({ actions, onCancel }) {
  // Step management
  const [step, setStep] = useState(0); // 0: team, 1: settings, 2: confirm

  // Core selections
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [leagueName, setLeagueName] = useState("");
  const [year, setYear] = useState(2025);
  const [difficulty, setDifficulty] = useState("Normal");

  // Advanced settings
  const [playoffFormat, setPlayoffFormat] = useState("standard");
  const [draftOrder, setDraftOrder] = useState("reverse_standings");
  const [salaryCap, setSalaryCap] = useState(301.2);
  const [godMode, setGodMode] = useState(false);
  const [injuryFrequency, setInjuryFrequency] = useState("normal");
  const [tradeRealism, setTradeRealism] = useState("normal");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seasonLength, setSeasonLength] = useState(DEFAULT_LEAGUE_SETTINGS.seasonLength);
  const [playoffTeams, setPlayoffTeams] = useState(DEFAULT_LEAGUE_SETTINGS.playoffTeams);
  const [capFloor, setCapFloor] = useState(DEFAULT_LEAGUE_SETTINGS.capFloor);
  const [progressionVolatility, setProgressionVolatility] = useState(DEFAULT_LEAGUE_SETTINGS.progressionVolatility);
  const [regressionSeverity, setRegressionSeverity] = useState(DEFAULT_LEAGUE_SETTINGS.regressionSeverity);
  const [scoutingFogStrength, setScoutingFogStrength] = useState(DEFAULT_LEAGUE_SETTINGS.scoutingFogStrength);
  const [ownerPatienceStrictness, setOwnerPatienceStrictness] = useState(DEFAULT_LEAGUE_SETTINGS.ownerPatienceStrictness);
  const [playerMoodVolatility, setPlayerMoodVolatility] = useState(DEFAULT_LEAGUE_SETTINGS.playerMoodVolatility);
  const [staffImpactStrength, setStaffImpactStrength] = useState(DEFAULT_LEAGUE_SETTINGS.staffImpactStrength);
  const [freeAgencyAggressiveness, setFreeAgencyAggressiveness] = useState(DEFAULT_LEAGUE_SETTINGS.freeAgencyAggressiveness);
  const [leagueSize, setLeagueSize] = useState(DEFAULT_LEAGUE_SETTINGS.leagueSize);
  const [draftRounds, setDraftRounds] = useState(DEFAULT_LEAGUE_SETTINGS.draftRounds);
  const [scheduleBalancePreset, setScheduleBalancePreset] = useState(DEFAULT_LEAGUE_SETTINGS.scheduleBalancePreset);
  const [conferenceNames, setConferenceNames] = useState(DEFAULT_LEAGUE_SETTINGS.conferenceNames.join(", "));
  const [divisionNames, setDivisionNames] = useState(DEFAULT_LEAGUE_SETTINGS.divisionNames.join(", "));

  // Team filter
  const [activeFilter, setActiveFilter] = useState(0);

  // Creating state
  const [creating, setCreating] = useState(false);

  const filteredTeams = useMemo(() => {
    const f = FILTERS[activeFilter];
    return DEFAULT_TEAMS.filter(t => {
      if (f.conf !== null && t.conf !== f.conf) return false;
      if (f.div !== null && t.div !== f.div) return false;
      return true;
    });
  }, [activeFilter]);

  const selectedTeamData = useMemo(() =>
    DEFAULT_TEAMS.find(t => t.id === selectedTeam),
    [selectedTeam]
  );

  const handleStart = useCallback(async () => {
    if (selectedTeam === null) return;
    setCreating(true);
    await actions.newLeague(DEFAULT_TEAMS, {
      userTeamId: selectedTeam,
      year,
      difficulty,
      name: leagueName || `${selectedTeamData?.name || "My"} Dynasty`,
      playoffFormat,
      draftOrder,
      salaryCap,
      godMode,
      injuryFrequency,
      tradeRealism,
      settings: {
        seasonLength,
        playoffTeams,
        salaryCap,
        capFloor,
        playoffSeeding: playoffFormat,
        draftOrderLogic: draftOrder,
        injuryFrequency: injuryFrequency === "none" ? 0 : injuryFrequency === "low" ? 25 : injuryFrequency === "high" ? 75 : 50,
        tradeDifficulty: tradeRealism === "easy" ? 30 : tradeRealism === "strict" ? 75 : 50,
        progressionVolatility,
        regressionSeverity,
        scoutingFogStrength,
        ownerPatienceStrictness,
        playerMoodVolatility,
        staffImpactStrength,
        freeAgencyAggressiveness,
        leagueSize,
        draftRounds,
        scheduleBalancePreset,
        conferenceNames: conferenceNames.split(",").map(v => v.trim()).filter(Boolean),
        divisionNames: divisionNames.split(",").map(v => v.trim()).filter(Boolean),
        customDifficultyEnabled: true,
        difficultyPreset: difficulty,
        leagueName: leagueName || `${selectedTeamData?.name || "My"} Dynasty`,
      },
    });
  }, [selectedTeam, year, difficulty, leagueName, selectedTeamData, playoffFormat, draftOrder, salaryCap, godMode, injuryFrequency, tradeRealism, seasonLength, playoffTeams, capFloor, progressionVolatility, regressionSeverity, scoutingFogStrength, ownerPatienceStrictness, playerMoodVolatility, staffImpactStrength, freeAgencyAggressiveness, leagueSize, draftRounds, scheduleBalancePreset, conferenceNames, divisionNames, actions]);

  const canProceed = step === 0 ? selectedTeam !== null : true;

  return (
    <div className="league-setup-root">
      {/* Header */}
      <div className="league-setup-header">
        <h1 className="league-setup-title">
          {step === 0 ? "Choose Your Franchise" : step === 1 ? "League Settings" : "Ready to Play"}
        </h1>
        <p className="league-setup-subtitle">
          {step === 0
            ? "Select the team you'll build into a dynasty"
            : step === 1
            ? "Customize your league experience"
            : "Review and launch your new career"}
        </p>
      </div>

      {/* Step indicator */}
      <div className="step-indicator">
        {[0, 1, 2].map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <div className="step-connector" />}
            <div
              className={`step-dot ${step === s ? "active" : ""} ${step > s ? "completed" : ""}`}
              onClick={() => (s < step ? setStep(s) : null)}
              style={{ cursor: s < step ? "pointer" : "default" }}
            />
          </React.Fragment>
        ))}
      </div>

      {/* Step 0: Team Selection */}
      {step === 0 && (
        <div className="fade-in" style={{ flex: 1, overflow: "auto", paddingBottom: 100 }}>
          {/* Filter tabs */}
          <div className="division-tabs">
            {FILTERS.map((f, i) => (
              <Button
                key={i}
                className={`division-tab ${activeFilter === i ? "active" : ""}`}
                onClick={() => setActiveFilter(i)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Team grid */}
          <div className="team-grid">
            {filteredTeams.map((team, idx) => {
              const color = teamColor(team.abbr);
              return (
                <Button
                  key={team.id}
                  className={`team-card ${selectedTeam === team.id ? "selected" : ""}`}
                  onClick={() => setSelectedTeam(team.id)}
                  style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                >
                  <div
                    className="team-card-logo"
                    style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
                  >
                    {team.abbr}
                  </div>
                  <div className="team-card-info">
                    <div className="team-card-name">{team.name}</div>
                    <div className="team-card-division">
                      {CONF_NAMES[team.conf]} {DIV_NAMES[team.div]}
                    </div>
                  </div>
                  {selectedTeam === team.id && (
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "var(--accent)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 14, color: "#fff",
                    }}>
                      ✓
                    </div>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 1: Settings */}
      {step === 1 && (
        <div className="fade-in" style={{
          flex: 1, overflow: "auto", padding: "0 var(--space-4)",
          paddingBottom: 100,
        }}>
          <div className="settings-panel">
            {/* League Name */}
            <div className="settings-group">
              <label className="settings-label">League Name</label>
              <Input
                className="settings-input"
                type="text"
                value={leagueName}
                onChange={e => setLeagueName(e.target.value)}
                placeholder={`${selectedTeamData?.name || "My"} Dynasty`}
                maxLength={40}
              />
            </div>

            {/* Starting Year */}
            <div className="settings-group">
              <label className="settings-label">Starting Year</label>
              <Input
                className="settings-input"
                type="number"
                value={year}
                onChange={e => setYear(Math.max(2000, Math.min(2050, Number(e.target.value))))}
                min={2000}
                max={2050}
              />
            </div>

            {/* Difficulty */}
            <div className="settings-group">
              <label className="settings-label">Difficulty</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {DIFFICULTY_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    onClick={() => setDifficulty(opt.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--space-3)",
                      padding: "var(--space-3) var(--space-4)",
                      background: difficulty === opt.value ? "var(--accent-muted)" : "var(--bg)",
                      border: difficulty === opt.value
                        ? "2px solid var(--accent)"
                        : "1px solid var(--hairline)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer", textAlign: "left",
                      color: "var(--text)", transition: "all 0.15s ease",
                      minHeight: 52,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{opt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{opt.label}</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                        {opt.desc}
                      </div>
                    </div>
                    {difficulty === opt.value && (
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: "var(--accent)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: "#fff", flexShrink: 0,
                      }}>✓</div>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <Button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: "100%", padding: "var(--space-3) var(--space-4)",
                background: "transparent",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-muted)", cursor: "pointer",
                fontSize: "var(--text-sm)", fontWeight: 600,
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                marginBottom: showAdvanced ? "var(--space-4)" : 0,
                transition: "all 0.15s ease",
              }}
            >
              <span>Advanced Settings</span>
              <span style={{
                transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
                fontSize: 12,
              }}>▼</span>
            </Button>

            {/* Advanced Settings Panel */}
            {showAdvanced && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
                {/* Playoff Format */}
                <div className="settings-group">
                  <label className="settings-label">Playoff Format</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {PLAYOFF_FORMATS.map(opt => (
                      <Button
                        key={opt.value}
                        onClick={() => setPlayoffFormat(opt.value)}
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          background: playoffFormat === opt.value ? "var(--accent-muted)" : "var(--bg)",
                          border: playoffFormat === opt.value
                            ? "2px solid var(--accent)"
                            : "1px solid var(--hairline)",
                          borderRadius: "var(--radius-md)",
                          cursor: "pointer", textAlign: "left",
                          color: "var(--text)", transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{opt.label}</div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                          {opt.desc}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Draft Order */}
                <div className="settings-group">
                  <label className="settings-label">Draft Order</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {DRAFT_ORDER_TYPES.map(opt => (
                      <Button
                        key={opt.value}
                        onClick={() => setDraftOrder(opt.value)}
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          background: draftOrder === opt.value ? "var(--accent-muted)" : "var(--bg)",
                          border: draftOrder === opt.value
                            ? "2px solid var(--accent)"
                            : "1px solid var(--hairline)",
                          borderRadius: "var(--radius-md)",
                          cursor: "pointer", textAlign: "left",
                          color: "var(--text)", transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{opt.label}</div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                          {opt.desc}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Salary Cap */}
                <div className="settings-group">
                  <label className="settings-label">Salary Cap ($M)</label>
                  <p className="settings-description">Hard cap per team. Default: $301.2M</p>
                  <Input
                    className="settings-input"
                    type="number"
                    value={salaryCap}
                    onChange={e => setSalaryCap(Math.max(100, Math.min(999, Number(e.target.value))))}
                    step={0.1}
                    min={100}
                    max={999}
                  />
                </div>
                <div className="settings-group">
                  <label className="settings-label">League Size</label>
                  <Input className="settings-input" type="number" min={4} max={32} value={leagueSize} onChange={e => setLeagueSize(Math.max(4, Math.min(32, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Season Length</label>
                  <Input className="settings-input" type="number" min={4} max={24} value={seasonLength} onChange={e => setSeasonLength(Math.max(4, Math.min(24, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Playoff Teams</label>
                  <Input className="settings-input" type="number" min={2} max={32} value={playoffTeams} onChange={e => setPlayoffTeams(Math.max(2, Math.min(32, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Cap Floor ($M)</label>
                  <Input className="settings-input" type="number" min={0} max={salaryCap} value={capFloor} onChange={e => setCapFloor(Math.max(0, Math.min(salaryCap, Number(e.target.value))))} />
                </div>

                {/* Injury Frequency */}
                <div className="settings-group">
                  <label className="settings-label">Injury Frequency</label>
                  <select
                    className="settings-select"
                    value={injuryFrequency}
                    onChange={e => setInjuryFrequency(e.target.value)}
                  >
                    <option value="low">Low (50% fewer injuries)</option>
                    <option value="normal">Normal (Realistic)</option>
                    <option value="high">High (50% more injuries)</option>
                    <option value="none">None (Injuries off)</option>
                  </select>
                </div>

                {/* Trade Realism */}
                <div className="settings-group">
                  <label className="settings-label">Trade Realism</label>
                  <select
                    className="settings-select"
                    value={tradeRealism}
                    onChange={e => setTradeRealism(e.target.value)}
                  >
                    <option value="easy">Easy (AI accepts more trades)</option>
                    <option value="normal">Normal (Balanced)</option>
                    <option value="strict">Strict (Very selective AI)</option>
                  </select>
                </div>
                <div className="settings-group">
                  <label className="settings-label">Progression Volatility (0-100)</label>
                  <Input className="settings-input" type="number" min={0} max={100} value={progressionVolatility} onChange={e => setProgressionVolatility(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Regression Severity (0-100)</label>
                  <Input className="settings-input" type="number" min={0} max={100} value={regressionSeverity} onChange={e => setRegressionSeverity(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Scouting Fog Strength (0-100)</label>
                  <Input className="settings-input" type="number" min={0} max={100} value={scoutingFogStrength} onChange={e => setScoutingFogStrength(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Owner Patience Strictness (0-100)</label>
                  <Input className="settings-input" type="number" min={0} max={100} value={ownerPatienceStrictness} onChange={e => setOwnerPatienceStrictness(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Player Mood Volatility (0-100)</label>
                  <Input className="settings-input" type="number" min={0} max={100} value={playerMoodVolatility} onChange={e => setPlayerMoodVolatility(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Staff Impact Strength (0-100)</label>
                  <Input className="settings-input" type="number" min={0} max={100} value={staffImpactStrength} onChange={e => setStaffImpactStrength(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Draft Rounds</label>
                  <Input className="settings-input" type="number" min={1} max={12} value={draftRounds} onChange={e => setDraftRounds(Math.max(1, Math.min(12, Number(e.target.value))))} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Schedule Balance Preset</label>
                  <select className="settings-select" value={scheduleBalancePreset} onChange={e => setScheduleBalancePreset(e.target.value)}>
                    {SCHEDULE_BALANCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="settings-group">
                  <label className="settings-label">Conference Names (comma separated)</label>
                  <Input className="settings-input" type="text" value={conferenceNames} onChange={e => setConferenceNames(e.target.value)} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Division Names (comma separated)</label>
                  <Input className="settings-input" type="text" value={divisionNames} onChange={e => setDivisionNames(e.target.value)} />
                </div>
                <div className="settings-group">
                  <label className="settings-label">Free Agency Aggressiveness (0-100)</label>
                  <Input className="settings-input" type="number" min={0} max={100} value={freeAgencyAggressiveness} onChange={e => setFreeAgencyAggressiveness(Math.max(0, Math.min(100, Number(e.target.value))))} />
                </div>

                {/* God Mode */}
                <div className="settings-group">
                  <div
                    className="toggle-switch"
                    onClick={() => setGodMode(!godMode)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === "Enter" && setGodMode(!godMode)}
                  >
                    <div className={`toggle-track ${godMode ? "active" : ""}`}>
                      <div className="toggle-thumb" />
                    </div>
                    <div>
                      <div className="toggle-label">God Mode</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                        Edit any player, team, or setting at any time. Disables achievements.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Confirmation */}
      {step === 2 && (
        <div className="fade-in-scale" style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 var(--space-4)", paddingBottom: 100,
        }}>
          <div style={{
            width: "100%", maxWidth: 480,
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
          }}>
            {/* Team header */}
            {selectedTeamData && (
              <div style={{
                padding: "var(--space-8) var(--space-6)",
                background: `linear-gradient(135deg, ${teamColor(selectedTeamData.abbr)}22, transparent)`,
                textAlign: "center",
                borderBottom: "1px solid var(--hairline)",
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "var(--radius-xl)",
                  background: `linear-gradient(135deg, ${teamColor(selectedTeamData.abbr)}, ${teamColor(selectedTeamData.abbr)}dd)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto var(--space-4)",
                  fontSize: 22, fontWeight: 900, color: "#fff",
                  boxShadow: `0 8px 32px ${teamColor(selectedTeamData.abbr)}40`,
                }}>
                  {selectedTeamData.abbr}
                </div>
                <div style={{
                  fontSize: "var(--text-2xl)", fontWeight: 900,
                  color: "var(--text)", letterSpacing: "-0.5px",
                }}>
                  {selectedTeamData.name}
                </div>
                <div style={{
                  fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 4,
                }}>
                  {CONF_NAMES[selectedTeamData.conf]} {DIV_NAMES[selectedTeamData.div]}
                </div>
              </div>
            )}

            {/* Settings summary */}
            <div style={{ padding: "var(--space-5) var(--space-6)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <SummaryRow label="League" value={leagueName || `${selectedTeamData?.name || "My"} Dynasty`} />
                <SummaryRow label="Year" value={year} />
                <SummaryRow label="Difficulty" value={difficulty} />
                <SummaryRow label="Playoffs" value={PLAYOFF_FORMATS.find(p => p.value === playoffFormat)?.label} />
                <SummaryRow label="Draft Order" value={DRAFT_ORDER_TYPES.find(d => d.value === draftOrder)?.label} />
                <SummaryRow label="Salary Cap" value={`$${salaryCap}M`} />
                {godMode && <SummaryRow label="God Mode" value="Enabled" highlight />}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="action-bar">
        <div className="action-bar-inner">
          <Button
            className="btn"
            onClick={() => (step > 0 ? setStep(step - 1) : onCancel())}
            disabled={creating}
            style={{
              flex: 1, fontSize: "var(--text-base)", fontWeight: 700,
              minHeight: 52, borderRadius: "var(--radius-md)",
              background: "var(--surface)", border: "1px solid var(--hairline)",
              color: "var(--text)", cursor: "pointer",
            }}
          >
            {step > 0 ? "Back" : "Cancel"}
          </Button>
          <Button
            id="start-career-btn"
            className="btn-premium btn-primary-premium"
            onClick={() => {
              if (step < 2) setStep(step + 1);
              else handleStart();
            }}
            disabled={!canProceed || creating}
            style={{
              flex: 2, fontSize: "var(--text-base)", minHeight: 52,
              opacity: canProceed && !creating ? 1 : 0.5,
            }}
          >
            {creating
              ? "Creating League..."
              : step < 2
              ? "Continue"
              : "Start Dynasty"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, highlight }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "var(--space-2) 0",
      borderBottom: "1px solid var(--hairline)",
    }}>
      <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{label}</span>
      <span style={{
        fontSize: "var(--text-sm)", fontWeight: 700,
        color: highlight ? "var(--warning)" : "var(--text)",
      }}>
        {value}
      </span>
    </div>
  );
}
