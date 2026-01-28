from playwright.sync_api import sync_playwright, expect
import os

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    # Ensure directory exists
    os.makedirs("verification", exist_ok=True)

    print("Loading game...")
    page.goto("http://localhost:8000")
    page.wait_for_load_state("networkidle")

    # Handle onboarding or dashboard
    try:
        if page.is_visible("#onboardModal"):
            print("Onboarding modal found.")
            page.wait_for_selector("#onboardTeam option", state="attached", timeout=5000)
            page.select_option("#onboardTeam", index=0)
            page.click("#onboardStart")
        elif page.is_visible("#leagueDashboard"):
             print("Dashboard found.")
             if page.is_visible("#create-league-btn"):
                 page.fill("#new-league-name", "Test League")
                 page.click("#create-league-btn")
                 page.wait_for_selector("#onboardModal", state="visible", timeout=5000)
                 page.wait_for_selector("#onboardTeam option", state="attached", timeout=5000)
                 page.select_option("#onboardTeam", index=0)
                 page.click("#onboardStart")
    except Exception as e:
        print(f"Navigation logic warning: {e}")

    # Wait for Hub
    print("Waiting for Hub...")
    try:
        page.wait_for_selector("#hub", state="visible", timeout=20000)
    except:
        page.screenshot(path="verification/hub_timeout.png")
        raise

    # Verify HQ Top Bar
    print("Verifying HQ Top Bar...")
    content = page.locator("#hub").text_content()
    if "Strong:" in content and "Weak:" in content:
        print("PASS: Strengths/Weaknesses found.")
    else:
        print("FAIL: Strengths/Weaknesses NOT found.")

    page.screenshot(path="verification/hub_header.png")

    # Verify Roster Click
    print("Navigating to Roster...")
    page.evaluate("window.location.hash = '#/roster'")
    page.wait_for_selector("#rosterTable", state="visible")

    print("Clicking first player...")
    page.wait_for_selector("#rosterTable tbody tr", state="visible")
    page.click("#rosterTable tbody tr:first-child", force=True)

    print("Waiting for modal...")
    modal = page.locator(".modal-content").filter(has_text="Basic Info").first
    expect(modal).to_be_visible(timeout=5000)
    print("PASS: Modal opened.")

    page.screenshot(path="verification/roster_modal.png")

    # Close modal by navigating
    print("Navigating to Schedule...")
    page.evaluate("window.location.hash = '#/schedule'")
    page.wait_for_selector(".week-schedule-card", state="visible")

    print("PASS: Schedule loaded.")
    page.screenshot(path="verification/schedule.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
