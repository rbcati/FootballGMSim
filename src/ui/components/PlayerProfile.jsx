/**
 * PlayerProfile.jsx
 *
 * Modal: accolades/legacy badges + position-aware career stats table.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import TraitBadge from "./TraitBadge";
import RadarChart from "./RadarChart";
import ExtensionNegotiationModal from "./ExtensionNegotiationModal.jsx";
import { getTeamIdentity } from "../../data/team-utils.js";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { formatMoneyM, safeRound, toFiniteNumber } from "../utils/numberFormatting.js";
import { derivePlayerContractFinancials } from "../utils/contractFormatting.js";
import { buildContractOfferInsight, toneToContractInsightColor } from "../utils/contractOfferInsights.js";
import { buildTeamIntelligence, classifyNeedFitForProspect, describeProspectProfile, describeRookieOnboarding } from "../utils/teamIntelligence.js";
import { buildTeamChemistrySummary, describePlayerMoraleContext } from "../utils/teamChemistry.js";
import { normalizeManagement, TRADE_STATUS_LABELS, TRADE_STATUS_TOOLTIPS, TRADE_STATUSES, CONTRACT_PLAN_FLAGS, CONTRACT_PLAN_LABELS, toggleContractPlan } from "../utils/playerManagement.js";
import { evaluateReSigningPriority, summarizeRetentionPlan } from "../../core/retention/reSigning.js";
import FaceAvatar from './FaceAvatar.jsx';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import { PERSONALITY_TOOLTIPS } from '../../core/development/personalitySystem.js';
import { buildPlayerProfileAnalysis } from "../../core/playerProfileAnalysis.js";
import { resolvePlayerForProfile } from "../utils/playerProfileResolver.js";
import { buildDevelopmentNotes, classifyDevelopmentTrend, getPlayerReadiness, getSchemeFitSignal, getAgeCurveContext, getDevelopmentSnapshot, getDevelopmentDrivers } from '../utils/playerDevelopmentSignals.js';
import { ToneChip, DevelopmentSignalRow, DevelopmentStatCard } from './PlayerDevelopmentUI.jsx';
import EmptyState from './EmptyState.jsx';
import { buildRouteRequestKey, buildLeagueCacheScopeKey } from "../utils/requestLoopGuard.js";
import useStableRouteRequest from "../hooks/useStableRouteRequest.js";
import { getPlayerGameLogs } from "../utils/playerGameLogs.js";
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from "../utils/dataBrowser.js";
import { buildMergedPlayerAwardTimeline, buildPlayerAwardHeaderBadges } from "../../core/playerAwardTimeline.js";
import { buildPlayerRecordContext, mergePlayerProfileSeasonRows } from "../../core/recordBookV1.js";
import { buildLegacyScoreReport, shouldShowLegacyProfileSection } from "../../core/legacyScore.js";
import { buildPlayerDevelopmentModel } from "../../core/playerDevelopmentModel.js";
import { buildProspectScoutingReport } from "../../core/scoutingModel.js";
import { buildPlayerCareerTimeline } from "../utils/playerCareerTimeline.js";
import { buildPlayerAdvancedStatsView } from "../utils/playerAdvancedStatsViewModel.js";
import { getPlayerMoraleSummary } from "../../core/mood/playerMoraleEngine.js";
import { getPlayerAwardSummary, AWARD_LABELS, AWARD_TYPES } from "../../core/awards/awardEngine.js";
import { getNegotiationContext } from "../../core/contracts/negotiationModifiers.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// Sentinel guard: rejects null, undefined, NaN, __missing_player__, and empty strings
// so that worker fetch calls are never issued for invalid player IDs.
function isValidPlayerId(id) {
  if (id == null) return false;
  const s = String(id).trim();
  return s !== '' && s !== 'NaN' && s !== '__missing_player__' && s !== 'undefined';
}

const CAREER_TIMELINE_LIMIT = 8;
const ADVANCED_ANALYTICS_EMPTY_TEXT = "Advanced tracking begins with newly simulated rich games.";

const ADVANCED_ANALYTICS_FIELDS = [
  { key: "targets", label: "Targets", shortLabel: "Tgt" },
  { key: "drops", label: "Drops", shortLabel: "Drop" },
  { key: "battedPasses", label: "Batted Passes", shortLabel: "Bat" },
  { key: "coverageTargets", label: "Coverage Targets", shortLabel: "Cov Tgt" },
  { key: "coverageCompletionsAllowed", label: "Coverage Completions Allowed", shortLabel: "Cov Cmp" },
  { key: "receptionsAllowed", label: "Receptions Allowed", shortLabel: "Rec All" },
  { key: "sacksAllowed", label: "Sacks Allowed", shortLabel: "Sck All" },
  { key: "sacksMade", label: "Sacks Made", shortLabel: "Sck Made" },
];

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

const PASS_POSITIONS = ["QB"];
const RUSH_POSITIONS = ["RB", "FB"];
const REC_POSITIONS = ["WR", "TE"];
const DEF_POSITIONS = ["CB", "S", "SS", "FS", "LB", "MLB", "OLB", "DE", "DT", "NT", "DL", "EDGE"];
const SPEC_POSITIONS = ["K", "P", "LS"];

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

function seasonSortValue(line) {
  const explicitYear = Number(line?.year ?? NaN);
  if (Number.isFinite(explicitYear)) return explicitYear;
  const token = line?.season ?? line?.seasonId;
  if (token == null) return 0;
  const resolvedYear = seasonYear(String(token));
  const numericYear = Number(resolvedYear);
  if (Number.isFinite(numericYear)) return numericYear;
  const fallbackNumber = Number(String(token).replace(/[^\d.-]/g, ""));
  return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
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


function AttrRow({ label, value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value ?? 0)));
  return (
    <div className="attr-row">
      <span className="attr-label">{label}</span>
      <div className="attr-track">
        <div
          className="attr-fill"
          style={{
            width: `${safeValue}%`,
            background: safeValue >= 80 ? 'var(--success)' : safeValue >= 60 ? 'var(--warning)' : 'var(--danger)',
          }}
        />
      </div>
      <span className="attr-value">{safeValue}</span>
    </div>
  );
}


function hasRecordedStats(stats = {}) {
  return Object.values(stats || {}).some((value) => Number(value) > 0);
}

function summarizeTrackedStats(stats = {}, position = '') {
  const pos = String(position || '').toUpperCase();
  const parts = [];
  if (Number(stats.passAtt ?? 0) > 0) parts.push(`${stats.passComp ?? 0}/${stats.passAtt ?? 0}, ${stats.passYd ?? 0} pass yds, ${stats.passTD ?? 0} TD, ${stats.interceptions ?? 0} INT`);
  if (Number(stats.rushAtt ?? 0) > 0) parts.push(`${stats.rushAtt ?? 0} car, ${stats.rushYd ?? 0} rush yds, ${stats.rushTD ?? 0} TD`);
  if (Number(stats.targets ?? 0) > 0 || Number(stats.receptions ?? 0) > 0) parts.push(`${stats.receptions ?? 0}/${stats.targets ?? 0} rec, ${stats.recYd ?? 0} rec yds, ${stats.recTD ?? 0} TD`);
  if (Number(stats.tackles ?? 0) > 0 || Number(stats.sacks ?? 0) > 0 || Number(stats.interceptions ?? 0) > 0) parts.push(`${stats.tackles ?? 0} tackles, ${stats.sacks ?? 0} sacks, ${stats.interceptions ?? 0} INT`);
  if (Number(stats.fieldGoalsAttempted ?? 0) > 0 || Number(stats.extraPointsAttempted ?? 0) > 0) parts.push(`${stats.fieldGoalsMade ?? 0}/${stats.fieldGoalsAttempted ?? 0} FG, ${stats.extraPointsMade ?? 0}/${stats.extraPointsAttempted ?? 0} XP`);
  if (Number(stats.punts ?? 0) > 0) parts.push(`${stats.punts ?? 0} punts, ${stats.puntYards ?? 0} yards`);
  if (parts.length) return parts.join(' · ');
  if (pos === 'QB') return null;
  return null;
}

function buildImpactSummary(player, context, statLine) {
  if (!hasRecordedStats(statLine)) return 'Detailed per-player stats were not recorded for this game.';
  const name = player?.name ?? 'This player';
  const line = summarizeTrackedStats(statLine, player?.pos ?? player?.position);
  if (Number(statLine.passYd ?? 0) > 0) return `${name} mattered this week by driving the passing offense: ${line}.`;
  if (Number(statLine.rushYd ?? 0) > 0) return `${name} mattered this week by creating rushing production: ${line}.`;
  if (Number(statLine.recYd ?? 0) > 0 || Number(statLine.receptions ?? 0) > 0) return `${name} mattered this week as a receiving target: ${line}.`;
  if (Number(statLine.sacks ?? 0) > 0 || Number(statLine.interceptions ?? 0) > 0 || Number(statLine.tackles ?? 0) > 0) return `${name} mattered this week on defense: ${line}.`;
  return `${name} had a tracked contribution this week: ${line}.`;
}

function getQuickTags(player) {
  const tags = [];
  const age = Number(player?.age);
  const ovr = Number(player?.ovr);
  const pot = Number(player?.potential);
  if (Number.isFinite(age) && age <= 23) tags.push('rookie/developing');
  if (Number.isFinite(age) && age >= 30) tags.push('veteran');
  if (Number.isFinite(ovr) && ovr >= 85) tags.push('star');
  if (Number.isFinite(pot) && Number.isFinite(ovr) && pot >= ovr + 8) tags.push('developing upside');
  if (player?.depthRank === 1 || player?.starter === true || player?.isStarter === true) tags.push('starter');
  return tags;
}

const sectionLabelStyle = {
  margin: "0 0 var(--space-2)",
  fontSize: "var(--text-xs)",
  fontWeight: 800,
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

function getAdvancedAnalyticsFocusKeys(position) {
  const pos = String(position ?? "").toUpperCase();
  const keys = new Set();

  if (["WR", "TE", "RB", "FB"].includes(pos)) {
    keys.add("targets");
    keys.add("drops");
  }
  if (["OL", "OT", "OG", "C", "G", "T", "QB"].includes(pos)) {
    keys.add("sacksAllowed");
  }
  if (["EDGE", "DL", "DE", "DT", "NT", "LB", "MLB", "OLB"].includes(pos)) {
    keys.add("sacksMade");
    keys.add("battedPasses");
  }
  if (["CB", "S", "SS", "FS", "LB", "MLB", "OLB"].includes(pos)) {
    keys.add("coverageTargets");
    keys.add("coverageCompletionsAllowed");
    keys.add("receptionsAllowed");
  }

  return keys;
}

function formatAdvancedStat(value) {
  return Number(value ?? 0).toLocaleString();
}

function AdvancedAnalyticsSection({ advancedView, player }) {
  const focusKeys = getAdvancedAnalyticsFocusKeys(player?.pos ?? player?.position);

  return (
    <section className="card-enter" data-testid="player-profile-advanced-analytics">
      <h3 style={sectionLabelStyle}>Advanced Analytics</h3>
      {!advancedView?.hasData ? (
        <p
          data-testid="player-profile-advanced-empty"
          style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}
        >
          {ADVANCED_ANALYTICS_EMPTY_TEXT}
        </p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <div
            data-testid="player-profile-advanced-career"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
              gap: 8,
            }}
          >
            {ADVANCED_ANALYTICS_FIELDS.map((field) => {
              const isFocus = focusKeys.has(field.key);
              return (
                <div
                  key={field.key}
                  className="stat-box"
                  data-focus={isFocus ? "true" : "false"}
                  style={{
                    padding: "8px 10px",
                    border: isFocus ? "1px solid var(--accent)" : "1px solid var(--hairline)",
                  }}
                >
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>
                    {field.label}
                  </div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                    {formatAdvancedStat(advancedView.career?.[field.key])}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="table-wrapper player-career-table-wrap"
            data-testid="player-profile-advanced-ledger-wrap"
            role="region"
            aria-label="Player advanced season ledger - scroll horizontally to view all columns"
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-md)",
              maxWidth: "100%",
            }}
          >
            <Table
              className="standings-table"
              data-testid="player-profile-advanced-ledger"
              style={{
                width: "100%",
                minWidth: 780,
                fontSize: "0.76rem",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <TableHeader>
                <TableRow>
                  <TableHead style={{ textAlign: "left" }}>Year/Season</TableHead>
                  {ADVANCED_ANALYTICS_FIELDS.map((field) => (
                    <TableHead key={field.key} style={{ textAlign: "right" }}>
                      {field.shortLabel}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {advancedView.seasons.map((row) => (
                  <TableRow key={`advanced-season-${row.season}`}>
                    <TableCell style={{ fontWeight: 700 }}>{row.season}</TableCell>
                    {ADVANCED_ANALYTICS_FIELDS.map((field) => (
                      <TableCell key={`${row.season}-${field.key}`} style={{ textAlign: "right" }}>
                        {formatAdvancedStat(row[field.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Look up a team's full name, delegating to the shared getTeamIdentity utility. */
