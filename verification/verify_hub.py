from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:8000")

        print("Waiting for hub or onboard...")
        page.wait_for_selector("#onboardStart, #hub", timeout=10000)

        if page.is_visible("#onboardStart"):
            print("Onboarding...")
            page.click("#onboardStart")
            page.wait_for_selector("#hub", timeout=10000)

        print("Hub visible. Taking screenshot...")
        page.screenshot(path="verification/verification_hub.png")

        # Check if we can see team name in hub
        print("Verifying hub content...")
        expect(page.locator("#hub h2")).to_have_text("League Hub")

        browser.close()

if __name__ == "__main__":
    run()
