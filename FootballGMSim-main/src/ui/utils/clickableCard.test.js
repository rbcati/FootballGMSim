import { describe, expect, it, vi } from "vitest";
import { getClickableCardProps } from "./clickableCard.js";

describe("getClickableCardProps", () => {
  it("returns keyboard + click handlers for active cards", () => {
    const onOpen = vi.fn();
    const props = getClickableCardProps({ onOpen, ariaLabel: "Open box score" });

    props.onClick?.({ type: "click" });
    expect(onOpen).toHaveBeenCalledTimes(1);

    const preventDefault = vi.fn();
    props.onKeyDown?.({ key: "Enter", preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("returns inert props when disabled", () => {
    const onOpen = vi.fn();
    const props = getClickableCardProps({ onOpen, disabled: true });
    expect(props.onClick).toBeUndefined();
    expect(props.role).toBeUndefined();
  });
});

