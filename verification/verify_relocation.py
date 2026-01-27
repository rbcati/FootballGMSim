
import os
from playwright.sync_api import sync_playwright

def test_relocation(page):
    # Capture console logs
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

    # Use localhost
    url = "http://localhost:8000/index.html"
    print(f"Navigating to {url}")
    page.goto(url)

    # Wait a bit for JS to init
    page.wait_for_timeout(2000)

    # Check if modal is visible
    if page.is_visible("#onboardModal"):
        print("Modal is visible")
        # Proceed with onboarding
        page.wait_for_selector("#onboardTeam option", state="attached")
        page.click("#onboardStart")
    else:
        print("Modal is hidden. Checking if we are on Hub or Dashboard...")
        if page.is_visible("#hub"):
            print("We are on Hub")
        elif page.is_visible("#leagueDashboard"):
            print("We are on Dashboard")
            # Click create league if available
            if page.is_visible("#create-league-btn"):
                 page.fill("#new-league-name", "Test League")
                 page.click("#create-league-btn")
            else:
                 # Force start
                 print("Forcing startNewLeague...")
                 page.evaluate("if(window.gameController) window.gameController.startNewLeague()")
                 page.wait_for_selector("#onboardModal", state="visible")
                 page.wait_for_selector("#onboardTeam option", state="attached")
                 page.click("#onboardStart")

    # Wait for the hub to load (hash changes to #/hub)
    print("Waiting for Hub...")
    page.wait_for_selector("#hub", state="visible")

    # Enable Owner Mode
    print("Waiting for Owner Mode Interface...")
    # It might take a moment for renderOwnerModeInterface to be called via setTimeout in renderHub
    page.wait_for_timeout(2000)

    # Check if interface exists
    if not page.is_visible("#ownerModeInterface"):
        print("Owner Mode Interface not found in DOM. Attempting to force render.")
        page.evaluate("if(window.renderOwnerModeInterface) window.renderOwnerModeInterface()")
        page.wait_for_timeout(1000)

    enable_btn = page.query_selector("button:text('Enable Owner Mode')")
    if enable_btn and enable_btn.is_visible():
        print("Clicking Enable Owner Mode...")
        enable_btn.click()
        page.wait_for_timeout(1000)
    else:
        print("Enable Owner Mode button not found/visible. Checking for Relocate...")

    # Now check for Relocate Franchise button
    print("Looking for Relocate Franchise button...")
    relocate_btn = page.query_selector("button:text('Relocate Franchise')")

    if not relocate_btn:
        print("Relocate button not found. Taking screenshot of hub.")
        page.screenshot(path="verification/hub_debug.png")
        # Dump owner mode interface HTML
        html = page.inner_html("#ownerModeInterface") if page.is_visible("#ownerModeInterface") else "No Interface"
        print(f"Owner Mode HTML: {html}")
        raise Exception("Relocate button not found")

    print("Clicking Relocate Franchise...")
    relocate_btn.click()

    # Wait for Relocation Wizard
    print("Waiting for Relocation Wizard...")
    page.wait_for_selector("#relocation", state="visible")
    page.wait_for_selector("h3:text('Step 1: Choose a New Market')")

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification/relocation_wizard.png")
    print("Screenshot saved to verification/relocation_wizard.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_relocation(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
