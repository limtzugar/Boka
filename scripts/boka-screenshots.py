"""BOKA — Screenshots v3 — klikamy tab, czekamy na Zustand state update, screenshot."""
import asyncio
from playwright.async_api import async_playwright
import os

PORT = 3002
OUT_DIR = '/home/z/my-project/download/screenshots'
os.makedirs(OUT_DIR, exist_ok=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={'width': 1600, 'height': 1000},
            device_scale_factor=2,
        )
        page = await ctx.new_page()

        await page.goto(f'http://localhost:{PORT}/', wait_until='networkidle', timeout=30000)
        await page.wait_for_timeout(5000)

        await page.screenshot(path=os.path.join(OUT_DIR, '01-chat.png'))
        print('OK -> 01-chat.png (Chat)')

        # Mapa: (filename, title-substring, label)
        TABS = [
            ('02-agenti.png',       'Moi agenci',   'Moi Agenci'),
            ('03-cockpit.png',      'Cockpit',      'Cockpit'),
            ('04-agent-memory.png', 'Agent Memory', 'Agent Memory'),
            ('05-rodzina.png',      'Rodzina',      'Ludzie BOKA'),
            ('06-pamiec.png',       'Pamięć',       'Pamięć'),
            ('08-skills.png',       'Skills',       'Skills'),
        ]

        for filename, title_substr, label in TABS:
            try:
                # Kliknij przycisk
                btn = page.locator(f'button[title*="{title_substr}"]').first
                await btn.click(timeout=5000)
                # Czekaj na aktualizację stanu + render
                await page.wait_for_timeout(3500)
                await page.screenshot(path=os.path.join(OUT_DIR, filename))
                print(f'OK -> {filename} ({label})')
            except Exception as e:
                print(f'  ERR {filename}: {e}')

        await browser.close()
        print(f'\nWszystkie screeny w: {OUT_DIR}')


if __name__ == '__main__':
    asyncio.run(main())
