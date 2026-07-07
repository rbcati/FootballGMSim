/**
 * RosterDecisionBoard.jsx — contract decision intelligence for the user team.
 *
 * Renders a filterable, sortable table of players whose contracts expire
 * within EXPIRING_WINDOW_SEASONS. Presentation + local pending-decision state
 * only: decisions live in a useState map keyed by row, and nothing here
 * mutates league / player / global state.
 *
 * Data contracts consumed (never re-derived here):
 *  - contract years remaining: contract.years with the established
 *    yearsLeft / yearsRemaining fallbacks (see contractInsights.js). Players
 *    without a usable contract are excluded from the board.
 *  - player._resignMeta: recommendation payload written by the Roster
 *    enrichment site (evaluateResignRecommendation) — reads `label` and
 *    `negotiationRisk`; missing meta renders "—".
 *  - hidden dev trait: getHiddenDevTraitLabel (draftVariance.js) decides
 *    reveal state; hiddenTrueOvr is never read or rendered.
 *
 * Props:
 *  - roster: sanitized player array (RosterHub's null-filtered roster)
 *  - league: used only for the dev-trait reveal season context
 *  - onCommitDecisions: optional (decisionsMap) => void; when absent the
 *    board is preview-only and the commit button stays disabled
 *  - onPlayerSelect: optional (playerId) => void
 */

