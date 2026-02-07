from playwright.sync_api import sync_playwright

def verify_live_game():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        page.goto("http://localhost:3000")
        page.wait_for_timeout(2000)

        # Inject state and render live game
        page.evaluate("""
            if (!window.liveGameViewer) window.liveGameViewer = new window.LiveGameViewer();

            // Mock pre-game context
            window.liveGameViewer.preGameContext = {
                stakes: 85, // High Stakes
                difficulty: 'Nightmare Matchup (Very Hard)',
                matchup: 'Favorable matchup for Passing'
            };

            // Create container
            document.body.innerHTML = '<div id="test-container" style="width: 100%; height: 100vh; background: #222;"></div>';

            // Render
            window.liveGameViewer.renderToView('#test-container');
        """)

        # Wait for render
        page.wait_for_selector('.stakes-badge')

        # Screenshot
        page.screenshot(path="verification/live_game_viewer.png")
        print("Screenshot saved to verification/live_game_viewer.png")

        browser.close()

if __name__ == "__main__":
    verify_live_game()
