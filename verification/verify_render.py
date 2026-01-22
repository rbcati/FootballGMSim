from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/index.html")
        page.click('button#btnSimWeek')
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/verification.png")
        browser.close()

if __name__ == "__main__":
    run()