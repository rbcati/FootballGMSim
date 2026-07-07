/**
 * PlayerDecisionRow.jsx — single row of the Roster Decision Board.
 *
 * Pure presentation: renders the player's expiring-contract snapshot, the
 * `_resignMeta` recommendation (data contract from Roster.jsx enrichment —
 * reads `label` / `negotiationRisk`, never re-derives them), and the four
 * local pending-decision pills. All state lives in the parent board; this
 * component never touches league/player/global state.
 *
 * Decisions are identified by row.decisionKey (String(player.id), or null
 * when the player has no usable id). A null decisionKey renders the row
 * read-only: pills are disabled, onDecide is never called, and a muted
 * "Decision unavailable" note explains why.
 */

import React from "react";
import { formatContractMoney } from "../utils/contractFormatting.js";

export const DECISION_OPTIONS = [
  { key: "extend", label: "Extend" },
  { key: "cut", label: "Cut" },
  { key: "franchise_tag", label: "Franchise Tag" },
  { key: "let_walk", label: "Let Walk" },
];

function DevTraitBadge({ label }) {
  if (label == null) return null;
  if (label === "Hidden") {
    return (
      <span className="roster-decision-board__dev-badge roster-decision-board__dev-badge--hidden">
        Dev: Hidden
      </span>
    );
  }
  return <span className="roster-decision-board__dev-badge">{label}</span>;
}

export default function PlayerDecisionRow({ row, decision, onDecide, onPlayerSelect }) {
  const { player, decisionKey, renderKey, yearsRemaining, annualSalary, meta, devTraitLabel } = row;
  const pos = player?.pos ?? player?.position ?? "—";
  const name = player?.name ?? "Unknown Player";
  const canOpenProfile = typeof onPlayerSelect === "function" && player?.id != null;
  const canDecide = decisionKey != null;

  return (
    <tr
      className={decision ? "roster-decision-board__row--pending" : undefined}
      data-testid={`decision-row-${renderKey}`}
      data-pending={decision ? "true" : "false"}
    >
      <td>
        {canOpenProfile ? (
          <button className="btn-link" onClick={() => onPlayerSelect(player.id)}>{name}</button>
        ) : (
          <span>{name}</span>
        )}
        <DevTraitBadge label={devTraitLabel} />
      </td>
      <td>{pos}</td>
      <td>{player?.age ?? "—"}</td>
      <td>{player?.ovr ?? player?.displayOvr ?? "—"}</td>
      <td className="roster-decision-board__contract-cell">
        {formatContractMoney(annualSalary)}/yr · {yearsRemaining}y left
      </td>
      <td>{meta?.label ?? "—"}</td>
      <td>{meta?.negotiationRisk ?? "—"}</td>
      <td>
        <div className="roster-decision-board__pills" role="group" aria-label={`Pending decision for ${name}`}>
          {DECISION_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className="roster-decision-board__pill"
              aria-pressed={decision === option.key}
              disabled={!canDecide}
              onClick={canDecide ? () => onDecide(decisionKey, option.key) : undefined}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!canDecide && (
          <span className="roster-decision-board__missing-id-note">
            Decision unavailable: missing player ID.
          </span>
        )}
      </td>
    </tr>
  );
}
