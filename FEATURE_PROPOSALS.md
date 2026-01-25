# Feature Proposals: Vision-Stage & Greenfield Products

Based on a comprehensive analysis of the existing codebase (specifically `simulation.js`, `owner-mode.js`, `staff.js`, and `story-events.js`), here are three proposed features to elevate the product.

## 1. The "Newsroom" - Dynamic Narrative Engine (Greenfield)

**Concept:**
Currently, `story-events.js` acts as a static repository of potential events. The "Newsroom" would be a stateful engine that creates multi-week, branching storylines that react to game results, player morale, and user decisions. Instead of random pop-ups, events would have consequences that ripple through the season.

**Key Features:**
*   **Storyline State Machine:** Tracks "Active Storylines" (e.g., "QB Controversy", "Locker Room Mutiny", "Rookie Phenom").
*   **Branching Choices:** A "Media Day" or "Team Meeting" interface where user answers affect `Team Chemistry`, `Fan Satisfaction`, and `Player Morale`.
*   **Procedural Headlines:** Generates news stories based on simulation stats (e.g., if a QB throws 4 INTs, generate "Is [QB Name] Washed Up?" headlines).
*   **Integration:**
    *   Hooks into `simulation.js` to trigger events based on stats.
    *   Updates `owner-mode.js` (Fan Satisfaction) based on media handling.

**Technical Feasibility:**
*   Requires a new `NewsEngine` class.
*   leverages existing `events.js` structure but adds persistence.
*   Low risk, high immersion value.

## 2. RPG Coaching Skill Trees (Implemented - Phase 1)

**Concept:**
`staff.js` currently generates staff with three static ratings (`playerDevelopment`, `playcalling`, `scouting`). This feature has been implemented to transform staff management into an RPG-lite progression system where coaches earn XP and unlock specific "Perks" in a skill tree.

**Key Features:**
*   **Skill Trees:**
    *   **Head Coach:** Leadership (Morale boost), Guru (XP gain boost), CEO (Cap space management).
    *   **Offensive Coordinator:** Schemes specific trees (e.g., "Air Raid" tree unlocks boosts for WRs/QBs, "Smashmouth" tree buffs RBs/OL).
    *   **Defensive Coordinator:** "Blitz Specialist" (Sack boost), "No Fly Zone" (Interception boost).
*   **Staff XP:** Earned through wins and meeting season goals.
*   **Poaching Logic:** High-level coordinators will demand Head Coaching jobs elsewhere, forcing the user to develop a "Coaching Pipeline".

**Technical Feasibility:**
*   Extends `staff.js` data structure.
*   Modifies `simulation.js` to apply "Perk" multipliers during game calculation.
*   High strategic depth.

## 3. Franchise Relocation & Rebranding Suite (Vision-Stage)

**Concept:**
Building on the `owner-mode.js` foundation, this feature allows users to move their team to new markets or rebrand existing ones. This taps into the "Builder" archetype of players.

**Key Features:**
*   **Market Selection:** Choose from a list of open cities (e.g., London, San Antonio, Portland), each with defined `Market Size` and `Fan Loyalty` stats that feed directly into `owner-mode.js` revenue formulas.
*   **Identity Designer:**
    *   **Name Generator:** Pick from city-specific names (e.g., "London Monarchs").
    *   **Uniform/Color Editor:** Simple hex-code or preset selection for team colors.
*   **Stadium Builder:** Construct a new stadium with customizable tiers (Luxury Suites, Capacity) that determine future revenue potential.

**Technical Feasibility:**
*   Requires modifying `teams.js` to support dynamic team metadata (currently hardcoded constants).
*   Heavy UI work for the "Designer" aspect.
*   Deep integration with `owner-mode.js` economics.
