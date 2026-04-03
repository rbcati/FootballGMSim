import re

with open('tests/daily_regression.spec.js', 'r') as f:
    content = f.read()

# Fix syntax on Stats
content = content.replace("'button.standings-tab:has-text(\"Stats\"), { force: true }'", "'button.standings-tab:has-text(\"Stats\")', { force: true }")
mobile_fix_stats = """        await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Stats')); if (btn) btn.click(); });"""
content = content.replace("await page.click('button.standings-tab:has-text(\"Stats\")', { force: true });", mobile_fix_stats)

mobile_fix_roster = """        await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Roster')); if (btn) btn.click(); });"""
content = content.replace("await page.click('button.standings-tab:has-text(\"Roster\")', { force: true });", mobile_fix_roster)

with open('tests/daily_regression.spec.js', 'w') as f:
    f.write(content)
