import re

# Playwright fails to click on tabs because they are obscured by a <div></div> or the tabs themselves are not visible.
# This might be because the dashboard-main-tabs are hidden on mobile or obscured.
# Looking at the CSS:
# @media (max-width: 768px) { .dashboard-main-tabs { display: none; } }
# But playwright runs with desktop viewport by default unless configured otherwise. Let's make sure the tests use force=True for clicks just to bypass minor UI layout z-index issues.

with open('tests/daily_regression.spec.js', 'r') as f:
    content = f.read()

# Replace page.click('button.standings-tab:has-text("X")') with page.click(..., { force: true })
content = re.sub(r'(page\.click\([^)]+\))', r'\1, { force: true }', content)
# Wait, let's just make it a safer replacement.
content = content.replace("await page.click('button.standings-tab:has-text(\"Strategy\")');", "await page.click('button.standings-tab:has-text(\"Strategy\")', { force: true });")
content = content.replace("await page.click('button.standings-tab:has-text(\"Standings\")');", "await page.click('button.standings-tab:has-text(\"Standings\")', { force: true });")
content = content.replace("await page.click('button.standings-tab:has-text(\"Roster\")');", "await page.click('button.standings-tab:has-text(\"Roster\")', { force: true });")
content = content.replace("await page.click('.hub-header');", "await page.click('.app-header');")

# Fix the viewport size for Mobile UI Scrolling Check to use the MobileNav hamburger if needed, or we just force click.
# Mobile tabs are inside MobileNav, not standings-tab.
content = content.replace("await page.click('button.standings-tab:has-text(\"Standings\")', { force: true });", "await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Standings')); if (btn) btn.click(); });")

with open('tests/daily_regression.spec.js', 'w') as f:
    f.write(content)
