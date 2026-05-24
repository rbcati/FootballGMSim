import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeManagement } from "../utils/playerManagement.js";
import { generateAITradeBlock } from "../../core/trades/tradeBlockGenerator.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCapHit(player) {
  const hit = Number(player?.contract?.baseAnnual ?? player?.capHit ?? player?.baseAnnual ?? 0);
  return Number.isFinite(hit) ? `$${hit.toFixed(1)}M` : "—";
}

function ovrColorOf(ovr) {
  if (ovr >= 88) return "var(--success)";
  if (ovr >= 78) return "#0A84FF";
  if (ovr >= 68) return "#FF9F0A";
  return "var(--danger)";
}

function inferPostureLabel(assets) {
  const allTags = assets.flatMap((a) => a.reasonTags ?? []);
  if (allTags.some((t) => t === "cap_burden" || t === "cap_restricted")) return "Cap Strapped";
  if (allTags.some((t) => t === "rebuilder" || t === "aging_veteran")) return "Rebuilding";
  if (allTags.some((t) => t === "contender" || t === "redundant_depth")) return "Contending";
  return "Balanced";
}

// ── League Block sub-components ───────────────────────────────────────────────

function LeagueBlockRow({ player }) {
  if (!player) return null;
  const ovr = player.ovr ?? 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "36px 30px 1fr auto auto",
        gap: "var(--space-2)",
        alignItems: "center",
        padding: "var(--space-2) var(--space-3)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600 }}>
        {player.pos ?? "—"}
      </span>
      <span
        style={{
          fontWeight: 800,
          fontSize: "var(--text-xs)",
          color: ovrColorOf(ovr),
          textAlign: "center",
        }}
      >
        {ovr || "—"}
      </span>
      <span
        style={{
          fontWeight: 600,
          fontSize: "var(--text-xs)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {player.name ?? "Unknown"}
      </span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        Age&nbsp;{player.age ?? "—"}
      </span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", whiteSpace: "nowrap" }}>
        {fmtCapHit(player)}/yr
      </span>
    </div>
  );
}

function LeagueBlockTeamGroup({ team, assets }) {
  const postureLabel = inferPostureLabel(assets);
  const playerAssets = assets.filter((a) => a.assetType === "player");
  const pickAssets = assets.filter((a) => a.assetType === "pick");
  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        marginBottom: "var(--space-2)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-2) var(--space-3)",
          background: "var(--surface-strong)",
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          gap: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        <span>{team?.name ?? team?.abbr ?? "AI Team"}</span>
        <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
          {postureLabel} · {assets.length} on block
        </span>
      </div>
      {playerAssets.map((asset) => (
        <LeagueBlockRow key={`player-${asset.playerId}`} player={asset.player} />
      ))}
      {pickAssets.map((asset) => (
        <div
          key={`pick-${asset.pickId}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            borderBottom: "1px solid var(--hairline)",
            fontSize: "var(--text-xs)",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>PICK</span>
          <span style={{ fontWeight: 600 }}>
            {asset.pick?.season ? `${asset.pick.season} ` : ""}Round {asset.pick?.round ?? "?"}
          </span>
          <span style={{ color: "var(--text-subtle)" }}>{asset.reason}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TradeBlockPanel({ roster, onRemove, league, userTeamId }) {
  const [open, setOpen] = useState(true);
  const [leagueBlockOpen, setLeagueBlockOpen] = useState(false);

  const blockPlayers = useMemo(() => {
    if (!Array.isArray(roster)) return [];
    return roster.filter((player) => {
      const m = normalizeManagement(player);
      return (
        player?.onTradeBlock === true ||
        m.tradeStatus === "actively_shopping" ||
        m.contractPlan.includes("trade_candidate")
      );
    });
  }, [roster]);

  const leagueBlockData = useMemo(() => {
    if (!league || !leagueBlockOpen) return [];
    const allTeams = Array.isArray(league?.teams) ? league.teams : [];
    const uid = userTeamId ?? league?.userTeamId;
    const context = {
      userTeamId: uid,
      currentSeason: league?.year ?? league?.season ?? 0,
      phase: league?.phase ?? "regular",
    };
    const result = [];
    for (const team of allTeams) {
      if (Number(team?.id) === Number(uid)) continue;
      const teamRoster = Array.isArray(league?.players)
        ? league.players.filter((p) => Number(p?.teamId) === Number(team.id))
        : Array.isArray(team?.roster)
          ? team.roster
          : [];
      const assets = generateAITradeBlock(team, teamRoster, context);
      if (assets.length > 0) result.push({ team, assets });
    }
    return result;
  }, [league, userTeamId, leagueBlockOpen]);

  if (!Array.isArray(roster)) return null;

  return (
    <div
      className="card"
      style={{ marginBottom: "var(--space-4)", padding: "var(--space-4) var(--space-5)" }}
    >
      {/* ── User's Trade Block ── */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          padding: 0,
          fontWeight: 700,
          fontSize: "var(--text-sm)",
        }}
      >
        <span>Trade Block ({blockPlayers.length})</span>
        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {blockPlayers.length === 0 ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              No players on the trade block.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {blockPlayers.map((player) => (
                <div
                  key={player?.id ?? `${player?.name ?? "unknown"}-${player?.pos ?? "na"}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    gap: "var(--space-3)",
                    alignItems: "center",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-2) var(--space-3)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{player?.name ?? "Unknown"}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                    {player?.pos ?? "—"}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                    OVR {player?.ovr ?? "—"} · Age {player?.age ?? "—"}
                  </span>
                  <Button
                    className="btn"
                    onClick={() => player?.id && onRemove?.(player.id)}
                    style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── League Trade Block (read-only, generated at read-time) ── */}
      {league ? (
        <div style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--hairline)", paddingTop: "var(--space-3)" }}>
          <button
            onClick={() => setLeagueBlockOpen((prev) => !prev)}
            aria-expanded={leagueBlockOpen}
            data-testid="league-block-toggle"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "transparent",
              border: "none",
              color: "var(--text)",
              cursor: "pointer",
              padding: 0,
              fontWeight: 700,
              fontSize: "var(--text-sm)",
            }}
          >
            <span>League Block</span>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
              {leagueBlockOpen ? "Hide" : "Show · generated at read-time"}
            </span>
          </button>

          {leagueBlockOpen && (
            <div style={{ marginTop: "var(--space-3)" }} data-testid="league-block-content">
              {leagueBlockData.length === 0 ? (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                  No AI teams have assets available on the trade block right now.
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--text-subtle)",
                      marginBottom: "var(--space-3)",
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    <span>{leagueBlockData.length} team(s) with available assets</span>
                    <span>OVR · Name · Age · Cap/yr</span>
                  </div>
                  {leagueBlockData.map(({ team, assets }) => (
                    <LeagueBlockTeamGroup key={team.id} team={team} assets={assets} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
