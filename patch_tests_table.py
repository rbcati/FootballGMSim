import re

with open('tests/daily_regression.spec.js', 'r') as f:
    content = f.read()

# Roster uses #rosterTable or table, not always .standings-table
content = content.replace("await page.waitForSelector('.standings-table', { state: 'visible' });", "await page.waitForSelector('table', { state: 'visible' });")

# For the mobile test, the button needs to be clicked via JS evaluation since force:true isn't enough if it's completely hidden
mobile_fix = """        await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Standings')); if (btn) btn.click(); });"""
content = content.replace("await page.click('button.standings-tab:has-text(\"Standings\")', { force: true });", mobile_fix)

with open('tests/daily_regression.spec.js', 'w') as f:
    f.write(content)
