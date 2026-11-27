import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native scroll container with the same API as the previous Radix ScrollArea
 * wrapper (`<ScrollArea className style>{children}</ScrollArea>`).
 *
 * Why not Radix: under React 19, @radix-ui/react-scroll-area sets state from
 * ref callbacks and from its ResizeObserver-driven scrollbar visibility. When a
 * list's content height sits near the container's max height (e.g. the Draft
 * page's "Pick Order" list), the scrollbar mount/unmount reflows the content,
 * which flips the overflow state again and React aborts with error #185
 * ("Maximum update depth exceeded"). A plain overflow container has no
 * render-time state, so it cannot loop. Whether a page crashed depended on how
 * many rows the list held, which is why the Draft page opened on one save and
 * crashed on another.
 */
const ScrollArea = React.forwardRef(({ className, style, children, ...props }, ref) => (
  <div
    ref={ref}
    data-scroll-area=""
    className={cn("relative", className)}
    style={{ overflowY: "auto", overflowX: "hidden", ...style }}
    {...props}
  >
    {children}
  </div>
));
ScrollArea.displayName = "ScrollArea";

/** Kept for API compatibility; native scrollbars need no separate element. */
const ScrollBar = React.forwardRef(() => null);
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
