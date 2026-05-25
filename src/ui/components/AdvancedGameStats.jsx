import React, { useMemo } from "react";
import { PlayerButton } from "./BoxScore.jsx";

const FIELDS = [
  { key: "targets", label: "Tgt" },
  { key: "drops", label: "Drop", tone: "negative" },
  { key: "battedPasses", label: "Bat", tone: "positive" },
  { key: "coverageTargets", label: "Cov Tgt" },
  { key: "coverageCompletionsAllowed", label: "Cov Comp", tone: "negative" },
  { key: "receptionsAllowed", label: "Rec All" },
  { key: "sacksAllowed", label: "Sck All", tone: "negative" },
  { key: "sacksMade", label: "Sck Made", tone: "positive" },
];

function asSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasAnyAdvancedValue(row = {}) {
  return FIELDS.some(({ key }) => asSafeNumber(row?.[key]) !== 0);
}

function buildPlayerMap(playerTables = {}) {
  const players = [...(playerTables?.away ?? []), ...(playerTables?.home ?? [])];
  return players.reduce((acc, player) => {
    if (player?.playerId == null) return acc;
    acc[String(player.playerId)] = player;
    return acc;
  }, {});
}

export default function AdvancedGameStats({ advancedAttribution, playerTables, onPlayerSelect, context }) {
  const rows = useMemo(() => {
    if (!advancedAttribution || typeof advancedAttribution !== "object") return [];
    const playerMap = buildPlayerMap(playerTables);
    return Object.entries(advancedAttribution)
      .map(([playerId, raw]) => {
        const safe = FIELDS.reduce((acc, { key }) => {
          acc[key] = asSafeNumber(raw?.[key]);
          return acc;
        }, {});
        return { playerId: String(playerId), player: playerMap[String(playerId)] ?? null, stats: safe };
      })
      .filter((row) => hasAnyAdvancedValue(row.stats))
      .sort((a, b) => Number(a.playerId) - Number(b.playerId));
  }, [advancedAttribution, playerTables]);

  if (!rows.length) return null;

  return (
    <section className="bs-section" data-testid="game-book-advanced-stats">
      <div className="bs-section-header">
        <h4>Advanced Game Stats</h4>
        <span className="bs-section-count">{rows.length} players</span>
      </div>
      <div className="bs-table-wrap bs-table-wrap--compact" role="region" aria-label="Advanced game stats — scroll horizontally to view all columns">
        <table className="box-score-table" data-testid="advanced-game-stats-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Pos</th>
              {FIELDS.map((field) => <th key={field.key} scope="col">{field.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const displayPlayer = row.player ?? { playerId: row.playerId, name: `#${row.playerId}` };
              return (
                <tr key={`advanced-${row.playerId}`}>
                  <td>
                    {row.player ? <PlayerButton player={row.player} onSelect={onPlayerSelect} context={context} /> : `#${row.playerId}`}
                  </td>
                  <td>{displayPlayer?.position ?? displayPlayer?.pos ?? "—"}</td>
                  {FIELDS.map((field) => (
                    <td key={`${row.playerId}-${field.key}`} className={field.tone === "negative" && row.stats[field.key] > 0 ? "status-chip warning" : field.tone === "positive" && row.stats[field.key] > 0 ? "status-chip success" : undefined}>
                      {row.stats[field.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
