
import time
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Go to the app
    print("Navigating to app...")
    page.goto("http://localhost:8000")

    # Wait for onboarding modal
    print("Waiting for onboarding...")
    page.wait_for_selector("#onboardModal", state="visible")

    # Click Start Season (it might take a moment to load teams)
    # Give it a second for the team list to populate if needed
    time.sleep(1)

    print("Clicking Start Season...")
    page.click("#onboardStart")

    # Wait for Hub
    print("Waiting for Hub...")
    page.wait_for_selector("#hub", state="visible")

    # Check for team comparison
    print("Checking for Team Comparison...")
    try:
        page.wait_for_selector(".team-comparison", timeout=5000)
        print("PASS: Team comparison found.")
    except:
        print("FAIL: Team comparison NOT found.")

    # Take screenshot of Hub
    page.screenshot(path="verification/hub_verification.png", full_page=True)
    print("Screenshot saved to verification/hub_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
