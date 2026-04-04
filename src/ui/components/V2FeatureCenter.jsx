import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const FEATURE_BLOCKS = [
  {
    title: "Roster & Depth",
    icon: "🏋️",
    items: [
      "Practice/training points by position group",
      "Auto injury replacement + depth promotion logic",
    ],
  },
  {
    title: "Draft & Scouting",
    icon: "🎓",
    items: [
      "Pre-draft reports with combine metrics",
      "7-round mock + sortable Big Board",
      "Hidden rookie potential tracking",
    ],
  },
  {
    title: "Free Agency & Contracts",
    icon: "💼",
    items: [
      "Negotiation controls (years, salary, guarantees, incentives)",
      "CPU bidding war simulation",
    ],
  },
  {
    title: "League Depth",
    icon: "🧠",
    items: [
      "Trend-reactive GM AI",
      "Scheme-specific CPU team building",
      "Dynamic rivalry/news story events",
    ],
  },
];

export default function V2FeatureCenter({ title = "V2 Feature Center" }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            This hub centralizes in-progress v2 systems without changing worker message types,
            save schema, or existing save compatibility.
          </div>
        </CardContent>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-3)" }}>
        {FEATURE_BLOCKS.map((block) => (
          <Card key={block.title}>
            <CardHeader>
              <CardTitle style={{ fontSize: "var(--text-sm)" }}>
                {block.icon} {block.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {block.items.map((item) => (
                  <li key={item} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
