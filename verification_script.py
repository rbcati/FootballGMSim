from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8000")

    # Wait for page load
    page.wait_for_load_state("networkidle")

    # Start New League
    print("Clicking New League...")
    try:
        page.click("#btnNewLeague", timeout=2000)
    except:
        pass

    # Wait for modal
    try:
        page.wait_for_selector("#onboardModal", state="visible", timeout=2000)
        print("Starting Season...")
        page.click("#onboardStart")
        page.wait_for_selector("#hub", state="visible")
    except:
        print("Already started or modal not found")

    print("Hub loaded.")

    # Navigate to League Stats via Hash
    print("Navigating to League Stats (#/leagueStats)...")
    page.evaluate("window.location.hash = '#/leagueStats'")

    # Wait for stats view
    page.wait_for_selector("#leagueStats", state="visible")
    time.sleep(2) # Let tab render

    # Check Detailed Team Stats (should be default tab)
    # Verify new columns
    print("Verifying Team Stats Columns...")
    # passTD, defSacks
    try:
        page.wait_for_selector("#detailedStatsTable th[data-sort='passTD']", timeout=5000)
        print("Pass TD column found.")
        page.wait_for_selector("#detailedStatsTable th[data-sort='defSacks']", timeout=5000)
        print("Def Sacks column found.")
    except Exception as e:
        print(f"Team stats columns not found: {e}")
        print(page.content())

    # Take screenshot of Team Stats
    page.screenshot(path="verification_team_stats.png")
    print("Team Stats Screenshot taken.")

    # Navigate to Player Stats (Leaders) tab in the hub
    print("Navigating to Player Stats Tab...")
    try:
        page.click("button[data-tab='leaders']")
        time.sleep(2)

        # Verify Player Stats Table
        print("Verifying Player Stats Columns...")
        page.wait_for_selector("#statsTable th", state="visible", timeout=5000)

        # Check for WAR column
        content = page.content()
        if "WAR" in content:
            print("WAR column found.")
        else:
            print("WAR column NOT found.")

        # Take screenshot of Player Stats
        page.screenshot(path="verification_player_stats.png")
        print("Player Stats Screenshot taken.")

        # Switch to QB to check QB specific columns
        print("Switching to QB filter...")
        page.select_option("#statsPosFilter", "QB")
        time.sleep(2)
        page.screenshot(path="verification_qb_stats.png")
    except Exception as e:
        print(f"Player stats verification failed: {e}")

    # Navigate to Awards tab
    print("Navigating to Awards Tab...")
    try:
        page.click("button[data-tab='awards']")
        time.sleep(2)

        # Check for CPOY
        content = page.content()
        if "Comeback Player of Year" in content:
            print("CPOY race found.")
        else:
            print("CPOY race NOT found.")

        page.screenshot(path="verification_awards.png")
    except Exception as e:
        print(f"Awards verification failed: {e}")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
