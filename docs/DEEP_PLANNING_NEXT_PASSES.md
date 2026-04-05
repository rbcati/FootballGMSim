# Football GM — Deep Planning Pass (April 5, 2026)

## Part 1 — Current maturity assessment

### UI maturity: **late beta-ish**
- Mobile navigation structure is coherent (grouped drawer + bottom tabs), but nomenclature and IA consistency still leaks across surfaces (`Hub/Team/League/Actions` in bottom nav plus an extra `Actions` overflow entry). This is a trust and clarity issue, not a visual-theme issue.
- Weekly Hub now has a rich hero, urgent list, tools row, and snapshots, but it still duplicates action surfaces and uses a lot of vertical space for modest information density.
- Trade and core management screens appear functionally mature, but some overlays/data-dense screens still read as dashboard-heavy rather than game-premium.

### Engine maturity: **strong beta / near production depth**
- Core sim systems are already broad and deep (progression, injuries, AI trade logic, awards/retirement/HOF, salary-cap mechanics, worker architecture).
- This is no longer a "missing core gameplay" problem. The main risk is correctness drift between engine output and UI state projection, not lack of simulation features.

### QA maturity: **early alpha**
- Test scaffolding exists (Vitest + Playwright scripts and multiple unit/e2e/spec files), but confidence is low because test execution is not currently dependable in environment.
- Without a reliably executable baseline suite, refactor safety is mostly assumed.

### Reliability maturity: **mid beta with known trust gaps**
- A critical post-sim mismatch was identified and partially addressed via `lastSimWeek`/authoritative result propagation.
- However, the app still has several places where "latest game/result state" can be interpreted through fallback logic, increasing drift risk after multi-week sim or save/load transitions.

### Content/copy maturity: **mid beta**
- Big wins achieved on consistency, but copy is still mixed between polished sports-game voice and generic dashboard helper text.
- Brand voice and action labels need final standardization pass, not endless microcopy churn.

### Maintainability maturity: **mid beta trending fragile in UI layer**
- Core modules are decomposed better than the UI shell in several places.
- Some large UI files/components remain likely hotspots for regression and rerender side effects.
- Refactor appetite should stay constrained until tests are executable and reliable.

### Overall stage call
**Overall: late alpha → early beta transition, with engine depth already at beta/late-beta level but product trust (state correctness + regression protection) still below true beta quality.**

---

## Part 2 — Top 8 smartest next priorities (ranked)

### 1) Canonical post-sim results pipeline hardening
- **Category:** stability
- **Why it matters:** If sim completes and surfaces disagree (live game/recap/ticker/last game), users stop trusting outcomes.
- **Likely effort:** medium
- **Expected payoff:** very high (trust + bug reduction)
- **Timing:** **now**

### 2) Run-capable baseline automated tests (CI/local parity)
- **Category:** QA
- **Why it matters:** Existing tests are scaffolding until they execute consistently. No safe foundation for future fixes without this.
- **Likely effort:** medium
- **Expected payoff:** very high (velocity + safer changes)
- **Timing:** **now**

### 3) Save/load + multi-week simulation reliability matrix
- **Category:** reliability
- **Why it matters:** GM sims are long-session products. Save corruption or state rollback destroys retention.
- **Likely effort:** medium
- **Expected payoff:** very high (retention + credibility)
- **Timing:** **now**

### 4) Navigation and action-language canonicalization
- **Category:** UX flow
- **Why it matters:** Current naming drift (`Advance/Sim`, `Actions/Menu/More`, `Trade Desk/Center`) causes cognitive friction and makes UI feel less finished.
- **Likely effort:** small
- **Expected payoff:** high for low effort
- **Timing:** **now**

### 5) Weekly Hub compression + deduplication (functional, not cosmetic)
- **Category:** UX flow
- **Why it matters:** Hero/action duplication costs mobile space and weakens priority signaling.
- **Likely effort:** small-to-medium
- **Expected payoff:** medium-high
- **Timing:** **soon** (after reliability pass starts)

### 6) Error boundary + structured logging verification pass
- **Category:** stability
- **Why it matters:** Crashes and silent state failures need quick root-cause capture, especially with worker/event-heavy sim flows.
- **Likely effort:** medium
- **Expected payoff:** medium-high
- **Timing:** **soon**

### 7) Profiling-led render/perf sweep of top heavy screens
- **Category:** performance
- **Why it matters:** Large JSX surfaces may have wasted renders, but speculative optimization is waste.
- **Likely effort:** medium
- **Expected payoff:** medium
- **Timing:** **later** (after testability + reliability)

### 8) Premium presentation pass on high-impact overlays/data views
- **Category:** content/UI polish
- **Why it matters:** Perceived quality matters, but this is secondary until correctness trust is solid.
- **Likely effort:** medium-large
- **Expected payoff:** medium
- **Timing:** **later**

---

## Part 3 — Must fix now vs good but optional

### Must fix now
1. Post-sim state consistency across all result surfaces (single authoritative source).
2. Test execution reliability (at least a smoke-level baseline suite that runs every time).
3. Save/load integrity and multi-week sim reliability validation.
4. Bottom nav/action-label correctness and global action-language consistency.

### Good but optional (for now)
1. Weekly Hub visual refinement beyond compression/deduplication.
2. Deeper premium styling of table-heavy/detail overlays.
3. Trade feedback copy tuning after instrumentation validates signal/noise quality.
4. Broad performance optimization beyond measured hotspots.

---

## Part 4 — Where NOT to spend time right now

1. **Another broad app-wide UI redesign.**
   - Diminishing returns are already visible; structure is mostly coherent.
