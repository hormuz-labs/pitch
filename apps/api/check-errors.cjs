const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  await page.goto('file:///Users/mukundmadhav/pitch/apps/api/projects/make-second-launch-video/index.html');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  await browser.close();
})();
