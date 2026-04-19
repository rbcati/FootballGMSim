import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import StandingsTable from "./StandingsTable.jsx";

describe("StandingsTable", () => {
  it("renders empty-state copy when standings are missing", () => {
    const html = renderToString(<StandingsTable teams={[]} />);
    expect(html).toContain("No standings data available.");
  });

  it("renders partial team rows without crashing", () => {
    const html = renderToString(
      <StandingsTable
        userTeamId={7}
        teams={[
          { id: 7, abbr: "BUF", wins: 10, losses: 7 },
          { id: 11, name: "Jets", wins: 6, losses: 11, ties: 0 },
        ]}
      />,
    );
    expect(html).toContain("BUF");
    expect(html).toContain("Jets");
    expect(html).toContain(".588");
  });
});
