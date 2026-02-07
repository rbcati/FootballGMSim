from playwright.sync_api import sync_playwright
import time

def verify_juice():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})

        print("Navigating to app...")
        page.goto("http://localhost:3000")
        page.wait_for_timeout(3000)

        print("Injecting Game State...")
        page.evaluate("""() => {
            if (!window.liveGameViewer) window.liveGameViewer = new LiveGameViewer();
            document.body.innerHTML = '<div id="test-container" style="width:100%;height:100vh;background:#111;"></div>';

            const home = { team: { id: 1, abbr: 'NE', color: '#002244', name: 'Patriots' }, score: 35 };
            const away = { team: { id: 2, abbr: 'NYJ', color: '#125740', name: 'Jets' }, score: 14 };

            window.liveGameViewer.initGame(home.team, away.team, 1);
            window.liveGameViewer.renderToView('#test-container');

            window.liveGameViewer.combo = 4;
            window.liveGameViewer.streak = 3;
            window.liveGameViewer.renderMomentum();
            window.liveGameViewer.showGameOverOverlay('VICTORY', 35, 14, 'positive');
        }""")

        page.wait_for_timeout(1000)
        page.screenshot(path="verification/verify_juice_final.png")
        browser.close()

if __name__ == "__main__":
    verify_juice()
