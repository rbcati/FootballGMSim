import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ProspectFilters } from "./ProspectFilters.jsx";

const baseProps = {
  nameFilter: "",
  onNameFilterChange: vi.fn(),
  filterPos: "",
  onFilterPosChange: vi.fn(),
  posOptions: ["QB", "WR", "RB"],
  prospectCount: 42,
  showAdvancedFilters: false,
  onToggleAdvancedFilters: vi.fn(),
  advancedFilters: [],
  onAdvancedFiltersChange: vi.fn(),
  draftAdvancedFields: [],
  compareIds: [],
  showComparison: false,
  comparePlayerA: null,
  comparePlayerB: null,
  onCloseComparison: vi.fn(),
  onToggleCompare: vi.fn(),
  onOpenCompare: vi.fn(),
  onClearCompare: vi.fn(),
  resolvePlayer: vi.fn(),
};

describe("ProspectFilters", () => {
  it("renders search input and position options without crashing", () => {
    const html = renderToString(<ProspectFilters {...baseProps} />);
    expect(html).toContain("Search name");
    expect(html).toContain("All Positions");
    expect(html).toContain("QB");
    // React 18 SSR: "42 prospects" renders as "42<!-- --> prospects"
    expect(html).toContain("42");
    expect(html).toContain("prospect");
  });

  it("shows advanced filters button text", () => {
    const html = renderToString(<ProspectFilters {...baseProps} />);
    expect(html).toContain("Show advanced filters");
  });
});
