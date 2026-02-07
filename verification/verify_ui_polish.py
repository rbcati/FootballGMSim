from playwright.sync_api import sync_playwright
import time

def verify_ui(page):
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"Browser error: {exc}"))

    # Navigate to the app
    page.goto("http://localhost:3000")

    # Wait for the app to load (look for a button)
    page.wait_for_selector(".btn", timeout=10000)

    # Inject a live game view manually to test UI
    page.evaluate("""
        // Mock league data if needed, or just open the modal with mock teams
        window.state = window.state || {};
        window.state.onboarded = true; // FORCE ONBOARDED
        // Ensure teams array has enough dummy teams if not present
        if (!window.state.league) {
             window.state.league = { teams: [] };
             for(let i=0; i<10; i++) window.state.league.teams.push({id:i, name:'Team '+i, abbr:'TM'+i, color:'#000'});
        }

        console.log('Attempting to watch live game...');
        if (window.watchLiveGame) {
            window.watchLiveGame(0, 1);
        } else {
            console.error('window.watchLiveGame is not defined');
        }
    """)

    # Wait for view container (since watchLiveGame uses renderToView now, not modal)
    # The view ID is usually game-sim or similar.
    # live-game-viewer.js uses: window.liveGameViewer.renderToView('#game-sim');

    try:
        page.wait_for_selector("#game-sim .field-container", timeout=10000)
    except:
        print("Could not find #game-sim .field-container, trying modal...")
        page.wait_for_selector(".live-game-modal", timeout=5000)

    # Trigger a defense stop overlay manually to verify the shield animation
    page.evaluate("""
        if (window.liveGameViewer) {
            window.liveGameViewer.triggerVisualFeedback('defense-stop', 'TEST STOP');
        } else {
            console.error('liveGameViewer instance not found');
        }
    """)

    # Wait a split second for animation to start
    time.sleep(0.5)

    # Take screenshot of the "Stop" overlay
    page.screenshot(path="/home/jules/verification/ui_feedback_stop.png")

    time.sleep(2) # Wait for overlay to fade

    # Take screenshot of the game controls
    page.screenshot(path="/home/jules/verification/ui_controls.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_ui(page)
            print("Verification script ran successfully.")
        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()
