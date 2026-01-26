## 2024-05-22 - Modal Accessibility
**Learning:** The application uses dynamic DOM creation for modals without a centralized manager, leading to inconsistent keyboard behavior (no Escape to close).
**Action:** Implemented a global Escape key handler in `fixes.js` to target all `.modal` elements, ensuring a consistent and accessible dismissal pattern without rewriting individual component logic.

## 2025-02-18 - Skip Link Pattern
**Learning:** The application lacked a mechanism for keyboard users to bypass the navigation sidebar, which is critical for accessibility in a layout with a fixed sidebar.
**Action:** Implemented a standard "Skip to main content" link using a `.skip-link` utility class in `style.css` and a corresponding anchor in `index.html`. This pattern can be reused for other skip links if needed.
