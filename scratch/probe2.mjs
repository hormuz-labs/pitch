import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('crash', () => console.log('PAGE CRASHED'));
await page.goto('file:///home/adnan/Documents/pitch/projects/graphify.com-70s-fresh/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__READY === true, null, { timeout: 30000 });
console.log('ready, ping:', await page.evaluate(() => 1 + 1));
console.log('cues:', JSON.stringify(await page.evaluate(() => window.__CUES())));
await browser.close();
