import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto('http://localhost:5173')

        # Click new career, skip to dashboard
        await page.click('.sm-create-btn')

        # Select a team so Continue is enabled
        await page.wait_for_selector('.team-card')
        team_cards = await page.query_selector_all('.team-card')
        if team_cards:
            await team_cards[0].click()

        await page.click('text=Continue')
        await page.click('text=Continue')
        await page.click('text=Start Dynasty')
        await page.wait_for_selector('.app-header')

        # Start game
        await page.click('.app-advance-btn')
        await page.wait_for_selector('text=Watch Game', timeout=10000)
        await page.click('text=Watch Game')

        # Inject the touchdown overlay and hover state on play button to screenshot
        await page.evaluate("""
            () => {
                const overlay = document.createElement('div');
                overlay.className = 'game-event-overlay touchdown';
                overlay.innerText = 'TOUCHDOWN';
                document.body.appendChild(overlay);

                // Add a fake button hover effect
                const btn = document.querySelector('.play-call-btn');
                if(btn) {
                    btn.classList.add('hovered');
                    btn.style.transform = 'translateY(-2px)';
                    btn.style.filter = 'brightness(1.05)';
                    btn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
                }
            }
        """)

        # Wait a tick for animations
        await page.wait_for_timeout(500)
        await page.screenshot(path='/home/jules/verification/screenshots/ui_polish.png', full_page=True)
        await browser.close()

asyncio.run(main())
