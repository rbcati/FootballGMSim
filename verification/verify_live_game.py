from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Wait for app to load
        page.wait_for_timeout(2000)

        # Create a league if not present (simple check)
        # Assuming we land on a dashboard or landing page
        # Let's try to inject a game start directly if possible, or start a new league

        # Click "Start New League" if available
        start_btn = page.get_by_role("button", name="Start New Game")
        if start_btn.count() > 0:
            start_btn.click()
            page.wait_for_timeout(1000)
            # Pick a team
            page.get_by_text("Arizona Scorpions").click()
            page.get_by_role("button", name="Start Career").click()
            page.wait_for_timeout(2000)

        # Now we should be in the hub.
        # Let's try to start a live game via console for speed
        # We need valid team IDs. The regression test likely knows them.
        # Let's assume team 0 and 1 exist.

        print("Starting live game...")
        page.evaluate("window.watchLiveGame(0, 1)")
        page.wait_for_timeout(1000)

        # Wait for some plays to happen
        print("Watching game...")
        page.wait_for_timeout(5000)

        # Take a screenshot of the live game view
        page.screenshot(path="verification/live_game_viewer.png")
        print("Screenshot saved to verification/live_game_viewer.png")

        browser.close()

if __name__ == "__main__":
    run()
