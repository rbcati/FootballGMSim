# Trade Valuation Audit V1 — 2026-07

> Note: the full PR #1682 audit text was not present in this checkout when PR #1683 work began. This file preserves the implementation status for the canonical wiring follow-up without rewriting unavailable audit history.

## PR #1683 implementation status — Canonical Trade Valuation Wiring V1

- Worker package valuation now delegates to `calculatePackageAdjustedValue` in `src/core/trades/packageValuation.js`.
- Raw player values route through `getAssetValue(player, null, context)`.
- Raw pick values route through `getAssetValue({ assetType: 'pick', ...pick }, null, { currentSeason: null })` to preserve the pre-existing worker package output exactly. Passing the live season directly would activate canonical future-pick decay and change current worker acceptance values, because the prior worker path used the round matrix as its raw pick input.
- Contextual pick modifiers intentionally remain separate and explicit in `applyPackagePickContext`: projected range, trade-week urgency, team-direction preference, draft-board protection, and compensatory-pick discount.
- Strategic posture modifiers, positional need modifiers, cap-burden modifiers, draft-board player modifiers, and package diminishing returns remain separate from raw asset valuation.
- Numerical parity for the extracted worker package logic is exact for the covered representative player, pick, mixed-package, draft-board, compensatory, contender, rebuilder, projected-range, and diminishing-return fixtures.
- Trade Center local values are labeled as directional estimates (`Your estimate`, `Their estimate`, `Estimate: balanced/favors...`) instead of engine acceptance values.

## Deferred product decisions

- Whether Easy should remain at 0.80.
- Whether Trade Center should eventually receive exact worker preview values.
- Whether incoming proactive AI offers should be re-valued at acceptance time.
- Whether persona/deadline modifiers should be fully visible to users.
- Broad trade formula rebalance.
- Legacy trade-code deletion.
