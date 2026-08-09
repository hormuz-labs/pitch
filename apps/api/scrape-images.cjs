const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://zerith.studio', { waitUntil: 'networkidle' });

  const images = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(img => img.src).filter(src => src.startsWith('http'));
  });

  fs.writeFileSync('projects/make-second-launch-video/recon/images.json', JSON.stringify(images, null, 2));

  await browser.close();
})();
