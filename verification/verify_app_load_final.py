from playwright.sync_api import sync_playwright, expect
import sys

def verify_app_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the local server
        print("Navigating to http://localhost:8000")
        page.goto("http://localhost:8000")

        # Wait for app to initialize (give it a moment for scripts to run)
        # We can also wait for a selector
        try:
            page.wait_for_selector("body", timeout=5000)
            # Wait a bit more for deferred scripts
            page.wait_for_timeout(2000)
        except Exception as e:
            print(f"Error waiting for page load: {e}")

        # Check title
        title = page.title()
        print(f"Page title: {title}")
        expect(page).to_have_title("NFL GM Simulator")

        # Check window.Constants
        constants_check = page.evaluate("() => !!window.Constants && !!window.Constants.GAME_CONFIG")
        if not constants_check:
            print("FAILED: window.Constants or GAME_CONFIG is missing")
            # Print any console errors
            page.on("console", lambda msg: print(f"Console: {msg.text}"))
            sys.exit(1)
        print("PASSED: window.Constants is present")

        # Check window.Constants.TEAMS_REAL (merged from teams.js)
        teams_check = page.evaluate("() => !!window.Constants.TEAMS_REAL && window.Constants.TEAMS_REAL.length > 0")
        if not teams_check:
            print("FAILED: window.Constants.TEAMS_REAL is missing. Was teams.js loaded correctly?")
            sys.exit(1)
        print("PASSED: window.Constants.TEAMS_REAL is present")

        # Check window.state (initialized by state.js)
        state_check = page.evaluate("() => !!window.state && window.state.version === '4.0.0'")
        if not state_check:
             # Check if state exists at all
             has_state = page.evaluate("() => !!window.state")
             print(f"FAILED: window.state check. Exists: {has_state}")
             sys.exit(1)
        print("PASSED: window.state is initialized")

        # Check standings-page.js loaded (window.renderStandingsPage)
        standings_check = page.evaluate("() => typeof window.renderStandingsPage === 'function'")
        if not standings_check:
            print("FAILED: window.renderStandingsPage is missing. standings-page.js failed to load.")
            sys.exit(1)
        print("PASSED: standings-page.js loaded (window.renderStandingsPage exists)")

        # Take screenshot
        page.screenshot(path="verification/app_load_final.png")
        print("Screenshot saved to verification/app_load_final.png")

        browser.close()

if __name__ == "__main__":
    verify_app_load()
