from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:3000/#/roster")

        # Wait for the table to populate
        # Corrected ID based on index.html: rosterTable
        page.wait_for_selector("table#rosterTable tbody tr")

        # Take screenshot
        page.screenshot(path="verification/roster_view.png", full_page=True)
        browser.close()

if __name__ == "__main__":
    run()
