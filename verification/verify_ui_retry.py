from playwright.sync_api import sync_playwright, expect
import time
import os

def verify_ui(page):
    page.goto("http://localhost:3000")

    # 1. Onboarding
    try:
        page.wait_for_selector("#onboardModal", state="visible", timeout=3000)
        page.click("#onboardStart")
    except:
        pass

    page.wait_for_selector("#hub", state="visible")

    # 3. Roster & Player Modal
    print("Navigating to Roster...")
    page.goto("http://localhost:3000/#/roster")
    page.wait_for_selector("#rosterTable tr.clickable", state="attached")
    time.sleep(1)

    # Click first player
    page.click("#rosterTable tr.clickable:first-child .player-name-link")

    # Wait for the SPECIFIC active modal
    # ui.js creates a NEW modal div at body level
    page.wait_for_selector("body > .modal[style*='display: flex']", state="visible", timeout=5000)

    time.sleep(1)
    page.screenshot(path="verification/player_modal.png")
    print("Player Modal screenshot taken.")

    # Check for summary stats text
    content = page.locator("body > .modal[style*='display: flex']").inner_text()
    if "2024 Season Stats" in content:
        print("✅ Season Stats Summary FOUND in Modal")
    else:
        print("❌ Season Stats Summary NOT found")
        print(content[:200])

    # Close modal
    page.click("body > .modal[style*='display: flex'] .close")

    # 4. Trade
    print("Navigating to Trade...")
    page.goto("http://localhost:3000/#/trade")
    page.wait_for_selector("#tradeB option", state="attached")

    options = page.locator("#tradeB option").count()
    print(f"Trade Opponent Options: {options}")
    if options > 0:
        print("✅ Trade Dropdown populated")

    page.screenshot(path="verification/trade.png")

    # 5. Settings
    print("Navigating to Settings...")
    page.goto("http://localhost:3000/#/settings")
    page.wait_for_selector("#settingSound", state="attached")

    # Check if checked (should be true by default logic)
    is_checked = page.is_checked("#settingSound")
    print(f"Sound Toggle Checked: {is_checked}")

    page.screenshot(path="verification/settings.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_ui(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error_retry.png")
        finally:
            browser.close()
