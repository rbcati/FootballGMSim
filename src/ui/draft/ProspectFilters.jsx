import React from "react";
import AdvancedPlayerSearch from "../components/AdvancedPlayerSearch.jsx";
import PlayerComparison from "../components/PlayerComparison.jsx";
import PlayerCompareTray from "../components/PlayerCompareTray.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProspectFilters({
  nameFilter,
  onNameFilterChange,
  filterPos,
  onFilterPosChange,
  posOptions,
  prospectCount,
  showAdvancedFilters,
  onToggleAdvancedFilters,
  advancedFilters,
  onAdvancedFiltersChange,
  draftAdvancedFields,
  compareIds,
  showComparison,
  comparePlayerA,
  comparePlayerB,
  onCloseComparison,
  onToggleCompare,
  onOpenCompare,
  onClearCompare,
  resolvePlayer,
}) {
  return (
    <>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
        <Input
          type="text"
          placeholder="Search name…"
          value={nameFilter}
          onChange={(e) => onNameFilterChange(e.target.value)}
          style={{ padding: "5px 10px", background: "var(--surface-strong)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: "var(--text-sm)", width: 180 }}
        />
        <select
          value={filterPos}
          onChange={(e) => onFilterPosChange(e.target.value)}
          style={{ padding: "5px 10px", background: "var(--surface-strong)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: "var(--text-sm)" }}
        >
          <option value="">All Positions</option>
          {posOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginLeft: "auto" }}>
          {prospectCount} prospect{prospectCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Button className="btn" onClick={onToggleAdvancedFilters} style={{ fontSize: "var(--text-xs)" }}>
          {showAdvancedFilters ? "Hide advanced filters" : "Show advanced filters"}
        </Button>
      </div>

      {showAdvancedFilters && (
        <AdvancedPlayerSearch
          filters={advancedFilters}
          onChange={onAdvancedFiltersChange}
          title="Draft advanced search"
          allowedFields={draftAdvancedFields}
          presetKeys={["youngHighPotential", "day1Starters", "developmentalUpside", "bestAthletes", "valuePicks", "qbUpside", "skillUpside"]}
        />
      )}

      {showComparison && comparePlayerA && comparePlayerB && (
        <PlayerComparison playerA={comparePlayerA} playerB={comparePlayerB} onClose={onCloseComparison} />
      )}

      <PlayerCompareTray
        compareIds={compareIds}
        resolvePlayer={resolvePlayer}
        onRemove={onToggleCompare}
        onOpenCompare={onOpenCompare}
        onClear={onClearCompare}
      />
    </>
  );
}

export default ProspectFilters;
