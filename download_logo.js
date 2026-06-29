const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://trypitch.co/login');
  try {
    const el = await page.$('link[rel*="icon"], img[src*="logo"], img[alt*="logo"], svg');
    if (el) {
      await el.screenshot({ path: 'recordings/product_logo.png' });
    }
  } catch(e) {}
  await browser.close();
})();
