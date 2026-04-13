/**
 * PlayerProfile.jsx
 *
 * Modal: accolades/legacy badges + position-aware career stats table.
 */
import React, { useEffect, useMemo, useState } from "react";
import TraitBadge from "./TraitBadge";
import RadarChart from "./RadarChart";
import ExtensionNegotiationModal from "./ExtensionNegotiationModal.jsx";
import { getTeamIdentity } from "../../data/team-utils.js";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { formatMoneyM, safeRound, toFiniteNumber } from "../utils/numberFormatting.js";
import { derivePlayerContractFinancials } from "../utils/contractFormatting.js";
import { buildTeamIntelligence, classifyNeedFitForProspect, describeProspectProfile, describeRookieOnboarding } from "../utils/teamIntelligence.js";
import { buildTeamChemistrySummary, describePlayerMoraleContext } from "../utils/teamChemistry.js";
import { normalizeManagement, TRADE_STATUS_LABELS, TRADE_STATUS_TOOLTIPS, TRADE_STATUSES, CONTRACT_PLAN_FLAGS, CONTRACT_PLAN_LABELS, toggleContractPlan } from "../utils/playerManagement.js";
import { evaluateReSigningPriority, summarizeRetentionPlan } from "../../core/retention/reSigning.js";

// ── Accolade badge config ─────────────────────────────────────────────────────

const ACCOLADE_META = {
  SB_RING: { icon: "🏆", label: (yr) => `${yr} SB Champ` },
  SB_MVP: { icon: "🌟", label: (yr) => `${yr} SB MVP` },
  MVP: { icon: "🏅", label: (yr) => `${yr} MVP` },
  OPOY: { icon: "⚡", label: (yr) => `${yr} OPOY` },
  DPOY: { icon: "🛡️", label: (yr) => `${yr} DPOY` },
  ROTY: { icon: "🌱", label: (yr) => `${yr} ROTY` },
};


function formatPriorityLabel(key) {
  const labels = {
    money: 'Money',
    contender: 'Contender',
    role: 'Role',
    loyalty: 'Loyalty',
    development: 'Development',
  };
  return labels[key] ?? key;
}
// ── Position group → stat column definitions ──────────────────────────────────

function computePasserRating(t) {
  const att = t.passAtt || 0;
  if (att === 0) return "-";
  const a = Math.max(0, Math.min(2.375, ((t.passComp || 0) / att - 0.3) / 0.2));
  const b = Math.max(0, Math.min(2.375, ((t.passYd || 0) / att - 3) / 4));
  const c = Math.max(0, Math.min(2.375, (t.passTD || 0) / att / 0.05));
  const d = Math.max(
    0,
    Math.min(2.375, 2.375 - (t.interceptions || 0) / att / 0.04),
  );
  return (((a + b + c + d) / 6) * 100).toFixed(1);
}

