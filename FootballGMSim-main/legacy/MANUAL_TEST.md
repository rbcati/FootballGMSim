# Manual Test Script: Core Loop Verification

## 1. Setup
1.  Open the game.
2.  Start a **New League** (Fictional, GM Mode).
3.  Choose a team (e.g., Team 0).

## 2. Week HQ Verification
1.  **Check Landing Page**: You should land on the **Home** (Week HQ) tab.
2.  **Check Action Items**:
    *   Verify if there is an "Action Items" card at the top.
    *   If no items, go to **Roster** and cut players until you have < 40.
    *   Return to **Hub**. Verify "Low Roster Count" warning appears.
    *   Go to **Roster**, sign free agents until > 53 (if possible) or just verify the "Max 53" blocker by trying to advance later.

## 3. Global Advance Button
1.  Locate the "Advance Week" button in the right sidebar (above "League Dashboard").
2.  **Test Blocker**:
    *   Ensure you have a blocker (e.g., > 53 players or Cap Over). Use `window.state.league.teams[0].capUsed = 999` in console if needed to force cap issue.
    *   Click "Advance Week".
    *   Verify a modal appears saying "Cannot Advance".
    *   Verify you are redirected to the Hub (if not already there).
3.  **Clear Blockers**:
    *   Fix the issue (Reset cap in console or cut players).
    *   Click "Advance Week" again.
4.  **Test Advance**:
    *   Verify the simulation runs ("Simulating week...").
    *   Verify the **Weekly Recap** modal appears automatically.

## 4. Weekly Recap
1.  Check the Recap Modal content:
    *   Game Result (Win/Loss/Bye).
    *   Injuries (if any).
    *   News.
2.  Click "Continue".
3.  Verify the page refreshes and shows the next week on the Hub.

## 5. Owner Pressure (Simulation)
1.  Open console.
2.  Set satisfaction to low: `window.state.ownerMode.fanSatisfaction = 5`.
3.  Simulate to the end of the season (Click "Simulate Season" or keep Advancing).
4.  **Verify Firing**:
    *   At the end of the season (after Super Bowl, before Offseason), a "TERMINATED" modal should appear.
    *   Clicking the button should reload the game/delete save.

## 6. Navigation
1.  Navigate to **Roster**.
2.  Verify "Advance Week" is still visible in the sidebar.
3.  Click it. Verify it works (or blocks) from the Roster view.
