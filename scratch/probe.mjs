import { chromium } from 'playwright';
console.log('launching...');
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
browser.on('disconnected', () => console.log('BROWSER DISCONNECTED'));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('crash', () => console.log('PAGE CRASHED'));
page.on('pageerror', e => console.log('[err]', e.message));
console.log('goto...');
await page.goto('file:///home/adnan/Documents/pitch/projects/graphify.com-70s-fresh/index.html', { waitUntil: 'domcontentloaded' });
console.log('loaded, waiting READY...');
await page.waitForFunction(() => window.__READY === true, null, { timeout: 30000 });
console.log('ready');
for (const t of [0, 1, 2, 5, 20, 26, 27, 28, 30]) {
  await page.evaluate((tt) => window.__SEEK(tt), t);
  const s = await page.evaluate(() => {
    const st = (sel) => { const el = document.querySelector(sel); const c = getComputedStyle(el); return { op: c.opacity, tr: c.transform.slice(0, 60) }; };
    return { glow: st('#cursor-glow'), wrap: st('#cursor-pointer-wrap'), ripple: st('#cursor-ripple') };
  });
  console.log('t=' + t, JSON.stringify(s));
}
await browser.close();
console.log('done');
