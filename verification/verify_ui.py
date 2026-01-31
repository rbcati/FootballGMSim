from playwright.sync_api import sync_playwright
import time

def verify_ui(page):
    # 1. Load App
    page.goto("http://localhost:8000")

    # 2. Handle Onboarding
    try:
        start_btn = page.get_by_role("button", name="Start Season")
        if start_btn.is_visible(timeout=3000):
            start_btn.click()
            page.wait_for_selector("#hub", state="visible", timeout=10000)
    except:
        pass

    # 3. Test Game Overlay
    if page.evaluate("!!window.state && !!window.state.league"):
        page.evaluate("window.watchLiveGame(0, 1)")
        page.wait_for_selector(".scoreboard", state="visible", timeout=10000)

        page.evaluate("window.liveGameViewer.triggerVisualFeedback('touchdown', 'TOUCHDOWN!')")

        time.sleep(0.5)
        page.screenshot(path="verification/verification_overlay.png")
    else:
        print("No league loaded")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})
        try:
            verify_ui(page)
        finally:
            browser.close()
