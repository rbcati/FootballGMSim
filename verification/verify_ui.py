from playwright.sync_api import sync_playwright, expect
import time
import os

def verify_ui(page):
    page.goto("http://localhost:3000")

    # 1. Onboarding
    print("Waiting for onboarding...")
    try:
        page.wait_for_selector("#onboardModal", state="visible", timeout=5000)
        print("Onboarding modal visible.")
        page.click("#onboardStart")
        print("Clicked Start Season.")
    except:
        print("Onboarding skipped or failed.")

    # Wait for Hub
    print("Waiting for Hub...")
    page.wait_for_selector("#hub", state="visible")
    print("Hub visible.")

    # 2. Standings
    print("Navigating to Standings...")
    page.goto("http://localhost:3000/#/standings")

    # Check if #standings is visible
    try:
        page.wait_for_selector("#standings", state="visible", timeout=5000)
        print("#standings view is visible")
    except:
        print("#standings view is NOT visible")
        page.screenshot(path="verification/standings_hidden.png")

    try:
        page.wait_for_selector("#standings-division", state="visible", timeout=5000)
        print("Standings Division visible")
    except Exception as e:
        print(f"Standings Division NOT visible: {e}")
        # Check if it exists
        if page.locator("#standings-division").count() > 0:
            print("Element exists but is hidden.")
            # Check visibility of parent
            is_visible = page.evaluate("document.getElementById('standings').style.display != 'none'")
            print(f"Parent #standings visibility check: {is_visible}")

    page.screenshot(path="verification/standings.png")
    print("Standings screenshot taken.")

    # 3. Roster & Player Modal
    print("Navigating to Roster...")
    page.goto("http://localhost:3000/#/roster")
    page.wait_for_selector("#rosterTable tr.clickable", state="visible")

    # Check columns
    header_text = page.locator("#rosterTable thead").inner_text()
    print(f"Roster Header: {header_text}")

    # Click first player
    page.click("#rosterTable tr.clickable:first-child .player-name-link")
    # Wait for modal
    page.wait_for_selector(".modal-content", state="visible")
    time.sleep(1) # Wait for animation
    page.screenshot(path="verification/player_modal.png")
    print("Player Modal screenshot taken.")

    # Check for summary stats
    summary_text = page.locator(".season-summary").inner_text() if page.locator(".season-summary").count() > 0 else "Not Found"
    print(f"Summary Stats: {summary_text}")

    # Close modal
    page.click(".modal .close")

    # 4. Trade
    print("Navigating to Trade...")
    page.goto("http://localhost:3000/#/trade")
    page.wait_for_selector("#tradeB option", state="attached")
    page.screenshot(path="verification/trade.png")
    print("Trade screenshot taken.")

    # 5. Settings
    print("Navigating to Settings...")
    page.goto("http://localhost:3000/#/settings")
    page.wait_for_selector("#settingSound", state="attached")
    page.screenshot(path="verification/settings.png")
    print("Settings screenshot taken.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_ui(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
