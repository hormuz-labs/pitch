import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto('about:blank');
console.log('ok blank');
await page.goto('file:///home/adnan/Documents/pitch/projects/graphify.com-70s-fresh/index.html', { waitUntil: 'domcontentloaded' });
console.log('ok page');
await browser.close();