const POS_COLUMNS = {
  QB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "passAtt", label: "Att" },
    { key: "passComp", label: "Cmp" },
    { key: "passYd", label: "Pass Yds", hi: 3000 },
    { key: "passTD", label: "TD" },
    { key: "interceptions", label: "INT" },
    { key: "sacks", label: "Sacked" },
    {
      key: "_compPct",
      label: "Cmp%",
      fmt: (t) =>
        t.passAtt
          ? (((t.passComp || 0) / t.passAtt) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "_passer", label: "RTG", fmt: computePasserRating },
  ],
  RB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "rushAtt", label: "Car" },
    { key: "rushYd", label: "Rush Yds", hi: 1000 },
    { key: "rushTD", label: "TD" },
    {
      key: "_ypc",
      label: "YPC",
      fmt: (t) => (t.rushAtt ? ((t.rushYd || 0) / t.rushAtt).toFixed(1) : "-"),
    },
    { key: "receptions", label: "Rec" },
    { key: "recYd", label: "Rec Yds" },
    { key: "recTD", label: "RecTD" },
    { key: "fumbles", label: "Fum" },
  ],
  WR: [
    { key: "gamesPlayed", label: "GP" },
    { key: "targets", label: "Tgt" },
    { key: "receptions", label: "Rec" },
    { key: "recYd", label: "Rec Yds", hi: 1000 },
    { key: "recTD", label: "TD" },
    {
      key: "_catchPct",
      label: "Catch%",
      fmt: (t) =>
        t.targets
          ? (((t.receptions || 0) / t.targets) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "yardsAfterCatch", label: "YAC" },
  ],
  TE: [
    { key: "gamesPlayed", label: "GP" },
    { key: "targets", label: "Tgt" },
    { key: "receptions", label: "Rec" },
    { key: "recYd", label: "Rec Yds", hi: 700 },
    { key: "recTD", label: "TD" },
    {
      key: "_catchPct",
      label: "Catch%",
      fmt: (t) =>
        t.targets
          ? (((t.receptions || 0) / t.targets) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "yardsAfterCatch", label: "YAC" },
  ],
  OL: [
    { key: "gamesPlayed", label: "GP" },
    { key: "passBlockSnaps", label: "PB Snaps" },
    { key: "runBlockSnaps", label: "RB Snaps" },
    { key: "sacksAllowed", label: "Sacks Alwd" },
  ],
  DL: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl" },
    { key: "sacks", label: "Sacks", hi: 5 },
    { key: "tacklesForLoss", label: "TFL" },
    { key: "forcedFumbles", label: "FF" },
    { key: "fumbleRecoveries", label: "FR" },
    { key: "pressures", label: "Pres" },
    { key: "passRushSnaps", label: "Rush Snaps" },
  ],
  LB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl", hi: 80 },
    { key: "sacks", label: "Sacks" },
    { key: "tacklesForLoss", label: "TFL" },
    { key: "forcedFumbles", label: "FF" },
    { key: "interceptions", label: "INT" },
    { key: "passesDefended", label: "PD" },
  ],
  CB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl" },
    { key: "interceptions", label: "INT", hi: 3 },
    { key: "passesDefended", label: "PD" },
    { key: "targetsAllowed", label: "Tgt Alwd" },
    { key: "completionsAllowed", label: "Cmp Alwd" },
  ],
  S: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl", hi: 80 },
    { key: "interceptions", label: "INT", hi: 3 },
    { key: "passesDefended", label: "PD" },
    { key: "targetsAllowed", label: "Tgt Alwd" },
  ],
  K: [
    { key: "gamesPlayed", label: "GP" },
    { key: "fgMade", label: "FGM" },
    { key: "fgAttempts", label: "FGA" },
    {
      key: "_fgPct",
      label: "FG%",
      fmt: (t) =>
        t.fgAttempts
          ? (((t.fgMade || 0) / t.fgAttempts) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "longestFG", label: "Lng" },
    { key: "xpMade", label: "XPM" },
    { key: "xpAttempts", label: "XPA" },
  ],
  P: [
    { key: "gamesPlayed", label: "GP" },
    { key: "punts", label: "Punts" },
    { key: "puntYards", label: "Yds" },
    {
      key: "_avgPunt",
      label: "Avg",
      fmt: (t) => (t.punts ? ((t.puntYards || 0) / t.punts).toFixed(1) : "-"),
    },
    { key: "longestPunt", label: "Lng" },
  ],
};

function getColumns(pos) {
  if (!pos) return POS_COLUMNS.QB;
  const p = pos.toUpperCase();
  if (POS_COLUMNS[p]) return POS_COLUMNS[p];
  if (["DE", "DT", "EDGE"].includes(p)) return POS_COLUMNS.DL;
  if (["SS", "FS"].includes(p)) return POS_COLUMNS.S;
  if (["OT", "OG", "C", "G", "T"].includes(p)) return POS_COLUMNS.OL;
  return POS_COLUMNS.QB; // fallback
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(t, col) {
  if (col.fmt) return col.fmt(t);
  const v = t[col.key];
  if (v === undefined || v === null) return "-";
  // Format large integers with locale commas (e.g. 6122 → 6,122)
  if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) >= 1000) {
    return v.toLocaleString();
  }
  return v;
}

function isHigh(t, col) {
  if (!col.hi) return false;
  const v = t[col.key];
  return typeof v === "number" && v >= col.hi;
}

function seasonYear(seasonId) {
  if (!seasonId) return "?";
  if (seasonId.startsWith("s")) {
    const n = parseInt(seasonId.replace("s", ""), 10);
    return isNaN(n) ? seasonId : 2024 + n;
  }
  return seasonId;
}

function getSeasonProductionSummary(player) {
  if (!player?.careerStats?.length) return null;
  const latest = player.careerStats[player.careerStats.length - 1];
  if (!latest) return null;

  if (player.pos === "QB" && latest.passYds != null) {
    return `${latest.passYds.toLocaleString()} pass yds · ${latest.passTDs ?? 0} TD`;
  }
  if (["RB", "FB"].includes(player.pos) && latest.rushYds != null) {
    return `${latest.rushYds.toLocaleString()} rush yds · ${latest.rushTDs ?? 0} TD`;
  }
  if (["WR", "TE"].includes(player.pos) && latest.recYds != null) {
    return `${latest.receptions ?? 0} rec · ${latest.recYds.toLocaleString()} yds`;
  }
  if (["DE", "DT", "LB", "CB", "S", "DL"].includes(player.pos)) {
    return `${latest.tackles ?? 0} tkl · ${latest.sacks ?? 0} sacks`;
  }
  return null;
}

