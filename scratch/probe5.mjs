import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///home/adnan/Documents/pitch/projects/graphify.com-70s-fresh/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__READY === true, null, { timeout: 30000 });
const sels = ['#scene3 .artifact-main', '#scene4 .graph-shell', '#scene4 .node-hit', '#scene5 .query-mark'];
for (const t of [0.001, 15, 20, 25, 30, 34, 35.5, 40]) {
  const r = await page.evaluate(({ tt, sels }) => {
    window.__SEEK(tt);
    return sels.map((s) => { const el = document.querySelector(s); if (!el) return [s, null]; const c = getComputedStyle(el); return [s, c.opacity, c.visibility]; });
  }, { tt: t, sels });
  console.log('t=' + t, JSON.stringify(r));
}
await browser.close();
