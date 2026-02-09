from playwright.sync_api import sync_playwright
import time

def verify_live_game_effects():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        page.goto("http://localhost:3000")

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
            // We use the existing #app or whatever, but the script replaces body.innerHTML.
            // That is fine for a visual test of just the component.
            document.body.innerHTML = '<div id="game-view" style="width: 100%; height: 100vh;"></div>';

            window.liveGameViewer.initGame(home, away, 1);
            window.liveGameViewer.renderToView('#game-view');

            // 1. Trigger a big hit (Sack) to check shockwave
            setTimeout(() => {
                const sackPlay = {
                    type: 'play',
                    playType: 'pass',
                    result: 'sack',
                    yards: -5,
                    message: 'SACKED! Big Hit!',
                    quarter: 1,
                    time: 800,
                    down: 1,
                    distance: 10,
                    yardLine: 20,
                    offense: 2,
                    defense: 1
                };
                window.liveGameViewer.renderPlay(sackPlay);
                // Also trigger field effect manually to ensure particle system is active
                if(window.liveGameViewer.fieldEffects) {
                    window.liveGameViewer.fieldEffects.spawnParticles(50, 'shockwave');
                }
            }, 500);

            // 2. Trigger a Touchdown to check overlay and slide-in
            setTimeout(() => {
                const tdPlay = {
                    type: 'play',
                    playType: 'pass_long',
                    result: 'touchdown',
                    yards: 50,
                    message: 'TOUCHDOWN! Amazing play!',
                    quarter: 1,
                    time: 750,
                    down: 2,
                    distance: 10,
                    yardLine: 50,
                    offense: 1,
                    defense: 2
                };
                window.liveGameViewer.gameState.ballPossession = 'home';
                window.liveGameViewer.gameState.home.score = 6;
                window.liveGameViewer.renderPlay(tdPlay);
            }, 1500);
        """)

        # Wait for animations
        page.wait_for_timeout(2000)

        # Take screenshot
        page.screenshot(path="verification/verification.png")

        browser.close()

if __name__ == "__main__":
    verify_live_game_effects()
