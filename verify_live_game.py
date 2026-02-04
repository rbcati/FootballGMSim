from playwright.sync_api import sync_playwright
import time

def verify_live_game_effects():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        page.goto("http://localhost:8001")

        # Wait for load
        page.wait_for_timeout(3000)

        # Inject mock data and start viewer
        page.evaluate("""
            const home = {id: 1, name: 'Home Team', abbr: 'HOM', color: '#003366', roster: [{pos:'QB', id:10, name:'Test QB'}]};
            const away = {id: 2, name: 'Away Team', abbr: 'AWY', color: '#990000', roster: []};

            // Mock state
            window.state = {
                league: {
                    teams: {1: home, 2: away},
                    weeklyGamePlan: {}
                },
                userTeamId: 1
            };

            // Ensure container exists
            document.body.innerHTML = '<div id="game-view" style="width: 100%; height: 100vh;"></div>';

            window.liveGameViewer.initGame(home, away, 1);
            window.liveGameViewer.renderToView('#game-view');

            // Manually trigger a touchdown play to see effects
            const play = {
                type: 'play',
                playType: 'pass_long',
                result: 'touchdown',
                yards: 50,
                message: 'TOUCHDOWN! Amazing play!',
                quarter: 4,
                time: 60,
                down: 1,
                distance: 10,
                yardLine: 50,
                offense: 1,
                defense: 2
            };

            // Force state update so renderPlay has something to work with
            window.liveGameViewer.gameState.ballPossession = 'home';
            window.liveGameViewer.gameState.home.score = 6;

            // Trigger render
            window.liveGameViewer.renderPlay(play);
        """)

        # Wait for animations (shake, confetti, particles)
        page.wait_for_timeout(500)

        # Take screenshot
        page.screenshot(path="verification_touchdown.png")

        browser.close()

if __name__ == "__main__":
    verify_live_game_effects()
