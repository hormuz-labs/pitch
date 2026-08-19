import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('crash', () => console.log('PAGE CRASHED'));
await page.goto('file:///home/adnan/Documents/pitch/projects/graphify.com-70s-fresh/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__READY === true, null, { timeout: 30000 });
console.log('ready');
for (const t of [0.001, 1, 2, 5, 20, 26, 28, 30]) {
  try {
    const r = await page.evaluate((tt) => {
      window.__SEEK(tt);
      const st = (sel) => { const el = document.querySelector(sel); const c = getComputedStyle(el); return [c.opacity, c.transform.slice(0, 50)]; };
      return { glow: st('#cursor-glow'), wrap: st('#cursor-pointer-wrap') };
    }, t);
    console.log('t=' + t, JSON.stringify(r));
  } catch (e) { console.log('t=' + t, 'FAILED:', e.message.split('\n')[0]); break; }
}
await browser.close();
