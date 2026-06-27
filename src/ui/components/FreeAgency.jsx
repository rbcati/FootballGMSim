/**
 * FreeAgency.jsx
 *
 * Rebuilt ZenGM-style free agency browser.  Matches Roster.jsx aesthetics 1:1:
 *  - Identical OvrBadge / PosBadge / SortTh / PipBar sub-component family
 *  - Cap room banner with colour-coded progress bar (green → amber → red)
 *  - Position filter pills: ALL QB WR RB TE OL DL LB CB S
 *  - Name search + OVR ≥ threshold selector
 *  - Sortable columns: POS / Name / OVR / Age / Ask $/yr / Yrs
 *  - Inline sign form: player row highlights while open, sign form expands
 *    below (two-row pattern identical to Roster.jsx release confirmation)
 *  - Optimistic removal of signed player from FA pool
 *  - Success flash banner
 *
 * Data flow:
 *  Mount → actions.getFreeAgents() [silent] → FREE_AGENT_DATA { freeAgents[] }
 *  Sign  → actions.signPlayer(playerId, userTeamId, contract) → STATE_UPDATE
 *
 * Contract demand:
 *  Defaults computed by suggestedSalary(ovr, pos, age) — same market-rate
 *  formula used by the worker's FA wave.  User may edit both fields before
 *  confirming; cap validation fires on confirm.
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import TraitBadge from "./TraitBadge";
import PlayerAvatar from "./PlayerAvatar";
import DonutChart from "./DonutChart";
import PlayerCard from "./PlayerCard.jsx";
import PlayerComparison from "./PlayerComparison.jsx";
import PlayerCompareTray from "./PlayerCompareTray.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { computeTeamNeedsSummary, formatNeedsLine, summarizeFreeAgentMarket } from "../utils/marketSignals.js";
import { buildDirectionGuidance, buildTeamIntelligence, scoreFreeAgentForTeam } from "../utils/teamIntelligence.js";
import { getBudgetLabel, getMarketPlayerTags, toneToCssColor } from "../utils/transactionMarket.js";
import { ScreenHeader, StickySubnav } from "./ScreenSystem.jsx";
import AdvancedPlayerSearch from "./AdvancedPlayerSearch.jsx";
import { applyAdvancedPlayerFilters } from "../../core/footballAdvancedFilters";
import { buildPlayerEvaluation } from "../../core/playerEvaluation.js";
import { usePlayerCompare } from "../utils/playerCompare.js";
import { formatDemandTier } from "../utils/offseasonActionCenter.js";
import { buildFreeAgencyMarketAnalysis } from "../../core/freeAgency/freeAgencyMarketAnalysis.js";
import { buildFreeAgencyProfileContext } from "../utils/playerProfileContext.js";
import { buildContractOfferInsight, toneToContractInsightColor } from "../utils/contractOfferInsights.js";
import { evaluatePendingOfferCapReservation } from "../../core/pendingOfferCapModel.js";
import { buildShowingLabel, stableSortRows } from "../utils/dataBrowser.js";
import { resolveFreeAgencyLoadStatus } from "../utils/freeAgencyLoadStatus.js";
import StatusEmptyState from "./common/StatusEmptyState.jsx";
import CapImpactSummary from "./common/CapImpactSummary.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITIONS = ["ALL", "QB", "WR", "RB", "TE", "OL", "DL", "LB", "CB", "S"];

const POS_MULTIPLIERS = {
  QB: 2.2,
  WR: 1.15,
  RB: 0.7,
  TE: 1.0,
  OL: 1.0,
  DL: 1.0,
  LB: 0.9,
  CB: 1.0,
  S: 0.85,
};

// ── Salary helpers ────────────────────────────────────────────────────────────

function suggestedSalary(ovr, pos, age) {
  const isSuperstar = ovr >= 90;
  const isStar = ovr >= 80;
  const isStarter = ovr >= 70;
  const isBackup = ovr >= 60;

  const base = isSuperstar
    ? 25
    : isStar
      ? 15
      : isStarter
        ? 8
        : isBackup
          ? 3
          : 0.8;
  const mult = POS_MULTIPLIERS[pos] || 1.0;
  let raw = base * mult;

  if (age > 32) raw *= 0.7;
  else if (age > 29) raw *= 0.85;

  // Vet minimum floor
  const floor = 0.75 + (age > 26 ? 0.25 : 0);
  return Math.max(floor, Number(raw.toFixed(1)));
}

function suggestedYears(age) {
  if (age <= 26) return 4;
  if (age <= 29) return 3;
  if (age <= 32) return 2;
  return 1;
}

function resolveDemandAnnual(player) {
  const explicit = [
    player?.contractDemand?.baseAnnual,
    player?.contractDemand?.annual,
    player?.desiredContract?.baseAnnual,
    player?.desiredContract?.annual,
    player?.askingPrice,
    player?.ask,
  ].find((v) => Number.isFinite(v) && v > 0);
  if (explicit != null) return Number(explicit);
  return suggestedSalary(player?.ovr ?? 50, player?.pos, player?.age ?? 28);
}

function ovrColor(ovr) {
  if (ovr >= 85) return "var(--success)";
  if (ovr >= 75) return "var(--accent)";
  if (ovr >= 65) return "var(--warning)";
  return "var(--danger)";
}

const RESIGN_TIER_LABEL = {
  priority_resign: "Priority re-sign",
  resign_if_price: "Re-sign if price holds",
  replaceable_depth: "Replaceable depth",
  let_walk: "Let walk",
  trade_or_tag: "Trade/Tag candidate",
};

export function formatPlaybookKnowledge(playbookKnowledge) {
  return `${playbookKnowledge?.label ?? "None"} (${playbookKnowledge?.score ?? 0})`;
}

export function filterFreeAgentsForView(faPool, { signedIds, posFilter, minOvr, nameFilter, advancedFilters, archetypeFilter = "ALL", fitTierFilter = "ALL", roleFilter = "ALL", positionNeedOnly = false, needs = [] }) {
  const baseFiltered = faPool.filter((p) => {
    if (signedIds?.has?.(p.id)) return false;
    if (posFilter !== "ALL" && p.pos !== posFilter) return false;
    if (minOvr > 0 && p.ovr < minOvr) return false;
    if (nameFilter && !p.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (archetypeFilter !== "ALL" && p?._eval?.archetype?.archetype !== archetypeFilter) return false;
    if (fitTierFilter !== "ALL" && p?._eval?.schemeFit?.tier !== fitTierFilter) return false;
    if (roleFilter !== "ALL" && p?._eval?.roleProjection?.role !== roleFilter) return false;
    if (positionNeedOnly && !new Set(needs).has(p.pos)) return false;
    return true;
  });
  return applyAdvancedPlayerFilters(baseFiltered, advancedFilters);
}

export function sortFreeAgentsForView(displayed, { sortPreset, sortKey, sortDir, needs = [], marketRowsById = new Map() }) {
  const arr = [...displayed];
  const rowFor = (p) => marketRowsById.get(p?.id) ?? {};
  if (sortPreset === "best_available") {
    arr.sort((a, b) => (rowFor(b).sortKeys?.fitScore ?? 0) - (rowFor(a).sortKeys?.fitScore ?? 0) || (b.ovr ?? 0) - (a.ovr ?? 0));
    return arr;
  }
  if (sortPreset === "cheapest_value") {
    arr.sort((a, b) => (rowFor(a).sortKeys?.cost ?? a._ask ?? 999) - (rowFor(b).sortKeys?.cost ?? b._ask ?? 999));
    return arr;
  }
  if (sortPreset === "youngest") {
    arr.sort((a, b) => (a.age ?? 99) - (b.age ?? 99));
    return arr;
  }
  if (sortPreset === "position_need") {
    const needSet = new Set(needs);
    arr.sort((a, b) => Number(needSet.has(b.pos)) - Number(needSet.has(a.pos)) || (b.ovr ?? 0) - (a.ovr ?? 0));
    return arr;
  }
  if (sortPreset === "tactical_fit") {
    arr.sort((a, b) => (b?._eval?.schemeFit?.score ?? 0) - (a?._eval?.schemeFit?.score ?? 0) || (b.ovr ?? 0) - (a.ovr ?? 0));
    return arr;
  }
  if (sortPreset === "starter_upgrade") {
    arr.sort((a, b) => (rowFor(b).sortKeys?.replacementDelta ?? -999) - (rowFor(a).sortKeys?.replacementDelta ?? -999));
    return arr;
  }
  if (sortPreset === "young_upside") {
    arr.sort((a, b) => ((b.potential ?? b.ovr ?? 0) - (b.age ?? 99)) - ((a.potential ?? a.ovr ?? 0) - (a.age ?? 99)));
    return arr;
  }
  if (sortPreset === "lowest_risk") {
    arr.sort((a, b) => (rowFor(a).riskFlags?.length ?? 0) - (rowFor(b).riskFlags?.length ?? 0) || (rowFor(b).sortKeys?.fitScore ?? 0) - (rowFor(a).sortKeys?.fitScore ?? 0));
    return arr;
  }
  return stableSortRows(arr, (player) => {
    const marketRow = rowFor(player);
    if (sortKey === "ask") return player._ask;
    if (sortKey === "fitScore") return marketRow.sortKeys?.fitScore ?? player?._eval?.schemeFit?.score ?? player.schemeFit ?? 0;
    if (sortKey === "capFit") return marketRow.sortKeys?.capFit ?? marketRow.sortKeys?.affordability ?? 0;
    return player?.[sortKey];
  }, sortDir, (player) => player?.name);
}

// ── Shared sub-components (identical signature & appearance to Roster.jsx) ────

function OvrBadge({ ovr }) {
  const col = ovrColor(ovr);
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "2px 4px",
        borderRadius: "var(--radius-pill)",
        background: col + "22",
        color: col,
        fontWeight: 800,
        fontSize: "var(--text-xs)",
        textAlign: "center",
      }}
    >
      {ovr}
    </span>
  );
}

function PosBadge({ pos }) {
  return (
    <Badge
      variant="outline"
      style={{
        minWidth: 32,
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        color: "var(--text-muted)",
        borderColor: "var(--hairline)",
        textAlign: "center",
      }}
    >
      {pos}
    </Badge>
  );
}

function SortTh({ label, sortKey, current, dir, onSort, right = false }) {
  const active = current === sortKey;
  return (
    <TableHead
      onClick={() => onSort(sortKey)}
      style={{
        textAlign: right ? "right" : "left",
        paddingRight: right ? "var(--space-4)" : undefined,
        cursor: "pointer",
        userSelect: "none",
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontWeight: active ? 700 : 600,
        fontSize: "var(--text-xs)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </TableHead>
  );
}

/** 5-pip mini bar — identical to Roster.jsx. */
function PipBar({ value, color }) {
  const filled = Math.round((value / 100) * 5);
  return (
    <span style={{ display: "inline-flex", gap: 2, verticalAlign: "middle" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: i < filled ? color : "var(--hairline)",
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}

function InsightChip({ label, tone = "neutral" }) {
  return (
    <span style={{
      fontSize: 10,
      border: `1px solid ${toneToContractInsightColor(tone)}`,
      borderRadius: 999,
      padding: "1px 6px",
      color: toneToContractInsightColor(tone),
      background: `${toneToContractInsightColor(tone)}14`,
      lineHeight: 1.5,
    }}>
      {label}
    </span>
  );
}

export function ContractOfferInsightBlock({ player, capRoom, compact = false, showReasons = false, offer = null }) {
  const insight = buildContractOfferInsight(player, { capRoom }, offer ?? {});
  const chips = [
    { label: insight.marketTierLabel, tone: insight.hasMetadata ? "ok" : "neutral" },
    { label: insight.capFitLabel, tone: insight.capFitTone },
    { label: insight.termLabel, tone: "neutral" },
    ...insight.riskTags.slice(0, compact ? 2 : 3).map((label) => ({ label, tone: label.includes("Clean") || label.includes("Need") ? "ok" : "warning" })),
  ];
  return (
    <div aria-label="Contract market read" style={{ display: "grid", gap: 4, marginTop: 4 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {chips.map((chip) => <InsightChip key={`${player?.id ?? player?.name}-${chip.label}`} label={chip.label} tone={chip.tone} />)}
      </div>
      {!compact && (
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          Market read: {insight.annualValueLabel} · {insight.hasMetadata ? "offer metadata" : "model estimate for your cap"}
        </div>
      )}
      {showReasons && insight.reasonBullets.length > 0 ? (
        <div style={{ display: "grid", gap: 2, fontSize: 10, color: "var(--text-subtle)" }}>
          {insight.reasonBullets.map((reason, idx) => <div key={`why-${player?.id ?? player?.name}-${idx}`}>Why this deal? {reason}</div>)}
        </div>
      ) : null}
      {insight.fallback ? (
        <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>Contract metadata unavailable; showing safe estimate only.</div>
      ) : null}
    </div>
  );
}


const RESERVATION_TONE = Object.freeze({
  safe: 'var(--success)',
  manageable: 'var(--accent)',
  tight: 'var(--warning)',
  overcommitted: 'var(--danger)',
  unknown: 'var(--text-muted)',
});

function formatCapValue(value) {
  return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(1)}M` : 'Unknown';
}

function CapImpactStat({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '8px 10px', background: 'var(--surface)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export function PendingCapImpactPanel({ reservation }) {
  const status = reservation?.capReservationStatus ?? 'unknown';
  const tone = RESERVATION_TONE[status] ?? RESERVATION_TONE.unknown;
  const rows = Array.isArray(reservation?.offerRows) ? reservation.offerRows : [];
  return (
    <Card className="card-premium" style={{ marginBottom: "var(--space-4)" }}>
      <CardContent style={{ padding: "var(--space-4)", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 800 }}>Pending cap impact</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 3 }}>Annual cap reservation if every pending bid is accepted.</div>
          </div>
          <Badge variant="outline" style={{ color: tone, borderColor: tone, background: `${tone}14` }}>{reservation?.capReservationStatusLabel ?? 'Unknown'}</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          <CapImpactStat label="Current Room" value={formatCapValue(reservation?.currentCapRoom)} color={tone} />
          <CapImpactStat label="Pending Offers" value={String(reservation?.pendingOfferCount ?? 0)} />
          <CapImpactStat label="Annual Reserved" value={formatCapValue(reservation?.pendingAnnualCommitment)} color={reservation?.pendingAnnualCommitment > 0 ? "var(--warning)" : "var(--text)"} />
          <CapImpactStat label="After Pending" value={formatCapValue(reservation?.estimatedCapRoomAfterPending)} color={tone} />
        </div>
        {rows.length > 0 ? (
          <div style={{ display: "grid", gap: 4 }}>
            {rows.slice(0, 4).map((row) => (
              <div key={`${row.playerId ?? row.playerName}-${row.annualValue ?? 'unknown'}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.playerName}</span>
                <strong style={{ color: row.status === 'unknown' ? "var(--text-muted)" : "var(--text)", whiteSpace: "nowrap" }}>{row.status === 'unknown' ? 'Unknown annual' : `${formatCapValue(row.annualValue)} / yr`}{row.years ? ` · ${row.years}y` : ''}</strong>
              </div>
            ))}
            {rows.length > 4 ? <div style={{ fontSize: "10px", color: "var(--text-subtle)" }}>+{rows.length - 4} more pending offer{rows.length - 4 === 1 ? '' : 's'}</div> : null}
          </div>
        ) : (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>No pending bids are reserving cap right now.</div>
        )}
        {(reservation?.warnings ?? []).map((warning) => (
          <div key={warning} role="status" style={{ fontSize: "var(--text-xs)", color: status === 'overcommitted' ? "var(--danger)" : "var(--warning)", background: `${status === 'overcommitted' ? 'var(--danger)' : 'var(--warning)'}14`, border: `1px solid ${status === 'overcommitted' ? 'var(--danger)' : 'var(--warning)'}55`, borderRadius: "var(--radius-md)", padding: "8px 10px" }}>{warning}</div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Pending offers (negotiation market) ──────────────────────────────────────

const OFFER_STATUS_TONE = Object.freeze({
  pending: 'var(--accent)',
  accepted: 'var(--success)',
  rejected: 'var(--danger)',
  expired: 'var(--text-muted)',
  withdrawn: 'var(--text-muted)',
});

const OFFER_STATUS_LABEL = Object.freeze({
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
});

export function PendingOffersPanel({ pendingOffers = [], capSummary = null, onWithdraw }) {
  const offers = Array.isArray(pendingOffers) ? pendingOffers : [];
  if (offers.length === 0 && !capSummary?.reservedPendingCap) return null;
  return (
    <Card className="card-premium" style={{ marginBottom: "var(--space-4)" }} data-testid="pending-offers-panel">
      <CardContent style={{ padding: "var(--space-4)", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 800 }}>Your offers</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 3 }}>Offers stay pending until the player decides. Pending bids reserve cap room.</div>
          </div>
          {capSummary ? (
            <Badge variant="outline" data-testid="effective-cap-badge">
              Effective cap: {formatCapValue(capSummary.effectiveCapRoom)} (reserved {formatCapValue(capSummary.reservedPendingCap)})
            </Badge>
          ) : null}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {offers.map((offer) => {
            const status = OFFER_STATUS_LABEL[offer.status] ? offer.status : 'pending';
            const tone = OFFER_STATUS_TONE[status];
            return (
              <div key={offer.id} data-testid={`pending-offer-${offer.playerId}`} style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--surface)", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>
                    {offer.playerName ?? `Player ${offer.playerId}`}{offer.pos ? ` · ${offer.pos}` : ''}
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                      {' '}— {offer.years}y / ${Number(offer.totalValue ?? 0).toFixed(1)}M (${Number(offer.annualCapHit ?? 0).toFixed(1)}M cap/yr)
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge variant="outline" style={{ color: tone, borderColor: tone, background: `${tone}14` }}>{OFFER_STATUS_LABEL[status]}</Badge>
                    {status === 'pending' && typeof onWithdraw === 'function' ? (
                      <Button size="sm" variant="outline" onClick={() => onWithdraw(offer.playerId)}>Withdraw</Button>
                    ) : null}
                  </div>
                </div>
                {(offer.feedback ?? []).slice(0, 2).map((line) => (
                  <div key={line} style={{ fontSize: "var(--text-xs)", color: status === 'rejected' ? "var(--danger)" : "var(--text-muted)" }}>{line}</div>
                ))}
                {status === 'pending' && (offer.competingTeamIds ?? []).length > 0 ? (
                  <div style={{ fontSize: "10px", color: "var(--warning)" }}>{offer.competingTeamIds.length} competing team{offer.competingTeamIds.length === 1 ? '' : 's'} bidding</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cap banner ────────────────────────────────────────────────────────────────

function CapBanner({ userTeam }) {
  const capTotal = userTeam?.capTotal ?? 255;
  const capUsed = userTeam?.capUsed ?? 0;
  const deadCap = userTeam?.deadCap ?? 0;
  const capRoom = userTeam?.capRoom ?? capTotal - capUsed - deadCap;

  const roomCol =
    capRoom < 0
      ? "var(--danger)"
      : capRoom < 15
        ? "var(--warning)"
        : "var(--success)";

  return (
    <Card
      className="card-premium"
      style={{
        marginBottom: "var(--space-4)",
      }}
    >
      <CardContent style={{ padding: "var(--space-4) var(--space-5)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--text-xs)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "var(--text-muted)",
                marginBottom: 4,
                fontWeight: 700,
              }}
            >
              Salary Cap Room
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                color: roomCol,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ${capRoom.toFixed(1)}M
            </div>
            <div
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Used: ${capUsed.toFixed(1)}M · Dead: ${deadCap.toFixed(1)}M
            </div>
          </div>

          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                marginBottom: 4,
              }}
            >
              League Ceiling: ${capTotal.toFixed(0)}M
            </div>
            <DonutChart data={[
                { value: capUsed, color: "var(--accent)" },
                { value: deadCap, color: "var(--danger)" },
                { value: Math.max(0, capRoom), color: "var(--surface-strong)" }
            ]} size={48} strokeWidth={8} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Inline sign form ──────────────────────────────────────────────────────────
// Renders as a full-width <td colSpan=7> in its own table row, appearing
// directly below the highlighted player row (two-row pattern from Roster.jsx).

export function SignInlineForm({ player, capRoom, rosterCount = 53, rosterLimit = 53, pendingCapContext = null, onSubmit, onCancel, asDiv }) {
  const defaultSalary = suggestedSalary(player.ovr, player.pos, player.age);
  const defaultYears = suggestedYears(player.age);
  const [annual, setAnnual] = useState(defaultSalary);
  const [years, setYears] = useState(defaultYears);
  const [err, setErr] = useState("");

  const handleConfirm = () => {
    const sal = parseFloat(annual);
    const yrs = parseInt(years, 10);
    if (isNaN(sal) || sal <= 0) {
      setErr("Invalid salary amount.");
      return;
    }
    if (isNaN(yrs) || yrs < 1 || yrs > 7) {
      setErr("Years must be between 1 and 7.");
      return;
    }
    if (sal > capRoom) {
      setErr(`Cannot afford. You only have $${capRoom.toFixed(1)}M in space.`);
      return;
    }
    onSubmit({ baseAnnual: sal, yearsTotal: yrs, signingBonus: 0 });
  };

  const Wrapper = asDiv ? 'div' : 'td';
  const props = asDiv ? {} : { colSpan: 9 };
  const proposedReservation = useMemo(() => {
    if (!pendingCapContext) return null;
    return evaluatePendingOfferCapReservation({
      ...pendingCapContext,
      proposedOffer: {
        player,
        replaceExisting: true,
        offer: { contract: { baseAnnual: Number(annual || 0), yearsTotal: Number(years || 1), signingBonus: 0 } },
      },
    });
  }, [pendingCapContext, player, annual, years]);
  // projectedRoom reuses the same post-move figure already shown in this form:
  // the after-pending reservation when available, otherwise a display estimate of
  // currentRoom - annual cap hit consistent with the other figures on screen.
  const postMoveCap = proposedReservation?.estimatedCapRoomAfterPending ?? (Number(capRoom) - Number(annual || 0));
  const postMoveRoster = Number(rosterCount) + 1;
  const projectedWarnings = proposedReservation?.warnings ?? [];

  return (
    <Wrapper
      {...props}
      style={{
        padding: "var(--space-3) var(--space-5)",
        background: "var(--surface-strong)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        {/* Player demand label */}
        <div>
          <div
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Your bid for {player.name}:
          </div>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            ${(player._ask ?? 0).toFixed(1)}M / yr · {suggestedYears(player.age)}{" "}
            years
          </div>
          <ContractOfferInsightBlock player={player} capRoom={capRoom} compact offer={{ contract: { baseAnnual: Number(annual || 0), yearsTotal: Number(years || 1), signingBonus: 0 } }} />
        </div>
        <div style={{ display: "grid", gap: 2, marginLeft: "auto", minWidth: 170 }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            Cap after all pending: <strong style={{ color: postMoveCap < 0 ? "var(--danger)" : postMoveCap < 5 ? "var(--warning)" : "var(--text)" }}>{formatCapValue(postMoveCap)}</strong>
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            Roster after signing: <strong style={{ color: postMoveRoster > rosterLimit ? "var(--warning)" : "var(--text)" }}>{postMoveRoster}/{rosterLimit}</strong>
          </div>
          {projectedWarnings.slice(0, 1).map((warning) => (
            <div key={warning} style={{ fontSize: "10px", color: postMoveCap < 0 ? "var(--danger)" : "var(--warning)" }}>{warning}</div>
          ))}
        </div>

        {/* Inputs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: "var(--text-sm)" }}>$</span>
            <Input
              type="number"
              step="0.1"
              min="0.75"
              max="60"
              value={annual}
              onChange={(e) => {
                setAnnual(e.target.value);
                setErr("");
              }}
              style={{
                width: 70,
                padding: "4px 8px",
                background: "var(--bg)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: "var(--text-sm)",
              }}
            />
            <span
              style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}
            >
              M/yr
            </span>
          </div>
          <span style={{ color: "var(--hairline)" }}>×</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Input
              type="number"
              min="1"
              max="7"
              value={years}
              onChange={(e) => {
                setYears(e.target.value);
                setErr("");
              }}
              style={{
                width: 50,
                padding: "4px 8px",
                background: "var(--bg)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: "var(--text-sm)",
              }}
            />
            <span
              style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}
            >
              Yrs
            </span>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          {err && (
            <span style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>
              {err}
            </span>
          )}
          <Button
            className="btn"
            style={{ fontSize: "var(--text-xs)", padding: "4px 12px" }}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="btn btn-primary"
            style={{ fontSize: "var(--text-xs)", padding: "4px 16px" }}
            onClick={handleConfirm}
          >
            Confirm Bid
          </Button>
        </div>
      </div>

      {/* Current → this deal → projected room readout at the point of commit. */}
      <div style={{ marginTop: "var(--space-3)", maxWidth: 360 }}>
        <CapImpactSummary
          title={`Sign ${player.name} · cap impact`}
          currentRoom={capRoom}
          incoming={Number(annual || 0)}
          outgoing={0}
          projectedRoom={postMoveCap}
          incomingLabel="This contract (annual)"
        />
      </div>
    </Wrapper>
  );
}

// ── Player Preview Bottom Sheet ──────────────────────────────────────────────

function PlayerPreviewSheet({ player, capRoom, pendingCapContext = null, onClose, onSubmitBid }) {
  const [phase, setPhase] = useState("view"); // "view" | "bid"
  const offers = player?.offers || {};

  if (!player) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 1000,
          backdropFilter: "blur(4px)",
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          maxHeight: "85vh",
          background: "var(--bg-secondary)",
          borderRadius: "20px 20px 0 0",
          zIndex: 1001,
          overflow: "auto",
          padding: "8px 0 32px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--hairline-strong)", margin: "0 auto 16px" }} />

        <div style={{ padding: "0 16px" }}>
          {/* PlayerCard hero */}
          <PlayerCard player={player} variant="hero" onClose={onClose} />
          <div style={{ marginTop: 10, fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Team playbook knowledge: <strong style={{ color: "var(--text)" }}>{formatPlaybookKnowledge(player?.playbookKnowledge)}</strong>
          </div>
          <div style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: 10, background: "var(--surface)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, marginBottom: 2 }}>Market context</div>
            <ContractOfferInsightBlock player={player} capRoom={capRoom} showReasons />
          </div>

          {/* Bid form or trigger */}
          <div style={{ marginTop: 16 }}>
            {phase === "view" ? (
              <div style={{ display: "flex", gap: 10 }}>
                {offers.userOffered && (
                  <div style={{
                    flex: 1, padding: "10px 14px",
                    background: "#34C75918", border: "1px solid #34C75944",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.78rem", color: "#34C759", fontWeight: 700,
                    textAlign: "center",
                  }}>
                    {offers.userIsTopBidder ? "✓ Your bid leads!" : "Bid submitted"}
                  </div>
                )}
                {(player._ask ?? 0) > capRoom ? (
                  <div style={{
                    flex: 1, padding: "10px 14px",
                    background: "#FF453A18", border: "1px solid #FF453A44",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.78rem", color: "#FF453A", fontWeight: 700,
                    textAlign: "center",
                  }}>
                    Insufficient cap space
                  </div>
                ) : (
                  <Button
                    onClick={() => setPhase("bid")}
                    style={{
                      flex: 1, padding: "12px",
                      background: "var(--accent)", color: "#fff",
                      border: "none", borderRadius: "var(--radius-md)",
                      fontWeight: 800, fontSize: "0.9rem", cursor: "pointer",
                    }}
                  >
                    {offers.userOffered ? "Update Bid" : "Submit Bid"}
                  </Button>
                )}
              </div>
            ) : (
              <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  Contract Offer
                </div>
                <SignInlineForm
                  player={player}
                  capRoom={capRoom}
                  pendingCapContext={pendingCapContext}
                  asDiv
                  onCancel={() => setPhase("view")}
                  onSubmit={(c) => { onSubmitBid(player.id, c); onClose(); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

const mobileStyle = `
@media (max-width: 768px) {
  .desktop-only { display: none !important; }
  .mobile-only { display: flex !important; }
}
`;

export default function FreeAgency({
  userTeamId,
  league,
  actions,
  onPlayerSelect,
  onNavigate,
}) {
  const [faState, setFaState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Filters
  const [posFilter, setPosFilter] = useState("ALL");
  const [nameFilter, setNameFilter] = useState("");
  const [minOvr, setMinOvr] = useState(60);
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [maxAge, setMaxAge] = useState(40);
  const [minSchemeFit, setMinSchemeFit] = useState(0);
  const [demandTier, setDemandTier] = useState("ALL");
  const [watchOnly, setWatchOnly] = useState(false);
  const [archetypeFilter, setArchetypeFilter] = useState("ALL");
  const [fitTierFilter, setFitTierFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [positionNeedOnly, setPositionNeedOnly] = useState(false);
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [sortPreset, setSortPreset] = useState("best_available");
  const [marketFilter, setMarketFilter] = useState("all");

  // Sorting
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState("desc");

  // Interaction
  const [signingPlayerId, setSigningPlayerId] = useState(null);
  const [signedIds, setSignedIds] = useState(new Set()); // Optimistic hides
  const [flash, setFlash] = useState(null);
  const [previewPlayer, setPreviewPlayer] = useState(null);
  const [showCapPreview, setShowCapPreview] = useState(false);
  const [viewMode, setViewMode] = useState("table");

  // Keep ref to avoid stale closure during mount load
  const loadCountRef = useRef(0);

  useEffect(() => {
    let active = true;
    if (loadCountRef.current === 0) setLoading(true);
    loadCountRef.current += 1;

    setLoadError(null);

    Promise.resolve(actions?.getFreeAgents?.())
      .then((res) => {
        if (!active) return;
        // Treat a missing/empty response shape as an honest load failure rather
        // than silently rendering a misleading "no players match" empty state.
        if (!res || typeof res !== "object" || res.payload == null) {
          setFaState({ freeAgents: [] });
          setLoadError("Free agent data was unavailable.");
        } else {
          setFaState(res.payload);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error("FA load error:", err);
        setLoadError(err?.message || "Failed to load free agents.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [actions, league?.week, league?.phase]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeTeamId = userTeamId ?? league?.userTeamId ?? null;

  const userTeam = useMemo(
    () => league?.teams?.find((t) => t.id === activeTeamId),
    [league, activeTeamId],
  );

  const capTotal = userTeam?.capTotal ?? 255;
  const capUsed = userTeam?.capUsed ?? 0;
  const deadCap = userTeam?.deadCap ?? 0;
  const capRoom = userTeam?.capRoom ?? (capTotal - capUsed - deadCap);
  const rosterCount = Array.isArray(userTeam?.roster) ? userTeam.roster.length : 0;
  const rosterLimit = 53;
  const needsSummary = useMemo(() => computeTeamNeedsSummary(userTeam), [userTeam]);
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: league?.week ?? 1 }), [userTeam, league?.week]);

  const faPool = useMemo(() => {
    if (!faState?.freeAgents) return [];
    return faState.freeAgents.map((p) => ({
      ...p,
      _ask: resolveDemandAnnual(p),
    }));
  }, [faState]);
  const evaluatedFaPool = useMemo(() => faPool.map((p) => ({
    ...p,
    _eval: buildPlayerEvaluation(p, {
      teamContext: teamIntel,
      rosterContext: { roster: userTeam?.roster ?? [] },
      depthChartNeeds: (needsSummary?.needs ?? []).slice(0, 4),
      gamePlan: userTeam?.gamePlan ?? {},
    }),
  })), [faPool, teamIntel, userTeam?.roster, userTeam?.gamePlan, needsSummary?.needs]);
  const topNeeds = useMemo(() => (needsSummary?.needs ?? []).slice(0, 4), [needsSummary?.needs]);
  const marketAnalysis = useMemo(() => buildFreeAgencyMarketAnalysis({
    team: userTeam,
    roster: userTeam?.roster ?? [],
    freeAgents: evaluatedFaPool,
    cap: { capRoom, capUsed, deadCap },
  }), [userTeam, evaluatedFaPool, capRoom, capUsed, deadCap]);

  const marketRowsById = useMemo(() => new Map((marketAnalysis?.marketRows ?? []).map((r) => [r.playerId, r])), [marketAnalysis]);
  const pendingCapContext = useMemo(() => ({
    team: userTeam,
    freeAgents: evaluatedFaPool,
    teamId: activeTeamId,
    currentCapRoom: capRoom,
  }), [userTeam, evaluatedFaPool, activeTeamId, capRoom]);
  const pendingCapReservation = useMemo(
    () => evaluatePendingOfferCapReservation(pendingCapContext),
    [pendingCapContext],
  );
  // Latest ledger record per player (worker returns newest-first) so rows can
  // show pending/accepted/rejected/expired status next to the player name.
  const offerStatusByPlayer = useMemo(() => {
    const map = new Map();
    for (const offer of faState?.pendingOffers ?? []) {
      if (!map.has(offer.playerId)) map.set(offer.playerId, offer);
    }
    return map;
  }, [faState?.pendingOffers]);

  // aiFaEngine V1: competing AI offer counts per player (amounts withheld until resolution).
  const aiOfferCountByPlayer = useMemo(() => {
    return faState?.aiOfferCountByPlayerId ?? {};
  }, [faState?.aiOfferCountByPlayerId]);

  const displayed = useMemo(() => {
    const base = filterFreeAgentsForView(evaluatedFaPool, {
      signedIds, posFilter, minOvr, nameFilter, advancedFilters, archetypeFilter, fitTierFilter, roleFilter, positionNeedOnly, needs: topNeeds,
    });
    return base.filter((player) => {
      const marketRow = marketRowsById.get(player.id);
      if (marketFilter === "need" && !marketAnalysis.filters.fitsTeamNeed(marketRow || {})) return false;
      if (marketFilter === "affordable" && !marketAnalysis.filters.affordable(marketRow || {})) return false;
      if (marketFilter === "starter" && !marketAnalysis.filters.starterUpgrades(marketRow || {})) return false;
      if (marketFilter === "young" && !marketAnalysis.filters.youngUpside(marketRow || {})) return false;
      if (marketFilter === "risk" && !marketAnalysis.filters.avoidRisks(marketRow || {})) return false;
      if (marketFilter === "watchlist" && !watchlistIds.has(player.id)) return false;
      if ((player.age ?? 99) > maxAge) return false;
      if ((player._eval?.schemeFit?.score ?? player.schemeFit ?? 0) < minSchemeFit) return false;
      if (demandTier !== "ALL" && formatDemandTier(player) !== demandTier) return false;
      if (watchOnly && !watchlistIds.has(player.id)) return false;
      return true;
    });
  }, [evaluatedFaPool, signedIds, posFilter, nameFilter, minOvr, advancedFilters, archetypeFilter, fitTierFilter, roleFilter, positionNeedOnly, topNeeds, maxAge, minSchemeFit, demandTier, watchOnly, watchlistIds, marketFilter, marketAnalysis, marketRowsById]);

  const sortedAgents = useMemo(() => {
    return sortFreeAgentsForView(displayed, { sortPreset, sortKey, sortDir, needs: (needsSummary?.needs ?? []).slice(0, 4), marketRowsById });
  }, [displayed, sortKey, sortDir, sortPreset, needsSummary?.needs, marketRowsById]);
  const archetypeOptions = useMemo(
    () => Array.from(new Set(evaluatedFaPool.map((p) => p?._eval?.archetype?.archetype).filter(Boolean))).slice(0, 24),
    [evaluatedFaPool],
  );

  // Honest load/empty status for the main table card. Distinguishes:
  //  - loading        → fetch in flight
  //  - error          → fetch failed / response unavailable
  //  - unavailable    → no FA window this phase (loaded but pool is empty here)
  //  - empty          → FA pool genuinely has no players
  //  - ready          → players exist (filtered-empty handled inline in the table)
  // resolveFreeAgencyLoadStatus is exported for unit testing each state.
  const loadStatus = useMemo(
    () => resolveFreeAgencyLoadStatus({
      loading,
      error: loadError,
      faState,
      poolCount: evaluatedFaPool.length,
    }),
    [loading, loadError, faState, evaluatedFaPool.length],
  );


  const {
    compareIds,
    setCompareIds,
    showComparison,
    setShowComparison,
    toggleCompare,
    comparePlayerA,
    comparePlayerB,
  } = usePlayerCompare(sortedAgents, 2);

  const isResignPhase = faState?.phase === "offseason_resign";
  const priorityTargets = useMemo(() => {
    if (isResignPhase) {
      return sortedAgents.filter((p) => (p.tags || []).includes("expiring") || p.isExpiring).slice(0, 5);
    }
    return sortedAgents.slice(0, 5);
  }, [sortedAgents, isResignPhase]);
  const projectedPriorityCost = useMemo(
    () => priorityTargets.reduce((sum, p) => sum + (p._ask ?? 0), 0),
    [priorityTargets]
  );
  const affordableTargets = useMemo(
    () => priorityTargets.filter((p) => (p._ask ?? 0) <= capRoom + 0.01).length,
    [priorityTargets, capRoom],
  );
  const recommendedTargets = useMemo(
    () => sortedAgents
      .map((p) => ({ player: p, fit: scoreFreeAgentForTeam(p, teamIntel, capRoom) }))
      .sort((a, b) => b.fit.score - a.fit.score)
      .slice(0, 4),
    [sortedAgents, teamIntel, capRoom],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc"); // default desc for most football stats
    }
  };

  const refreshFreeAgents = async () => {
    try {
      const res = await actions.getFreeAgents();
      setFaState(res.payload);
    } catch (err) {
      console.error("FA refresh error:", err);
    }
  };

  const handleWithdrawOffer = async (playerId) => {
    if (activeTeamId == null) return;
    try {
      await actions.withdrawOffer(playerId, activeTeamId);
      showFlash("Offer withdrawn — cap reservation released.");
      await refreshFreeAgents();
    } catch (err) {
      alert("Withdraw failed: " + err.message);
    }
  };

  const handleSign = async (playerId, contract) => {
    setSigningPlayerId(null);
    if (activeTeamId == null) {
      showFlash("Could not resolve your active team. Please reload and try again.");
      return;
    }
    try {
        await actions.submitOffer(playerId, activeTeamId, contract);
        showFlash(`Offer submitted.`);
        await refreshFreeAgents();
        // Optimistic update for test
        setFaState(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                freeAgents: prev.freeAgents.map(p => {
                    if (p.id === playerId) {
                        return { ...p, offers: { ...(p.offers || {}), userOffered: true } };
                    }
                    return p;
                })
            };
        });
    } catch (err) {
      alert("Sign failed: " + err.message);
    }
  };

  const showFlash = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  };

  const handleQuickFilterPriorities = () => {
    setPosFilter("ALL");
    setMinOvr(75);
    setSortKey("ovr");
    setSortDir("desc");
    setNameFilter("");
    setShowCapPreview(true);
    showFlash(isResignPhase ? "Re-sign priorities loaded: OVR 75+." : "Top-target quick filter loaded: OVR 75+.");
  };

  const resetMarketFilters = () => {
    setNameFilter("");
    setPosFilter("ALL");
    setMinOvr(0);
    setMaxAge(40);
    setMinSchemeFit(0);
    setDemandTier("ALL");
    setFitTierFilter("ALL");
    setArchetypeFilter("ALL");
    setRoleFilter("ALL");
    setPositionNeedOnly(false);
    setWatchOnly(false);
    setMarketFilter("all");
    setAdvancedFilters([]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="free-agency-container app-screen-stack">
      <style>{mobileStyle}</style>
      <ScreenHeader
        eyebrow="Operations"
        title="Free Agency"
        subtitle="Scan market pressure, filter targets, and place bids quickly."
        metadata={[
          { label: "Cap Room", value: `$${capRoom.toFixed(1)}M` },
          ...(faState?.capSummary && faState.capSummary.reservedPendingCap > 0
            ? [{ label: "Effective Cap", value: `$${Number(faState.capSummary.effectiveCapRoom).toFixed(1)}M` }]
            : []),
          { label: "Pool", value: sortedAgents.length },
          { label: "Phase", value: faState?.phase ?? "loading" },
        ]}
      />
      <Card className="card-premium" style={{ marginBottom: "var(--space-4)" }}>
        <CardContent style={{ padding: "var(--space-4)", display: "grid", gap: 10 }}>
          <div style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--text-muted)" }}>Market Snapshot</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <Badge variant="outline">Cap Room: {marketAnalysis?.summary?.capRoom != null ? `$${marketAnalysis.summary.capRoom.toFixed(1)}M` : "Unknown"}</Badge>
            <Badge variant="outline">Need: {marketAnalysis?.summary?.biggestNeed?.key ?? "Unknown"}</Badge>
            <Badge variant="outline">Top Fit: {marketAnalysis?.summary?.topFit?.name ?? "None"}</Badge>
            <Badge variant="outline">Bargain: {marketAnalysis?.summary?.bargainOption?.name ?? "None"}</Badge>
          </div>
          {(marketAnalysis?.summary?.capPressure === "high" || marketAnalysis?.summary?.capPressure === "critical") && <div style={{ color: "var(--warning)", fontSize: "var(--text-xs)" }}>Cap pressure is high. Expensive options may be risky.</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["all","All"],["need","Fits Team Need"],["affordable","Affordable"],["starter","Starter Upgrades"],["young","Young Upside"],["risk","Avoid Risks"],["watchlist","Watchlist"]].map(([k,l]) => (
              <Button key={k} size="sm" variant={marketFilter===k?"default":"outline"} onClick={() => setMarketFilter(k)}>{l}</Button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {(marketAnalysis?.topFits ?? []).slice(0,5).map((row) => (
              <div key={row.playerId} style={{ textAlign: "left", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 10, padding: 8 }}>
                <button type="button" onClick={() => onPlayerSelect?.(row._player)} style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, padding: 0 }}>
                  <div style={{ fontWeight: 700 }}>{row.name} · {row.pos} · OVR {row.ovr}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{row.recommendation} · fit {row.fitScore} · {row.capFit} · {row.replacementDeltaLabel}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{row.capImpactLabel}</div>
                </button>
                <Button size="sm" variant="outline" onClick={() => setWatchlistIds((prev) => { const next = new Set(prev); if (next.has(row.playerId)) next.delete(row.playerId); else next.add(row.playerId); return next; })}>{watchlistIds.has(row.playerId) ? "Unwatch" : "Watch"}</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="card-premium" style={{ marginBottom: "var(--space-4)" }}>
        <CardContent style={{ padding: "var(--space-4)", display: "grid", gap: 8 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Free Agency · transaction workspace</div>
          <div style={{ fontWeight: 700 }}>Use this screen to place and edit offers. Use FA Hub for portfolio-level market pressure and shortlist triage.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge variant="outline">{formatNeedsLine(needsSummary)}</Badge>
            <Badge variant="outline">Direction: {teamIntel.direction}</Badge>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("Team")}>Return to team overview</Button>
            <Button size="sm" variant="secondary" onClick={() => onNavigate?.("FA Hub")}>Open FA Hub Overview</Button>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{buildDirectionGuidance(teamIntel)}</div>
        </CardContent>
      </Card>
      <Card className="card-premium" style={{ marginBottom: "var(--space-4)" }}>
        <CardContent style={{ padding: "var(--space-3)", display: "grid", gap: 4 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase" }}>Recommended FA targets</div>
          {recommendedTargets.map(({ player, fit }) => (
            <div key={player.id} style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
              <strong style={{ color: "var(--text)" }}>{player.name}</strong> ({fit.pos}) · {fit.reason}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Free Agency Bidding War Status Banner */}
      {faState && (
        <Card
          className="card-premium"
          style={{
            marginBottom: "var(--space-4)",
          }}
        >
          <CardContent
            style={{
              padding: "var(--space-4)",
              background: "var(--surface-strong)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-3)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--text-muted)",
                }}
              >
                {faState.phase === "free_agency" ? "Bidding War" : "Current Phase"}
              </div>
              <div
                style={{
                  fontSize: "var(--text-base)",
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                {faState.phase === "free_agency"
                  ? `Free Agency: Day ${faState.faDay ?? 1} of ${faState.faMaxDays ?? 5}`
                  : faState.phase === "offseason_resign"
                    ? "Offseason Re-Signing"
                    : "In-Season Free Agency"}
              </div>
              {faState.phase === "free_agency" && (
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  Submit your bids, then advance the day. Players evaluate all offers at day's end.
                </div>
              )}
            </div>
            {faState.phase === "free_agency" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {/* Day progress pips */}
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {Array.from({ length: faState.faMaxDays ?? 5 }, (_, i) => (
                    <span
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: i < (faState.faDay ?? 1) ? "var(--accent)" : "var(--hairline)",
                        border: i === (faState.faDay ?? 1) - 1 ? "2px solid var(--accent)" : "none",
                      }}
                    />
                  ))}
                </div>
                <Button
                  className="btn btn-primary"
                  onClick={() => actions.advanceFreeAgencyDay()}
                >
                  Advance Day {faState.faDay ?? 1} →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CapBanner userTeam={userTeam} />
      <PendingOffersPanel
        pendingOffers={faState?.pendingOffers}
        capSummary={faState?.capSummary}
        onWithdraw={handleWithdrawOffer}
      />
      <PendingCapImpactPanel reservation={pendingCapReservation} />

      {flash && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--success)22",
            border: "1px solid var(--success)",
            color: "var(--success)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-4)",
            fontWeight: 600,
            fontSize: "var(--text-sm)",
          }}
        >
          ✓ {flash}
        </div>
      )}

      {/* Filters Toolbar */}
      <StickySubnav title="Filters and view">
        <Button className="btn" onClick={() => setViewMode("table")} style={{ opacity: viewMode === "table" ? 1 : 0.75 }}>Table</Button>
        <Button className="btn" onClick={() => setViewMode("cards")} style={{ opacity: viewMode === "cards" ? 1 : 0.75 }}>Cards</Button>
      </StickySubnav>
      <Card
        className="card-premium"
        style={{
          marginBottom: "var(--space-4)",
          position: "sticky",
          top: "calc(env(safe-area-inset-top) + 4px)",
          zIndex: 9,
        }}
      >
        <CardContent
          style={{
            padding: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          {/* Top row: search & OVR */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              rowGap: "var(--space-2)",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Input
              type="text"
              placeholder="Search players..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              style={{
                padding: "6px 12px",
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: "var(--text-sm)",
                flex: "1 1 200px",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                Min OVR:
              </span>
              <Input
                type="number"
                min="0"
                max="99"
                value={minOvr}
                onChange={(e) => setMinOvr(Number(e.target.value))}
                style={{
                  width: 60,
                  padding: "4px 8px",
                  background: "var(--surface-strong)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: "var(--text-sm)",
                }}
              />
            </div>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Max Age
              <Input type="number" min="21" max="45" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value) || 40)} style={{ width: 62, marginLeft: 6 }} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Min Fit
              <Input type="number" min="0" max="100" value={minSchemeFit} onChange={(e) => setMinSchemeFit(Number(e.target.value) || 0)} style={{ width: 62, marginLeft: 6 }} />
            </label>
            <select value={demandTier} onChange={(e) => setDemandTier(e.target.value)} style={{ height: 30, borderRadius: 8, background: "var(--surface-strong)", border: "1px solid var(--hairline)", color: "var(--text)", fontSize: 12 }}>
              <option value="ALL">Demand: All</option>
              <option value="value">Demand: Value</option>
              <option value="starter">Demand: Starter</option>
              <option value="premium">Demand: Premium</option>
            </select>
            <select value={sortPreset} onChange={(e) => setSortPreset(e.target.value)} style={{ height: 30, borderRadius: 8, background: "var(--surface-strong)", border: "1px solid var(--hairline)", color: "var(--text)", fontSize: 12 }}>
              <option value="best_available">Sort: Best Fit</option>
              <option value="cheapest_value">Sort: Cheapest</option>
              <option value="young_upside">Sort: Young Upside</option>
              <option value="position_need">Sort: Position need</option>
              <option value="starter_upgrade">Sort: Starter Upgrade</option>
              <option value="tactical_fit">Sort: Scheme Fit</option>
              <option value="lowest_risk">Sort: Lowest Risk</option>
              <option value="manual">Sort: Manual columns</option>
            </select>
            <select value={fitTierFilter} onChange={(e) => setFitTierFilter(e.target.value)} style={{ height: 30, borderRadius: 8, background: "var(--surface-strong)", border: "1px solid var(--hairline)", color: "var(--text)", fontSize: 12 }}>
              <option value="ALL">Fit tier: All</option>
              <option value="Excellent">Excellent</option>
              <option value="Strong">Strong</option>
              <option value="Neutral">Neutral</option>
              <option value="Poor">Poor</option>
            </select>
            <select value={archetypeFilter} onChange={(e) => setArchetypeFilter(e.target.value)} style={{ height: 30, borderRadius: 8, background: "var(--surface-strong)", border: "1px solid var(--hairline)", color: "var(--text)", fontSize: 12, maxWidth: 220 }}>
              <option value="ALL">Archetype: All</option>
              {archetypeOptions.map((arch) => <option key={arch} value={arch}>{arch}</option>)}
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ height: 30, borderRadius: 8, background: "var(--surface-strong)", border: "1px solid var(--hairline)", color: "var(--text)", fontSize: 12 }}>
              <option value="ALL">Role: All</option>
              <option value="Starter">Starter</option>
              <option value="Rotation">Rotation</option>
              <option value="Depth">Depth</option>
              <option value="Development">Development</option>
            </select>
            <Button className="btn" onClick={() => setPositionNeedOnly((v) => !v)} style={{ whiteSpace: "nowrap", opacity: positionNeedOnly ? 1 : 0.8 }}>
              {positionNeedOnly ? "Need positions only" : "All positions"}
            </Button>
            <Button className="btn" onClick={() => setWatchOnly((prev) => !prev)} style={{ whiteSpace: "nowrap" }}>
              {watchOnly ? "Showing watchlist" : `Watchlist (${watchlistIds.size})`}
            </Button>
            {isResignPhase ? (
              <Button className="btn btn-primary" onClick={handleQuickFilterPriorities} style={{ whiteSpace: "nowrap" }}>
                Quick Filter: Re-sign Priorities
              </Button>
            ) : (
              <Button className="btn btn-primary" onClick={handleQuickFilterPriorities} style={{ whiteSpace: "nowrap" }}>
                Quick Filter: Top Targets
              </Button>
            )}
          </div>

          {/* Bottom row: Position Pills */}
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {POSITIONS.map((pos) => (
              <Button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "var(--radius-pill)",
                  border:
                    pos === posFilter
                      ? "1px solid var(--accent)"
                      : "1px solid var(--hairline)",
                  background:
                    pos === posFilter ? "var(--accent-muted)" : "var(--surface)",
                  color: pos === posFilter ? "var(--accent)" : "var(--text)",
                  fontSize: "var(--text-xs)",
                  fontWeight: pos === posFilter ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {pos}
              </Button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            Top needs: {topNeeds.join(", ") || "No urgent positional needs"}.
          </div>
        </CardContent>
      </Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        <span>{buildShowingLabel(sortedAgents.length, evaluatedFaPool.length, faState?.phase === "offseason_resign" ? "re-sign target" : "free agent")}</span>
        <Button type="button" variant="outline" onClick={resetMarketFilters}>Reset filters</Button>
      </div>
      <AdvancedPlayerSearch
        filters={advancedFilters}
        onChange={setAdvancedFilters}
        title="Advanced player search (AND)"
      />
      {showComparison && comparePlayerA && comparePlayerB && (
        <PlayerComparison playerA={comparePlayerA} playerB={comparePlayerB} onClose={() => setShowComparison(false)} />
      )}
      <PlayerCompareTray
        compareIds={compareIds}
        resolvePlayer={(id) => sortedAgents.find((p) => p.id === id)}
        onRemove={toggleCompare}
        onOpenCompare={() => setShowComparison(true)}
        onClear={() => setCompareIds([])}
      />

      {showCapPreview && (
        <Card className="card-premium" style={{ marginBottom: "var(--space-4)", borderColor: "var(--accent-gold)" }}>
          <CardContent style={{ padding: "var(--space-4)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Cap Impact Preview
              </div>
              <div style={{ fontWeight: 800, color: "var(--text)" }}>
                {priorityTargets.length} filtered target{priorityTargets.length === 1 ? "" : "s"}: ${projectedPriorityCost.toFixed(1)}M / yr total demand
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: projectedPriorityCost > capRoom ? "var(--danger)" : "var(--success)" }}>
                You can currently afford {affordableTargets}/{priorityTargets.length || 0} · remaining room: ${(capRoom - projectedPriorityCost).toFixed(1)}M
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginTop: 2 }}>
                Uses each player's current ask/demand when available.
              </div>
            </div>
            <Button className="btn" onClick={() => setShowCapPreview(false)}>Close</Button>
          </CardContent>
        </Card>
      )}

      {/* Main Table Card */}
      <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
        {loadStatus.state !== "ready" ? (
          <StatusEmptyState
            testId="fa-load-status"
            state={loadStatus.state}
            title={loadStatus.title}
            body={loadStatus.body}
          />
        ) : (
          <div>
            {viewMode === "table" && <div className="desktop-only table-wrapper" style={{ overflowX: "auto" }}>
              <Table className="standings-table" style={{ width: "100%" }}>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      style={{
                        paddingLeft: "var(--space-5)",
                        width: 36,
                        color: "var(--text-subtle)",
                        fontSize: "var(--text-xs)",
                      }}
                    >
                      #
                    </TableHead>
                    <SortTh
                      label="POS"
                      sortKey="pos"
                      current={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortTh
                      label="NAME"
                      sortKey="name"
                      current={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <TableHead>TRAITS</TableHead>
                    <SortTh
                      label="OVR"
                      sortKey="ovr"
                      current={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortTh
                      label="AGE"
                      sortKey="age"
                      current={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <TableHead style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600, textAlign: "center" }}>
                      CMP
                    </TableHead>
                    <TableHead style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600, textAlign: "center" }}>
                      WL
                    </TableHead>
                    <TableHead
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                    >
                      SCHEME FIT
                    </TableHead>
                    <TableHead
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                    >
                      TOP BID
                    </TableHead>
                    <SortTh
                      label="ASK $/YR"
                      sortKey="ask"
                      current={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      right
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgents.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        style={{ padding: 0 }}
                      >
                        <StatusEmptyState
                          testId="fa-filtered-empty"
                          state="filtered"
                          title="No players match your filters."
                          body="Adjust your filters, minimum OVR, or search to widen the pool."
                          actionLabel="Reset filters"
                          onAction={resetMarketFilters}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  {sortedAgents.slice(0, 100).map((player, idx) => {
                    const isSigningThis = signingPlayerId === player.id;
                    const canAfford = (player._ask ?? 0) <= capRoom + 0.01;
                    const askYrs = suggestedYears(player.age);
                    const offers = player.offers || {};
                    const market = summarizeFreeAgentMarket(player);
                    const hasBids = market.bidderCount > 0;
                    const userIsTop = market.userLeads;

                    // Top Bid cell (shared between signing & normal rows)
                    const topBidCell = (
                      <TableCell style={{ textAlign: "center", whiteSpace: "nowrap", fontSize: "var(--text-xs)" }}>
                        {hasBids ? (
                          <div>
                            <div style={{
                              fontWeight: 700,
                              color: userIsTop ? "var(--success)" : "var(--warning)",
                            }}>
                              {market.topOfferLabel}
                            </div>
                            <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                              {market.topBidTeam ?? "No current market snapshot"}
                            </div>
                            <div style={{ color: "var(--text-muted)", marginTop: 1 }}>
                              {market.competitionLabel}
                            </div>
                            <div style={{ color: "var(--text-muted)", marginTop: 1 }}>
                              {market.attention ?? `Market: ${market.heatLabel ?? "No market heat signal"}`} · {market.knownBidderLabel}
                            </div>
                            <div style={{ color: "var(--text-muted)", marginTop: 1 }}>
                              {market.decision}
                            </div>
                            {market.decisionReason && (
                              <div style={{ color: "var(--text-subtle)", marginTop: 1 }}>
                                {market.decisionReason}
                              </div>
                            )}
                            <div style={{ color: "var(--text-muted)", marginTop: 1 }}>
                              {market.urgencyLabel}{market.patienceLabel ? ` · ${market.patienceLabel}` : ""}
                            </div>
                            <div style={{ color: "var(--text-muted)", marginTop: 1 }}>
                              Playbook knowledge: {formatPlaybookKnowledge(player?.playbookKnowledge)}
                            </div>
                            {market.motivationSummary && (
                              <div style={{ color: "var(--text-subtle)", marginTop: 1 }}>
                                {market.motivationSummary}{market.fitScore ? ` · Fit ${market.fitScore}/100` : ""}
                              </div>
                            )}
                            {market.stateChips?.length ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 3 }}>
                                {market.stateChips.slice(0, 2).map((chip) => (
                                  <span key={chip} style={{ fontSize: 10, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 6px', color: 'var(--text-subtle)' }}>{chip}</span>
                                ))}
                              </div>
                            ) : null}
                            {!!market.reSign?.recommendationTier && (
                              <div style={{ color: "var(--text-subtle)", marginTop: 1 }}>
                                {RESIGN_TIER_LABEL[market.reSign.recommendationTier] ?? "Re-sign view unavailable"}: {market.reSign.shortReason}
                              </div>
                            )}
                            {userIsTop && (
                              <span style={{
                                display: "inline-block",
                                marginTop: 2,
                                padding: "1px 6px",
                                borderRadius: "var(--radius-pill)",
                                background: "var(--success)22",
                                color: "var(--success)",
                                fontWeight: 700,
                                fontSize: "10px",
                              }}>
                                YOUR BID LEADS
                              </span>
                            )}
                            {!userIsTop && offers.userOffered && (
                              <div style={{ color: "var(--warning)", marginTop: 3, fontSize: "10px" }}>
                                {market.leadLabel}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-subtle)" }}>No visible competing offer yet</span>
                        )}
                      </TableCell>
                    );

                    if (isSigningThis) {
                      return (
                        <React.Fragment key={player.id}>
                          <TableRow style={{ background: "var(--accent)0d" }}>
                            <TableCell style={{ paddingLeft: "var(--space-5)", color: "var(--text-subtle)", fontSize: "var(--text-xs)", fontWeight: 700 }}>
                              {idx + 1}
                            </TableCell>
                            <TableCell><PosBadge pos={player.pos} /></TableCell>
                            <TableCell onClick={() => setPreviewPlayer(player)} style={{ fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                              <span style={{ borderBottom: "1px dotted var(--text-muted)" }}>{player.name}</span>
                              <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>
                                {player?._eval?.archetype?.archetype ?? "Balanced"} · {player?._eval?.roleProjection?.role ?? "Depth"} · {player?._eval?.simImpact?.summary}
                              </div>
                              <ContractOfferInsightBlock player={player} capRoom={capRoom} compact />
                            </TableCell>
                            <TableCell style={{ whiteSpace: "nowrap" }}>
                              {(player.traits || []).map((t) => <TraitBadge key={t} traitId={t} />)}
                            </TableCell>
                            <TableCell><OvrBadge ovr={player.ovr} />{player.scoutUncertaintyBand ? <div style={{fontSize:11,color:'var(--text-muted)'}}>{player.scoutConfidenceLabel} · ±{player.scoutUncertaintyBand}</div> : null}</TableCell>
                            <TableCell style={{ color: "var(--text-muted)" }}>{player.age}</TableCell>
                            <TableCell style={{ textAlign: "center" }}><Button title={compareIds.includes(player.id) ? "Remove from compare" : "Add to compare"} onClick={() => toggleCompare(player)} style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", border: `1.5px solid ${compareIds.includes(player.id) ? "var(--accent)" : "var(--hairline)"}`, background: compareIds.includes(player.id) ? "var(--accent-muted)" : "transparent", fontSize: 12, color: compareIds.includes(player.id) ? "var(--accent)" : "var(--text-subtle)" }}>{compareIds.includes(player.id) ? "✓" : "⊕"}</Button></TableCell>
                            <TableCell style={{ textAlign: "center" }}><Button title={watchlistIds.has(player.id) ? "Remove from watchlist" : "Add to watchlist"} onClick={() => setWatchlistIds((prev) => { const next = new Set(prev); if (next.has(player.id)) next.delete(player.id); else next.add(player.id); return next; })} style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", border: `1.5px solid ${watchlistIds.has(player.id) ? "var(--warning)" : "var(--hairline)"}`, background: watchlistIds.has(player.id) ? "rgba(255,159,10,0.16)" : "transparent", fontSize: 12, color: watchlistIds.has(player.id) ? "var(--warning)" : "var(--text-subtle)" }}>{watchlistIds.has(player.id) ? "★" : "☆"}</Button></TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              <PipBar value={player?._eval?.schemeFit?.score ?? player.schemeFit ?? 50} color="var(--accent)" />
                              <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>{player?._eval?.schemeFit?.tier ?? "Neutral"}</div>
                            </TableCell>
                            {topBidCell}
                            <TableCell style={{ textAlign: "right", paddingRight: "var(--space-5)" }}>
                              <Button className="btn btn-primary" disabled>
                                {offers.userOffered ? "Update Bid" : "Submit Bid"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <SignInlineForm
                              player={player}
                              capRoom={capRoom}
                              pendingCapContext={pendingCapContext}
                              rosterCount={rosterCount}
                              rosterLimit={rosterLimit}
                              onCancel={() => setSigningPlayerId(null)}
                              onSubmit={(c) => handleSign(player.id, c)}
                            />
                          </TableRow>
                        </React.Fragment>
                      );
                    }

                    return (
                      <TableRow key={player.id}>
                        <TableCell style={{ paddingLeft: "var(--space-5)", color: "var(--text-subtle)", fontSize: "var(--text-xs)", fontWeight: 700 }}>
                          {idx + 1}
                        </TableCell>
                        <TableCell><PosBadge pos={player.pos} /></TableCell>
                        <TableCell onClick={() => onPlayerSelect && onPlayerSelect(player.id, buildFreeAgencyProfileContext(player.market ?? player))} style={{ fontWeight: 600, color: "var(--text)", cursor: onPlayerSelect ? "pointer" : "default" }}>
                          <span style={{ borderBottom: onPlayerSelect ? "1px dotted var(--text-muted)" : "none" }}>{player.name}</span>
                          {(() => {
                            const offerStatus = offerStatusByPlayer.get(player.id);
                            if (!offerStatus) return null;
                            const tone = OFFER_STATUS_TONE[offerStatus.status] ?? "var(--text-muted)";
                            const isOutbid = offerStatus.status === 'rejected' && (offerStatus.feedback ?? []).some((f) => typeof f === 'string' && f.includes('signed with'));
                            const winningTeamName = isOutbid ? (() => { const m = (offerStatus.feedback?.[0] ?? '').match(/signed with (.+?) instead/); return m ? m[1] : null; })() : null;
                            return (
                              <>
                                <span data-testid={`fa-offer-status-${player.id}`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 999, padding: "0 6px" }}>
                                  {OFFER_STATUS_LABEL[offerStatus.status] ?? "Pending"}
                                </span>
                                {isOutbid && winningTeamName && (
                                  <div data-testid={`fa-outbid-${player.id}`} style={{ fontSize: 10, color: "var(--danger)", marginTop: 2 }}>
                                    Signed with {winningTeamName} — you were outbid
                                  </div>
                                )}
                                {offerStatus.status === 'expired' && (offerStatus.feedback ?? []).some((f) => typeof f === 'string' && f.includes('negotiation window')) && (
                                  <div data-testid={`fa-back-on-market-${player.id}`} style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                                    Back on market — all offers rejected
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          {(() => {
                            const aiCount = aiOfferCountByPlayer[String(player.id)] ?? 0;
                            if (aiCount === 0) return null;
                            return (
                              <div data-testid={`fa-competing-badge-${player.id}`} style={{ fontSize: 10, color: "var(--warning)", marginTop: 2, fontWeight: 600 }}>
                                {aiCount} other team{aiCount === 1 ? '' : 's'} interested
                              </div>
                            );
                          })()}
                          <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>
                            {player?._eval?.archetype?.archetype ?? "Balanced"} · {player?._eval?.roleProjection?.replaceContext ?? "Depth option"}
                          </div>
                          <ContractOfferInsightBlock player={player} capRoom={capRoom} compact />
                        </TableCell>
                        <TableCell style={{ whiteSpace: "nowrap" }}>
                          {(player.traits || []).map((t) => <TraitBadge key={t} traitId={t} />)}
                        </TableCell>
                        <TableCell><OvrBadge ovr={player.ovr} /></TableCell>
                        <TableCell style={{ color: "var(--text-muted)" }}>{player.age}</TableCell>
                        <TableCell style={{ textAlign: "center" }}><Button title={compareIds.includes(player.id) ? "Remove from compare" : "Add to compare"} onClick={() => toggleCompare(player)} style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", border: `1.5px solid ${compareIds.includes(player.id) ? "var(--accent)" : "var(--hairline)"}`, background: compareIds.includes(player.id) ? "var(--accent-muted)" : "transparent", fontSize: 12, color: compareIds.includes(player.id) ? "var(--accent)" : "var(--text-subtle)" }}>{compareIds.includes(player.id) ? "✓" : "⊕"}</Button></TableCell>
                        <TableCell style={{ textAlign: "center" }}><Button title={watchlistIds.has(player.id) ? "Remove from watchlist" : "Add to watchlist"} onClick={() => setWatchlistIds((prev) => { const next = new Set(prev); if (next.has(player.id)) next.delete(player.id); else next.add(player.id); return next; })} style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", border: `1.5px solid ${watchlistIds.has(player.id) ? "var(--warning)" : "var(--hairline)"}`, background: watchlistIds.has(player.id) ? "rgba(255,159,10,0.16)" : "transparent", fontSize: 12, color: watchlistIds.has(player.id) ? "var(--warning)" : "var(--text-subtle)" }}>{watchlistIds.has(player.id) ? "★" : "☆"}</Button></TableCell>
                        <TableCell style={{ textAlign: "center" }}>
                          <PipBar value={player?._eval?.schemeFit?.score ?? player.schemeFit ?? 50} color="var(--accent)" />
                          <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>{player?._eval?.schemeFit?.tier ?? "Neutral"}</div>
                        </TableCell>
                        {topBidCell}
                        <TableCell style={{ textAlign: "right", paddingRight: "var(--space-5)", whiteSpace: "nowrap" }}>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>
                            ${(player?.demandProfile?.askAnnual ?? player._ask ?? 0).toFixed(1)}M{" "}
                            <span style={{ color: "var(--text-muted)" }}>/ {askYrs}y</span>
                          </div>
                          {(() => {
                            const leverageLabel = player?.demandProfile?.leverageLabel;
                            if (!leverageLabel || leverageLabel === 'Standard') return null;
                            const isHofInducted = player?.hofStatus === 'inducted';
                            const displayLabel = isHofInducted ? 'Hall of Famer' : leverageLabel;
                            const leverageColor = leverageLabel === 'High Leverage' ? 'var(--warning)' : 'var(--success)';
                            const badgeColor = isHofInducted ? '#b8860b' : leverageColor;
                            const feedbackLine = player?.demandProfile?.feedbackLine;
                            return (
                              <div data-testid="fa-leverage-indicator" style={{ marginBottom: 4 }}>
                                <span data-testid="fa-leverage-label" style={{ fontSize: 10, fontWeight: 700, color: badgeColor, border: `1px solid ${badgeColor}`, borderRadius: 999, padding: "0 5px" }}>
                                  {displayLabel}
                                </span>
                                {feedbackLine && !isHofInducted && (
                                  <div data-testid="fa-leverage-reason" style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>
                                    {feedbackLine}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: 4 }}>
                            {player?.demandProfile?.headline ?? "Balanced priorities"}{market.riskLabel ? ` · ${market.riskLabel}` : ""}
                          </div>
                          <div style={{ marginBottom: 4 }}>
                            {(() => {
                              const budget = getBudgetLabel({ askAnnual: player?.demandProfile?.askAnnual ?? player._ask ?? 0, capRoom });
                              return <span style={{ fontSize: "10px", color: toneToCssColor(budget.tone), fontWeight: 700 }}>{budget.label}</span>;
                            })()}
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: 4 }}>
                            Playbook: {formatPlaybookKnowledge(player?.playbookKnowledge)}
                          </div>
                          {player?.demandProfile?.feedbackLine && player?.demandProfile?.leverageLabel === 'Standard' && (
                            <div style={{ fontSize: 10, color: "var(--text-subtle)", marginBottom: 4 }}>
                              {player.demandProfile.feedbackLine}
                            </div>
                          )}
                          {!canAfford ? (
                            <span style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>
                              Cannot Afford
                            </span>
                          ) : (
                            <Button
                              className="btn btn-primary"
                              style={{ padding: "2px 10px", fontSize: "var(--text-xs)" }}
                              onClick={() => setSigningPlayerId(player.id)}
                            >
                              {offers.userOffered ? "Update Bid" : "Submit Bid"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>}

            {viewMode === "cards" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-3)", padding: "var(--space-3)" }}>
                {sortedAgents.length === 0 ? (
                  <StatusEmptyState
                    testId="fa-filtered-empty"
                    state="filtered"
                    title={faState?.phase === "offseason_resign" ? "No re-sign targets match your filters." : "No players match your filters."}
                    body={faState?.phase === "offseason_resign"
                      ? "Try broadening position filters or lowering minimum OVR to find affordable retention options."
                      : "Adjust filters or open FA Hub to scout position pressure before returning here."}
                    actionLabel="Reset filters"
                    onAction={resetMarketFilters}
                  />
                ) : null}
                {sortedAgents.slice(0, 80).map((player, idx) => (
                  <Card key={player.id} className="card-premium" style={{ padding: "var(--space-3)" }}>
                    <div style={{ fontWeight: 700 }}>{idx + 1}. {player.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{player.pos} · age {player.age} · OVR {player.ovr}{player.scoutUncertaintyBand ? ` (Scout ${player.scoutOvr} ±${player.scoutUncertaintyBand})` : ''}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{player?._eval?.archetype?.archetype ?? "Balanced"} · Fit {player?._eval?.schemeFit?.score ?? player.schemeFit ?? 50} ({player?._eval?.schemeFit?.tier ?? "Neutral"})</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{player?._eval?.roleProjection?.replaceContext ?? "Depth option"} · {player?._eval?.simImpact?.summary}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Playbook {formatPlaybookKnowledge(player?.playbookKnowledge)}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Demand {(player?.demandProfile?.askAnnual ?? player._ask ?? 0).toFixed(1)}M / yr</div>
                    <ContractOfferInsightBlock player={player} capRoom={capRoom} showReasons />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {getMarketPlayerTags(player, { capRoom, needs: needsSummary?.needs ?? [], surplus: needsSummary?.surplus ?? [] }).map((tag) => (
                        <span key={`${player.id}-${tag.label}`} style={{ fontSize: 10, border: "1px solid var(--hairline)", padding: "1px 6px", borderRadius: 999, color: toneToCssColor(tag.tone) }}>{tag.label}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{player?.demandProfile?.headline ?? 'Balanced motivations'}{player?.demandProfile?.fitScore ? ` · Fit ${player.demandProfile.fitScore}/100` : ''}</div>
                    {Array.isArray(player?.market?.stateChips) && player.market.stateChips.length > 0 ? <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{player.market.stateChips.join(' · ')}</div> : null}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <Button className="btn" onClick={() => onPlayerSelect && onPlayerSelect(player.id, buildFreeAgencyProfileContext(player.market ?? player))}>View profile</Button>
                      <Button className="btn" onClick={() => toggleCompare(player)}>{compareIds.includes(player.id) ? "Uncompare" : "Compare"}</Button>
                      <Button className="btn btn-primary" onClick={() => setSigningPlayerId(player.id)}>Negotiate</Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Mobile Card Layout */}
            <div className="mobile-only" style={{ display: "none", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-3)" }}>
               {sortedAgents.length === 0 && (
                  <StatusEmptyState
                    testId="fa-filtered-empty"
                    state="filtered"
                    title={faState?.phase === "offseason_resign" ? "No re-sign targets match your filters." : "No players match your filters."}
                    body={faState?.phase === "offseason_resign"
                      ? "Try broadening position filters or lowering minimum OVR to find affordable retention options."
                      : "Adjust filters, minimum OVR, or search criteria."}
                    actionLabel="Reset filters"
                    onAction={resetMarketFilters}
                  />
               )}
               {sortedAgents.slice(0, 100).map((player, idx) => {
                  const isSigningThis = signingPlayerId === player.id;
                  const canAfford = (player._ask ?? 0) <= capRoom + 0.01;
                  const askYrs = suggestedYears(player.age);
                  const mOffers = player.offers || {};
                  const mMarket = summarizeFreeAgentMarket(player);
                  const mHasBids = mMarket.bidderCount > 0;
                  const mUserIsTop = mMarket.userLeads;

                  return (
                     <Card key={player.id} className="card-premium" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-3)", background: isSigningThis ? "var(--surface-strong)" : "var(--surface)", border: mUserIsTop ? "1px solid var(--success)" : "1px solid var(--hairline)", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                        <div style={{ display: "flex", gap: "var(--space-3)" }}>
                           <PlayerAvatar text={player.pos} teamColor="var(--accent)" size={56} />
                           <div style={{ flex: 1 }}>
                               <div style={{ fontWeight: 700, fontSize: "var(--text-base)", color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
                                   <span onClick={() => setPreviewPlayer(player)} style={{ cursor: "pointer", borderBottom: "1px dotted" }}>{idx + 1}. {player.name}</span>
                                   <OvrBadge ovr={player.ovr} />
                               </div>
                                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                                   Age {player.age} · Ask: ${(player?.demandProfile?.askAnnual ?? player._ask ?? 0).toFixed(1)}M/yr ({askYrs} yr)
                                </div>
                                <ContractOfferInsightBlock player={player} capRoom={capRoom} compact />
                               <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>
                                  {player?._eval?.archetype?.archetype ?? "Balanced"} · Fit {player?._eval?.schemeFit?.score ?? player.schemeFit ?? 50} ({player?._eval?.schemeFit?.tier ?? "Neutral"}) · {player?._eval?.roleProjection?.role ?? "Depth"}
                               </div>
                               <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: 2 }}>
                                   {player?.demandProfile?.headline ?? "Balanced priorities"} · {mMarket.attention ?? `${mMarket.heatLabel ?? "No market heat signal"} market`} · {mMarket.knownBidderLabel}
                                </div>
                                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: 2 }}>
                                   {mMarket.decision} · {mMarket.urgencyLabel}{mMarket.patienceLabel ? ` · ${mMarket.patienceLabel}` : ""}
                                </div>
                                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: 2 }}>
                                   Playbook: {formatPlaybookKnowledge(player?.playbookKnowledge)}
                                </div>
                                {mMarket.decisionReason && (
                                  <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginTop: 2 }}>
                                    {mMarket.decisionReason}
                                  </div>
                                )}
                                {!!mMarket.reSign?.recommendationTier && (
                                  <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginTop: 2 }}>
                                    {RESIGN_TIER_LABEL[mMarket.reSign.recommendationTier] ?? "Re-sign"} · {mMarket.reSign.shortReason}
                                  </div>
                                )}
                               {/* Top Bid info on mobile */}
                               {mHasBids && (
                                 <div style={{ fontSize: "var(--text-xs)", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                   <span style={{ fontWeight: 700, color: mUserIsTop ? "var(--success)" : "var(--warning)" }}>
                                     Top Bid: {mMarket.topOfferLabel}
                                   </span>
                                   <span style={{ color: "var(--text-muted)" }}>by {mMarket.topBidTeam ?? "No current market snapshot"}</span>
                                   <span style={{ color: "var(--text-muted)" }}>({mMarket.competitionLabel})</span>
                                   {mUserIsTop && (
                                     <span style={{ padding: "1px 6px", borderRadius: "var(--radius-pill)", background: "var(--success)22", color: "var(--success)", fontWeight: 700, fontSize: "10px" }}>
                                       YOUR BID LEADS
                                     </span>
                                   )}
                                   {!mUserIsTop && mOffers.userOffered && (
                                     <span style={{ color: "var(--warning)", fontSize: "10px" }}>{mMarket.leadLabel}</span>
                                   )}
                                 </div>
                               )}
                               <div style={{ marginTop: "var(--space-2)" }}>
                                  {(player.traits || []).map((t) => <TraitBadge key={t} traitId={t} />)}
                               </div>
                               <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                 {getMarketPlayerTags(player, { capRoom, needs: needsSummary?.needs ?? [], surplus: needsSummary?.surplus ?? [] }).map((tag) => (
                                   <span key={`${player.id}-m-${tag.label}`} style={{ fontSize: 10, border: "1px solid var(--hairline)", padding: "1px 6px", borderRadius: 999, color: toneToCssColor(tag.tone) }}>{tag.label}</span>
                                 ))}
                               </div>
                           </div>
                        </div>

                        {isSigningThis ? (
                            <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: "var(--space-3)", marginTop: "var(--space-2)" }}>
                               <SignInlineForm player={player} capRoom={capRoom} pendingCapContext={pendingCapContext} rosterCount={rosterCount} rosterLimit={rosterLimit} asDiv onCancel={() => setSigningPlayerId(null)} onSubmit={(c) => handleSign(player.id, c)} />
                            </div>
                        ) : (
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                               <Button className="btn" onClick={() => setPreviewPlayer(player)} style={{ fontSize: "var(--text-xs)", padding: "4px 12px" }}>View Card</Button>
                               <Button className="btn btn-primary" onClick={() => setSigningPlayerId(player.id)}>{mOffers.userOffered ? "Update Bid" : "Submit Bid"}</Button>
                            </div>
                        )}
                     </Card>
                  );
               })}
            </div>
          </div>
        )}
      </Card>

      {/* Pool count footer */}
      <div
        style={{
          marginTop: "var(--space-3)",
          fontSize: "var(--text-xs)",
          color: "var(--text-subtle)",
          textAlign: "right",
        }}
      >
        {displayed.length} shown · {Math.max(0, faPool.length - signedIds.size)}{" "}
        available in pool
      </div>

      {/* Player Preview Sheet */}
      {previewPlayer && (
        <PlayerPreviewSheet
          player={previewPlayer}
          capRoom={capRoom}
          pendingCapContext={pendingCapContext}
          onClose={() => setPreviewPlayer(null)}
          onSubmitBid={handleSign}
        />
      )}
    </div>
  );
}
