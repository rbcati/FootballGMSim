from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/index.html")

        # Verify topbar is gone
        topbar_count = page.locator(".topbar").count()
        print(f"Topbar count: {topbar_count}")

        # Verify storyEvents is loaded
        story_events = page.evaluate("window.storyEvents")
        print(f"Story events found: {len(story_events) if story_events else 'None'}")

        page.screenshot(path="verification/verification.png")
        browser.close()

if __name__ == "__main__":
    run()
