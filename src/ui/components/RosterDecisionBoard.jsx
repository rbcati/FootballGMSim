/**
 * RosterDecisionBoard.jsx — contract decision intelligence for the user team.
 *
 * Renders a filterable, sortable table of players whose contracts expire
 * within EXPIRING_WINDOW_SEASONS. Presentation + local pending-decision state
 * only: decisions live in a useState map keyed by String(player.id), and
 * nothing here mutates league / player / global state.
 *
 * Decision identity: rows without a usable player.id still render, but their
 * decision pills are disabled and they can never appear in the decisions map
 * or the dry-run commit plan. The payload is therefore always
 * { [String(playerId)]: decisionKey } with stable player-id keys only.
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
 * Durable let-walk intent (V1): on mount (and on roster syncs before any user
 * interaction) pending decisions are pre-populated from persisted
 * player.extensionDecision === "let_walk" — the intent recorded by a previous
 * apply or by Contract Center. ONLY let_walk pre-populates: no other persisted
 * value maps unambiguously to a DECISION_OPTIONS key. Once the user touches
 * the board (decide / reset / review / apply), roster syncs never overwrite
 * local pending state. Toggling off a persisted let-walk does NOT call the
 * worker — it becomes a local "clear_let_walk" pending intent that flows
 * through the same Review Decisions / Apply flow and executes as
 * updatePlayerManagement({ extensionDecision: null }).
 *
 * Commit dry-run (V1): "Review Decisions" builds a local, validated commit
 * plan via buildRosterDecisionCommitPlan and renders it below the board. The
 * review step itself never mutates anything.
 *
 * Commit execution (V1): once a dry-run plan is shown, "Apply Executable
 * Decisions" appears if the plan has at least one executable entry
 * (blockingErrors empty and decision !== "extend"). Clicking it delegates to
 * executeRosterDecisionCommitPlan, which only calls existing worker action
 * handlers (releasePlayer / applyFranchiseTag / updatePlayerManagement) — no
 * roster, contract, or cap math lives in this component. Results render as
 * Applied/Dispatched / Skipped / Failed (send-based actions like release are
 * only ever "dispatched"; the worker owns the confirmed outcome). Only
 * applied/dispatched decisions are removed from local pending state, so
 * skipped/failed rows stay adjustable, and each reviewed plan can be applied
 * at most once — re-applying requires a fresh review.
 *
 * Props:
 *  - roster: sanitized player array (RosterHub's null-filtered roster)
 *  - league: dev-trait reveal season context + commit-plan metadata
 *    (userTeamId / seasonId / phase); read-only
 *  - actions: optional useWorker action creators; required only for the
 *    apply step. Without it every entry is reported as skipped.
 *  - onCommitDecisions: optional legacy commit callback; still unused —
 *    execution goes through `actions` handlers instead.
 *  - onPlayerSelect: optional (playerId) => void
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "./ScreenSystem.jsx";
import { derivePlayerContractFinancials, formatContractMoney } from "../utils/contractFormatting.js";
import { buildRosterDecisionCommitPlan } from "../utils/rosterDecisionCommitPlan.js";
import {
  executeRosterDecisionCommitPlan,
  countExecutableCommitPlanEntries,
} from "../utils/rosterDecisionCommitExecution.js";
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

function decisionKeyFor(player) {
  const id = player?.id;
  if (typeof id === "string" || typeof id === "number") return String(id);
  return null;
}

/**
 * Pending decisions seeded from durable player state. Only
 * extensionDecision === "let_walk" pre-populates: "pending" / "deferred" /
 * "extended" / "tagged" have no unambiguous DECISION_OPTIONS pill, so they are
 * ignored by design. Scope matches the board rows exactly — usable player id
 * and a contract expiring within the board window.
 */