function getPlayerSummaryChips(player, ringCount, nonRing) {
  const chips = [];
  const contractYears = toFiniteNumber(player?.contract?.years, null);
  const contractAnnual = derivePlayerContractFinancials(player).annualSalary;
  if (contractYears != null || contractAnnual != null) {
    chips.push({
      label: "Contract",
      value: `${contractYears != null ? `${safeRound(contractYears, 0)}y` : "—"} · ${formatMoneyM(contractAnnual, "—")}/yr`,
    });
  }
  if (player?.age != null) {
    const devSignal = player.age <= 24 ? "Ascending" : player.age >= 30 ? "Veteran" : "Prime";
    chips.push({ label: "Development", value: `${player.age} · ${devSignal}` });
  }
  if (player?.injuryWeeksRemaining > 0) {
    chips.push({
      label: "Durability",
      value: `Out ${safeRound(player.injuryWeeksRemaining, 0)}w`,
      tone: "warn",
    });
  } else {
    chips.push({ label: "Durability", value: "Available" });
  }
  const recent = getSeasonProductionSummary(player);
  if (recent) chips.push({ label: "Recent", value: recent });
  if (ringCount > 0 || nonRing.length > 0) {
    chips.push({
      label: "Accolades",
      value: ringCount > 0 ? `${ringCount}x Champ` : `${nonRing.length} awards`,
    });
  }
  return chips;
}

