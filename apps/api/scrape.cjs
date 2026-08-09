const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://zerith.studio', { waitUntil: 'networkidle' });

  const dom = await page.content();
  fs.writeFileSync('projects/make-second-launch-video/recon/dom.txt', dom);

  const tokens = await page.evaluate(() => {
    const bodyStyle = window.getComputedStyle(document.body);
    const rootStyle = window.getComputedStyle(document.documentElement);
    
    const getVar = (name) => rootStyle.getPropertyValue(name).trim();
    
    const buttons = Array.from(document.querySelectorAll('a[class*="btn"], button, a[class*="button"]'));
    let primaryButton = null;
    if (buttons.length > 0) {
      const btnStyle = window.getComputedStyle(buttons[0]);
      primaryButton = {
        backgroundColor: btnStyle.backgroundColor,
        backgroundImage: btnStyle.backgroundImage,
        color: btnStyle.color,
        borderRadius: btnStyle.borderRadius,
        boxShadow: btnStyle.boxShadow,
      };
    }

    // Accent frequency scan
    const colors = {};
    const elements = document.querySelectorAll('*');
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      const color = style.color;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        colors[bg] = (colors[bg] || 0) + 1;
      }
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        colors[color] = (colors[color] || 0) + 1;
      }
    });

    const sortedColors = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const headings = document.querySelectorAll('h1, h2, h3');
    let headingFont = '';
    if (headings.length > 0) {
      headingFont = window.getComputedStyle(headings[0]).fontFamily;
    }

    return {
      body: {
        backgroundColor: bodyStyle.backgroundColor,
        color: bodyStyle.color,
        fontFamily: bodyStyle.fontFamily,
      },
      headingFont,
      primaryButton,
      topColors: sortedColors,
    };
  });

  fs.writeFileSync('projects/make-second-launch-video/recon/brand-tokens.json', JSON.stringify(tokens, null, 2));

  await browser.close();
})();