import React, { useMemo, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import { derivePlayerContractFinancials } from "../utils/contractFormatting.js";
import { getHiddenDevTraitLabel } from "../../core/draft/draftVariance.js";
import PlayerDecisionRow, { DECISION_OPTIONS } from "./PlayerDecisionRow.jsx";

export const EXPIRING_WINDOW_SEASONS = 2;

const RISK_RANK = { high: 3, medium: 2, low: 1 };

const COLUMNS = [
  { key: "name", label: "Player Name" },
  { key: "pos", label: "Pos" },
  { key: "age", label: "Age" },
  { key: "ovr", label: "OVR" },
  { key: "contract", label: "Contract" },
  { key: "action", label: "Recommended Action" },
  { key: "risk", label: "Risk" },
];

function getYearsRemaining(player) {
  const contract = player?.contract;
  if (contract == null || typeof contract !== "object") return null;
  const years = Number(contract.years ?? contract.yearsLeft ?? contract.yearsRemaining);
  return Number.isFinite(years) ? years : null;
}

function rowKeyFor(player, index) {
  const id = player?.id;
  if (typeof id === "string" || typeof id === "number") return String(id);
  return `row-${index}`;
}

function sortValue(row, key) {
  switch (key) {
    case "name": return String(row.player?.name ?? "").toLowerCase();
    case "pos": return String(row.player?.pos ?? row.player?.position ?? "").toLowerCase();
    case "age": return Number(row.player?.age) || 0;
    case "ovr": return Number(row.player?.ovr ?? row.player?.displayOvr) || 0;
    case "contract": return row.annualSalary ?? -1;
    case "action": return String(row.meta?.label ?? "").toLowerCase();
    case "risk": return RISK_RANK[String(row.meta?.negotiationRisk ?? "").toLowerCase()] ?? 0;
    default: return 0;
  }
}

export default function RosterDecisionBoard({ roster, league, onCommitDecisions, onPlayerSelect }) {
  const [decisions, setDecisions] = useState({});
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDesc, setSortDesc] = useState(true);

  const revealContext = useMemo(
    () => ({ currentSeason: league?.year ?? league?.seasonId ?? null }),
    [league?.year, league?.seasonId],
  );

  const rows = useMemo(() => {
    const safe = Array.isArray(roster) ? roster : [];
    return safe
      .filter((player) => player && typeof player === "object")
      .map((player, index) => {
        const yearsRemaining = getYearsRemaining(player);
        if (yearsRemaining == null || yearsRemaining > EXPIRING_WINDOW_SEASONS) return null;
        const meta = player._resignMeta && typeof player._resignMeta === "object" ? player._resignMeta : null;
        return {
          player,
          rowKey: rowKeyFor(player, index),
          yearsRemaining,
          annualSalary: derivePlayerContractFinancials(player).annualSalary,
          meta,
          devTraitLabel: getHiddenDevTraitLabel(player, revealContext),
        };
      })
      .filter(Boolean);
  }, [roster, revealContext]);

  const positions = useMemo(() => {
    const seen = new Set();
    rows.forEach((row) => {
      const pos = row.player?.pos ?? row.player?.position;
      if (pos) seen.add(String(pos));
    });
    return ["ALL", ...Array.from(seen).sort()];
  }, [rows]);

  const visibleRows = useMemo(() => {
    let next = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      next = next.filter((row) => String(row.player?.name ?? "").toLowerCase().includes(q));
    }
    if (posFilter !== "ALL") {
      next = next.filter((row) => String(row.player?.pos ?? row.player?.position ?? "") === posFilter);
    }
    const sorted = [...next].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return sortDesc ? -cmp : cmp;
    });
    return sorted;
  }, [rows, search, posFilter, sortKey, sortDesc]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(key !== "name" && key !== "pos");
    }
  };

  const handleDecide = (rowKey, decisionKey) => {
    setDecisions((prev) => {
      const next = { ...prev };
      if (next[rowKey] === decisionKey) {
        delete next[rowKey];
      } else {
        next[rowKey] = decisionKey;
      }
      return next;
    });
  };

  const pendingCount = Object.keys(decisions).length;
  const canCommit = typeof onCommitDecisions === "function";

  const handleCommit = () => {
    if (!canCommit) return;
    onCommitDecisions({ ...decisions });
  };

  if (rows.length === 0) {
    return (
      <div className="roster-decision-board" data-testid="roster-decision-board">
        <EmptyState
          title="No expiring contracts"
          body={`No players have contracts expiring within ${EXPIRING_WINDOW_SEASONS} seasons.`}
        />
      </div>
    );
  }

  return (
    <div className="roster-decision-board" data-testid="roster-decision-board">
      <div className="roster-decision-board__toolbar">
        <input
          type="text"
          className="settings-input roster-decision-board__search"
          placeholder="Search expiring players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search expiring players"
        />
        <div className="division-tabs roster-decision-board__pos-tabs" role="group" aria-label="Filter by position">
          {positions.map((pos) => (
            <button
              key={pos}
              type="button"
              className={`division-tab${posFilter === pos ? " active" : ""}`}
              onClick={() => setPosFilter(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="roster-decision-board__table-wrap">
        <table className="standings-table roster-decision-board__table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} aria-sort={sortKey === col.key ? (sortDesc ? "descending" : "ascending") : "none"}>
                  <button
                    type="button"
                    className="roster-decision-board__sort-button"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDesc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
              <th>Pending Decision</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <PlayerDecisionRow
                key={row.rowKey}
                row={row}
                decision={decisions[row.rowKey] ?? null}
                onDecide={handleDecide}
                onPlayerSelect={onPlayerSelect}
              />
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="roster-decision-board__empty-cell">
                  No expiring players match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="roster-decision-board__footer">
        <span className="roster-decision-board__meta">
          {visibleRows.length} of {rows.length} expiring · {pendingCount} pending decision{pendingCount === 1 ? "" : "s"}
        </span>
        <div className="roster-decision-board__footer-actions">
          {pendingCount > 0 && (
            <button type="button" className="btn-link" onClick={() => setDecisions({})}>
              Reset
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={!canCommit || pendingCount === 0}
            onClick={handleCommit}
          >
            Commit Decisions
          </button>
          {!canCommit && (
            <span className="roster-decision-board__preview-note">
              Preview only — decisions are not applied yet.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export { DECISION_OPTIONS };
