from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console messages
        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

        # Load the game
        print("Loading game...")
        # Force dashboard hash
        page.goto("http://localhost:3000/index.html#/leagueDashboard")
        page.wait_for_timeout(5000)

        # Check if onboard modal is covering
        if page.is_visible("#onboardModal"):
            print("Onboard modal visible. Closing it to see dashboard...")
            # Try to close it? Or just use it?
            # If we want to verify dashboard, we need to close it.
            # But the modal might be mandatory if no state.
            # Let's try to reload with dashboard hash again or click Cancel if exists (it doesn't).
            # We will proceed to create league VIA MODAL if it's open, then check dashboard later?
            # No, we want to check dashboard creation.
            # Let's try to hide the modal via JS
            page.evaluate("document.getElementById('onboardModal').hidden = true")
            page.evaluate("document.getElementById('onboardModal').style.display = 'none'")
            page.wait_for_timeout(1000)

        # Create new league via Dashboard
        print("Creating league via Dashboard...")
        try:
            page.fill("#new-league-name", "TestLeague")
            page.click("#create-league-btn")
        except Exception as e:
            print(f"Dashboard create failed: {e}")
            # If dashboard create fails, maybe we are not on dashboard?
            if page.is_visible("#onboardModal"):
                 page.evaluate("document.getElementById('onboardModal').hidden = false")
                 page.evaluate("document.getElementById('onboardModal').style.display = 'flex'")
                 print("Falling back to Onboard Modal creation")
                 page.click("#onboardStart")

        page.wait_for_timeout(5000)

        # Verify Hub Loaded
        if page.is_visible("#hub"):
             print("Hub loaded.")
        else:
             print("Hub not visible.")

        # Simulate Week
        print("Simulating week...")
        try:
            if page.is_visible("#btnSimWeekHero"):
                page.click("#btnSimWeekHero")
            elif page.is_visible("button:has-text('Simulate Week')"):
                page.click("button:has-text('Simulate Week')")
            else:
                page.evaluate("if(window.simulateWeek) window.simulateWeek()")
        except Exception as e:
            print(f"Simulate week failed: {e}")

        page.wait_for_timeout(5000)

        # Navigate to Standings
        print("Checking Standings...")
        page.evaluate("location.hash = '#/standings'")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification_standings.png")

        # Navigate to Team Stats
        print("Checking Team Stats...")
        page.evaluate("location.hash = '#/leagueStats'")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification_team_stats.png")

        # Navigate to Roster and Player Stats
        print("Checking Player Stats...")
        page.evaluate("location.hash = '#/roster'")
        page.wait_for_timeout(2000)

        # Click first player
        try:
            page.click("#rosterTable tbody tr:first-child")
            page.wait_for_timeout(2000)
            page.screenshot(path="verification_player_stats.png")
        except Exception as e:
            print(f"Player click failed: {e}")
            page.screenshot(path="error_player.png")

        browser.close()

if __name__ == "__main__":
    run()