2. **Big refactors of mega components before test reliability is fixed.**
   - High regression risk, low immediate trust gain.
3. **Micro-polishing every copy string.**
   - Do a targeted canonical language pass, then move on.
4. **Speculative performance tuning with no profiler evidence.**
   - Measure first; optimize only proven hotspots.
5. **Feature sprawl while state correctness is still suspect.**
   - New depth on shaky foundations multiplies bug surface area.

---

## Part 5 — Next 3 development passes

## Pass A — Immediate high-value pass

### Goal
Restore trust by eliminating obvious state/copy contradictions in the primary weekly loop.

### Exact focus areas
- Canonicalize action labels + nav labels (single vocabulary map).
- Remove bottom-nav label conflicts (ensure final tab semantics are unambiguous).
- Collapse Weekly Hub top hero action duplication (one primary progression CTA; secondary actions move to one clear cluster).
- Ensure recap/last-game fallback copy never contradicts completed sim state.

### Suggested file/subsystem targets
- `src/ui/components/MobileNav.jsx`
- `src/ui/components/WeeklyHub.jsx`
- `src/ui/App.jsx` (top action menus/labels)
- `src/ui/components/LeagueDashboard.jsx` (last-game/recap widgets)
- shared copy constants module (new or existing utility target)

### Risks
- Accidental label mismatch with tab-routing keys.
- Regression if label text and internal tab IDs are conflated.

### Success criteria
- No duplicate/conflicting action labels in nav or headers.
- One unambiguous primary weekly progression action.
- After sim completion, user never sees contradictory "no results" messaging when results payload exists.

---

## Pass B — Stability / systems pass

### Goal
Make simulation outcome state deterministic and verifiable across transitions.

### Exact focus areas
- Implement/confirm a single authoritative "latest simulation result envelope" consumed by recap/ticker/last-game views.
- Harden save/load hydration paths so post-sim state survives reload and slot switching.
- Add deterministic regression tests for multi-week sim + post-sim display state.
- Validate ErrorBoundary and structured log emission for critical weekly-loop failures.

### Suggested file/subsystem targets
- Worker message protocol and handlers (`src/worker/*`, `src/ui/hooks/useWorker.js`)
- League UI state composition (`src/ui/App.jsx`, dashboard/result components)
- Persistence modules (`src/db/*`, save manager components)
- Tests: `tests/unit/*`, `src/core/__tests__/*`, selected Playwright weekly-loop specs

### Risks
- Hidden assumptions in legacy fallback paths.
- Flaky tests if worker timing is nondeterministic.

### Success criteria
- Multi-week sim/reload/slot-switch matrix passes defined acceptance checks.
- Deterministic tests cover at least the weekly-loop happy path + no-results regression case.
- Critical simulation-state failures produce actionable logs and graceful UI fallbacks.

---

## Pass C — Depth / product quality pass

### Goal
Increase game quality and retention once trust baseline is stable.

### Exact focus areas
- Improve decision quality feedback loops (trade valuation explanation clarity, weekly strategic recommendations tied to outcome metrics).
- Upgrade selected high-frequency screens from "dashboard" to "sports-game" presentation where it improves comprehension (not decoration-first).
- Tighten recap storytelling and franchise narrative beats with concrete, data-backed highlights.

### Suggested file/subsystem targets
- Trade evaluation UI and service layer (`TradeCenter`, trade logic views)
- Weekly recap/news modules (`news-engine`, recap components)
- Selected detail overlays with highest session-time share

### Risks
- Feature scope creep.
- Presentation work drifting back into broad visual churn.

### Success criteria
- Users get clearer "why" behind major recommendations/actions.
- Recap/story surfaces feel materially more game-like and less generic.
- No measurable regression in reliability/test pass rate.

---

## Part 6 — Single best next Codex pass (recommendation)

## Recommendation
**Do Pass A now, explicitly scoped to “weekly loop trust and language consistency” (not a redesign pass).**

### Why this is the best next move
- It addresses the highest-visibility trust cracks with manageable scope.
- It de-risks later stability work by reducing ambiguous UI/state interpretation.
- It prevents further UX debt from naming drift while avoiding risky deep refactors.
- It creates immediate player-facing quality gains without pretending visuals are the core blocker.

---

## Part 7 — Codex-ready execution plan outline (not final prompt)

1. **Inventory and canonical map**
   - Build a single label map for weekly progression/actions/navigation.
   - Enumerate all current variants and choose canonical terms.

2. **Navigation/action cleanup implementation**
   - Apply canonical terms in bottom nav, menu trigger, hub hero, and top actions.
   - Remove duplicate semantics (e.g., two "Actions" affordances with different behavior labels).

3. **Weekly Hub action hierarchy cleanup**
   - Keep one clear primary CTA for progression.
   - Reposition secondary shortcuts to avoid duplicate top-level intent.

4. **Post-sim contradiction guards**
   - Ensure result components check authoritative payload first.
   - Gate fallback "No results" copy behind explicit proof that no results exist.

5. **Targeted regression tests**
   - Add/adjust tests for nav label consistency and post-sim result rendering.
   - Add one multi-week simulation display regression case.

6. **Validation checklist + acceptance criteria**
   - Simulate multiple weeks in one session.
   - Reload after sim and verify recap/ticker/last-game alignment.
   - Verify no duplicate/conflicting labels in mobile nav and top actions.

7. **Out-of-scope guardrails**
   - No broad styling/theme overhaul.
   - No major file architecture refactor.
   - No speculative performance changes without profiling evidence.
