from playwright.sync_api import sync_playwright
import time

def verify_visuals():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        # 1. Load the app
        page.goto("http://localhost:8080/index.html")
        page.wait_for_load_state("networkidle")

        # 2. Onboard (Start New Game)
        if page.is_visible('#onboardModal'):
            print("Onboarding modal visible")
            page.click('#onboardStart')

            # Wait for hub to load
            print("Waiting for hub...")
            page.wait_for_selector('#hub', state='visible', timeout=20000)
            print("Hub visible")

        # 3. Reload to ensure state is persisted/loaded
        print("Reloading page...")
        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(2) # Wait for init

        # Check state again
        league_exists = page.evaluate("!!window.state && !!window.state.league")
        print(f"League exists after reload: {league_exists}")

        if not league_exists:
            print("League still not loaded. Checking IndexedDB/Storage...")
            # Debugging info
            print(page.evaluate("JSON.stringify(window.state)"))
            return

        # 3. Trigger a Live Game
        print("Triggering Live Game...")
        page.evaluate("""
            const L = window.state.league;
            if (L && L.schedule) {
                // Find a game
                const weeks = L.schedule.weeks || L.schedule;
                const weekIdx = (L.week || 1) - 1;
                const weekObj = weeks[weekIdx] || weeks[0];

                if (weekObj && weekObj.games && weekObj.games.length > 0) {
                    const game = weekObj.games[0];
                    console.log("Starting game:", game.home, game.away);
                    window.watchLiveGame(game.home, game.away);
                } else {
                    console.error("No games found in schedule");
                }
            } else {
                console.error("Invalid league schedule structure");
            }
        """)

        # Wait for game modal/view to appear
        try:
            page.wait_for_selector('#game-sim', state='visible', timeout=10000)
            print("Game view visible")
        except:
            print("Game view did not appear. Taking debug screenshot.")
            page.screenshot(path="verification/debug_error_game.png")
            return

        # 4. Wait for a few plays to simulate
        time.sleep(5)

        # 5. Capture screenshot of the game viewer
        page.screenshot(path="verification/live_game.png")
        print("Captured live_game.png")

        # 6. Force Red Zone
        print("Forcing Red Zone state...")
        page.evaluate("""
            if (window.liveGameViewer && window.liveGameViewer.gameState) {
                const state = window.liveGameViewer.gameState;
                state.ballPossession = 'home';
                state.home.yardLine = 90; // Deep in opponent territory (Red Zone)
                window.liveGameViewer.updateField(state);
            }
        """)

        time.sleep(1)
        page.screenshot(path="verification/red_zone.png")
        print("Captured red_zone.png")

        # 7. Force visual feedback
        print("Forcing Touchdown Overlay...")
        page.evaluate("""
            if (window.liveGameViewer) {
                window.liveGameViewer.triggerVisualFeedback('touchdown', 'TOUCHDOWN!');
            }
        """)
        time.sleep(0.5)
        page.screenshot(path="verification/touchdown_overlay.png")
        print("Captured touchdown_overlay.png")

        browser.close()

if __name__ == "__main__":
    verify_visuals()
