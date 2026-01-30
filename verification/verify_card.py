from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the verification page
        page.goto("http://localhost:8000/verification/verify_card.html")

        # Wait for card to render
        page.wait_for_selector(".card")

        # Take a screenshot
        page.screenshot(path="verification/verification.png")

        browser.close()
        print("Screenshot saved to verification/verification.png")

if __name__ == "__main__":
    run()
