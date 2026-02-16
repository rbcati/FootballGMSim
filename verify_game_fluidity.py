from playwright.sync_api import sync_playwright
import time

def verify_fluidity():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 720})

        # Navigate
        page.goto("http://localhost:8001")
        page.wait_for_timeout(3000)

        # Inject CSS
        page.add_style_tag(content="""
            #game-view { width: 1000px; height: 600px; display: block; position: relative; background: #333; }
            .football-field-container { width: 100%; height: 300px; position: relative; }
        """)

        # Inject setup
        page.evaluate("""
            const home = {id: 1, name: 'Home Team', abbr: 'HOM', color: '#003366', roster: [{pos:'QB', id:10, name:'QB1'}, {pos:'RB', id:20, name:'RB1'}]};
            const away = {id: 2, name: 'Away Team', abbr: 'AWY', color: '#990000', roster: []};

            window.state = {
                league: {
                    teams: {1: home, 2: away},
                    weeklyGamePlan: {}
                },
                userTeamId: 1
            };

            if (!document.getElementById('game-view')) {
                const d = document.createElement('div');
                d.id = 'game-view';
                document.body.appendChild(d);
            }

            if (!window.liveGameViewer) window.liveGameViewer = new LiveGameViewer();
            window.liveGameViewer.initGame(home, away, 1);
            window.liveGameViewer.renderToView('#game-view');
            window.liveGameViewer.tempo = 'normal';
        """)

        time.sleep(1)

        # Check Width
        width = page.evaluate("document.querySelector('.football-field-container').offsetWidth")
        print(f"Field Width: {width}px")

        # 1. Test Pass Play (Dropback -> Windup)
        print("Testing Pass Play...")
        page.evaluate("""
            window.liveGameViewer.gameState.ballPossession = 'home';
            window.liveGameViewer.gameState.home.yardLine = 20;
            const play = {
                type: 'play',
                playType: 'pass_medium',
                result: 'complete',
                yards: 15,
                quarter: 1, time: 900, down: 1, distance: 10, yardLine: 20,
                offense: 1, defense: 2
            };
            const startState = { yardLine: 20, possession: 'home' };
            window.testPromise = window.liveGameViewer.animatePlay(play, startState);
        """)

        # Dropback is 600ms. Wait 0.7s to check windup.
        time.sleep(0.7)
        has_windup = page.evaluate("!!document.querySelector('.throw-animation')")
        print(f"QB Windup Detected (at 0.7s): {has_windup}")

        # Ball should be moving now (Throw).
        time.sleep(0.2)
        ball_transform = page.evaluate("document.querySelector('.football-ball').style.transform")
        print(f"Ball Transform during flight: {ball_transform}")

        # Finish
        page.evaluate("window.testPromise")
        time.sleep(1.0)

        # 2. Test Run Play (Handoff)
        print("Testing Run Play...")
        page.evaluate("""
            const playRun = {
                type: 'play',
                playType: 'run_inside',
                result: 'tackle',
                yards: 5,
                quarter: 1, time: 880, down: 2, distance: 5, yardLine: 35,
                offense: 1, defense: 2
            };
            const startRun = { yardLine: 35, possession: 'home' };
            window.testRunPromise = window.liveGameViewer.animatePlay(playRun, startRun);
        """)

        # Handoff starts immediately. Check at 0.1s
        time.sleep(0.1)
        has_handoff = page.evaluate("!!document.querySelector('.handoff-meet')")
        print(f"Handoff Animation Detected: {has_handoff}")

        time.sleep(1.5)

        # 3. Test Turnover
        print("Testing Turnover Transition...")
        page.evaluate("""
            window.liveGameViewer.updateFieldState(80, false);
        """)
        time.sleep(0.1)
        has_blur = page.evaluate("!!document.querySelector('.blur-transition')")
        print(f"Blur Transition Detected: {has_blur}")

        browser.close()

if __name__ == "__main__":
    verify_fluidity()