function seedPersistedDecisions(roster) {
  const seeded = {};
  for (const player of Array.isArray(roster) ? roster : []) {
    if (!player || typeof player !== "object") continue;
    if (player.extensionDecision !== "let_walk") continue;
    const key = decisionKeyFor(player);
    if (key == null) continue;
    const yearsRemaining = getYearsRemaining(player);
    if (yearsRemaining == null || yearsRemaining > EXPIRING_WINDOW_SEASONS) continue;
    seeded[key] = "let_walk";
  }
  return seeded;
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

const DECISION_LABELS = {
  ...Object.fromEntries(DECISION_OPTIONS.map((o) => [o.key, o.label])),
  // Not a pill: the pending clear intent created by toggling off a persisted
  // let-walk. Needs a label wherever plan entries / execution results render.
  clear_let_walk: "Clear Let Walk",
};

function CommitPlanEntry({ entry }) {
  const contractBits = [];
  if (entry.contract.annualSalary != null) contractBits.push(`${formatContractMoney(entry.contract.annualSalary)}/yr`);
  if (entry.contract.yearsRemaining != null) contractBits.push(`${entry.contract.yearsRemaining}y left`);
  if (entry.contract.deadCap != null && entry.contract.deadCap > 0) {
    contractBits.push(`${formatContractMoney(entry.contract.deadCap)} dead cap`);
  }
  return (
    <li className="roster-decision-board__plan-entry" data-testid={`plan-valid-${entry.playerId}`}>
      <span>
        <strong>{entry.playerName}</strong>
        {entry.pos ? ` (${entry.pos})` : ""} — {DECISION_LABELS[entry.decision] ?? entry.decision}
        {contractBits.length > 0 ? ` · ${contractBits.join(" · ")}` : ""}
      </span>
      {entry.blockingErrors.map((message, i) => (
        <span key={`${message}-${i}`} className="roster-decision-board__plan-blocking">{message}</span>
      ))}
      {entry.warnings.map((message, i) => (
        <span key={`${message}-${i}`} className="roster-decision-board__plan-warning">{message}</span>
      ))}
    </li>
  );
}

function CommitPlanSummary({ plan }) {
  return (
    <section
      className="roster-decision-board__dry-run"
      data-testid="decision-dry-run-summary"
      aria-label="Commit plan preview"
    >
      <div className="roster-decision-board__dry-run-header">
        <strong>Commit plan preview</strong>
        <span className="roster-decision-board__dry-run-note">
          Dry run only — nothing has been applied to your roster yet.
        </span>
      </div>

      <div data-testid="dry-run-valid">
        <h4 className="roster-decision-board__dry-run-heading">
          Valid decisions ({plan.valid.length})
        </h4>
        {plan.valid.length === 0 ? (
          <p className="roster-decision-board__dry-run-empty">No valid decisions in this plan.</p>
        ) : (
          <ul className="roster-decision-board__plan-list">
            {plan.valid.map((entry) => (
              <CommitPlanEntry key={entry.playerId} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      {plan.invalid.length > 0 && (
        <div data-testid="dry-run-invalid">
          <h4 className="roster-decision-board__dry-run-heading">
            Invalid decisions ({plan.invalid.length})
          </h4>
          <ul className="roster-decision-board__plan-list">
            {plan.invalid.map((entry) => (
              <li
                key={entry.playerId}
                className="roster-decision-board__plan-entry roster-decision-board__plan-entry--invalid"
                data-testid={`plan-invalid-${entry.playerId}`}
              >
                Player {entry.playerId} — {DECISION_LABELS[entry.decision] ?? String(entry.decision)}: {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const RESULT_SECTIONS = [
  {
    // "Applied" covers both confirmed request-based actions and send-based
    // actions that could only be dispatched — each item's own message says
    // which, so the section title must not overpromise confirmation.
    key: "applied",
    title: "Applied / Dispatched",
    empty: "No decisions were applied or dispatched.",
    tone: "roster-decision-board__result-entry--applied",
  },
  {
    key: "skipped",
    title: "Skipped (not applied)",
    empty: "Nothing was skipped.",
    tone: "roster-decision-board__result-entry--skipped",
  },
  {
    key: "failed",
    title: "Failed",
    empty: "No failures.",
    tone: "roster-decision-board__result-entry--failed",
  },
];

function ExecutionResultSummary({ result, plan }) {
  const nameById = new Map(
    (Array.isArray(plan?.valid) ? plan.valid : []).map((entry) => [entry.playerId, entry.playerName]),
  );
  return (
    <section
      className="roster-decision-board__execution-result"
      data-testid="decision-execution-result"
      aria-label="Execution results"
      aria-live="polite"
    >
      <div className="roster-decision-board__dry-run-header">
        <strong>Execution results</strong>
        <span className="roster-decision-board__dry-run-note">
          Skipped and failed decisions were NOT applied — they remain pending below.
          Dispatched items were submitted to the game engine, which reports the final roster result.
        </span>
      </div>
      {RESULT_SECTIONS.map(({ key, title, empty, tone }) => (
        <div key={key} data-testid={`execution-${key}`}>
          <h4 className="roster-decision-board__dry-run-heading">
            {title} ({result[key].length})
          </h4>
          {result[key].length === 0 ? (
            <p className="roster-decision-board__dry-run-empty">{empty}</p>
          ) : (
            <ul className="roster-decision-board__plan-list">
              {result[key].map((item) => (
                <li
                  key={`${key}-${item.playerId}`}
                  className={`roster-decision-board__plan-entry ${tone}`}
                  data-testid={`execution-${key}-${item.playerId}`}
                >
                  <strong>{nameById.get(item.playerId) ?? `Player ${item.playerId}`}</strong>
                  {" — "}
                  {DECISION_LABELS[item.decision] ?? String(item.decision)}: {item.message ?? item.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

// onCommitDecisions is accepted but intentionally unused: execution is wired
// through the `actions` worker handlers instead of a bespoke commit callback.
export default function RosterDecisionBoard({ roster, league, actions, onCommitDecisions, onPlayerSelect }) {
  const [decisions, setDecisions] = useState(() => seedPersistedDecisions(roster));
  const [commitPlan, setCommitPlan] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  // Re-entrancy guard for apply: state updates are async, so two clicks in the
  // same tick would both read isExecuting === false. The ref closes that gap.
  const executingRef = useRef(false);
  // True once the user decides / resets / reviews / applies this session.
  // Roster syncs (worker STATE_UPDATE refreshes) may re-seed pending decisions
  // from persisted intent ONLY while this is false — never over user edits.
  const userTouchedRef = useRef(false);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDesc, setSortDesc] = useState(true);

  // Pre-population sync: a roster that arrives/refreshes before any user
  // interaction re-seeds pending decisions from persisted let-walk intent.
  // Returning `prev` when nothing changed avoids a pointless re-render on
  // parent renders that rebuild the roster array.
  useEffect(() => {
    if (userTouchedRef.current) return;
    const seeded = seedPersistedDecisions(roster);
    setDecisions((prev) => {
      const prevKeys = Object.keys(prev);
      const seededKeys = Object.keys(seeded);
      const unchanged =
        prevKeys.length === seededKeys.length && seededKeys.every((key) => prev[key] === seeded[key]);
      return unchanged ? prev : seeded;
    });
  }, [roster]);

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
        const decisionKey = decisionKeyFor(player);
        return {
          player,
          decisionKey,
          renderKey: decisionKey ?? `missing-id-${index}`,
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

  // Decision keys whose CURRENT roster player carries a persisted let-walk
  // intent — toggling let_walk off for these must become a pending clear
  // intent instead of silently dropping the pending entry.
  const persistedLetWalkKeys = useMemo(() => {
    const keys = new Set();
    for (const row of rows) {
      if (row.decisionKey != null && row.player?.extensionDecision === "let_walk") {
        keys.add(row.decisionKey);
      }
    }
    return keys;
  }, [rows]);

  const handleDecide = (playerKey, decisionKey) => {
    if (playerKey == null) return;
    userTouchedRef.current = true;
    setCommitPlan(null); // any pending-decision change invalidates the previewed plan
    setExecutionResult(null);
    setDecisions((prev) => {
      const next = { ...prev };
      if (next[playerKey] === decisionKey) {
        if (decisionKey === "let_walk" && persistedLetWalkKeys.has(playerKey)) {
          // Local pending clear intent ONLY — no worker call happens here.
          // The clear executes through Review Decisions / Apply, as
          // updatePlayerManagement({ extensionDecision: null }).
          next[playerKey] = "clear_let_walk";
        } else {
          delete next[playerKey];
        }
      } else {
        next[playerKey] = decisionKey;
      }
      return next;
    });
  };

  const pendingCount = Object.keys(decisions).length;

  // Reset returns to the board's INITIAL state — session edits are discarded
  // but persisted let-walk intents re-seed (clearing a persisted intent is a
  // reviewed decision, not a side effect of Reset).
  const handleReset = () => {
    userTouchedRef.current = true;
    setDecisions(seedPersistedDecisions(roster));
    setCommitPlan(null);
    setExecutionResult(null);
  };

  // Dry run only: builds a local validated plan; never calls mutation handlers.
  const handleReview = () => {
    if (pendingCount === 0) return;
    userTouchedRef.current = true;
    setExecutionResult(null);
    setCommitPlan(buildRosterDecisionCommitPlan({ decisions: { ...decisions }, roster, league }));
  };

  const executableCount = useMemo(
    () => (commitPlan != null ? countExecutableCommitPlanEntries(commitPlan) : 0),
    [commitPlan],
  );

  // Real commits: delegates every mutation to existing worker action handlers.
  // Pending decisions are only pruned AFTER results return, and only the
  // successfully applied ones — skipped/failed stay pending for adjustment.
  // A plan is consumable exactly once: once executionResult exists the button
  // is unmounted AND this handler refuses to run again for the stale plan —
  // re-applying requires a fresh "Review Decisions" pass.
  const handleApplyExecutable = async () => {
    if (commitPlan == null || executingRef.current || executionResult != null) return;
    userTouchedRef.current = true;
    executingRef.current = true;
    setIsExecuting(true);
    try {
      const result = await executeRosterDecisionCommitPlan({ plan: commitPlan, actions });
      setExecutionResult(result);
      if (result.applied.length > 0) {
        setDecisions((prev) => {
          const next = { ...prev };
          for (const item of result.applied) delete next[item.playerId];
          return next;
        });
      }
    } finally {
      executingRef.current = false;
      setIsExecuting(false);
    }
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
                key={row.renderKey}
                row={row}
                decision={row.decisionKey != null ? decisions[row.decisionKey] ?? null : null}
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
            <button type="button" className="btn-link" onClick={handleReset}>
              Reset
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={pendingCount === 0}
            onClick={handleReview}
          >
            Review Decisions
          </button>
          <span className="roster-decision-board__preview-note">
            Preview only — reviewing builds a dry-run plan; decisions are not applied yet.
          </span>
        </div>
      </div>

      {commitPlan != null && (
        <>
          <CommitPlanSummary plan={commitPlan} />
          {executionResult == null && executableCount > 0 && (
            <div className="roster-decision-board__execute-bar">
              <button
                type="button"
                className="btn"
                disabled={isExecuting}
                onClick={handleApplyExecutable}
              >
                {isExecuting ? "Applying…" : `Apply Executable Decisions (${executableCount})`}
              </button>
              <span className="roster-decision-board__preview-note">
                Applies only entries without blocking errors; extensions always go through Contract Center.
              </span>
            </div>
          )}
          {executionResult != null && (
            <ExecutionResultSummary result={executionResult} plan={commitPlan} />
          )}
        </>
      )}
    </div>
  );
}

export { DECISION_OPTIONS };
