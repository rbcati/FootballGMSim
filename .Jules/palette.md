## 2024-05-22 - Modal Accessibility
**Learning:** The application uses dynamic DOM creation for modals without a centralized manager, leading to inconsistent keyboard behavior (no Escape to close).
**Action:** Implemented a global Escape key handler in `fixes.js` to target all `.modal` elements, ensuring a consistent and accessible dismissal pattern without rewriting individual component logic.
