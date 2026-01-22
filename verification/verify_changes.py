from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:8000/index.html", timeout=10000)
            print("Page loaded.")

            # Handle the onboarding modal
            page.wait_for_selector('select#onboardTeam', timeout=10000)
            print("Onboarding modal found.")
            page.select_option('select#onboardTeam', '0')
            print("Team selected.")
            page.click('button#onboardStart')
            print("Starting game...")

            # Wait for the main UI to load and the 'Simulate Week' button to be visible
            page.wait_for_selector('button#btnSimWeekHero', state='visible', timeout=15000)
            print("Hub loaded, 'Simulate Week' button is visible.")

            # Get the text content of hubWeek before clicking
            initial_week_element = page.wait_for_selector('#hubWeek')
            initial_week = initial_week_element.text_content()
            print(f"Initial week: {initial_week}")

            page.click('button#btnSimWeekHero')
            print("Clicked 'Simulate Week' button.")

            # Wait for the week to update
            page.wait_for_function(f"document.querySelector('#hubWeek').textContent !== '{initial_week}'", timeout=10000)

            final_week_element = page.wait_for_selector('#hubWeek')
            final_week = final_week_element.text_content()
            print(f"Final week: {final_week}")

            if int(final_week) > int(initial_week):
                print("SUCCESS: Week advanced correctly.")
            else:
                print("FAILURE: Week did not advance.")

            page.screenshot(path="verification/verification.png")
            print("Screenshot taken.")

        except Exception as e:
            print(f"An error occurred: {e}")
            page.screenshot(path="verification/verification_error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
