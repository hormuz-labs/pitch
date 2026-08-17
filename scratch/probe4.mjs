import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///home/adnan/Documents/pitch/projects/graphify.com-70s-fresh/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__READY === true, null, { timeout: 30000 });
for (const t of [0.001, 2, 12, 20, 30, 34.4, 34.55, 34.7, 35, 40, 60]) {
  const r = await page.evaluate((tt) => {
    window.__SEEK(tt);
    const st = (sel) => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return [c.opacity, c.transform.slice(0, 55), c.left, c.top]; };
    return { dot: st('#bridge-dot'), panel: st('#bridge-panel'), line: st('#bridge-line') };
  }, t);
  console.log('t=' + t, JSON.stringify(r));
}
await browser.close();
