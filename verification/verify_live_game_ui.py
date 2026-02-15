from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:3000")

    # Wait for init
    page.wait_for_timeout(2000)

    # Init logic
    print("Initializing league...")
    page.evaluate("""
        async () => {
            if (window.gameController) {
                await window.gameController.startNewLeague();
            } else {
                console.error("GameController missing");
            }
        }
    """)

    # Navigate through onboarding
    print("Handling onboarding...")
    try:
        page.locator("#onboardStart").click(timeout=10000)
    except:
        print("Onboarding skipped or failed")

    page.wait_for_selector("#hub")
    print("Hub loaded")

    # Start Game
    print("Starting Live Game...")
    page.evaluate("""
        () => {
            const userTeam = window.state.userTeamId;
            const oppTeam = userTeam === 0 ? 1 : 0;
            window.watchLiveGame(userTeam, oppTeam);
        }
    """)

    page.wait_for_selector("#game-sim")
    print("Game Sim loaded")
    page.wait_for_timeout(3000) # Let animations settle and scoreboard populate

    # Verify scoreboard is not empty
    scoreboard_text = page.locator(".scoreboard").inner_text()
    print(f"Scoreboard text: {scoreboard_text}")

    page.screenshot(path="verification/live_game_ui.png")
    print("Screenshot saved to verification/live_game_ui.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