function getTeamName(teamId, teams) {
  return getTeamIdentity(teamId, teams).name;
}


function PlayerProfileSkeleton() {
  return (
    <div style={{ padding: "var(--space-4)", display: "grid", gap: 10 }}>
      <div style={{ height: 22, width: "42%", borderRadius: 8, background: "var(--surface-strong)" }} />
      <div style={{ height: 14, width: "58%", borderRadius: 6, background: "var(--surface-strong)" }} />
      <div style={{ height: 12, width: "100%", borderRadius: 6, background: "var(--surface-strong)" }} />
      <div style={{ height: 12, width: "90%", borderRadius: 6, background: "var(--surface-strong)" }} />
      <div style={{ height: 220, width: "100%", borderRadius: 10, background: "var(--surface-strong)" }} />
    </div>
  );
}

export default function PlayerProfile({
  playerId,
  onClose,
  actions,
  teams = [],
  league = null,
  onNavigate = null,
  onOpenBoxScore = null,
  isUserOnClock = false,
  onDraftPlayer = null,
  profileContext = null,
  onFocusLeagueHistorySeason = null,
}) {

  const [data, setData] = useState(null);
  const [archivedSeasons, setArchivedSeasons] = useState([]);
  const [recordBook, setRecordBook] = useState(null);
  const [extending, setExtending] = useState(false);
  const [showProjections, setShowProjections] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState("Overview");
  const [draftContext, setDraftContext] = useState(null);
  const [seasonLogSearch, setSeasonLogSearch] = useState("");
  const [seasonLogTeamFilter, setSeasonLogTeamFilter] = useState("all");
  const [seasonLogSortKey, setSeasonLogSortKey] = useState("season");
  const [seasonLogSortDirection, setSeasonLogSortDirection] = useState("desc");
  const [careerTransactions, setCareerTransactions] = useState([]);
  const [showAllCareerTimeline, setShowAllCareerTimeline] = useState(false);
  const requestKey = useMemo(() => buildRouteRequestKey("player", playerId), [playerId]);
  const cacheScopeKey = useMemo(() => buildLeagueCacheScopeKey(league), [league]);
  const fetchProfileData = React.useCallback(async () => {
    const response = await actions?.getPlayerCareer?.(playerId);
    return response?.payload ?? response ?? null;
  }, [actions, playerId]);
  const {
    data: fetchedData,
    loading,
    error: requestError,
    refresh: fetchProfile,
  } = useStableRouteRequest({
    requestKey,
    cacheScopeKey,
    enabled: isValidPlayerId(playerId),
    fetcher: fetchProfileData,
    warnLabel: 'PlayerProfile',
    clearDataOnLoad: false,
  });

  useEffect(() => {
    if (requestError) {
      console.error("Failed to load player profile:", requestError);
    }
  }, [requestError]);

  useEffect(() => {
    let cancelled = false;
    if (!actions?.getAllSeasons || !isValidPlayerId(playerId)) {
      setArchivedSeasons([]);
      return () => { cancelled = true; };
    }
    actions
      .getAllSeasons()
      .then((res) => {
        if (cancelled) return;
        setArchivedSeasons(res?.payload?.seasons ?? res?.seasons ?? []);
      })
      .catch(() => {
        if (!cancelled) setArchivedSeasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [actions, playerId]);

  useEffect(() => {
    let cancelled = false;
    if (!actions?.getPlayerDraftContext || !isValidPlayerId(playerId)) {
      setDraftContext(null);
      return () => {
        cancelled = true;
      };
    }
    actions
      .getPlayerDraftContext(playerId)
      .then((res) => {
        if (cancelled) return;
        setDraftContext(res?.payload?.context ?? null);
      })
      .catch(() => {
        if (!cancelled) setDraftContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [actions, playerId]);

  useEffect(() => {
    let cancelled = false;
    if (!actions?.getRecords || !isValidPlayerId(playerId)) {
      setRecordBook(null);
      return () => { cancelled = true; };
    }
    actions
      .getRecords()
      .then((res) => {
        if (cancelled) return;
        setRecordBook(res?.payload?.recordBook ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecordBook(null);
      });
    return () => { cancelled = true; };
  }, [actions, playerId]);

  useEffect(() => {
    if (fetchedData) setData(fetchedData);
  }, [fetchedData]);

  useEffect(() => {
    let cancelled = false;
    if (!actions?.getTransactions || !isValidPlayerId(playerId)) {
      setCareerTransactions([]);
      return () => { cancelled = true; };
    }
    actions
      .getTransactions({ playerId: Number(playerId), limit: 100 })
      .then((res) => {
        if (cancelled) return;
        const txs = res?.payload?.transactions ?? [];
        setCareerTransactions(Array.isArray(txs) ? txs : []);
      })
      .catch(() => {
        if (!cancelled) setCareerTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [actions, playerId]);

  useEffect(() => {
    setShowAllCareerTimeline(false);
  }, [playerId]);

  const fetchedPlayer = data?.player;
  const resolvedProfile = useMemo(() => resolvePlayerForProfile({ playerId, league, context: profileContext ?? {} }), [playerId, league, profileContext]);
  const player = fetchedPlayer ?? resolvedProfile.player;
  const effectivePlayer = player;
  const playerView = effectivePlayer;
  const recordBookLines = useMemo(
    () => buildPlayerRecordContext(recordBook, effectivePlayer ?? { id: playerId }),
    [recordBook, effectivePlayer, playerId],
  );
  const legacyReport = useMemo(() => {
    if (!effectivePlayer) return null;
    return buildLegacyScoreReport(effectivePlayer, {
      recordBook,
      archivedSeasons,
      teams,
    });
  }, [effectivePlayer, recordBook, archivedSeasons, teams]);

  const legacyStatusLabel = useMemo(() => {
    if (!legacyReport || !playerView) return null;
    if (playerView.hof) return "Hall of Fame inductee";
    const st = String(playerView.status ?? "");
    if (st !== "retired") {
      return legacyReport.recommendation === "legacy_watch" ? "Legacy watch" : "Active — building résumé";
    }
    if (legacyReport.recommendation === "borderline") return "Borderline — résumé under review";
    if (legacyReport.recommendation === "induct") return "Qualified résumé (enshrinement tracked in league history)";
    return "Not in Hall of Fame — keep watching accolades and records";
  }, [legacyReport, playerView]);
  const playerMissing = !isValidPlayerId(playerId) || (!loading && !effectivePlayer);
  const loadErrorMessage = requestError?.message || data?.error || null;
  const userTeam = useMemo(() => teams.find((t) => t.id === data?.meta?.userTeamId || t.id === player?.teamId), [teams, data?.meta?.userTeamId, player?.teamId]);
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: data?.meta?.week ?? 1 }), [userTeam, data?.meta?.week]);
  const isProspect = effectivePlayer?.status === "draft_eligible" || resolvedProfile.statusHint === "draft_prospect";
  const prospectProfile = useMemo(() => (isProspect ? describeProspectProfile(player) : null), [isProspect, player]);
  const needFit = useMemo(() => (isProspect ? classifyNeedFitForProspect(player?.pos, teamIntel) : null), [isProspect, player?.pos, teamIntel]);
  const chemistry = useMemo(() => buildTeamChemistrySummary(userTeam, { week: data?.meta?.week ?? 1, direction: teamIntel?.direction }), [userTeam, data?.meta?.week, teamIntel]);
  const moraleContext = useMemo(() => describePlayerMoraleContext(player, { team: userTeam, chemistry, week: data?.meta?.week ?? 1 }), [player, userTeam, chemistry, data?.meta?.week]);
  const onboardingContext = useMemo(() => ((isProspect || Number(player?.age ?? 30) <= 24) ? describeRookieOnboarding(player, teamIntel) : null), [isProspect, player, teamIntel]);
  const contractMarketRead = useMemo(() => buildContractOfferInsight(player ?? {}, { capRoom: userTeam?.capRoom, team: userTeam, teamIntel }), [player, userTeam, teamIntel]);
  const developmentSignal = useMemo(() => classifyDevelopmentTrend(player), [player]);
  const readinessSignal = useMemo(() => getPlayerReadiness(player), [player]);
  const fitSignal = useMemo(() => getSchemeFitSignal(player), [player]);
  const developmentNotes = useMemo(() => buildDevelopmentNotes(player, moraleContext), [player, moraleContext]);
  const ageCurve = useMemo(() => getAgeCurveContext(player), [player]);
  const developmentSnapshot = useMemo(() => getDevelopmentSnapshot(player), [player]);
  const developmentDrivers = useMemo(() => getDevelopmentDrivers(player, moraleContext), [player, moraleContext]);
  const developmentArcModel = useMemo(
    () => buildPlayerDevelopmentModel(effectivePlayer, { developmentContext: effectivePlayer?.developmentContext }),
    [effectivePlayer],
  );
  const prospectScoutingReport = useMemo(
    () => (isProspect ? buildProspectScoutingReport(player, { team: userTeam }) : null),
    [isProspect, player, userTeam],
  );

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
  const columns = getColumns(effectivePlayer?.pos);

  // Group accolades: condense SB_RING into count
  const accolades = Array.isArray(effectivePlayer?.accolades) ? effectivePlayer.accolades : [];
  const ringCount = accolades.filter((a) => a.type === "SB_RING").length;
  const nonRing = accolades
    .filter((a) => a.type !== "SB_RING")
    .sort((a, b) => b.year - a.year);
  const mergedAwardTimeline = useMemo(
    () => buildMergedPlayerAwardTimeline(
      effectivePlayer?.id,
      Array.isArray(effectivePlayer?.accolades) ? effectivePlayer.accolades : [],
      archivedSeasons,
      teams,
    ),
    [effectivePlayer?.id, effectivePlayer?.accolades, archivedSeasons, teams],
  );
  const awardHeaderBadges = useMemo(
    () => buildPlayerAwardHeaderBadges(mergedAwardTimeline),
    [mergedAwardTimeline],
  );
  const careerTimelineModel = useMemo(
    () => buildPlayerCareerTimeline({
      player: effectivePlayer,
      league,
      transactions: careerTransactions,
      awardRows: mergedAwardTimeline.rows,
      recordRows: recordBookLines,
      assumeTransactionsRelevant: true,
    }),
    [careerTransactions, effectivePlayer, league, mergedAwardTimeline.rows, recordBookLines],
  );
  const careerTimelineRows = showAllCareerTimeline
    ? careerTimelineModel.rows
    : careerTimelineModel.rows.slice(0, CAREER_TIMELINE_LIMIT);
  const summaryChips = getPlayerSummaryChips(player, ringCount, nonRing);
  const accoladesByYear = [...accolades].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const mergedProfileSeasonRows = useMemo(
    () => mergePlayerProfileSeasonRows(effectivePlayer, archivedSeasons),
    [effectivePlayer, archivedSeasons],
  );
  const seasonLogTeamOptions = useMemo(
    () => uniqueFilterOptions(mergedProfileSeasonRows, (line) => line?.team ?? null),
    [mergedProfileSeasonRows],
  );
  const seasonLogPrimaryStat = useMemo(() => {
    const pos = String(effectivePlayer?.pos ?? effectivePlayer?.position ?? "").toUpperCase();
    if (pos === "QB") return { key: "passYds", label: "Pass Yds" };
    if (["RB", "FB"].includes(pos)) return { key: "rushYds", label: "Rush Yds" };
    if (["WR", "TE"].includes(pos)) return { key: "recYds", label: "Rec Yds" };
    if (["DE", "DT", "LB", "CB", "S", "DL", "EDGE"].includes(pos)) return { key: "tackles", label: "Tackles" };
    if (pos === "K") return { key: "fgMade", label: "FG Made" };
    return { key: "gamesPlayed", label: "Games" };
  }, [effectivePlayer?.pos, effectivePlayer?.position]);
  const seasonLogRows = useMemo(() => {
    const filtered = mergedProfileSeasonRows
      .filter((line) => seasonLogTeamFilter === "all" || String(line?.team ?? "—") === seasonLogTeamFilter)
      .filter((line) => rowMatchesSearch(line, seasonLogSearch, [
        (row) => row?.season ?? row?.seasonId ?? "",
        (row) => row?.year ?? "",
        (row) => row?.team ?? "",
        (row) => row?.ovr ?? "",
        (row) => row?.gamesPlayed ?? row?.gp ?? "",
        (row) => row?.passYds ?? row?.passingYards ?? "",
        (row) => row?.passTDs ?? row?.touchdowns ?? "",
        (row) => row?.rushYds ?? row?.rushingYards ?? "",
        (row) => row?.rushTDs ?? row?.rushingTDs ?? "",
        (row) => row?.receptions ?? "",
        (row) => row?.recYds ?? row?.receivingYards ?? "",
        (row) => row?.recTDs ?? row?.receivingTDs ?? "",
        (row) => row?.tackles ?? row?.totalTackles ?? "",
        (row) => row?.sacks ?? "",
        (row) => row?.defInts ?? row?.defInterceptions ?? "",
        (row) => row?.fgMade ?? "",
        (row) => row?.xpMade ?? "",
      ]));
    return stableSortRows(
      filtered,
      (line) => {
        switch (seasonLogSortKey) {
          case "team":
            return String(line?.team ?? "");
          case "games":
            return Number(line?.gamesPlayed ?? line?.gp ?? 0);
          case "primaryStat":
            return Number(line?.[seasonLogPrimaryStat.key] ?? 0);
          case "ovr":
            return Number(line?.ovr ?? 0);
          case "season":
          default:
            return seasonSortValue(line);
        }
      },
      seasonLogSortDirection,
      (line) => seasonSortValue(line),
    );
  }, [mergedProfileSeasonRows, seasonLogPrimaryStat.key, seasonLogSearch, seasonLogSortDirection, seasonLogSortKey, seasonLogTeamFilter]);
  const seasonLogShowingLabel = useMemo(
    () => buildShowingLabel(seasonLogRows.length, mergedProfileSeasonRows.length, "season"),
    [seasonLogRows.length, mergedProfileSeasonRows.length],
  );
  const teamJourney = [...new Set(mergedProfileSeasonRows.map((line) => line.team).filter(Boolean))];
  const careerArcRows = useMemo(() => {
    const seasonRows = mergedProfileSeasonRows.map((line) => ({
      year: Number(line?.year ?? 0) || (typeof line?.season === 'number' ? line.season : 0),
      label: `Season ${line?.season ?? "—"}`,
      detail: `${line?.team ?? "FA"} · OVR ${line?.ovr ?? "—"}`,
    }));
    const awardRows = accoladesByYear.map((acc) => ({
      year: Number(acc?.year ?? 0),
      label: String(acc?.type ?? "Award").replaceAll("_", " "),
      detail: acc?.type === "SB_RING" ? "Championship ring earned" : "Career accolade",
    }));
    return [...seasonRows, ...awardRows]
      .filter((row) => Number.isFinite(row.year) && row.year > 0)
      .sort((a, b) => b.year - a.year)
      .slice(0, 12);
  }, [mergedProfileSeasonRows, accoladesByYear]);
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


  const teammates = data?.teammates ?? [];
  const devHistory = Array.isArray(player?.developmentHistory) ? player.developmentHistory : [];
  const isGodMode = !!data?.meta?.commissionerMode;
  const canShowProjectionToggle = isGodMode || String(data?.meta?.difficulty ?? '').toLowerCase() === 'easy';
  const mentorCandidates = teammates.filter((p) => Number(p.age ?? 0) >= 28 && Number(p?.personalityProfile?.leadership ?? 0) >= 65 && String(p.id) !== String(player?.id));
  const devChartData = useMemo(() => ({
    labels: devHistory.map((d) => String(d.season ?? d.age ?? '—')),
    datasets: [
      { label: 'Physical', data: devHistory.map((d) => d.physical ?? null), borderColor: '#60a5fa', backgroundColor: 'transparent' },
      { label: 'Passing', data: devHistory.map((d) => d.passing ?? null), borderColor: '#22c55e', backgroundColor: 'transparent' },
      { label: 'Rush/Rec', data: devHistory.map((d) => d.rushingReceiving ?? null), borderColor: '#f59e0b', backgroundColor: 'transparent' },
      { label: 'Blocking', data: devHistory.map((d) => d.blocking ?? null), borderColor: '#a78bfa', backgroundColor: 'transparent' },
      { label: 'Defense', data: devHistory.map((d) => d.defense ?? null), borderColor: '#f43f5e', backgroundColor: 'transparent' },
      { label: 'Kicking', data: devHistory.map((d) => d.kicking ?? null), borderColor: '#14b8a6', backgroundColor: 'transparent' },
    ],
  }), [devHistory]);

  const playerAdvancedStatsArchive =
    league?.playerSeasonStatsArchive
    ?? league?.meta?.playerSeasonStatsArchive
    ?? data?.meta?.playerSeasonStatsArchive
    ?? null;
  const playerAdvancedStatsView = useMemo(
    () => buildPlayerAdvancedStatsView(effectivePlayer?.id ?? playerId, playerAdvancedStatsArchive),
    [effectivePlayer?.id, playerId, playerAdvancedStatsArchive],
  );
  const careerRows = useMemo(() => mergedProfileSeasonRows, [mergedProfileSeasonRows]);
  const careerTotals = useMemo(() => {
    const posU = String(effectivePlayer?.pos ?? effectivePlayer?.position ?? '').toUpperCase();
    const defSkill = ['DE', 'DT', 'LB', 'CB', 'S', 'DL', 'EDGE'].includes(posU);
    return careerRows.reduce((totals, line) => ({
      gamesPlayed: totals.gamesPlayed + Number(line?.gamesPlayed ?? line?.gp ?? 0),
      passYds: totals.passYds + Number(line?.passYds ?? line?.passingYards ?? 0),
      passTDs: totals.passTDs + Number(line?.passTDs ?? line?.touchdowns ?? 0),
      rushYds: totals.rushYds + Number(line?.rushYds ?? line?.rushingYards ?? 0),
      rushTDs: totals.rushTDs + Number(line?.rushTDs ?? line?.rushingTDs ?? 0),
      receptions: totals.receptions + Number(line?.receptions ?? 0),
      recYds: totals.recYds + Number(line?.recYds ?? line?.receivingYards ?? 0),
      recTDs: totals.recTDs + Number(line?.recTDs ?? line?.receivingTDs ?? 0),
      tackles: totals.tackles + Number(line?.tackles ?? line?.totalTackles ?? 0),
      sacks: totals.sacks + Number(line?.sacks ?? 0),
      interceptions: totals.interceptions + (defSkill
        ? Number(line?.defInts ?? line?.defInterceptions ?? 0)
        : Number(line?.interceptions ?? line?.ints ?? 0)),
    }), {
      gamesPlayed: 0, passYds: 0, passTDs: 0, rushYds: 0, rushTDs: 0, receptions: 0, recYds: 0, recTDs: 0, tackles: 0, sacks: 0, interceptions: 0,
    });
  }, [careerRows, effectivePlayer?.pos, effectivePlayer?.position]);
  const careerSeasonLogPrimaryTotal = useMemo(() => {
    return careerRows.reduce((sum, line) => {
      if (seasonLogPrimaryStat.key === "gamesPlayed") return sum + Number(line?.gamesPlayed ?? line?.gp ?? 0);
      return sum + Number(line?.[seasonLogPrimaryStat.key] ?? 0);
    }, 0);
  }, [careerRows, seasonLogPrimaryStat.key]);

  const profileAnalysis = useMemo(() => buildPlayerProfileAnalysis({ player: effectivePlayer, team: resolvedProfile.team, league, context: profileContext ?? {} }), [effectivePlayer, resolvedProfile.team, league, profileContext]);
  const playerGameLogs = useMemo(() => getPlayerGameLogs(league, effectivePlayer), [league, effectivePlayer]);
  const currentSeasonTotals = useMemo(() => {
    if (!league || !playerGameLogs.length) return null;
    const seenGames = new Set();
    const totals = {
      gamesPlayed: 0,
      passAtt: 0,
      passComp: 0,
      passYd: 0,
      passTD: 0,
      interceptions: 0,
      rushAtt: 0,
      rushYd: 0,
      rushTD: 0,
      receptions: 0,
      targets: 0,
      recYd: 0,
      recTD: 0,
      tackles: 0,
      sacks: 0,
    };
    for (const row of playerGameLogs) {
      const gameKey = row.gameId ? String(row.gameId) : `w${row.week}`;
      if (seenGames.has(gameKey)) continue;
      seenGames.add(gameKey);
      const s = row.stats ?? {};
      totals.gamesPlayed += 1;
      totals.passAtt += Number(s.passAtt ?? 0);
      totals.passComp += Number(s.passComp ?? 0);
      totals.passYd += Number(s.passYd ?? 0);
      totals.passTD += Number(s.passTD ?? 0);
      totals.interceptions += Number(s.interceptions ?? 0);
      totals.rushAtt += Number(s.rushAtt ?? 0);
      totals.rushYd += Number(s.rushYd ?? 0);
      totals.rushTD += Number(s.rushTD ?? 0);
      totals.receptions += Number(s.receptions ?? 0);
      totals.targets += Number(s.targets ?? 0);
      totals.recYd += Number(s.recYd ?? 0);
      totals.recTD += Number(s.recTD ?? 0);
      totals.tackles += Number(s.tackles ?? 0);
      totals.sacks += Number(s.sacks ?? 0);
    }
    return totals;
  }, [league, playerGameLogs]);
  const contextStatLine = profileContext?.statLine ?? profileContext?.player?.stats ?? null;
  const hasThisWeekContext = Boolean(profileContext?.source === 'game-book' || profileContext?.source === 'weekly-results' || profileContext?.gameId);
  const thisWeekLine = contextStatLine && hasRecordedStats(contextStatLine) ? summarizeTrackedStats(contextStatLine, player?.pos ?? player?.position) : null;
  const thisWeekSummary = hasThisWeekContext ? buildImpactSummary(player, profileContext, contextStatLine) : null;
  const quickTags = getQuickTags(player);
  const primarySeasonTotals = (currentSeasonTotals && hasRecordedStats(currentSeasonTotals)) ? currentSeasonTotals : latestTotals;
  const seasonStatsRecorded = hasRecordedStats(primarySeasonTotals);
  const gmContext = profileAnalysis?.recommendationContext ?? {};
  const hasGmContext = Boolean(
    gmContext?.sourceLabel || gmContext?.reason || gmContext?.comparisonReceipt || gmContext?.recommendation || gmContext?.fitScore != null || gmContext?.capImpactLabel || gmContext?.valueLabel
  );


  if (playerMissing) {
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
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--surface-elevated)",
            width: "min(520px, 100%)",
            borderRadius: 12,
            border: "1px solid var(--hairline)",
            padding: 16,
            display: "grid",
            gap: 10,
          }}
        >
          <strong>Player profile unavailable</strong>
          <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            {loadErrorMessage ? `Reason: ${loadErrorMessage}.` : "The selected player could not be loaded."}
          </div>
          <div>
            <Button className="btn" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="player-profile"
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
        {isUserOnClock && onDraftPlayer && playerView && (
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
              ★ You're on the clock! Draft {playerView.name}?
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
          data-testid="player-profile-summary"
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
            <PlayerProfileSkeleton />
          ) : playerView ? (
            <div
              style={{
                display: "flex",
                gap: "var(--space-4)",
                alignItems: "flex-start",
                flex: 1,
              }}
            >
              {/* Avatar */}
              <FaceAvatar
                face={playerView.face}
                seed={playerView.id ?? playerView.name}
                size={54}
                style={{ flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.1rem, 4.8vw, 1.7rem)",
                    fontWeight: 900,
                    lineHeight: 1.15,
                  }}
                >
                  {playerView.name}
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--text-sm)",
                    marginTop: 4,
                  }}
                >
                  {playerView.pos ?? playerView.position ?? "POS —"} · Age {playerView.age ?? "—"} ·{" "}
                  {playerView.teamId != null
                    ? getTeamName(playerView.teamId, teams)
                    : playerView.status === "retired" ? "Retired" : "Team unavailable"}
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
                    className={`rating-pill rating-color-${playerView.ovr >= 85 ? "elite" : playerView.ovr >= 75 ? "good" : "avg"}`}
                  >
                    {playerView.ovr} OVR
                  </span>
                  {playerView.progressionDelta != null &&
                    playerView.progressionDelta !== 0 && (
                      <span
                        className={
                          playerView.progressionDelta > 0
                            ? "text-success"
                            : "text-danger"
                        }
                        style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}
                      >
                        ({playerView.progressionDelta > 0 ? "+" : ""}
                        {playerView.progressionDelta})
                      </span>
                    )}
                  {playerView.potential != null && (
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "var(--text-sm)",
                        fontWeight: 700,
                      }}
                    >
                      Pot: {playerView.potential}
                    </span>
                  )}
                </div>


                <div style={{ marginTop: "var(--space-2)", display: "flex", gap: 6, flexWrap: "wrap", fontSize: "var(--text-xs)" }}>
                  <span className="status-chip info">Contract: {summaryChips.find((chip) => chip.label === "Contract")?.value ?? "Not available"}</span>
                  <span className="status-chip muted">Status: {playerView.injuryWeeksRemaining > 0 ? `Out ${playerView.injuryWeeksRemaining}w` : "Available"}</span>
                  {playerView.draftYear || playerView.draftRound || playerView.draftPick ? <span className="status-chip muted">Draft: {playerView.draftYear ?? "—"} R{playerView.draftRound ?? "—"} P{playerView.draftPick ?? "—"}</span> : null}
                  {quickTags.map((tag) => <span key={tag} className="status-chip success">{tag}</span>)}
                  {(player?.contract?.tag === 'franchise' || player?.isTagged) && (
                    <span className="status-chip warning" title="Franchise Tagged — player is locked to this team for the season.">Franchise Tagged</span>
                  )}
                  {player?.contract?.tender && !player?.contract?.tag && (
                    <span className="status-chip info" title={`RFA Tender — signing this player away requires forfeiting a ${player.contract.compensationPick ?? player.contract.tender.replace(/_/g, ' ')} draft pick.`}>
                      RFA Tender ({player.contract.tender.replace(/_/g, ' ')})
                    </span>
                  )}
                </div>

                {draftContext?.known ? (
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--hairline)",
                      background: "var(--surface-strong)",
                      fontSize: "var(--text-xs)",
                    }}
                    data-testid="player-profile-draft-memory"
                  >
                    <div style={sectionLabelStyle}>Draft memory</div>
                    <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
                      {draftContext.draftedByAbbr ? (
                        <span>
                          Drafted by <strong style={{ color: "var(--text)" }}>{draftContext.draftedByAbbr}</strong>
                          {draftContext.draftYear != null ? ` · ${draftContext.draftYear}` : ""}
                          {draftContext.round != null ? ` · R${draftContext.round}` : ""}
                          {draftContext.pickInRound != null ? ` pick ${draftContext.pickInRound}` : ""}
                          {draftContext.overall != null ? ` (#${draftContext.overall})` : ""}
                        </span>
                      ) : (
                        <span>Draft origin partially logged.</span>
                      )}
                    </div>
                    {draftContext.redraftRank != null ? (
                      <div style={{ marginTop: 6, color: "var(--text)" }}>
                        Redraft rank (class): <strong>#{draftContext.redraftRank}</strong>
                        {draftContext.outcomeLabel ? <span style={{ color: "var(--text-muted)" }}> · {draftContext.outcomeLabel}</span> : null}
                      </div>
                    ) : null}
                    {draftContext.stealBustNote ? (
                      <div style={{ marginTop: 6, color: "var(--text-subtle)" }}>{draftContext.stealBustNote}</div>
                    ) : null}
                  </div>
                ) : null}

                {playerView.developmentContext && (
                  <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                    Dev path: {playerView.developmentContext.baseAgeCurve} · Focus {String(playerView.developmentContext.trainingFocus || 'balanced').replace('_', ' ')} · Staff mod {playerView.developmentContext.staffDevelopmentModifier >= 0 ? '+' : ''}{playerView.developmentContext.staffDevelopmentModifier}% · {playerView.developmentContext.playingTimeModifier}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                  Trend: {developmentSignal.label} · Readiness: {readinessSignal.label} · Scheme: {fitSignal.label}
                </div>
                <DevelopmentSignalRow
                  items={[
                    { label: developmentSignal.label, tone: developmentSignal.tone },
                    { label: readinessSignal.label, tone: readinessSignal.tone },
                    { label: `${fitSignal.label} (${player?.schemeFit ?? 50})`, tone: fitSignal.tone },
                    { label: ageCurve.label, tone: ageCurve.tone },
                  ]}
                />

                {/* ── Morale Indicator ── */}
                {playerView && (() => {
                  const moraleSummary = getPlayerMoraleSummary(playerView);
                  const moraleColor = moraleSummary.score >= 85 ? 'var(--success)'
                                    : moraleSummary.score >= 70 ? 'var(--text-muted)'
                                    : moraleSummary.score >= 55 ? 'var(--text-subtle)'
                                    : moraleSummary.score >= 40 ? 'var(--warning)'
                                    : 'var(--danger)';
                  return (
                    <div
                      data-testid="player-profile-morale"
                      style={{
                        marginTop: 'var(--space-2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Morale</span>
                      <span
                        data-testid="player-profile-morale-label"
                        style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: moraleColor }}
                      >
                        {moraleSummary.label}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>({moraleSummary.score})</span>
                      {moraleSummary.topEvent?.reason && (
                        <span
                          data-testid="player-profile-morale-reason"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontStyle: 'italic' }}
                        >
                          · {moraleSummary.topEvent.reason}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* ── Career Awards Trophy Shelf ── */}
                {playerView && (() => {
                  const awardSummary = getPlayerAwardSummary(playerView);
                  if (awardSummary.totalAwards === 0) return null;
                  const teams = data?.teams ?? [];
                  const teamAbbrById = new Map(teams.map(t => [String(t.id), t.abbr ?? t.name]));
                  return (
                    <div
                      data-testid="player-profile-career-awards"
                      style={{
                        marginTop: 'var(--space-2)',
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--hairline)',
                        background: 'var(--surface-strong)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-muted)', marginBottom: 6 }}>
                        Career Awards
                      </div>
                      {awardSummary.summaryLine && (
                        <div
                          data-testid="player-profile-award-summary"
                          style={{ fontWeight: 700, color: 'var(--warning)', fontSize: 'var(--text-sm)', marginBottom: 6 }}
                        >
                          {awardSummary.summaryLine}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {awardSummary.highlights.map((h) => (
                          <div key={h.dedupeKey} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                            <span style={{ color: 'var(--text-subtle)', minWidth: 36 }}>{h.season}</span>
                            <span style={{ color: 'var(--text)' }}>{h.label}</span>
                            {h.teamId != null && (
                              <span style={{ color: 'var(--text-muted)' }}>· {teamAbbrById.get(String(h.teamId)) ?? h.teamId}</span>
                            )}
                          </div>
                        ))}
                        {awardSummary.totalAwards > awardSummary.highlights.length && (
                          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            +{awardSummary.totalAwards - awardSummary.highlights.length} more awards
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Negotiation Profile ── */}
                {playerView && (() => {
                  const moraleSummary = getPlayerMoraleSummary(playerView);
                  const awardSummary = getPlayerAwardSummary(playerView);
                  const currentSeason = Number(data?.meta?.season ?? 0);
                  const userTeamId = Number(data?.meta?.userTeamId ?? 0);
                  const negCtx = getNegotiationContext(playerView, data?.meta ?? {}, { moraleSummary, awardSummary, currentSeason, userTeamId });
                  if (!negCtx.feedbackLine && negCtx.leverageLabel === 'Standard') return null;
                  const leverageColor = negCtx.leverageLabel === 'High Leverage' ? 'var(--warning)'
                                       : negCtx.leverageLabel === 'Discount' ? 'var(--success)'
                                       : 'var(--text-muted)';
                  return (
                    <div
                      data-testid="player-profile-negotiation"
                      style={{
                        marginTop: 'var(--space-2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Negotiation</span>
                      <span
                        data-testid="player-profile-leverage-label"
                        style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: leverageColor }}
                      >
                        {negCtx.leverageLabel}
                      </span>
                      {negCtx.feedbackLine && (
                        <span
                          data-testid="player-profile-negotiation-reason"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontStyle: 'italic' }}
                        >
                          · {negCtx.feedbackLine}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* ── Holdout Status ── */}
                {playerView?.holdout?.active && (
                  <div
                    data-testid="player-profile-holdout"
                    style={{
                      marginTop: 'var(--space-2)',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid #FF9F0A44',
                      background: '#FF9F0A0E',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontWeight: 900, color: '#FF9F0A', textTransform: 'uppercase', letterSpacing: '.07em', fontSize: 'var(--text-xs)' }}>On Holdout</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>— {playerView.holdout.reason?.replace(/_/g, ' ') ?? 'contract dispute'}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ color: 'var(--text-subtle)' }}>Started Week {playerView.holdout.startWeek}</span>
                      <span style={{ color: '#FF9F0A', fontWeight: 700 }}>+{Math.round((playerView.holdout.demandPremium ?? 0) * 100)}% demand premium</span>
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>Resolve by signing, trading, or releasing this player.</div>
                  </div>
                )}

                {!isProspect && playerView && (
                  <div
                    data-testid="player-profile-dev-arc"
                    style={{
                      marginTop: "var(--space-2)",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--hairline)",
                      background: "var(--surface-strong)",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    <div style={{ ...sectionLabelStyle, marginBottom: 6 }}>Career arc snapshot</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      <span className="status-chip info">{developmentArcModel.devStage.replace(/_/g, " ")}</span>
                      <span className="status-chip muted">{developmentArcModel.arcType.replace(/_/g, " ")}</span>
                      <span className="status-chip muted">Trend: {developmentArcModel.devTrend}</span>
                      <span className="status-chip muted">Confidence: {developmentArcModel.confidence}</span>
                    </div>
                    <div style={{ color: "var(--text-muted)", lineHeight: 1.45, marginBottom: 6 }}>
                      Ceiling band ~{developmentArcModel.ceilingBand} · Floor band ~{developmentArcModel.floorBand}
                    </div>
                    <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>{developmentArcModel.summary}</div>
                    {developmentArcModel.growthSignals[0] ? (
                      <div style={{ color: "var(--text-subtle)" }}>↑ {developmentArcModel.growthSignals[0]}</div>
                    ) : null}
                    {developmentArcModel.regressionRisks[0] ? (
                      <div style={{ color: "var(--text-subtle)" }}>↓ {developmentArcModel.regressionRisks[0]}</div>
                    ) : null}
                    <div style={{ marginTop: 6, color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>
                      {developmentArcModel.staffImpact}
                      {" · "}
                      {developmentArcModel.trainingImpact}
                      {" · "}
                      {developmentArcModel.playingTimeImpact}
                    </div>
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
                {(ringCount > 0 || nonRing.length > 0 || awardHeaderBadges.length > 0) && (
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
                    {mergedAwardTimeline.rows.length > 0
                      ? awardHeaderBadges.map((chip) => (
                          <span key={chip.key} style={badgeStyle("var(--accent)", "var(--surface-strong)")}>
                            {chip.text}
                          </span>
                        ))
                      : nonRing.map((acc, i) => {
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
                {playerView.status === "active" && player.contract?.years === 1 && (
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
                {playerView.status === "active" && player?.teamId != null && (
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
            <div data-testid="player-profile-unavailable" style={{ color: "var(--text-muted)", display: "grid", gap: 6 }}><strong>Player unavailable</strong><span>This player reference is no longer available in the loaded franchise data.</span></div>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {profileContext?.source === 'game-book' || profileContext?.returnTo === 'game-book' ? (
              <Button size="sm" variant="outline" data-testid="player-profile-return-to-game-book" onClick={() => { if (profileContext?.gameId) onOpenBoxScore?.(profileContext.gameId); onClose?.(); }}>Return to Game Book</Button>
            ) : null}
            {profileContext?.source === 'weekly-results' || profileContext?.returnTo === 'weekly-results' ? (
              <Button size="sm" variant="outline" onClick={() => { onNavigate?.('Weekly Results'); onClose?.(); }}>Return to Weekly Results</Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => { onNavigate?.('HQ'); onClose?.(); }}>Return to HQ</Button>
          </div>
          <div className="standings-tabs profile-tab-row" style={{ gap: 6, flexWrap: "nowrap" }}>
            {["Overview", "Career Stats", "Game Log"].map((tab) => (
              <button
                key={tab}
                className={`standings-tab${activeProfileTab === tab ? " active" : ""}`}
                onClick={() => setActiveProfileTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {activeProfileTab === "Overview" && (
            <>
          {hasThisWeekContext && (
            <section className="card-enter" data-testid="player-profile-game-impact">
              <h3 style={sectionLabelStyle}>This Week / Game Impact</h3>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 800 }}>{profileContext?.role ?? (profileContext?.source === 'weekly-results' ? 'From Weekly Results' : 'From Game Book')}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginTop: 4 }}>
                {profileContext?.week ? `From Week ${profileContext.week} ${profileContext?.source === 'game-book' ? 'Game Book' : 'Weekly Results'}` : 'From recent game context'}
              </div>
              <p style={{ marginTop: 8 }}>{thisWeekSummary}</p>
              {thisWeekLine ? <div className="stat-box" style={{ padding: 8 }}>{thisWeekLine}</div> : null}
            </section>
          )}
          <section className="card-enter" data-testid="player-profile-season-stats">
            <h3 style={sectionLabelStyle}>Season Stats</h3>
            {seasonStatsRecorded ? (
              <div className="stat-box" style={{ padding: 8 }}>{summarizeTrackedStats(primarySeasonTotals, player?.pos ?? player?.position) ?? 'Tracked season totals are available.'}</div>
            ) : (
              <EmptyState icon="📊" title="No tracked season stats yet" subtitle="Season stats will appear after this player records tracked stats." />
            )}
          </section>
          {!loading && playerView && (
            <section className="card-enter" data-testid="player-profile-career-timeline">
              <h3 style={sectionLabelStyle}>Career Timeline</h3>
              <div
                data-testid="player-profile-acquisition-summary"
                style={{
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px",
                  background: "var(--surface-strong)",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>How acquired</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 800, marginTop: 2 }}>{careerTimelineModel.acquisition.summary}</div>
                {careerTimelineModel.acquisition.detail ? (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 2 }}>{careerTimelineModel.acquisition.detail}</div>
                ) : null}
              </div>
              {careerTimelineRows.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {careerTimelineRows.map((row, idx) => (
                    <div
                      key={row.id ?? idx}
                      data-testid="player-profile-career-timeline-row"
                      style={{
                        border: "1px solid var(--hairline)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                        <span className="status-chip muted">{row.label ?? row.type ?? "Event"}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {row.season ? `Season ${row.season}` : ""}
                          {row.week != null ? ` - Week ${row.week}` : ""}
                          {row.teamAbbr ? ` - ${row.teamAbbr}` : ""}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>{row.summary ?? "Player event"}</div>
                      {row.detail ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{row.detail}</div> : null}
                      {row.source ? <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 4, textTransform: "uppercase" }}>{row.source}</div> : null}
                    </div>
                  ))}
                  {careerTimelineModel.rows.length > CAREER_TIMELINE_LIMIT ? (
                    <Button size="sm" variant="outline" onClick={() => setShowAllCareerTimeline((value) => !value)}>
                      {showAllCareerTimeline ? "Show less" : `Show all ${careerTimelineModel.rows.length}`}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <EmptyState title="No career timeline recorded yet." subtitle="Legacy players may not have transaction history in older saves." />
              )}
            </section>
          )}
          {!loading && hasGmContext && (
            <section className="card-enter">
              <h3 style={sectionLabelStyle}>Why this player?</h3>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {(gmContext.sourceLabel ?? "GM context")}{gmContext.action ? ` · ${gmContext.action}` : ""}
              </div>
              {gmContext.reason ? <div style={{ fontSize: 13, fontWeight: 600 }}>{gmContext.reason}</div> : null}
              {gmContext.comparisonReceipt ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{gmContext.comparisonReceipt}</div> : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {gmContext.fitScore != null ? <span className="chip">Fit {gmContext.fitScore}</span> : null}
                {gmContext.valueLabel ? <span className="chip">{gmContext.valueLabel}</span> : null}
                {gmContext.capImpactLabel ? <span className="chip">{gmContext.capImpactLabel}</span> : null}
              </div>
              {gmContext.recommendation ? <div style={{ fontSize: 12 }}>{gmContext.recommendation}</div> : null}
            </section>
          )}
          {!loading && playerView && (
            <section className="card-enter">
              <h3 style={sectionLabelStyle}>Development Tab</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {devHistory.length > 0 ? <Line data={devChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'var(--text-muted)' } } } }} height={220} /> : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No preseason development snapshots yet.</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canShowProjectionToggle && <Button size="sm" variant="outline" onClick={() => setShowProjections((v) => !v)}>{showProjections ? 'Hide' : 'Show'} projections</Button>}
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Updates after each preseason progression run.</span>
                </div>
                {showProjections && <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Projection: {(player?.potential ?? player?.ovr ?? 70)} potential ceiling • {player?.developmentContext?.mentorship ?? 'No mentorship bonus'}</div>}
                {player?.personalityProfile && <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))' }}>
                  {Object.entries(player.personalityProfile).filter(([k]) => PERSONALITY_TOOLTIPS[k]).map(([k, v]) => (
                    <div key={k} title={PERSONALITY_TOOLTIPS[k]} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 8, fontSize: 12 }}>
                      <strong style={{ textTransform: 'capitalize' }}>{k}</strong>: {Math.round(Number(v ?? 0))}
                    </div>
                  ))}
                </div>}
                {player?.teamId != null && mentorCandidates.length > 0 && actions?.assignMentor && Number(player?.age ?? 0) <= 25 && (
                  <div style={{ display: 'grid', gap: 6, maxWidth: 360 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Assign mentor</label>
                    <select value={player?.mentorship?.mentorId ?? ''} onChange={(e) => actions.assignMentor(e.target.value, player.id, player.teamId).then(fetchProfile)} style={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--hairline)', padding: '5px 8px', background: 'var(--surface)' }}>
                      <option value="">No mentor</option>
                      {mentorCandidates.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.pos})</option>)}
                    </select>
                  </div>
                )}
              </div>
            </section>
          )}
          {!loading && player && summaryChips.length > 0 && (
            <section className="card-enter">
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

          {!loading && playerView && (
            <section className="card-enter">
              <h3 style={sectionLabelStyle}>Core Attributes</h3>
              <AttrRow label="OVR" value={player?.ovr ?? 0} />
              <AttrRow label="Potential" value={player?.potential ?? player?.ovr ?? 0} />
              <AttrRow label="Morale" value={player?.morale ?? 0} />
              <AttrRow label="Scheme Fit" value={player?.schemeFit ?? 50} />
            </section>
          )}

          {!loading && player && isProspect && prospectScoutingReport && (
            <section className="card-enter" data-testid="player-profile-scouting-report">
              <h3 style={sectionLabelStyle}>Scouting snapshot</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                <span className="status-chip info">{prospectScoutingReport.scoutingGrade}</span>
                <span className="status-chip muted">Conf: {prospectScoutingReport.confidence}</span>
                <span className="status-chip muted">Risk: {prospectScoutingReport.riskLevel.replace(/_/g, " ")}</span>
                <span className="status-chip muted">↑ {prospectScoutingReport.upsideLabel.replace(/_/g, " ")}</span>
                <span className="status-chip muted">Floor: {prospectScoutingReport.floorLabel.replace(/_/g, " ")}</span>
              </div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginBottom: 4 }}>{prospectScoutingReport.projectedRole}</div>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 8 }}>{prospectScoutingReport.summary}</p>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginBottom: 6 }}>{prospectScoutingReport.schemeFitSummary}</div>
              {prospectScoutingReport.combineSignals[0] ? (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Combine: {prospectScoutingReport.combineSignals[0]}</div>
              ) : null}
              {prospectScoutingReport.interviewSignals[0] ? (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Interview: {prospectScoutingReport.interviewSignals[0]}</div>
              ) : null}
              {prospectScoutingReport.traits[0] ? (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 6 }}>Notes: {prospectScoutingReport.traits.slice(0, 2).join(" · ")}</div>
              ) : null}
            </section>
          )}
          {!loading && player && isProspect && (
            <section className="card-enter">
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


          {!loading && playerView && (
            <section className="card-enter">
              <h3 style={sectionLabelStyle}>Development Intelligence</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <DevelopmentStatCard
                  label="Trajectory"
                  value={`${developmentSignal.icon} ${developmentSignal.label}`}
                  detail={`OVR change: ${playerView.progressionDelta > 0 ? "+" : ""}${playerView.progressionDelta ?? 0}`}
                  tone={developmentSignal.tone}
                />
                <DevelopmentStatCard
                  label="Short-term readiness"
                  value={readinessSignal.label}
                  detail={readinessSignal.detail}
                  tone={readinessSignal.tone}
                />
                <DevelopmentStatCard
                  label="Scheme fit context"
                  value={`${fitSignal.label} · ${player?.schemeFit ?? 50}`}
                  detail="Best role is tied to current scheme and depth usage."
                  tone={fitSignal.tone}
                />
                <DevelopmentStatCard
                  label="Age curve"
                  value={ageCurve.label}
                  detail={`Age ${player?.age ?? "—"} · Potential ${player?.potential ?? "—"}. ${ageCurve.detail}`}
                  tone={ageCurve.tone}
                />
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                {developmentNotes.notes.slice(0, 4).map((note, idx) => (
                  <div key={`dev-note-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>• {note}</div>
                ))}
                {developmentDrivers.slice(0, 3).map((driver, idx) => (
                  <div key={`driver-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>↳ {driver}</div>
                ))}
              </div>
              {developmentSnapshot ? (
                <div style={{ marginTop: 8, border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px", background: "var(--surface-strong)" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Recent development snapshot</div>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {developmentSnapshot.topGain ? <ToneChip label={`Top gain: ${developmentSnapshot.topGain.label} +${developmentSnapshot.topGain.delta}`} tone="good" /> : null}
                    {developmentSnapshot.topDrop && developmentSnapshot.topDrop.delta < 0 ? <ToneChip label={`Top drop: ${developmentSnapshot.topDrop.label} ${developmentSnapshot.topDrop.delta}`} tone="bad" /> : null}
                    {!developmentSnapshot.topGain && !developmentSnapshot.topDrop ? <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No category-level change in latest snapshot.</span> : null}
                  </div>
                </div>
              ) : null}
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Roster")}>Review depth role</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Contract Center")}>Review extension decision</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Trade Center")}>Check trade value</Button>
              </div>
            </section>
          )}

          {!loading && playerView && (
            <section className="card-enter">
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
            <section className="card-enter">
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


          {!loading && playerView && (
            <section className="card-enter">
              <h3 style={sectionLabelStyle}>Contract Read</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Market tier</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{contractMarketRead.marketTierLabel}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 2 }}>{contractMarketRead.hasMetadata ? "From saved offer metadata" : "Market estimate from current ratings/cap context"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Cap fit</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2, color: toneToContractInsightColor(contractMarketRead.capFitTone) }}>{contractMarketRead.capFitLabel}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 2 }}>{contractMarketRead.annualValueLabel} · {contractMarketRead.termLabel}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Risk tags</div>
                  <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(contractMarketRead.riskTags.length ? contractMarketRead.riskTags : ["No major model risk tags"]).slice(0, 4).map((tag) => (
                      <span key={`profile-contract-${tag}`} style={{ fontSize: 11, border: "1px solid var(--hairline)", borderRadius: 999, padding: "2px 8px", color: "var(--text-subtle)" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              {contractMarketRead.reasonBullets.length > 0 ? (
                <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
                  {contractMarketRead.reasonBullets.map((reason, idx) => (
                    <div key={`profile-contract-reason-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>• Why this deal? {reason}</div>
                  ))}
                </div>
              ) : null}
            </section>
          )}


          {!loading && playerView && (
            <section className="card-enter">
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
                    {(player?.contract?.tag === 'franchise' || player?.isTagged) && (
                      <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--surface-strong)", border: "1px solid var(--warning, #f59e0b)", fontSize: "var(--text-xs)", fontWeight: 700 }}>
                        Franchise Tagged — this player is locked to the team. They cannot sign with another franchise.
                      </div>
                    )}
                    {player?.contract?.tender && !player?.contract?.tag && (
                      <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--surface-strong)", border: "1px solid var(--hairline)", fontSize: "var(--text-xs)", fontWeight: 700 }}>
                        RFA Tender ({player.contract.tender.replace(/_/g, ' ')}) — another team may sign this player, but must forfeit a {player.contract.compensationPick ?? player.contract.tender.replace(/_/g, ' ')} draft pick as compensation.
                      </div>
                    )}
                  </>
                );
              })()}
            </section>
          )}


          {!loading && playerView && (
            <section className="card-enter">
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

          {!loading && playerView && shouldShowLegacyProfileSection(legacyReport, playerView) && legacyReport && (
            <section className="card-enter" data-testid="player-profile-legacy-watch">
              <h3 style={sectionLabelStyle}>Legacy &amp; Hall of Fame</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Legacy score</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>
                    {legacyReport.legacyScore}
                    {legacyReport.tier ? <span style={{ color: "var(--text-muted)", fontWeight: 600, marginLeft: 6 }}>({legacyReport.tier})</span> : null}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Status</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{legacyStatusLabel}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Best season</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{bestSeason ? seasonYear(bestSeason.seasonId) : "—"}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Championships</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{ringCount}</div>
                </div>
                <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>Team journey</div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2 }}>{teamJourney.length ? teamJourney.join(" → ") : "Single team / N/A"}</div>
                </div>
              </div>
              {legacyReport.breakdown && (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", marginTop: 8, marginBottom: 0 }}>
                  Breakdown: production {legacyReport.breakdown.production} · awards {legacyReport.breakdown.awards} · records {legacyReport.breakdown.records} ·
                  titles {legacyReport.breakdown.championships} · longevity {legacyReport.breakdown.longevity} · peak {legacyReport.breakdown.peak}
                </p>
              )}
              {Array.isArray(legacyReport.reasons) && legacyReport.reasons.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.45 }}>
                  {legacyReport.reasons.slice(0, 4).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {careerHighs.length > 0 && (
            <section className="card-enter">
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

          {!loading && playerView && (
            <section className="card-enter" data-testid="player-profile-award-timeline">
              <h3 style={sectionLabelStyle}>Awards &amp; honors</h3>
              {mergedAwardTimeline.rows.length === 0 ? (
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", margin: 0 }}>No archived awards yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {mergedAwardTimeline.rows.map((row, idx) => (
                    <div
                      key={`${row.year}-${row.canonical}-${idx}`}
                      style={{
                        fontSize: "var(--text-sm)",
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        gap: 8,
                        borderBottom: "1px solid var(--hairline)",
                        paddingBottom: 6,
                      }}
                    >
                      <span>
                        <strong style={{ color: "var(--text)" }}>{row.year}</strong>
                        <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{row.label}</span>
                      </span>
                      <span style={{ color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>
                        {row.teamAbbr ? `${row.teamAbbr}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {!loading && playerView && recordBookLines.length > 0 && (
            <section className="card-enter" data-testid="player-profile-record-book">
              <h3 style={sectionLabelStyle}>Record book</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {recordBookLines.map((line) => (
                  <li key={`${line.kind}-${line.recordKey}-${line.text}`}>{line.text}</li>
                ))}
              </ul>
            </section>
          )}

          {careerArcRows.length > 0 && (
            <section className="card-enter">
              <h3 style={sectionLabelStyle}>Career Arc</h3>
              <div style={{ display: "grid", gap: 4 }}>
                {careerArcRows.map((row, idx) => (
                  <div key={`${row.year}-${row.label}-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span><strong style={{ color: "var(--text)" }}>{row.year}</strong> · {row.label}</span>
                    <span>{row.detail}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card-enter">
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
            <div className="table-wrapper player-career-table-wrap" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
              <Table
                className="standings-table"
                style={{ width: "100%", minWidth: 540, fontSize: "0.76rem", lineHeight: 1.3 }}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead
                      style={{
                        paddingLeft: "var(--space-4)",
                        textAlign: "left", position: "sticky", left: 0, zIndex: 2, background: "var(--surface)",
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

          {/* ── Per-season career log (player.careerStats + archived playerSeasonStatsV1) ── */}
          {!loading && mergedProfileSeasonRows.length > 0 && (
            <section className="card-enter">
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "var(--space-2)" }}>
                <input
                  aria-label="Search player season log"
                  value={seasonLogSearch}
                  onChange={(e) => setSeasonLogSearch(e.target.value)}
                  placeholder="Search season/team/stats"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 10px",
                    color: "var(--text)",
                    minWidth: 170,
                  }}
                />
                <select
                  aria-label="Filter player season log by team"
                  value={seasonLogTeamFilter}
                  onChange={(e) => setSeasonLogTeamFilter(e.target.value)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 10px",
                    color: "var(--text)",
                  }}
                >
                  <option value="all">All teams</option>
                  {seasonLogTeamOptions.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
                <select
                  aria-label="Sort player season log"
                  value={seasonLogSortKey}
                  onChange={(e) => setSeasonLogSortKey(e.target.value)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 10px",
                    color: "var(--text)",
                  }}
                >
                  <option value="season">Season</option>
                  <option value="team">Team</option>
                  <option value="games">Games</option>
                  <option value="primaryStat">{seasonLogPrimaryStat.label}</option>
                  <option value="ovr">OVR</option>
                </select>
                <select
                  aria-label="Sort direction for player season log"
                  value={seasonLogSortDirection}
                  onChange={(e) => setSeasonLogSortDirection(e.target.value)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 10px",
                    color: "var(--text)",
                  }}
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label="Reset player season log filters"
                  onClick={() => {
                    setSeasonLogSearch("");
                    setSeasonLogTeamFilter("all");
                    setSeasonLogSortKey("season");
                    setSeasonLogSortDirection("desc");
                  }}
                >
                  Reset
                </button>
              </div>
              <div data-testid="player-profile-season-log-showing" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
                {seasonLogShowingLabel} · Career totals: {careerTotals.gamesPlayed || 0} GP
                {seasonLogPrimaryStat.key !== "gamesPlayed" ? ` · ${seasonLogPrimaryStat.label} ${careerSeasonLogPrimaryTotal.toLocaleString()}` : ""}
              </div>
              {seasonLogRows.length === 0 ? (
                <EmptyState title="No season rows match this filter." subtitle="Reset filters to show the full archived season log." />
              ) : null}
              <div className="table-wrapper player-career-table-wrap" role="region" aria-label="Player season log — scroll horizontally to view all stat columns" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
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
                      <TableHead style={{ textAlign: "center" }}>Pos</TableHead>
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
                      {["DE", "DT", "LB", "CB", "S", "DL", "EDGE"].includes(
                        player.pos,
                      ) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>TKL</TableHead>
                          <TableHead style={{ textAlign: "center" }}>SCK</TableHead>
                          <TableHead style={{ textAlign: "center" }}>D-INT</TableHead>
                        </>
                      )}
                      {["K"].includes(player.pos) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>FGM</TableHead>
                          <TableHead style={{ textAlign: "center" }}>XPM</TableHead>
                        </>
                      )}
                      <TableHead style={{ textAlign: "center" }}>OVR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seasonLogRows.map((line, i) => (
                      <TableRow key={i} data-testid={`player-profile-season-log-row-${line?.season ?? line?.seasonId ?? i}`}>
                        <TableCell
                          style={{
                            paddingLeft: "var(--space-4)",
                            fontWeight: 600,
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {line.season}
                            {onFocusLeagueHistorySeason && line.season != null && String(line.season).startsWith("s") ? (
                              <button
                                type="button"
                                className="btn-link"
                                style={{ fontSize: "0.7rem", fontWeight: 600 }}
                                onClick={() => onFocusLeagueHistorySeason(String(line.season))}
                              >
                                League History
                              </button>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "var(--text-xs)",
                          }}
                        >
                          {line.team}
                        </TableCell>
                        <TableCell style={{ textAlign: "center", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          {player?.pos ?? "—"}
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
                              {Number(line.compPct) > 0 ? `${Number(line.compPct).toFixed(1)}%` : "—"}
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
                        {["DE", "DT", "LB", "CB", "S", "DL", "EDGE"].includes(
                          player.pos,
                        ) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.tackles}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.sacks}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>{line.defInts ?? line.defInterceptions ?? "—"}</TableCell>
                          </>
                        )}
                        {["K"].includes(player.pos) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>{line.fgMade ?? "—"}</TableCell>
                            <TableCell style={{ textAlign: "center" }}>{line.xpMade ?? "—"}</TableCell>
                          </>
                        )}
                        <TableCell style={{ textAlign: "center" }}>
                          <strong>{line.ovr != null ? line.ovr : "—"}</strong>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
          {!loading && mergedProfileSeasonRows.length === 0 && !isProspect && (
            <section className="card-enter" style={{ marginTop: "var(--space-3)" }}>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                Season logs appear after seasons are archived with stat snapshots.
              </p>
            </section>
          )}
            </>
          )}
          {activeProfileTab === "Game Log" && (
            <section className="card-enter" data-testid="player-profile-game-logs">
              <h3 style={sectionLabelStyle}>Game Log</h3>
              {playerGameLogs.length === 0 ? (
                <EmptyState title="No game logs recorded yet." subtitle="Game logs will appear after this player records tracked stats." />
              ) : (
                <div className="table-wrapper" style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
                  <Table className="standings-table" style={{ width: "100%", minWidth: 760 }}>
                    <TableHeader><TableRow><TableHead>Week</TableHead><TableHead>Opp</TableHead><TableHead>Result</TableHead><TableHead>Key Stats</TableHead><TableHead>Game</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {playerGameLogs.map((row) => {
                        const st = row.stats ?? {};
                        const pos = String(player?.pos ?? player?.position ?? '').toUpperCase();
                        const keyStats = pos === 'QB' ? `${st.passComp ?? 0}/${st.passAtt ?? 0}, ${st.passYd ?? 0} YDS, ${st.passTD ?? 0} TD, ${st.interceptions ?? 0} INT${st.rate != null ? `, ${st.rate} RTG` : ''}`
                          : ['RB','FB'].includes(pos) ? `${st.rushAtt ?? 0} ATT, ${st.rushYd ?? 0} YDS, ${st.rushTD ?? 0} TD, ${st.receptions ?? 0} REC`
                          : ['WR','TE'].includes(pos) ? `${st.targets ?? 0} TGT, ${st.receptions ?? 0} REC, ${st.recYd ?? 0} YDS, ${st.recTD ?? 0} TD`
                          : ['K'].includes(pos) ? `${st.fieldGoalsMade ?? 0}/${st.fieldGoalsAttempted ?? 0} FG, ${st.extraPointsMade ?? 0}/${st.extraPointsAttempted ?? 0} XP`
                          : ['P'].includes(pos) ? `${st.punts ?? 0} P, ${st.puntYards ?? 0} YDS`
                          : `${st.tackles ?? 0} TKL, ${st.sacks ?? 0} SACK, ${st.interceptions ?? 0} INT, ${st.passDeflections ?? 0} PD`;
                        return <TableRow key={`${row.week}-${row.gameId ?? row.opponentId}`}><TableCell>W{row.week}</TableCell><TableCell>{row.opponentAbbr}</TableCell><TableCell>{row.result}</TableCell><TableCell>{keyStats || row.summary}</TableCell><TableCell>{row.gameId ? <button type="button" className="btn-link" onClick={() => onOpenBoxScore?.(row.gameId)}>View Game Book</button> : "—"}</TableCell></TableRow>;
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )}
          {activeProfileTab === "Career Stats" && (
            <>
            <AdvancedAnalyticsSection advancedView={playerAdvancedStatsView} player={player} />
            <section className="card-enter">
              {careerRows.length === 0 ? (
                <EmptyState
                  icon="📉"
                  title="No career stats yet"
                  subtitle="Stats accumulate after each completed season."
                />
              ) : (
                <div className="table-wrapper" style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
                  <Table className="standings-table" style={{ width: "100%", minWidth: 760 }}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Season</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead style={{ textAlign: "center" }}>Games</TableHead>
                        {PASS_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableHead style={{ textAlign: "right" }}>Pass Yds</TableHead><TableHead style={{ textAlign: "right" }}>Pass TD</TableHead></>)}
                        {RUSH_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableHead style={{ textAlign: "right" }}>Rush Yds</TableHead><TableHead style={{ textAlign: "right" }}>Rush TD</TableHead></>)}
                        {REC_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableHead style={{ textAlign: "right" }}>Rec</TableHead><TableHead style={{ textAlign: "right" }}>Rec Yds</TableHead><TableHead style={{ textAlign: "right" }}>Rec TD</TableHead></>)}
                        {DEF_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableHead style={{ textAlign: "right" }}>Tackles</TableHead><TableHead style={{ textAlign: "right" }}>Sacks</TableHead><TableHead style={{ textAlign: "right" }}>INT</TableHead></>)}
                        {SPEC_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableHead style={{ textAlign: "right" }}>FGM</TableHead><TableHead style={{ textAlign: "right" }}>XPM</TableHead></>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {careerRows.map((line, index) => (
                        <TableRow key={`${line?.season ?? "season"}-${line?.team ?? "team"}-${index}`}>
                          <TableCell>{line?.season ?? line?.seasonId ?? "—"}</TableCell>
                          <TableCell>{line?.team ?? "—"}</TableCell>
                          <TableCell style={{ textAlign: "center" }}>{line?.gamesPlayed ?? line?.gp ?? "—"}</TableCell>
                          {PASS_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{Number(line?.passYds ?? line?.passingYards ?? 0) > 0 ? Number(line?.passYds ?? line?.passingYards ?? 0).toLocaleString() : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{Number(line?.passTDs ?? line?.touchdowns ?? 0) > 0 ? Number(line?.passTDs ?? line?.touchdowns ?? 0) : "—"}</TableCell></>)}
                          {RUSH_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{Number(line?.rushYds ?? line?.rushingYards ?? 0) > 0 ? Number(line?.rushYds ?? line?.rushingYards ?? 0).toLocaleString() : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{Number(line?.rushTDs ?? line?.rushingTDs ?? 0) > 0 ? Number(line?.rushTDs ?? line?.rushingTDs ?? 0) : "—"}</TableCell></>)}
                          {REC_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{Number(line?.receptions ?? 0) > 0 ? Number(line?.receptions ?? 0) : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{Number(line?.recYds ?? line?.receivingYards ?? 0) > 0 ? Number(line?.recYds ?? line?.receivingYards ?? 0).toLocaleString() : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{Number(line?.recTDs ?? line?.receivingTDs ?? 0) > 0 ? Number(line?.recTDs ?? line?.receivingTDs ?? 0) : "—"}</TableCell></>)}
                          {DEF_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{Number(line?.tackles ?? line?.totalTackles ?? 0) > 0 ? Number(line?.tackles ?? line?.totalTackles ?? 0) : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{Number(line?.sacks ?? 0) > 0 ? Number(line?.sacks ?? 0) : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{Number(line?.defInts ?? line?.defInterceptions ?? 0) > 0 ? Number(line?.defInts ?? line?.defInterceptions ?? 0) : "—"}</TableCell></>)}
                          {SPEC_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{line?.fgMade || 0 ? line?.fgMade ?? 0 : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{line?.xpMade || 0 ? line?.xpMade ?? 0 : "—"}</TableCell></>)}
                        </TableRow>
                      ))}
                      <TableRow style={{ fontWeight: 800, background: "var(--surface-strong)" }}>
                        <TableCell>Career Totals</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell style={{ textAlign: "center" }}>{careerTotals.gamesPlayed || "—"}</TableCell>
                        {PASS_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{careerTotals.passYds ? careerTotals.passYds.toLocaleString() : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{careerTotals.passTDs || "—"}</TableCell></>)}
                        {RUSH_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{careerTotals.rushYds ? careerTotals.rushYds.toLocaleString() : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{careerTotals.rushTDs || "—"}</TableCell></>)}
                        {REC_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{careerTotals.receptions || "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{careerTotals.recYds ? careerTotals.recYds.toLocaleString() : "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{careerTotals.recTDs || "—"}</TableCell></>)}
                        {DEF_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>{careerTotals.tackles || "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{careerTotals.sacks || "—"}</TableCell><TableCell style={{ textAlign: "right" }}>{careerTotals.interceptions || "—"}</TableCell></>)}
                        {SPEC_POSITIONS.includes(player?.position ?? player?.pos) && (<><TableCell style={{ textAlign: "right" }}>—</TableCell><TableCell style={{ textAlign: "right" }}>—</TableCell></>)}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
            </>
          )}
        </div>
      </div>

      {/* Extension modal */}
      {extending && playerView && (
        <ExtensionNegotiationModal
          player={player}
          actions={actions}
          teamId={player.teamId}
          cacheScopeKey={cacheScopeKey}
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
