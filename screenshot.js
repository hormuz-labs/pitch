const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const element = await page.locator('img').first();
  await element.screenshot({ path: 'recordings/product_logo.png' });
  await browser.close();
})();
