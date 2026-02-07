from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        page.goto('http://localhost:8000')
        page.wait_for_timeout(2000)

        # Mock setup to render Live Game
        page.evaluate("""
            () => {
                // Ensure LiveGameViewer exists
                if (!window.liveGameViewer) window.liveGameViewer = new LiveGameViewer();

                // Mock context
                window.liveGameViewer.preGameContext = {
                    stakes: 90,
                    difficulty: 'Nightmare Matchup (Very Hard)'
                };

                // Mock Game State for visual pop
                window.liveGameViewer.gameState = window.liveGameViewer.initializeGameState(
                    { id: 1, abbr: 'HOME', color: '#003366', roster: [] },
                    { id: 2, abbr: 'AWAY', color: '#990000', roster: [] }
                );

                // Inject container
                const d = document.createElement('div');
                d.id = 'verification-container';
                d.style.position = 'absolute';
                d.style.top = '0';
                d.style.left = '0';
                d.style.width = '100%';
                d.style.height = '100vh';
                d.style.zIndex = '9999';
                d.style.background = '#000';
                document.body.appendChild(d);

                window.liveGameViewer.renderToView('#verification-container');

                // Trigger a visual event manually to verify overlay
                setTimeout(() => {
                    window.liveGameViewer.triggerVisualFeedback('defense-stop', 'TEST STOP!');
                }, 500);
            }
        """)

        page.wait_for_timeout(1000) # Wait for animation to appear

        # Take screenshot
        page.screenshot(path='/home/jules/verification/game_ui.png')
        print("Screenshot taken")

        browser.close()

if __name__ == '__main__':
    run()
