from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()

    try:
        # 1. Setup
        page.goto('http://localhost:3000')
        page.wait_for_timeout(1000)

        # Ensure league exists
        page.evaluate("""
             async () => {
                 if (!window.state || !window.state.league) {
                     await window.gameController.startNewLeague();
                     document.getElementById('onboardStart').click();
                 }
             }
        """)
        page.wait_for_selector('#hub', state='visible', timeout=20000)

        # 2. Start Live Game
        page.evaluate("""
            () => {
                const L = window.state.league;
                window.watchLiveGame(L.teams[0].id, L.teams[1].id);
            }
        """)

        page.wait_for_selector('#game-sim', state='visible')
        page.wait_for_selector('#scoreHome')

        # 3. Pause Sim and Inject High Score
        page.evaluate("""
            () => {
                if (window.liveGameViewer) {
                    window.liveGameViewer.isPaused = true;
                    if (window.liveGameViewer.intervalId) clearTimeout(window.liveGameViewer.intervalId);

                    window.liveGameViewer.gameState.home.score = 105;
                    window.liveGameViewer.gameState.away.score = 99;
                    window.liveGameViewer.renderGame();
                }
            }
        """)

        page.wait_for_timeout(1000) # Wait for render

        # 4. Take Screenshot
        page.screenshot(path='verification/live_game_ui.png')
        print("Screenshot saved to verification/live_game_ui.png")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
