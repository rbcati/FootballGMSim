from playwright.sync_api import sync_playwright

def verify_live_game(page):
    page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

    # 1. Navigate to app
    page.goto("http://localhost:3000")

    # 2. Start New League
    page.get_by_role("button", name="New League").click()

    # 3. Wait for dashboard
    # Increase timeout
    try:
        page.wait_for_selector("text=Season s1", timeout=15000)
    except Exception as e:
        print("Timeout waiting for Season s1. Taking screenshot.")
        page.screenshot(path="verification/timeout.png")
        raise e

    # 4. Check for Play Game button
    play_btn = page.get_by_role("button", name="Play Game")
    if play_btn.is_visible():
        print("Play Game button found!")
        play_btn.click()

        # 5. Check if game container appears
        page.wait_for_selector("#game-sim-container", timeout=10000)
        print("Game container loaded!")

        # Take screenshot of the game
        page.screenshot(path="verification/live_game.png")
    else:
        print("Play Game button NOT found.")
        page.screenshot(path="verification/dashboard_no_button.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_live_game(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