const sectionLabelStyle = {
  margin: "0 0 var(--space-2)",
  fontSize: "var(--text-xs)",
  fontWeight: 800,
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

// ── Main component ────────────────────────────────────────────────────────────

/** Look up a team's full name, delegating to the shared getTeamIdentity utility. */
function getTeamName(teamId, teams) {
  return getTeamIdentity(teamId, teams).name;
}

export default function PlayerProfile({
  playerId,
  onClose,
  actions,
  teams = [],
  onNavigate = null,
  isUserOnClock = false,
  onDraftPlayer = null,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extending, setExtending] = useState(false);

  const fetchProfile = React.useCallback(() => {
    if (!playerId) return;
    setLoading(true);
    actions
      .getPlayerCareer(playerId)
      .then((response) => {
        setData(response.payload ?? response);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load player profile:", err);
        setLoading(false);
      });
  }, [playerId, actions]);

  useEffect(() => {
    let stale = false;
    if (!playerId) return;
    setLoading(true);
    actions
      .getPlayerCareer(playerId)
      .then((response) => {
        if (!stale) {
          setData(response.payload ?? response);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!stale) {
          console.error("Failed to load player profile:", err);
          setLoading(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [playerId, actions]);

  const player = data?.player;
  const userTeam = useMemo(() => teams.find((t) => t.id === data?.meta?.userTeamId || t.id === player?.teamId), [teams, data?.meta?.userTeamId, player?.teamId]);
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: data?.meta?.week ?? 1 }), [userTeam, data?.meta?.week]);
  const isProspect = player?.status === "draft_eligible";
  const prospectProfile = useMemo(() => (isProspect ? describeProspectProfile(player) : null), [isProspect, player]);
  const needFit = useMemo(() => (isProspect ? classifyNeedFitForProspect(player?.pos, teamIntel) : null), [isProspect, player?.pos, teamIntel]);
  const chemistry = useMemo(() => buildTeamChemistrySummary(userTeam, { week: data?.meta?.week ?? 1, direction: teamIntel?.direction }), [userTeam, data?.meta?.week, teamIntel]);
  const moraleContext = useMemo(() => describePlayerMoraleContext(player, { team: userTeam, chemistry, week: data?.meta?.week ?? 1 }), [player, userTeam, chemistry, data?.meta?.week]);
  const onboardingContext = useMemo(() => ((isProspect || Number(player?.age ?? 30) <= 24) ? describeRookieOnboarding(player, teamIntel) : null), [isProspect, player, teamIntel]);

  const management = useMemo(() => normalizeManagement(player), [player]);
  const updateManagement = async (updates) => {
    if (!player?.id || !actions?.updatePlayerManagement || !player?.teamId) return;
    await actions.updatePlayerManagement(player.id, player.teamId, updates);
    setData((prev) => {
      if (!prev?.player) return prev;
      return { ...prev, player: { ...prev.player, ...updates, onTradeBlock: updates?.tradeStatus === 'actively_shopping' } };
    });
  };
  const stats = data?.stats ?? [];
  const columns = getColumns(player?.pos);

  // Group accolades: condense SB_RING into count
  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];
  const ringCount = accolades.filter((a) => a.type === "SB_RING").length;
  const nonRing = accolades
    .filter((a) => a.type !== "SB_RING")
    .sort((a, b) => b.year - a.year);
  const summaryChips = getPlayerSummaryChips(player, ringCount, nonRing);
  const accoladesByYear = [...accolades].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const teamJourney = [...new Set((player?.careerStats ?? []).map((line) => line.team).filter(Boolean))];
  const keyColumns = columns.filter((c) => !c.fmt && c.key !== "gamesPlayed").slice(0, 4);
  const careerHighs = keyColumns
    .map((col) => {
      let best = { value: 0, season: null };
      for (const s of stats) {
        const value = s?.totals?.[col.key] ?? 0;
        if (value > best.value) best = { value, season: seasonYear(s.seasonId) };
      }
      return { label: col.label, ...best };
    })
    .filter((entry) => entry.value > 0);
  const latestStatLine = stats.length ? stats[stats.length - 1] : null;
  const latestTotals = latestStatLine?.totals ?? {};
  const latestGP = Number(latestTotals.gamesPlayed ?? 0);
  const perGameSummary = useMemo(() => {
    if (!latestGP) return [];
    const out = [];
    if ((latestTotals.passYd ?? 0) > 0) out.push({ label: "Pass Yds/G", value: ((latestTotals.passYd ?? 0) / latestGP).toFixed(1) });
    if ((latestTotals.rushYd ?? 0) > 0) out.push({ label: "Rush Yds/G", value: ((latestTotals.rushYd ?? 0) / latestGP).toFixed(1) });
    if ((latestTotals.recYd ?? 0) > 0) out.push({ label: "Rec Yds/G", value: ((latestTotals.recYd ?? 0) / latestGP).toFixed(1) });
    if ((latestTotals.tackles ?? 0) > 0) out.push({ label: "Tackles/G", value: ((latestTotals.tackles ?? 0) / latestGP).toFixed(1) });
    return out.slice(0, 3);
  }, [latestGP, latestTotals]);
  const peakSeason = useMemo(() => {
    if (!stats.length) return null;
    const metric = player?.pos === "QB" ? "passYd" : ["RB", "FB"].includes(player?.pos) ? "rushYd" : ["WR", "TE"].includes(player?.pos) ? "recYd" : ["LB", "DL", "DE", "DT", "EDGE"].includes(player?.pos) ? "sacks" : "tackles";
    return [...stats].sort((a, b) => Number(b?.totals?.[metric] ?? 0) - Number(a?.totals?.[metric] ?? 0))[0] ?? null;
  }, [stats, player?.pos]);
  const bestSeason = [...stats].sort((a, b) => {
    const aPrimary = a?.totals?.[keyColumns[0]?.key] ?? 0;
    const bPrimary = b?.totals?.[keyColumns[0]?.key] ?? 0;
    return bPrimary - aPrimary;
  })[0];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.6)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, var(--surface-elevated), var(--surface))",
          width: "min(980px, 100%)",
          maxWidth: 960,
          maxHeight: "92vh",
          overflowY: "auto",
          borderRadius: "min(var(--radius-lg), 14px)",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--hairline-strong)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Draft Banner (only when user is on the clock) ── */}
        {isUserOnClock && onDraftPlayer && player && (
          <div
            style={{
              padding: "var(--space-3) var(--space-5)",
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-4)",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: "#fff",
                fontSize: "var(--text-sm)",
              }}
            >
              ★ You're on the clock! Draft {player.name}?
            </span>
            <Button
              className="btn"
              style={{
                background: "#fff",
                color: "var(--accent)",
                border: "none",
                fontWeight: 800,
                padding: "6px 18px",
                fontSize: "var(--text-sm)",
                borderRadius: "var(--radius-pill)",
                flexShrink: 0,
              }}
              onClick={() => onDraftPlayer(player.id)}
            >
              Draft This Player
            </Button>
          </div>
        )}

        {/* ── Header ── */}
        <div
          style={{
            padding: "var(--space-4) var(--space-4)",
            borderBottom: "1px solid var(--hairline)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
          }}
        >
          {loading ? (
            <div style={{ color: "var(--text-muted)" }}>Loading…</div>
          ) : player ? (
            <div
              style={{
                display: "flex",
                gap: "var(--space-4)",
                alignItems: "flex-start",
                flex: 1,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: "14px",
                  background: "var(--surface-sunken)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                {player.pos}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.1rem, 4.8vw, 1.7rem)",
                    fontWeight: 900,
                    lineHeight: 1.15,
                  }}
                >
                  {player.name}
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--text-sm)",
                    marginTop: 4,
                  }}
                >
                  {player.pos} · Age {player.age} ·{" "}
                  {player.status === "active"
                    ? getTeamName(player.teamId, teams)
                    : "Retired"}
                </div>

                {/* OVR + progression delta + potential */}
                <div
                  style={{
                    marginTop: "var(--space-2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className={`rating-pill rating-color-${player.ovr >= 85 ? "elite" : player.ovr >= 75 ? "good" : "avg"}`}
                  >
                    {player.ovr} OVR
                  </span>
                  {player.progressionDelta != null &&
                    player.progressionDelta !== 0 && (
                      <span
                        className={
                          player.progressionDelta > 0
                            ? "text-success"
                            : "text-danger"
                        }
                        style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}
                      >
                        ({player.progressionDelta > 0 ? "+" : ""}
                        {player.progressionDelta})
                      </span>
                    )}
                  {player.potential && (
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "var(--text-sm)",
                        fontWeight: 700,
                      }}
                    >
                      Pot: {player.potential}
                    </span>
                  )}
                </div>


                {player.developmentContext && (
                  <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                    Dev path: {player.developmentContext.baseAgeCurve} · Focus {String(player.developmentContext.trainingFocus || 'balanced').replace('_', ' ')} · Staff mod {player.developmentContext.staffDevelopmentModifier >= 0 ? '+' : ''}{player.developmentContext.staffDevelopmentModifier}% · {player.developmentContext.playingTimeModifier}
                  </div>
                )}

                {/* Traits */}
                {player.traits?.length > 0 && (
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    {player.traits.map((t) => (
                      <TraitBadge key={t} traitId={t} />
                    ))}
                  </div>
                )}

                {/* ── Accolades / Legacy ── */}
                {(ringCount > 0 || nonRing.length > 0) && (
                  <div
                    style={{
                      marginTop: "var(--space-3)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--space-2)",
                    }}
                  >
                    {ringCount > 0 && (
                      <span style={badgeStyle("#B8860B", "#ffe066")}>
                        🏆 {ringCount}x SB Champ
                      </span>
                    )}
                    {nonRing.map((acc, i) => {
                      const meta = ACCOLADE_META[acc.type];
                      if (!meta) return null;
                      return (
                        <span
                          key={i}
                          style={badgeStyle(
                            "var(--accent)",
                            "var(--surface-strong)",
                          )}
                        >
                          {meta.icon} {meta.label(acc.year)}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Extension button */}
                {player.status === "active" && player.contract?.years === 1 && (
                  <div style={{ marginTop: "var(--space-3)" }}>
                    <Button
                      className="btn"
                      onClick={() => setExtending(true)}
                      style={{
                        fontSize: "var(--text-xs)",
                        padding: "4px 12px",
                        border: "1px solid var(--accent)",
                        color: "var(--accent)",
                      }}
                    >
                      Negotiate Extension
                    </Button>
                  </div>
                )}
                {player.status === "active" && player?.teamId != null && (
                  <div style={{ marginTop: 'var(--space-3)', display: 'grid', gap: 6, maxWidth: 360 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Trade posture</div>
                    <select
                      value={management.tradeStatus}
                      onChange={(e) => updateManagement({ tradeStatus: e.target.value })}
                      style={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--hairline)', padding: '4px 6px', background: 'var(--surface)' }}
                      title={TRADE_STATUS_TOOLTIPS[management.tradeStatus]}
                    >
                      {TRADE_STATUSES.map((status) => (
                        <option key={status} value={status}>{TRADE_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {CONTRACT_PLAN_FLAGS.map((flag) => (
                        <Button key={flag} size="sm" variant="outline" onClick={() => updateManagement({ contractPlan: toggleContractPlan(player, flag) })} style={{ opacity: management.contractPlan.includes(flag) ? 1 : 0.7 }}>
                          {management.contractPlan.includes(flag) ? '✓ ' : ''}{CONTRACT_PLAN_LABELS[flag]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)" }}>Player not found</div>
          )}

          <Button
            className="btn"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
            fontSize: "1.2rem",
            lineHeight: 1,
            color: "var(--text-muted)",
            padding: "4px 8px",
            marginLeft: "var(--space-2)",
            borderRadius: "999px",
            minWidth: 34,
            minHeight: 34,
          }}
        >
          ×
        </Button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "var(--space-4)", flex: 1, display: "grid", gap: "var(--space-4)" }}>
          {!loading && player && summaryChips.length > 0 && (
            <section>
              <h3 style={sectionLabelStyle}>Quick Read</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                {summaryChips.map((chip, idx) => (
                  <div key={`${chip.label}-${idx}`} style={{
                    border: `1px solid ${chip.tone === "warn" ? "rgba(255,159,10,0.4)" : "var(--hairline)"}`,
                    background: chip.tone === "warn" ? "rgba(255,159,10,0.08)" : "var(--surface-strong)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px",
                  }}>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>{chip.label}</div>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{chip.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "var(--space-2)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Draft Room")}>Draft room</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Draft Board")}>Big board</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("History")}>Season archive</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Hall of Fame")}>Hall of Fame</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Leaders")}>Leaders</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Analytics")}>Analytics</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Injuries")}>Injuries</Button>
              </div>
            </section>
          )}

          {!loading && player && isProspect && (
            <section>
              <h3 style={sectionLabelStyle}>Prospect Evaluation</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Projected Role</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{prospectProfile?.readiness ?? "Unknown"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Upside vs Readiness</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{prospectProfile?.upside ?? "Unknown"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Age / Development Profile</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{prospectProfile?.ageProfile ?? "Unknown"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Team Need Fit</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{needFit?.bucket ?? "Depth upgrade"}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{needFit?.short ?? "No strong fit signal."}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Rookie onboarding</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{onboardingContext?.state ?? "Manageable onboarding setup"}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{onboardingContext?.notes?.[0] ?? "Landing spot context updates as roster and staff change."}</div>
                </div>
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 6 }}>
                Note: scouting certainty is limited to data currently stored in this save.
              </div>
            </section>
          )}


          {!loading && player && (
            <section>
              <h3 style={sectionLabelStyle}>Morale & Role Context</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Current morale</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{moraleContext?.state ?? "Steady"} · {moraleContext?.score ?? player?.morale ?? "—"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Team environment</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{chemistry?.state ?? "Stable"}</div>
                </div>
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {(moraleContext?.reasons ?? []).slice(0, 3).map((reason, idx) => (
                  <div key={`mctx-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>• {reason}</div>
                ))}
                {Number(player?.age ?? 40) <= 25 && teamIntel?.organization?.developmentEnvironment?.reasons?.[0] ? (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>• Development environment: {teamIntel.organization.developmentEnvironment.reasons[0]}</div>
                ) : null}
              </div>
            </section>
          )}


          {!loading && player && player?.motivationProfile && (
            <section>
              <h3 style={sectionLabelStyle}>Motivation & Contract Outlook</h3>
              <div style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '10px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700 }}>Archetype</div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginTop: 2 }}>{String(player.motivationProfile.archetype || 'balanced').replace(/_/g, ' ')}</div>
                </div>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '10px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700 }}>Mood summary</div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginTop: 2 }}>{player?.motivationSummary?.summary ?? 'Balanced priorities'}</div>
                </div>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '10px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700 }}>Contract outlook</div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginTop: 2 }}>{player?.motivationSummary?.contractOutlook ?? 'No clear market pressure.'}</div>
                </div>
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(player?.motivationSummary?.priorities ?? []).map((p) => (
                  <span key={p} style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '2px 8px', color: 'var(--text-subtle)' }}>
                    {formatPriorityLabel(p)} priority
                  </span>
                ))}
              </div>
            </section>
          )}


          {!loading && player && (
            <section>
              <h3 style={sectionLabelStyle}>Contract Retention Panel</h3>
              {(() => {
                const userTeam = teams.find((t) => Number(t.id) === Number(player?.teamId)) || {};
                const leagueCtx = { players: [], week: 1, phase: '' };
                const priority = evaluateReSigningPriority(player, userTeam, leagueCtx);
                const plan = summarizeRetentionPlan(player, { team: userTeam, league: leagueCtx, priority });
                return (
                  <>
                    <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Contract status</div>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{priority.expiring ? 'Expiring now' : `${priority.yearsLeft} years remaining`}</div>
                      </div>
                      <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Extension eligibility</div>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{String(priority.extensionReadiness).replace(/_/g, ' ')}</div>
                      </div>
                      <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Expected market behavior</div>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{priority.profile.headline}</div>
                      </div>
                      <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Retention recommendation</div>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{String(plan.recommendation).replace(/_/g, ' ')}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{plan.recommendationSummary}</div>
                  </>
                );
              })()}
            </section>
          )}


          {!loading && player && (
            <section>
              <h3 style={sectionLabelStyle}>Current vs Peak Context</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Current Season</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{latestStatLine ? seasonYear(latestStatLine.seasonId) : "—"}</div>
                  {perGameSummary.map((g) => <div key={g.label} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{g.label}: {g.value}</div>)}
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Peak Season</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{peakSeason ? seasonYear(peakSeason.seasonId) : "—"}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Use career highs below for category peaks.</div>
                </div>
              </div>
            </section>
          )}

          {!loading && player && (
            <section>
              <h3 style={sectionLabelStyle}>Legacy Context</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Hall of Fame</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{player.hof ? "Inducted" : "Not inducted"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Best Season</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{bestSeason ? seasonYear(bestSeason.seasonId) : "—"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Championships</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{ringCount}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Team Journey</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{teamJourney.length ? teamJourney.join(" → ") : "Single team / N/A"}</div>
                </div>
              </div>
            </section>
          )}

          {careerHighs.length > 0 && (
            <section>
              <h3 style={sectionLabelStyle}>Career Highs</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                {careerHighs.map((entry) => (
                  <div key={entry.label} style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>{entry.label}</div>
                    <div style={{ fontSize: "var(--text-base)", fontWeight: 800 }}>{entry.value.toLocaleString()}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Season {entry.season ?? "—"}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {accoladesByYear.length > 0 && (
            <section>
              <h3 style={sectionLabelStyle}>Awards Timeline</h3>
              <div style={{ display: "grid", gap: 4 }}>
                {accoladesByYear.slice(-12).map((acc, idx) => (
                  <div key={`${acc.type}-${acc.year}-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    <strong style={{ color: "var(--text)" }}>{acc.year ?? "—"}</strong> · {acc.type}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
          <h3
            style={{
              marginTop: 0,
              fontSize: "var(--text-base)",
              marginBottom: "var(--space-2)",
            }}
          >
            Career Stats
          </h3>

          {loading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading stats…</p>
          ) : stats.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>
              No career stats recorded yet.
            </p>
          ) : (
            <div className="table-wrapper" style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
              <Table
                className="standings-table"
                style={{ width: "100%", minWidth: 540, fontSize: "0.76rem", lineHeight: 1.3 }}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead
                      style={{
                        paddingLeft: "var(--space-4)",
                        textAlign: "left", position: "sticky", left: 0, background: "var(--surface)",
                      }}
                    >
                      Year
                    </TableHead>
                    <TableHead style={{ textAlign: "left" }}>Team</TableHead>
                    {columns.map((col) => (
                      <TableHead
                        key={col.key}
                        style={{ textAlign: "center", whiteSpace: "nowrap" }}
                      >
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...stats]
                    .sort((a, b) =>
                      (b.seasonId || "").localeCompare(a.seasonId || ""),
                    )
                    .map((s, i) => {
                      const t = s.totals || {};
                      const primeKey = columns.find((c) => c.hi)?.key;
                      return (
                        <TableRow key={i}>
                          <TableCell
                            style={{
                              paddingLeft: "var(--space-3)",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {seasonYear(s.seasonId)}
                          </TableCell>
                          <TableCell
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "11px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.teamId != null
                              ? getTeamName(s.teamId, teams)
                              : "FA"}
                          </TableCell>
                          {columns.map((col) => (
                            <TableCell
                              key={col.key}
                              style={{
                                textAlign: "center",
                                color: col.key === primeKey
                                  ? "var(--text)"
                                  : isHigh(t, col)
                                  ? "var(--accent)"
                                  : "var(--text)",
                                fontWeight: col.key === primeKey ? 700 : isHigh(t, col) ? 700 : 500,
                              }}
                            >
                              {fmt(t, col)}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Career totals row */}
          {!loading &&
            stats.length > 1 &&
            (() => {
              const totals = {};
              stats.forEach((s) => {
                Object.entries(s.totals || {}).forEach(([k, v]) => {
                  if (typeof v === "number") totals[k] = (totals[k] || 0) + v;
                });
              });
              return (
                <div
                  style={{
                    marginTop: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--surface-strong)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    gap: "var(--space-6)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Career
                  </span>
                  {columns
                    .filter((c) => !c.fmt && c.key !== "gamesPlayed")
                    .slice(0, 6)
                    .map((col) => {
                      const v = totals[col.key];
                      if (v === undefined) return null;
                      return (
                        <span
                          key={col.key}
                          style={{ fontSize: "var(--text-sm)" }}
                        >
                          <span
                            style={{
                              color: "var(--text-muted)",
                              marginRight: 4,
                            }}
                          >
                            {col.label}
                          </span>
                          <strong>{v}</strong>
                        </span>
                      );
                    })}
                </div>
              );
            })()}
          </section>

          {/* ── Per-season Career Stats (from player.careerStats archive) ── */}
          {!loading && player?.careerStats?.length > 0 && (
            <section>
              <h3
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 700,
                  marginBottom: "var(--space-2)",
                  marginTop: 0,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".07em",
                }}
              >
                Season Log
              </h3>
              <div className="table-wrapper" style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
                <Table
                  className="standings-table"
                  style={{
                    width: "100%",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 480,
                    fontSize: "0.76rem",
                  }}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        style={{
                          textAlign: "left",
                          paddingLeft: "var(--space-4)",
                        }}
                      >
                        Season
                      </TableHead>
                      <TableHead style={{ textAlign: "left" }}>Team</TableHead>
                      <TableHead style={{ textAlign: "center" }}>GP</TableHead>
                      {["QB"].includes(player.pos) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>YDS</TableHead>
                          <TableHead style={{ textAlign: "center" }}>TD</TableHead>
                          <TableHead style={{ textAlign: "center" }}>INT</TableHead>
                          <TableHead style={{ textAlign: "center" }}>CMP%</TableHead>
                        </>
                      )}
                      {["RB", "FB"].includes(player.pos) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>RYDS</TableHead>
                          <TableHead style={{ textAlign: "center" }}>RTD</TableHead>
                          <TableHead style={{ textAlign: "center" }}>REC</TableHead>
                          <TableHead style={{ textAlign: "center" }}>RCYDS</TableHead>
                        </>
                      )}
                      {["WR", "TE"].includes(player.pos) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>REC</TableHead>
                          <TableHead style={{ textAlign: "center" }}>YDS</TableHead>
                          <TableHead style={{ textAlign: "center" }}>TD</TableHead>
                        </>
                      )}
                      {["DE", "DT", "LB", "CB", "S", "DL"].includes(
                        player.pos,
                      ) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>TKL</TableHead>
                          <TableHead style={{ textAlign: "center" }}>SCK</TableHead>
                          <TableHead style={{ textAlign: "center" }}>FF</TableHead>
                        </>
                      )}
                      <TableHead style={{ textAlign: "center" }}>OVR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...player.careerStats].reverse().map((line, i) => (
                      <TableRow key={i}>
                        <TableCell
                          style={{
                            paddingLeft: "var(--space-4)",
                            fontWeight: 600,
                          }}
                        >
                          {line.season}
                        </TableCell>
                        <TableCell
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "var(--text-xs)",
                          }}
                        >
                          {line.team}
                        </TableCell>
                        <TableCell style={{ textAlign: "center" }}>
                          {line.gamesPlayed}
                        </TableCell>
                        {["QB"].includes(player.pos) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.passYds?.toLocaleString()}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.passTDs}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>{line.ints}</TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.compPct?.toFixed(1)}%
                            </TableCell>
                          </>
                        )}
                        {["RB", "FB"].includes(player.pos) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.rushYds?.toLocaleString()}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.rushTDs}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.receptions}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.recYds?.toLocaleString()}
                            </TableCell>
                          </>
                        )}
                        {["WR", "TE"].includes(player.pos) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.receptions}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.recYds?.toLocaleString()}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.recTDs}
                            </TableCell>
                          </>
                        )}
                        {["DE", "DT", "LB", "CB", "S", "DL"].includes(
                          player.pos,
                        ) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.tackles}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.sacks}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>{line.ffum}</TableCell>
                          </>
                        )}
                        <TableCell style={{ textAlign: "center" }}>
                          <strong>{line.ovr}</strong>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Extension modal */}
      {extending && player && (
        <ExtensionNegotiationModal
          player={player}
          actions={actions}
          teamId={player.teamId}
          onClose={() => setExtending(false)}
          onComplete={() => {
            setExtending(false);
            fetchProfile();
          }}
        />
      )}

      <style>{`
        .rating-pill {
          display: inline-block; padding: 2px 8px;
          border-radius: var(--radius-pill);
          font-weight: 700; font-size: var(--text-sm); color: #fff;
        }
        .rating-color-elite { background: var(--accent); }
        .rating-color-good  { background: var(--success); }
        .rating-color-avg   { background: var(--warning); }
        .rating-color-bad   { background: var(--danger); }
      `}</style>
    </div>
  );
}

function badgeStyle(borderColor, bg) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--text-xs)",
    fontWeight: 700,
    border: `1px solid ${borderColor}`,
    background: bg,
    color: "var(--text)",
  };
}
