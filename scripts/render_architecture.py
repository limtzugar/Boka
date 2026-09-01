"""Render BOKA Cockpit architecture diagram to PNG via Playwright."""
import asyncio
from playwright.async_api import async_playwright
import os

HTML_PATH = '/home/z/my-project/scripts/orchestrator-architecture.html'
OUT_PATH = '/home/z/my-project/download/boka-cockpit-architecture.png'


async def render():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            viewport={'width': 1400, 'height': 900},
            device_scale_factor=2,
        )
        await page.goto(f'file://{HTML_PATH}', wait_until='networkidle')
        await page.wait_for_timeout(500)

        # Auto-fit viewport to content
        el = page.locator('#root')
        bbox = await el.bounding_box()
        if bbox:
            fit_w = max(1400, int(bbox['width'] + 80))
            fit_h = int(bbox['height'] + 80)
            await page.set_viewport_size({'width': fit_w, 'height': fit_h})
            await page.wait_for_timeout(300)

        await el.screenshot(path=OUT_PATH)
        await browser.close()

        size_kb = os.path.getsize(OUT_PATH) / 1024
        print(f'OK -> {OUT_PATH} ({size_kb:.0f} KB)')


if __name__ == '__main__':
    asyncio.run(render())
