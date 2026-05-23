/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import ResponsiveDataTable from "../../src/ui/components/ResponsiveDataTable.jsx";

describe("ResponsiveDataTable", () => {
  it("renders children inside a scrollable region", () => {
    render(
      <ResponsiveDataTable label="Test table">
        <table>
          <tbody>
            <tr>
              <td data-testid="cell">Hello</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveDataTable>
    );
    expect(screen.getByTestId("cell")).toBeTruthy();
  });

  it("sets role=region and the provided aria-label", () => {
    render(
      <ResponsiveDataTable label="League leaders">
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </ResponsiveDataTable>
    );
    const region = screen.getByRole("region", { name: "League leaders" });
    expect(region).toBeTruthy();
  });

  it("renders an accessible caption when provided", () => {
    render(
      <ResponsiveDataTable label="Career stats" caption="Career statistics by season">
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </ResponsiveDataTable>
    );
    expect(screen.getByText("Career statistics by season")).toBeTruthy();
  });

  it("adds sticky-column class when stickyFirstColumn is true", () => {
    const { container } = render(
      <ResponsiveDataTable label="Sticky table" stickyFirstColumn>
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </ResponsiveDataTable>
    );
    const wrap = container.firstChild;
    expect(wrap.className).toContain("responsive-data-wrap--sticky-col");
  });

  it("does not add sticky-column class when stickyFirstColumn is false (default)", () => {
    const { container } = render(
      <ResponsiveDataTable label="No sticky">
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </ResponsiveDataTable>
    );
    const wrap = container.firstChild;
    expect(wrap.className).not.toContain("sticky-col");
  });

  it("returns the emptyState fallback when children is null", () => {
    render(
      <ResponsiveDataTable label="Empty" emptyState={<p data-testid="empty">No data</p>}>
        {null}
      </ResponsiveDataTable>
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("returns null when no children and no emptyState", () => {
    const { container } = render(
      <ResponsiveDataTable label="Empty">{null}</ResponsiveDataTable>
    );
    expect(container.firstChild).toBeNull();
  });

  it("is keyboard-focusable (tabIndex=0)", () => {
    const { container } = render(
      <ResponsiveDataTable label="Focusable">
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </ResponsiveDataTable>
    );
    const wrap = container.firstChild;
    expect(wrap.tabIndex).toBe(0);
  });

  it("passes data-testid through", () => {
    render(
      <ResponsiveDataTable label="Testable" data-testid="my-wrap">
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </ResponsiveDataTable>
    );
    expect(screen.getByTestId("my-wrap")).toBeTruthy();
  });

  it("accepts extra className without overwriting base class", () => {
    const { container } = render(
      <ResponsiveDataTable label="Extra class" className="my-extra-class">
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </ResponsiveDataTable>
    );
    const wrap = container.firstChild;
    expect(wrap.className).toContain("responsive-data-wrap");
    expect(wrap.className).toContain("my-extra-class");
  });
});
