# Drama Engine Test Guide

This guide explains how to verify the "High Stakes" drama features.

## 1. Setup
1. Start a new league (Real or Fictional).
2. Open the console (F12).

## 2. Test Scenarios

### Scenario A: Division Clinch Opportunity
Force a situation where you are 1 game ahead in Week 17.

1.  **Simulate to Week 16** (or just set the week manually).
2.  **Manipulate Standings**:
    Run this in the console:
    ```javascript
    // Set user team (ID 0) to 10-6
    window.state.league.teams[0].wins = 10;
    window.state.league.teams[0].losses = 6;

    // Set division rival (ID 1) to 9-7
    window.state.league.teams[1].wins = 9;
    window.state.league.teams[1].losses = 7;

    // Ensure same division
    window.state.league.teams[1].conf = window.state.league.teams[0].conf;
    window.state.league.teams[1].div = window.state.league.teams[0].div;

    // Force Week 17
    window.state.league.week = 17;

    // Trigger re-render
    window.renderHub();
    ```
3.  **Verify**:
    -   Check the Dashboard. You should see a red "High Stakes Matchup" banner: "Win to clinch the Division Title!" or similar.
    -   The "Advance Week" button should be glowing red with text "PLAY CRITICAL GAME".

### Scenario B: Job Security Crisis
Force a situation where the owner is angry.

1.  **Manipulate Owner Mode**:
    ```javascript
    // Enable Owner Mode
    if (!window.state.ownerMode) window.initializeOwnerMode();
    window.state.ownerMode.enabled = true;

    // Tank satisfaction
    window.state.ownerMode.fanSatisfaction = 25;

    // Force re-render
    window.renderHub();
    ```
2.  **Verify**:
    -   Check the Dashboard. Banner should say "Owner patience has run out. Win or else." (Tag: JOB_CRITICAL).

### Scenario C: Game Outcome
1.  Set up Scenario A or B.
2.  Click "PLAY CRITICAL GAME" (or Advance Week).
3.  **Verify Recap**:
    -   If you win: Look for "🏆 GOAL ACHIEVED" or "👔 JOB SAVED".
    -   If you lose: Look for "😞 OPPORTUNITY MISSED" or "⚠️ ON THE BRINK".

## 3. Variance Test
To verify the game engine variance:
1.  Open console.
2.  Ensure `verbose` logging is enabled (or just look for the DramaEngine log).
3.  Simulate a high stakes game.
4.  Check the console for `[DramaEngine] Simulating High Stakes Game:` followed by context.
5.  Check for `[DramaEngine] High Stakes Modifiers Applied` in the logs.
